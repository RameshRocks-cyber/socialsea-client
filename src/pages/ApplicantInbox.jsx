import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAllJobs } from "../data/jobStore";
import { buildCompanyId, readCompanyProfile } from "../services/companyProfileStore";
import { buildProfilePath } from "../utils/profileRoute";
import "./JobPages.css";

const APPLICATIONS_KEY = "socialsea_job_applications_v1";
const JOBS_KEY = "socialsea_company_jobs_v1";

const readApplications = () => {
  try {
    const raw = localStorage.getItem(APPLICATIONS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const groupByJob = (list) =>
  list.reduce((acc, item) => {
    const key = String(item?.jobId || "unknown").trim() || "unknown";
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});

const formatDate = (value) => {
  if (!value) return "Recently";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";
  return date.toLocaleString();
};

export default function ApplicantInbox() {
  const navigate = useNavigate();
  const profile = useMemo(() => readCompanyProfile(), []);
  const [jobs, setJobs] = useState(() => getAllJobs());
  const [applications, setApplications] = useState(() => readApplications());

  useEffect(() => {
    const refresh = () => {
      setJobs(getAllJobs());
      setApplications(readApplications());
    };
    const onStorage = (event) => {
      if (!event) {
        refresh();
        return;
      }
      if (event.key === APPLICATIONS_KEY || event.key === JOBS_KEY) {
        refresh();
      }
    };
    window.addEventListener("focus", refresh);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const companyId = profile.companyId || buildCompanyId(profile.name);
  const filtered = companyId
    ? applications.filter((app) => String(app?.companyId || "") === companyId)
    : applications;

  const grouped = useMemo(() => groupByJob(filtered), [filtered]);
  const jobMap = useMemo(() => new Map(jobs.map((job) => [job.id, job])), [jobs]);

  const totalCount = filtered.length;

  return (
    <div className="job-page">
      <header className="job-page-header job-page-header-row">
        <div>
          <h1 className="job-page-title">Applicant Inbox</h1>
          <p className="job-page-subtitle">Submissions for your posted roles.</p>
        </div>
        <button
          type="button"
          className="job-page-edit"
          onClick={() => navigate("/post-job?mode=job")}
        >
          Post a Job
        </button>
      </header>

      {totalCount === 0 ? (
        <section className="job-section">
          <h3 className="job-section-title">No applications yet</h3>
          <p className="job-empty">
            Share your job openings to start receiving applicants.
          </p>
        </section>
      ) : (
        Object.entries(grouped).map(([jobId, items]) => {
          const job = jobMap.get(jobId);
          const title = job?.title || items?.[0]?.jobTitle || "Job opening";
          const location = job?.location || items?.[0]?.jobLocation || "";
          return (
            <section className="job-section" key={jobId}>
              <div className="job-section-head">
                <div>
                  <h3 className="job-section-title">{title}</h3>
                  <p className="job-page-subtitle">
                    {location || "Location not set"} - {items.length} applicant{items.length === 1 ? "" : "s"}
                  </p>
                </div>
                {job?.id && (
                  <button
                    type="button"
                    className="job-page-edit"
                    onClick={() => navigate(`/jobs/${job.id}`)}
                  >
                    View Job
                  </button>
                )}
              </div>
              <div className="applicant-grid">
                {items.map((app) => (
                  <div className="applicant-card" key={app.id}>
                    <strong>{app.name || "Applicant"}</strong>
                    <span className="applicant-meta">{app.email || "Email not provided"}</span>
                    {app.phone && <span className="applicant-meta">{app.phone}</span>}
                    {app.portfolio && (
                      <a
                        className="applicant-link"
                        href={app.portfolio}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Portfolio
                      </a>
                    )}
                    {app.note && <p className="applicant-note">{app.note}</p>}
                    <span className="applicant-meta">Submitted {formatDate(app.submittedAt)}</span>
                    <div className="applicant-actions">
                      <button
                        type="button"
                        className="applicant-action"
                        onClick={() => navigate(`/applicants/${app.id}`)}
                      >
                        View Profile
                      </button>
                      {(() => {
                        const profileKey = String(app.applicantKey || app.email || "").trim();
                        if (!profileKey) return null;
                        const profilePath = buildProfilePath(profileKey);
                        return (
                          <button
                            type="button"
                            className="applicant-action"
                            onClick={() => navigate(profilePath)}
                          >
                            Social Profile
                          </button>
                        );
                      })()}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}
