import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toApiUrl } from "../api/baseUrl";
import { getAllJobs, getStoredJobs } from "../data/jobStore";
import { buildProfilePath } from "../utils/profileRoute";
import "./JobPages.css";

const APPLICATIONS_KEY = "socialsea_job_applications_v1";

const isFilled = (value) => String(value || "").trim().length > 0;

const hasEntry = (entry) =>
  Object.values(entry || {}).some((value) => isFilled(value));

const splitLines = (value) =>
  String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

const splitSkills = (value) =>
  String(value || "")
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);

const splitMedia = (value) =>
  String(value || "")
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);

const isVideoUrl = (url) =>
  /\.(mp4|mov|webm|mkv|m4v)(\?|$)/i.test(String(url || ""));

const resolveMediaUrl = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  return toApiUrl(raw);
};

const formatRange = (start, end) => {
  const startText = String(start || "").trim();
  const endText = String(end || "").trim();
  if (!startText && !endText) return "";
  if (startText && endText) return `${startText} - ${endText}`;
  if (startText) return `${startText} - Present`;
  return endText;
};

const buildMeta = (primary, details) => {
  const pieces = [];
  if (isFilled(primary)) pieces.push(primary);
  const detailText = splitLines(details).join(" | ");
  if (detailText) pieces.push(detailText);
  return pieces.join(" - ");
};

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
  return date.toLocaleString();
};

const buildJobMap = () => {
  const map = new Map();
  [...getStoredJobs(), ...getAllJobs()].forEach((job) => {
    if (!job?.id || map.has(job.id)) return;
    map.set(job.id, job);
  });
  return map;
};

