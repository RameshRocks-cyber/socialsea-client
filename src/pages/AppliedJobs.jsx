import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAllJobs, getStoredJobs } from "../data/jobStore";
import "./JobPages.css";

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

const formatDate = (value) => {
  if (!value) return "Recently";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";
  return date.toLocaleDateString();
};

const buildJobMap = () => {
  const map = new Map();
  [...getStoredJobs(), ...getAllJobs()].forEach((job) => {
    if (!job?.id || map.has(job.id)) return;
    map.set(job.id, job);
  });
  return map;
};

export default function AppliedJobs() {
  const navigate = useNavigate();
  const [applications, setApplications] = useState(() => readApplications());
  const viewerEmail = getViewerEmail();

  const filteredApps = useMemo(() => {
    const list = applications.slice();
    const filtered = viewerEmail
      ? list.filter((app) => normalizeEmail(app?.email) === viewerEmail)
      : list;
    return filtered.sort((a, b) => {
      const aTs = new Date(a?.submittedAt || 0).getTime();
      const bTs = new Date(b?.submittedAt || 0).getTime();
      return bTs - aTs;
    });
  }, [applications, viewerEmail]);

  const jobMap = useMemo(() => buildJobMap(), [applications]);

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

  return (
    <div className="job-page job-list-page">
      <header className="job-page-header">
        <h1 className="job-page-title">Applied Jobs</h1>
        <p className="job-page-subtitle">
          {viewerEmail
            ? `Applications for ${viewerEmail}`
            : "Applications saved on this device."}
        </p>
        <div className="job-page-actions">
          <button type="button" className="job-page-edit" onClick={() => navigate("/jobs")}>
            Browse Jobs
          </button>
        </div>
      </header>

      <div className="job-list">
        {filteredApps.length === 0 ? (
          <p className="job-empty">No applied jobs yet.</p>
        ) : (
          filteredApps.map((app) => {
            const job = jobMap.get(app.jobId);
            const title = job?.title || app.jobTitle || "Job";
            const company = job?.companyName || app.companyName || "Company";
            const location = job?.location || app.jobLocation || "Location not set";
            const appliedAt = formatDate(app.submittedAt);
            const targetJobId = job?.id || app.jobId;
            return (
              <div
                key={app.id}
                className="job-list-row"
                role="button"
                tabIndex={0}
                onClick={() => {
                  if (!targetJobId) return;
                  navigate(`/jobs/${targetJobId}`);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    if (!targetJobId) return;
                    navigate(`/jobs/${targetJobId}`);
                  }
                }}
              >
                <div className="job-list-main">
                  <div className="job-list-role">{title}</div>
                  <div className="job-list-meta">
                    <span>{location}</span>
                    <span>Applied {appliedAt}</span>
                  </div>
                  <div className="job-list-skills">Status: Applied</div>
                </div>
                <div className="job-list-company">
                  <div className="job-list-company-label">Company</div>
                  <span className="job-list-company-name">{company}</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
