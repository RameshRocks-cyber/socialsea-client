import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  addCompanyJob,
  getStoredJobs,
  isJobExpired,
  removeCompanyJob,
  updateCompanyJob
} from "../data/jobStore";
import {
  buildCompanyId,
  emptyProfile,
  readCompanyProfile,
  writeCompanyProfile
} from "../services/companyProfileStore";
import { getStoredProfileIdentifier } from "../utils/profileRoute";
import "./PostJob.css";

const JOBS_KEY = "socialsea_company_jobs_v1";
const APPLICATIONS_KEY = "socialsea_job_applications_v1";
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_JOB_DURATION_DAYS = 30;

const parseList = (value) =>
  String(value || "")
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);

const joinList = (list) => (Array.isArray(list) ? list.join(", ") : "");

const buildDraft = (profile) => ({
  ...profile,
  featuresText: joinList(profile.features),
  clientsText: joinList(profile.clients),
  servicesText: joinList(profile.services)
});

const normalizeStatus = (value) => {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "paused" || raw === "closed") return raw;
  return "open";
};

const toDurationDays = (value) => {
  const num = Math.floor(Number(value));
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, num);
};

const resolveDurationDays = (job) => {
  const explicit = toDurationDays(job?.durationDays);
  if (explicit) return explicit;
  const createdAt = Number(job?.createdAt || 0);
  const expiresAt = Number(job?.expiresAt || 0);
  if (createdAt > 0 && expiresAt > createdAt) {
    return Math.max(1, Math.ceil((expiresAt - createdAt) / DAY_MS));
  }
  return DEFAULT_JOB_DURATION_DAYS;
};

const buildJobDraft = (job = {}) => ({
  title: String(job.title || ""),
  location: String(job.location || ""),
  salary: String(job.salary || ""),
  experience: String(job.experience || ""),
  track: String(job.track || ""),
  durationDays: String(resolveDurationDays(job)),
  skillsText: joinList(job.skills),
  description: String(job.description || ""),
  responsibilitiesText: joinList(job.responsibilities),
  requirementsText: joinList(job.requirements),
  benefitsText: joinList(job.benefits),
  applyUrl: String(job.applyUrl || ""),
  status: normalizeStatus(job.status)
});