export default function ApplicantProfile() {
  const { applicationId } = useParams();
  const navigate = useNavigate();
  const applications = useMemo(() => readApplications(), []);
  const jobMap = useMemo(() => buildJobMap(), []);
  const application = applications.find((app) => String(app.id) === String(applicationId));

  if (!application) {
    return (
      <div className="job-page">
        <div className="job-section">
          <h3 className="job-section-title">Applicant not found</h3>
          <p className="job-empty">We could not find this applicant profile.</p>
          <button type="button" className="job-page-edit" onClick={() => navigate("/applicant-inbox")}>
            Back to Inbox
          </button>
        </div>
      </div>
    );
  }

  const job = jobMap.get(application.jobId);
  const profileKey = String(application.applicantKey || application.email || "").trim();
  const profilePath = profileKey ? buildProfilePath(profileKey) : "";
  const resume = application.resumeSnapshot || null;
  const hasResume = hasResumeContent(resume);
  const experience = hasResume ? resume.experience?.filter(hasEntry) || [] : [];
  const education = hasResume ? resume.education?.filter(hasEntry) || [] : [];
  const projects = hasResume ? resume.projects?.filter(hasEntry) || [] : [];
  const skills = hasResume ? splitSkills(resume.skills) : [];

  return (
    <div className="job-page">
      <header className="job-page-header job-page-header-row">
        <div>
          <h1 className="job-page-title">Applicant Profile</h1>
          <p className="job-page-subtitle">Review applicant details and submission.</p>
        </div>
        <div className="job-page-actions">
          <button type="button" className="job-page-edit" onClick={() => navigate("/applicant-inbox")}>
            Back to Inbox
          </button>
          {job?.id && (
            <button type="button" className="job-page-edit" onClick={() => navigate(`/jobs/${job.id}`)}>
              View Job
            </button>
          )}
          {profilePath && (
            <button type="button" className="job-page-edit" onClick={() => navigate(profilePath)}>
              Social Profile
            </button>
          )}
        </div>
      </header>

      <section className="job-section">
        <h3 className="job-section-title">Applicant Details</h3>
        <div className="applicant-profile-grid">
          <div>
            <span className="applicant-profile-label">Name</span>
            <strong>{application.name || "Applicant"}</strong>
          </div>
          <div>
            <span className="applicant-profile-label">Email</span>
            <strong>{application.email || "Not provided"}</strong>
          </div>
          <div>
            <span className="applicant-profile-label">Phone</span>
            <strong>{application.phone || "Not provided"}</strong>
          </div>
          <div>
            <span className="applicant-profile-label">Portfolio</span>
            {application.portfolio ? (
              <a className="applicant-link" href={application.portfolio} target="_blank" rel="noreferrer">
                {application.portfolio}
              </a>
            ) : (
              <strong>Not provided</strong>
            )}
          </div>
          <div>
            <span className="applicant-profile-label">Submitted</span>
            <strong>{formatDate(application.submittedAt)}</strong>
          </div>
        </div>
        {application.note && (
          <div className="applicant-profile-note">
            <span className="applicant-profile-label">Note</span>
            <p>{application.note}</p>
          </div>
        )}
      </section>

      <section className="job-section">
        <h3 className="job-section-title">Job Info</h3>
        <div className="applicant-profile-grid">
          <div>
            <span className="applicant-profile-label">Role</span>
            <strong>{job?.title || application.jobTitle || "Job"}</strong>
          </div>
          <div>
            <span className="applicant-profile-label">Company</span>
            <strong>{job?.companyName || application.companyName || "Company"}</strong>
          </div>
          <div>
            <span className="applicant-profile-label">Location</span>
            <strong>{job?.location || application.jobLocation || "Not set"}</strong>
          </div>
        </div>
      </section>

      {hasResume ? (
        <>
          <section className="job-section">
            <h3 className="job-section-title">Summary</h3>
            <p>{resume.objective || "No summary provided."}</p>
          </section>

          <section className="job-section">
            <h3 className="job-section-title">Resume</h3>
            <div className="resume-grid">
              <div className="resume-card">
                <h4>Experience</h4>
                {experience.length === 0 && (
                  <p className="job-empty">Add experience details.</p>
                )}
                {experience.map((item, index) => {
                  const range = formatRange(item.start, item.end);
                  const meta = buildMeta(item.company, item.details);
                  return (
                    <div className="resume-item" key={`exp-${index}`}>
                      <span>{range || "Timeframe"}</span>
                      <strong>{item.role || "Role"}</strong>
                      {meta && <p>{meta}</p>}
                    </div>
                  );
                })}
              </div>

              <div className="resume-card">
                <h4>Skills</h4>
                {skills.length === 0 && <p className="job-empty">Add skills.</p>}
                {skills.length > 0 && (
                  <div className="job-pill-row">
                    {skills.map((skill) => (
                      <span className="job-pill" key={skill}>
                        {skill}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="resume-card">
                <h4>Projects</h4>
                {projects.length === 0 && <p className="job-empty">Add projects.</p>}
                {projects.map((item, index) => {
                  const media = splitMedia(item.media);
                  return (
                    <div className="resume-item" key={`proj-${index}`}>
                      <strong>{item.name || "Project"}</strong>
                      {item.description && <p>{item.description}</p>}
                      {media.length > 0 && (
                        <div className="job-project-media">
                          {media.map((url) => {
                            const resolved = resolveMediaUrl(url);
                            if (!resolved) return null;
                            return isVideoUrl(resolved) ? (
                              <video key={resolved} src={resolved} controls preload="metadata" />
                            ) : (
                              <img key={resolved} src={resolved} alt="project" loading="lazy" />
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="resume-card">
                <h4>Education</h4>
                {education.length === 0 && (
                  <p className="job-empty">Add education details.</p>
                )}
                {education.map((item, index) => {
                  const range = formatRange(item.start, item.end);
                  const meta = buildMeta(item.school, item.details);
                  return (
                    <div className="resume-item" key={`edu-${index}`}>
                      <span>{range || "Timeframe"}</span>
                      <strong>{item.degree || "Degree"}</strong>
                      {meta && <p>{meta}</p>}
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        </>
      ) : (
        <section className="job-section">
          <h3 className="job-section-title">Resume</h3>
          <p className="job-empty">No resume attached to this application.</p>
        </section>
      )}
    </div>
  );
}
