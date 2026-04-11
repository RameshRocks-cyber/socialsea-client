import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { getAllJobs } from "../data/jobStore";
import { readCompanyProfile } from "../services/companyProfileStore";
import { readResumeSnapshot } from "../services/resumeStorage";
import { getStoredProfileIdentifier } from "../utils/profileRoute";
import "./JobApply.css";

const initialForm = {
  name: "",
  email: "",
  phone: "",
  portfolio: "",
  note: ""
};

const APPLICATIONS_KEY = "socialsea_job_applications_v1";

const normalizeEmail = (value) => String(value || "").trim().toLowerCase();

const getViewerEmail = () =>
  normalizeEmail(sessionStorage.getItem("email") || localStorage.getItem("email") || "");

const readApplications = () => {
  try {
    const raw = localStorage.getItem(APPLICATIONS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeApplications = (list) => {
  try {
    localStorage.setItem(APPLICATIONS_KEY, JSON.stringify(list || []));
  } catch {
    // ignore storage errors
  }
};

const hasAppliedForJob = (applications, jobId, viewerEmail) => {
  const idText = String(jobId || "").trim();
  if (!idText) return false;
  return (applications || []).some((app) => {
    if (String(app?.jobId || "") !== idText) return false;
    if (!viewerEmail) return true;
    return normalizeEmail(app?.email) === viewerEmail;
  });
};

const isFilled = (value) => String(value || "").trim().length > 0;

const hasEntry = (entry) =>
  Object.values(entry || {}).some((value) => isFilled(value));

const hasResumeContent = (resume) => {
  if (!resume) return false;
  const personal = resume.personal || {};
  if (Object.values(personal).some((value) => isFilled(value))) return true;
  if (
    isFilled(resume.objective) ||
    isFilled(resume.skills) ||
    isFilled(resume.achievements) ||
    isFilled(resume.references) ||
    isFilled(resume.coverLetter) ||
    isFilled(resume.declaration)
  ) {
    return true;
  }
  if ((resume.education || []).some(hasEntry)) return true;
  if ((resume.experience || []).some(hasEntry)) return true;
  if ((resume.projects || []).some(hasEntry)) return true;
  if (
    (resume.customSections || []).some(
      (section) => isFilled(section?.title) || isFilled(section?.content)
    )
  ) {
    return true;
  }
  return false;
};

const JobApply = () => {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const allJobs = getAllJobs();
  const job = allJobs.find((item) => item.id === jobId);
  const companyProfile = useMemo(() => readCompanyProfile(), []);
  const viewerEmail = getViewerEmail();
  const applicantKey = getStoredProfileIdentifier();
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [applications, setApplications] = useState(() => readApplications());
  const alreadyApplied = useMemo(
    () => (job?.id ? hasAppliedForJob(applications, job.id, viewerEmail) : false),
    [applications, job?.id, viewerEmail]
  );

  useEffect(() => {
    const refresh = () => setApplications(readApplications());
    const onStorage = (event) => {
      if (!event || event.key === APPLICATIONS_KEY) refresh();
    };
    window.addEventListener("focus", refresh);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  if (!job) {
    return (
      <div className="job-apply-page">
        <div className="job-apply-shell">
          <div className="job-apply-card">
            <h2>Job not found</h2>
            <p>We could not find this job listing.</p>
            <button type="button" className="job-apply-secondary" onClick={() => navigate("/jobs")}>
              Back to Jobs
            </button>
          </div>
        </div>
      </div>
    );
  }

  const hasProfileMatch =
    Boolean(companyProfile.companyId) &&
    companyProfile.companyId === job.companyId &&
    Boolean(companyProfile.name);
  const companyName =
    job.companyName ||
    (hasProfileMatch ? companyProfile.name : "") ||
    "Company";
  const canApplyExternally = Boolean(job.applyUrl);

  const updateField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");
    if (alreadyApplied) {
      setError("You already applied to this job.");
      return;
    }
    if (!form.name.trim() || !form.email.trim()) {
      setError("Name and email are required.");
      return;
    }
    const resumeSnapshot = readResumeSnapshot();
    const resumeAttached = hasResumeContent(resumeSnapshot);
    const entry = {
      id: `app-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      jobId: job.id,
      jobTitle: job.title,
      jobLocation: job.location,
      companyId: job.companyId,
      companyName,
      applicantKey: applicantKey || form.email.trim(),
      name: form.name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      portfolio: form.portfolio.trim(),
      note: form.note.trim(),
      submittedAt: new Date().toISOString(),
      resumeAttached,
      resumeSnapshot: resumeAttached ? resumeSnapshot : null
    };
    const stored = readApplications();
    const next = [entry, ...stored].slice(0, 500);
    writeApplications(next);
    setApplications(next);
    setSuccess("Application saved. The hiring team will reach out if there is a match.");
    setForm(initialForm);
  };

  return (
    <div className="job-apply-page">
      <div className="job-apply-shell">
        <header className="job-apply-hero">
          <button type="button" className="job-apply-back" onClick={() => navigate(-1)}>
            {"<"}
          </button>
          <div className="job-apply-hero-copy">
            <p className="job-apply-eyebrow">Apply</p>
            <h1>{job.title}</h1>
            <p className="job-apply-subtitle">
              {hasProfileMatch ? (
                <Link to={`/companies/${job.companyId}`}>{companyName}</Link>
              ) : (
                <span>{companyName}</span>
              )}
              <span>-</span>
              <span>{job.location}</span>
            </p>
          </div>
          <div className="job-apply-salary">{job.salary}</div>
        </header>

        <section className="job-apply-summary">
          <div>
            <h2>Application Options</h2>
            <p>Choose the best way to apply. You can also save this job for later.</p>
          </div>
          <div className="job-apply-summary-meta">
            <div>
              <span>Experience</span>
              <strong>{job.experience}</strong>
            </div>
            <div>
              <span>Track</span>
              <strong>{job.track}</strong>
            </div>
            <div>
              <span>Company</span>
              <strong>{companyName}</strong>
            </div>
          </div>
        </section>

        <section className="job-apply-grid">
          <article className="job-apply-card">
            <div>
              <h3>Quick Apply</h3>
              <p>Send your basic details directly to the hiring team.</p>
            </div>
            <form className="job-apply-form" onSubmit={handleSubmit}>
              <input
                type="text"
                placeholder="Full name"
                value={form.name}
                onChange={(event) => updateField("name", event.target.value)}
              />
              <input
                type="email"
                placeholder="Email address"
                value={form.email}
                onChange={(event) => updateField("email", event.target.value)}
              />
              <input
                type="tel"
                placeholder="Phone number"
                value={form.phone}
                onChange={(event) => updateField("phone", event.target.value)}
              />
              <input
                type="text"
                placeholder="Portfolio or LinkedIn URL"
                value={form.portfolio}
                onChange={(event) => updateField("portfolio", event.target.value)}
              />
              <textarea
                rows={3}
                placeholder="Short note to the hiring team"
                value={form.note}
                onChange={(event) => updateField("note", event.target.value)}
              />
              {error && <p className="job-apply-alert error">{error}</p>}
              {success && <p className="job-apply-alert success">{success}</p>}
              <button type="submit" className="job-apply-primary" disabled={alreadyApplied}>
                {alreadyApplied ? "Applied" : "Submit Application"}
              </button>
              {alreadyApplied && <p className="job-apply-alert success">You have already applied.</p>}
            </form>
          </article>

          <article className="job-apply-card">
            <div>
              <h3>Apply with Profile</h3>
              <p>Use your saved Job Profile and resume details.</p>
            </div>
            <button type="button" className="job-apply-primary" onClick={() => navigate("/job-profile")}>
              Open Job Profile
            </button>
            <button type="button" className="job-apply-secondary" onClick={() => navigate("/resume-builder")}>
              Edit Resume
            </button>
          </article>

          <article className="job-apply-card">
            <div>
              <h3>External Application</h3>
              <p>Complete the companys official application if provided.</p>
            </div>
            {canApplyExternally ? (
              <a className="job-apply-primary" href={job.applyUrl} target="_blank" rel="noreferrer">
                Apply on Company Site
              </a>
            ) : (
              <button type="button" className="job-apply-secondary" disabled>
                Link not available
              </button>
            )}
          </article>
        </section>
      </div>
    </div>
  );
};

export default JobApply;
