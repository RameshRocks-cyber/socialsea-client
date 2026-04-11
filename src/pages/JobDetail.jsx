import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { getAllJobs } from "../data/jobStore";
import { readCompanyProfile } from "../services/companyProfileStore";
import "./JobDetail.css";

const SAVED_JOBS_KEY = "savedJobIds";
const HIDDEN_TYPES_KEY = "hiddenJobTypes";
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

const hasAppliedForJob = (applications, jobId, viewerEmail) => {
  const idText = String(jobId || "").trim();
  if (!idText) return false;
  return (applications || []).some((app) => {
    if (String(app?.jobId || "") !== idText) return false;
    if (!viewerEmail) return true;
    return normalizeEmail(app?.email) === viewerEmail;
  });
};

const parseList = (key) => {
  try {
    const raw = localStorage.getItem(key);
    const list = JSON.parse(raw || "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
};

const JobDetail = () => {
  const { jobId } = useParams();
  const navigate = useNavigate();
  const allJobs = getAllJobs();
  const job = allJobs.find((item) => item.id === jobId);
  const companyProfile = useMemo(() => readCompanyProfile(), []);
  const [savedJobs, setSavedJobs] = useState(() => parseList(SAVED_JOBS_KEY));
  const [menuOpen, setMenuOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [applications, setApplications] = useState(() => readApplications());
  const viewerEmail = getViewerEmail();
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
      <div className="job-detail-page">
        <div className="job-detail-card">
          <h2>Job not found</h2>
          <p>We could not find this job listing.</p>
          <button type="button" className="job-detail-secondary" onClick={() => navigate("/jobs")}>
            Back to Jobs
          </button>
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
  const canApply = Boolean(job.id);
  const isSaved = savedJobs.includes(job.id);

  const toggleSave = () => {
    setSavedJobs((prev) => {
      const next = prev.includes(job.id) ? prev.filter((id) => id !== job.id) : [...prev, job.id];
      localStorage.setItem(SAVED_JOBS_KEY, JSON.stringify(next));
      return next;
    });
  };

  const hideJobType = () => {
    const existing = parseList(HIDDEN_TYPES_KEY);
    if (!existing.includes(job.track)) {
      const next = [...existing, job.track];
      localStorage.setItem(HIDDEN_TYPES_KEY, JSON.stringify(next));
    }
    setNotice(`We will hide ${job.track} jobs in the main list.`);
    setMenuOpen(false);
  };

  return (
    <div className="job-detail-page">
      <div className="job-detail-card">
        <div className="job-detail-top">
          <button
            type="button"
            className="job-detail-close"
            onClick={() => navigate(-1)}
            aria-label="Exit"
          >
            X
          </button>
        </div>
        <div className="job-detail-head">
          <div>
            <h2>{job.title}</h2>
            <div className="job-detail-subtitle">
              {hasProfileMatch ? (
                <Link to={`/companies/${job.companyId}`}>{companyName}</Link>
              ) : (
                <span>{companyName}</span>
              )}
              <span>-</span>
              <span>{job.location}</span>
            </div>
          </div>
          <div className="job-detail-salary">{job.salary}</div>
        </div>

        <div className="job-detail-actions">
          <button
            type="button"
            className="job-detail-apply"
            onClick={() => navigate(`/jobs/${job.id}/apply`)}
            disabled={!canApply || alreadyApplied}
          >
            {alreadyApplied ? "Applied" : canApply ? "Apply Now" : "Apply Unavailable"}
          </button>
          <button type="button" className="job-detail-secondary" onClick={toggleSave}>
            {isSaved ? "Saved" : "Save"}
          </button>
          <div className="job-detail-menu">
            <button
              type="button"
              className="job-detail-kebab"
              onClick={() => setMenuOpen((prev) => !prev)}
              aria-label="More actions"
            >
              ...
            </button>
            {menuOpen && (
              <div className="job-detail-menu-list">
                <button type="button" onClick={hideJobType}>
                  Do not show this type of jobs
                </button>
              </div>
            )}
          </div>
        </div>

        {notice && <div className="job-detail-notice">{notice}</div>}

        <div className="job-detail-meta">
          <div>
            <div className="job-detail-label">Experience</div>
            <div>{job.experience}</div>
          </div>
          <div>
            <div className="job-detail-label">Job Track</div>
            <div>{job.track}</div>
          </div>
          <div>
            <div className="job-detail-label">Key Skills</div>
            <div className="job-detail-skills">
              {(job.skills || []).map((skill) => (
                <span key={skill}>{skill}</span>
              ))}
            </div>
          </div>
        </div>

        <section className="job-detail-section">
          <h3>About the Role</h3>
          <p>{job.description}</p>
        </section>

        <section className="job-detail-section">
          <h3>Responsibilities</h3>
          <ul>
            {(job.responsibilities || []).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <section className="job-detail-section">
          <h3>Requirements</h3>
          <ul>
            {(job.requirements || []).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>

        <section className="job-detail-section">
          <h3>Benefits</h3>
          <ul>
            {(job.benefits || []).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
};

export default JobDetail;