const readApplications = () => {
  try {
    const raw = localStorage.getItem(APPLICATIONS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const groupApplicants = (list) =>
  list.reduce((acc, item) => {
    const key = String(item?.jobId || "").trim() || "unknown";
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});

const parseMode = (search) => {
  const params = new URLSearchParams(search || "");
  const raw = String(params.get("mode") || "").toLowerCase();
  if (raw === "job" || raw === "openings" || raw === "profile") return raw;
  return "";
};

const formatDate = (value) => {
  if (!value) return "Recently";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";
  return date.toLocaleDateString();
};

export default function PostJob() {
  const location = useLocation();
  const navigate = useNavigate();
  const initialProfile = useMemo(() => readCompanyProfile() || emptyProfile(), []);
  const [profile, setProfile] = useState(initialProfile);
  const [draft, setDraft] = useState(() => buildDraft(initialProfile));
  const [editMode, setEditMode] = useState(() => !initialProfile.name);
  const [activePanel, setActivePanel] = useState(() => parseMode(location.search) || "profile");
  const [jobs, setJobs] = useState(() => getStoredJobs());
  const [applications, setApplications] = useState(() => readApplications());
  const [jobDraft, setJobDraft] = useState(() => buildJobDraft());
  const [jobEditId, setJobEditId] = useState("");
  const [jobNotice, setJobNotice] = useState("");
  const [showExpiredJobs, setShowExpiredJobs] = useState(false);
  const detailsRef = useRef(null);
  const jobFormRef = useRef(null);

  const goToPanel = (panel) => {
    setActivePanel(panel);
    navigate(`/post-job?mode=${panel}`, { replace: true });
  };

  const ownerKey = getStoredProfileIdentifier();
  const companyId = profile.companyId || buildCompanyId(profile.name);
  const companyName = profile.name || "Company";
  const canPostJobs = Boolean(profile.name);

  const companyJobs = useMemo(() => {
    const list = jobs.slice();
    if (ownerKey) {
      const byOwner = list.filter((job) => job.ownerKey === ownerKey);
      if (byOwner.length) return byOwner;
    }
    if (companyId) return list.filter((job) => job.companyId === companyId);
    return list;
  }, [jobs, ownerKey, companyId]);

  const sortedJobs = useMemo(
    () => companyJobs.slice().sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0)),
    [companyJobs]
  );

  const now = Date.now();
  const expiredJobsCount = sortedJobs.filter((job) => isJobExpired(job, now)).length;
  const visibleOpenings = showExpiredJobs
    ? sortedJobs
    : sortedJobs.filter((job) => !isJobExpired(job, now));

  const openRoles = sortedJobs.filter(
    (job) => normalizeStatus(job.status) === "open" && !isJobExpired(job, now)
  ).length;

  const applicantsByJob = useMemo(() => {
    const filtered = companyId
      ? applications.filter((app) => String(app?.companyId || "") === companyId)
      : applications;
    return groupApplicants(filtered);
  }, [applications, companyId]);

  const logoUrl = editMode ? draft.logoUrl : profile.logoUrl;
  const displayName = (editMode ? draft.name : profile.name) || "Company Profile";
  const metaSubtitle = [
    editMode ? draft.industry : profile.industry,
    editMode ? draft.location : profile.location
  ]
    .filter(Boolean)
    .join(" - ");

  const startEdit = () => {
    setDraft(buildDraft(profile));
    setEditMode(true);
  };

  const cancelEdit = () => {
    setDraft(buildDraft(profile));
    setEditMode(false);
  };

  const saveEdit = () => {
    const name = String(draft.name || "").trim();
    const nextCompanyId = name ? buildCompanyId(name) : "";
    const next = {
      companyId: nextCompanyId,
      name,
      logoUrl: String(draft.logoUrl || "").trim(),
      industry: String(draft.industry || "").trim(),
      location: String(draft.location || "").trim(),
      size: String(draft.size || "").trim(),
      stage: String(draft.stage || "").trim(),
      overview: String(draft.overview || "").trim(),
      whatWeDo: String(draft.whatWeDo || "").trim(),
      features: parseList(draft.featuresText),
      clients: parseList(draft.clientsText),
      services: parseList(draft.servicesText),
      website: String(draft.website || "").trim(),
      contactEmail: String(draft.contactEmail || "").trim()
    };
    setProfile(next);
    writeCompanyProfile(next);
    if (ownerKey && name) {
      const stored = getStoredJobs();
      stored.forEach((job) => {
        if (job.ownerKey !== ownerKey) return;
        if (job.companyId === nextCompanyId && job.companyName === name) return;
        updateCompanyJob(job.id, {
          companyId: nextCompanyId || job.companyId,
          companyName: name,
          updatedAt: Date.now()
        });
      });
      setJobs(getStoredJobs());
    }
    setEditMode(false);
  };

  const handleLogoChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setDraft((prev) => ({
        ...prev,
        logoUrl: String(reader.result || "")
      }));
    };
    reader.readAsDataURL(file);
    event.target.value = "";
  };

  const handleRemoveLogo = () => {
    setDraft((prev) => ({ ...prev, logoUrl: "" }));
  };

  const resetJobDraft = () => {
    setJobDraft(buildJobDraft());
    setJobEditId("");
  };

  const startJobEdit = (job) => {
    if (!job) return;
    setJobDraft(buildJobDraft(job));
    setJobEditId(String(job.id || ""));
    setJobNotice("");
    goToPanel("job");
  };

  const saveJob = () => {
    setJobNotice("");
    if (!canPostJobs) {
      setJobNotice("Add a company name in Company Details before posting jobs.");
      return;
    }
    const title = String(jobDraft.title || "").trim();
    if (!title) {
      setJobNotice("Job title is required.");
      return;
    }
    const durationDays = toDurationDays(jobDraft.durationDays) || DEFAULT_JOB_DURATION_DAYS;
    const expiresAt = Date.now() + durationDays * DAY_MS;

    const payload = {
      title,
      location: String(jobDraft.location || "").trim(),
      salary: String(jobDraft.salary || "").trim(),
      experience: String(jobDraft.experience || "").trim(),
      track: String(jobDraft.track || "General").trim() || "General",
      skills: parseList(jobDraft.skillsText),
      description: String(jobDraft.description || "").trim(),
      responsibilities: parseList(jobDraft.responsibilitiesText),
      requirements: parseList(jobDraft.requirementsText),
      benefits: parseList(jobDraft.benefitsText),
      applyUrl: String(jobDraft.applyUrl || "").trim(),
      companyId: companyId || buildCompanyId(companyName) || "company",
      companyName,
      ownerKey,
      status: normalizeStatus(jobDraft.status),
      durationDays,
      expiresAt,
      updatedAt: Date.now()
    };

    if (jobEditId) {
      updateCompanyJob(jobEditId, payload);
      setJobNotice("Job updated.");
    } else {
      addCompanyJob({ ...payload, createdAt: Date.now() });
      setJobNotice("Job posted successfully.");
    }

    setJobs(getStoredJobs());
    resetJobDraft();
  };

  const updateJobStatus = (jobId, status) => {
    if (!jobId) return;
    const nextStatus = normalizeStatus(status);
    const currentJob = jobs.find((job) => String(job.id) === String(jobId));
    const nextPayload = { status: nextStatus, updatedAt: Date.now() };
    if (nextStatus === "open" && currentJob && isJobExpired(currentJob)) {
      const durationDays = toDurationDays(currentJob.durationDays) || DEFAULT_JOB_DURATION_DAYS;
      nextPayload.expiresAt = Date.now() + durationDays * DAY_MS;
    }
    updateCompanyJob(jobId, nextPayload);
    setJobs(getStoredJobs());
  };

  const deleteJob = (jobId) => {
    if (!jobId) return;
    const ok = window.confirm("Delete this job?");
    if (!ok) return;
    removeCompanyJob(jobId);
    setJobs(getStoredJobs());
    if (String(jobEditId) === String(jobId)) {
      resetJobDraft();
    }
  };

  useEffect(() => {
    const mode = parseMode(location.search);
    if (mode) {
      setActivePanel(mode);
    }
  }, [location.search]);

  useEffect(() => {
    const refresh = () => setJobs(getStoredJobs());
    const onStorage = (event) => {
      if (!event || event.key === JOBS_KEY) refresh();
    };
    window.addEventListener("focus", refresh);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

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

  useEffect(() => {
    if (!editMode || !detailsRef.current) return;
    detailsRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    const firstField = detailsRef.current.querySelector("input, textarea");
    if (firstField) {
      firstField.focus();
    }
  }, [editMode]);

  useEffect(() => {
    if (activePanel !== "job" || !jobFormRef.current) return;
    jobFormRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    const firstField = jobFormRef.current.querySelector("input, textarea");
    if (firstField) {
      firstField.focus();
    }
  }, [activePanel, jobEditId]);

  return (
    <div className="company-manage-page">
      <div className="company-manage-shell">
        <header className="company-manage-header">
          <button type="button" className="company-manage-back" onClick={() => navigate(-1)}>
            {"<"}
          </button>
          <div className="company-manage-title">
            <div className="company-manage-logo">
              {logoUrl ? (
                <img src={logoUrl} alt="Company logo" />
              ) : (
                <span className="company-manage-logo-placeholder">Logo</span>
              )}
            </div>
            <div>
              <p className="company-manage-eyebrow">Company Profile</p>
              <h1>{displayName}</h1>
              <p>{metaSubtitle || "Showcase what your company builds."}</p>
            </div>
          </div>
          <div className="company-manage-actions">
            <button type="button" className="company-manage-ghost" onClick={() => navigate("/company-hub")}>
              Company Hub
            </button>
            {activePanel === "profile" ? (
              editMode ? (
                <>
                  <button type="button" className="company-manage-ghost" onClick={cancelEdit}>
                    Cancel
                  </button>
                  <button type="button" className="company-manage-primary" onClick={saveEdit}>
                    Save Profile
                  </button>
                </>
              ) : (
                <button type="button" className="company-manage-primary" onClick={startEdit}>
                  Edit Profile
                </button>
              )
            ) : (
              <button
                type="button"
                className="company-manage-primary"
                onClick={() => {
                  goToPanel("profile");
                  startEdit();
                }}
              >
                Edit Profile
              </button>
            )}
          </div>
        </header>

        <div className="company-manage-tabs">
          <button
            type="button"
            className={`company-manage-tab ${activePanel === "profile" ? "active" : ""}`.trim()}
            onClick={() => goToPanel("profile")}
          >
            Company Profile
          </button>
          <button
            type="button"
            className={`company-manage-tab ${activePanel === "job" ? "active" : ""}`.trim()}
            onClick={() => goToPanel("job")}
          >
            Post a Job
          </button>
          <button
            type="button"
            className={`company-manage-tab ${activePanel === "openings" ? "active" : ""}`.trim()}
            onClick={() => goToPanel("openings")}
          >
            Manage Openings
          </button>
        </div>

        {activePanel === "profile" && (
          <>
            <section className="company-manage-snapshot">
              <div className="company-manage-card">
                <h2>Profile Snapshot</h2>
                <div className="company-manage-stats">
                  <div>
                    <span>Open Roles</span>
                    <strong>{openRoles}</strong>
                  </div>
                  <div>
                    <span>Team Size</span>
                    <strong>{profile.size || "Not set"}</strong>
                  </div>
                  <div>
                    <span>Stage</span>
                    <strong>{profile.stage || "Not set"}</strong>
                  </div>
                </div>
                <div className="company-manage-meta">
                  <div>
                    <span>Website</span>
                    <strong>{profile.website || "Not set"}</strong>
                  </div>
                  <div>
                    <span>Contact</span>
                    <strong>{profile.contactEmail || "Not set"}</strong>
                  </div>
                </div>
              </div>

              <div className="company-manage-card">
                <h2>About the Company</h2>
                {editMode ? (
                  <textarea
                    rows={5}
                    value={draft.overview}
                    onChange={(event) => setDraft((prev) => ({ ...prev, overview: event.target.value }))}
                    placeholder="Share your company story, mission, and culture."
                  />
                ) : (
                  <p>{profile.overview || "Add your company overview to introduce the team."}</p>
                )}
              </div>
            </section>

            <section className="company-manage-grid">
              <div className="company-manage-card">
                <h2>What We Do</h2>
                {editMode ? (
                  <textarea
                    rows={4}
                    value={draft.whatWeDo}
                    onChange={(event) => setDraft((prev) => ({ ...prev, whatWeDo: event.target.value }))}
                    placeholder="Describe the products, services, or outcomes your company delivers."
                  />
                ) : (
                  <p>{profile.whatWeDo || "Add a short description of the work your company focuses on."}</p>
                )}
              </div>

              <div className="company-manage-card">
                <h2>Key Features</h2>
                {editMode ? (
                  <textarea
                    rows={4}
                    value={draft.featuresText}
                    onChange={(event) => setDraft((prev) => ({ ...prev, featuresText: event.target.value }))}
                    placeholder="List features separated by commas or new lines."
                  />
                ) : profile.features.length ? (
                  <div className="company-manage-chips">
                    {profile.features.map((item) => (
                      <span key={item}>{item}</span>
                    ))}
                  </div>
                ) : (
                  <p className="company-manage-muted">Add feature highlights.</p>
                )}
              </div>

              <div className="company-manage-card">
                <h2>Clients</h2>
                {editMode ? (
                  <textarea
                    rows={4}
                    value={draft.clientsText}
                    onChange={(event) => setDraft((prev) => ({ ...prev, clientsText: event.target.value }))}
                    placeholder="List clients separated by commas or new lines."
                  />
                ) : profile.clients.length ? (
                  <div className="company-manage-chips">
                    {profile.clients.map((item) => (
                      <span key={item}>{item}</span>
                    ))}
                  </div>
                ) : (
                  <p className="company-manage-muted">Add client names or partners.</p>
                )}
              </div>

              <div className="company-manage-card">
                <h2>Services</h2>
                {editMode ? (
                  <textarea
                    rows={4}
                    value={draft.servicesText}
                    onChange={(event) => setDraft((prev) => ({ ...prev, servicesText: event.target.value }))}
                    placeholder="List services separated by commas or new lines."
                  />
                ) : profile.services.length ? (
                  <div className="company-manage-chips">
                    {profile.services.map((item) => (
                      <span key={item}>{item}</span>
                    ))}
                  </div>
                ) : (
                  <p className="company-manage-muted">Add the services or offerings you provide.</p>
                )}
              </div>

              {editMode && (
                <div ref={detailsRef} className="company-manage-card company-manage-form-grid">
                  <h2>Company Details</h2>
                  <label>
                    <span className="company-manage-label">
                      Company Name <span className="company-manage-required">Required</span>
                    </span>
                    <input
                      type="text"
                      value={draft.name}
                      onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
                    />
                  </label>
                  <label>
                    Company Logo
                    <input type="file" accept="image/*" onChange={handleLogoChange} />
                    {draft.logoUrl && (
                      <button type="button" className="company-manage-inline" onClick={handleRemoveLogo}>
                        Remove Logo
                      </button>
                    )}
                  </label>
                  <label>
                    Industry
                    <input
                      type="text"
                      value={draft.industry}
                      onChange={(event) => setDraft((prev) => ({ ...prev, industry: event.target.value }))}
                    />
                  </label>
                  <label>
                    Location
                    <input
                      type="text"
                      value={draft.location}
                      onChange={(event) => setDraft((prev) => ({ ...prev, location: event.target.value }))}
                    />
                  </label>
                  <label>
                    Team Size
                    <input
                      type="text"
                      value={draft.size}
                      onChange={(event) => setDraft((prev) => ({ ...prev, size: event.target.value }))}
                    />
                  </label>
                  <label>
                    Stage
                    <input
                      type="text"
                      value={draft.stage}
                      onChange={(event) => setDraft((prev) => ({ ...prev, stage: event.target.value }))}
                    />
                  </label>
                  <label>
                    Website
                    <input
                      type="url"
                      value={draft.website}
                      onChange={(event) => setDraft((prev) => ({ ...prev, website: event.target.value }))}
                    />
                  </label>
                  <label>
                    Contact Email
                    <input
                      type="email"
                      value={draft.contactEmail}
                      onChange={(event) => setDraft((prev) => ({ ...prev, contactEmail: event.target.value }))}
                    />
                  </label>
                </div>
              )}
            </section>
          </>
        )}

        {activePanel === "job" && (
          <section ref={jobFormRef} className="company-manage-section">
            <div className="company-manage-card">
              <div className="company-job-form-head">
                <div>
                  <h2>{jobEditId ? "Edit Job Opening" : "Post a Job"}</h2>
                  <p>{jobEditId ? "Update your job details and publish changes." : "Create a new opening for your team."}</p>
                </div>
                {jobEditId && (
                  <button type="button" className="company-manage-ghost" onClick={resetJobDraft}>
                    Cancel Edit
                  </button>
                )}
              </div>

              {!canPostJobs && (
                <div className="company-manage-warning">
                  Add a company name in the profile tab to publish jobs.
                </div>
              )}

              <div className="company-job-form-grid">
                <label>
                  <span className="company-manage-label">
                    Job Title <span className="company-manage-required">Required</span>
                  </span>
                  <input
                    type="text"
                    value={jobDraft.title}
                    onChange={(event) => setJobDraft((prev) => ({ ...prev, title: event.target.value }))}
                  />
                </label>
                <label>
                  Location
                  <input
                    type="text"
                    value={jobDraft.location}
                    onChange={(event) => setJobDraft((prev) => ({ ...prev, location: event.target.value }))}
                  />
                </label>
                <label>
                  Salary
                  <input
                    type="text"
                    value={jobDraft.salary}
                    onChange={(event) => setJobDraft((prev) => ({ ...prev, salary: event.target.value }))}
                  />
                </label>
                <label>
                  Experience
                  <input
                    type="text"
                    value={jobDraft.experience}
                    onChange={(event) => setJobDraft((prev) => ({ ...prev, experience: event.target.value }))}
                  />
                </label>
                <label>
                  Track
                  <input
                    type="text"
                    value={jobDraft.track}
                    onChange={(event) => setJobDraft((prev) => ({ ...prev, track: event.target.value }))}
                  />
                </label>
                <label>
                  Duration (days)
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={jobDraft.durationDays}
                    onChange={(event) => setJobDraft((prev) => ({ ...prev, durationDays: event.target.value }))}
                    placeholder={`e.g. ${DEFAULT_JOB_DURATION_DAYS}`}
                  />
                  <span className="company-job-hint">Job stays visible for this many days.</span>
                </label>
                <label>
                  Apply URL
                  <input
                    type="url"
                    value={jobDraft.applyUrl}
                    onChange={(event) => setJobDraft((prev) => ({ ...prev, applyUrl: event.target.value }))}
                  />
                </label>
                <label className="full">
                  Skills (comma or new line separated)
                  <textarea
                    rows={3}
                    value={jobDraft.skillsText}
                    onChange={(event) => setJobDraft((prev) => ({ ...prev, skillsText: event.target.value }))}
                  />
                </label>
                <label className="full">
                  About the Role
                  <textarea
                    rows={4}
                    value={jobDraft.description}
                    onChange={(event) => setJobDraft((prev) => ({ ...prev, description: event.target.value }))}
                  />
                </label>
                <label className="full">
                  Responsibilities
                  <textarea
                    rows={4}
                    value={jobDraft.responsibilitiesText}
                    onChange={(event) => setJobDraft((prev) => ({ ...prev, responsibilitiesText: event.target.value }))}
                  />
                </label>
                <label className="full">
                  Requirements
                  <textarea
                    rows={4}
                    value={jobDraft.requirementsText}
                    onChange={(event) => setJobDraft((prev) => ({ ...prev, requirementsText: event.target.value }))}
                  />
                </label>
                <label className="full">
                  Benefits
                  <textarea
                    rows={4}
                    value={jobDraft.benefitsText}
                    onChange={(event) => setJobDraft((prev) => ({ ...prev, benefitsText: event.target.value }))}
                  />
                </label>
              </div>

              <div className="company-job-actions">
                <button
                  type="button"
                  className="company-manage-primary"
                  onClick={saveJob}
                  disabled={!canPostJobs}
                >
                  {jobEditId ? "Update Job" : "Publish Job"}
                </button>
                <button type="button" className="company-manage-ghost" onClick={resetJobDraft}>
                  Clear Form
                </button>
                <button type="button" className="company-manage-ghost" onClick={() => goToPanel("openings")}>
                  View Openings
                </button>
              </div>

              {jobNotice && <p className="company-manage-muted">{jobNotice}</p>}
            </div>
          </section>
        )}

        {activePanel === "openings" && (
          <section className="company-manage-section">
            <div className="company-manage-card">
              <div className="company-job-form-head">
                <div>
                  <h2>Manage Openings</h2>
                  <p>Pause, close, or edit your posted roles.</p>
                </div>
                <button type="button" className="company-manage-primary" onClick={() => goToPanel("job")}>
                  Post a Job
                </button>
              </div>
              <div className="company-job-filters">
                <label className="company-job-toggle">
                  <input
                    type="checkbox"
                    checked={showExpiredJobs}
                    onChange={(event) => setShowExpiredJobs(event.target.checked)}
                  />
                  Show expired jobs{expiredJobsCount ? ` (${expiredJobsCount})` : ""}
                </label>
              </div>
              {visibleOpenings.length === 0 ? (
                <p className="company-manage-muted">
                  {expiredJobsCount && !showExpiredJobs
                    ? "No active jobs. Turn on expired jobs to review older listings."
                    : "No jobs posted yet."}
                </p>
              ) : (
                <div className="company-job-list">
                  {visibleOpenings.map((job) => {
                    const status = normalizeStatus(job.status);
                    const expired = isJobExpired(job, now);
                    const expiresAt = Number(job.expiresAt || 0);
                    const applicantCount = applicantsByJob[job.id]?.length || 0;
                    return (
                      <div className="company-job-item" key={job.id}>
                        <div className="company-job-head">
                          <div>
                            <h3>{job.title || "Job Title"}</h3>
                            <p className="company-job-meta">
                              {[job.location, job.salary, job.experience].filter(Boolean).join(" - ") ||
                                "Details not set"}
                            </p>
                          </div>
                          <span className={`company-job-status ${expired ? "expired" : status}`.trim()}>
                            {expired ? "expired" : status}
                          </span>
                        </div>
                        <div className="company-job-submeta">
                          <span>Track: {job.track || "General"}</span>
                          <span>Applicants: {applicantCount}</span>
                          <span>
                            {expiresAt
                              ? `${expired ? "Expired" : "Expires"} ${formatDate(expiresAt)}`
                              : "No expiry"}
                          </span>
                          <span>Updated {formatDate(job.updatedAt || job.createdAt)}</span>
                        </div>
                        <div className="company-job-actions">
                          <button type="button" className="company-manage-ghost" onClick={() => startJobEdit(job)}>
                            Edit
                          </button>
                          {status === "open" && (
                            <button
                              type="button"
                              className="company-manage-ghost"
                              onClick={() => updateJobStatus(job.id, "paused")}
                            >
                              Pause
                            </button>
                          )}
                          {status === "paused" && (
                            <button
                              type="button"
                              className="company-manage-ghost"
                              onClick={() => updateJobStatus(job.id, "open")}
                            >
                              Resume
                            </button>
                          )}
                          {status !== "closed" && (
                            <button
                              type="button"
                              className="company-manage-ghost"
                              onClick={() => updateJobStatus(job.id, "closed")}
                            >
                              Close
                            </button>
                          )}
                          <button
                            type="button"
                            className="company-manage-ghost"
                            onClick={() => navigate("/applicant-inbox")}
                          >
                            Applicants
                          </button>
                          <button
                            type="button"
                            className="company-manage-ghost company-manage-danger"
                            onClick={() => deleteJob(job.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
