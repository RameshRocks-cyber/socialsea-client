import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getDefaultResume, loadResume } from "../services/resumeStorage";
import { toApiUrl } from "../api/baseUrl";
import "./JobPages.css";

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
  const detailText = splitLines(details).join(" • ");
  if (detailText) pieces.push(detailText);
  return pieces.join(" — ");
};

const JobProfile = () => {
  const [resume, setResume] = useState(() => getDefaultResume());

  useEffect(() => {
    let mounted = true;
    loadResume().then((data) => {
      if (!mounted) return;
      setResume(data);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const handleDownload = () => {
    window.print();
  };

  const experience = resume.experience?.filter(hasEntry) || [];
  const education = resume.education?.filter(hasEntry) || [];
  const projects = resume.projects?.filter(hasEntry) || [];
  const skills = splitSkills(resume.skills);
  const avatarUrl = resolveMediaUrl(resume.personal?.avatar);

  return (
    <div className="job-page">
      <header className="job-page-header job-page-header-row">
        <div className="job-page-header-left">
          <div className="job-page-identity">
            {avatarUrl ? (
              <img className="job-page-avatar" src={avatarUrl} alt="Profile" />
            ) : null}
            <div>
              <h1 className="job-page-title">Job Profile</h1>
              <p className="job-page-subtitle">
                Resume-style view of studies, projects, skills, and experience.
              </p>
            </div>
          </div>
        </div>
        <div className="job-page-actions">
          <Link className="job-page-edit" to="/resume-builder">
            Edit Resume
          </Link>
          <button type="button" className="job-page-download" onClick={handleDownload}>
            Download PDF
          </button>
        </div>
      </header>

      <section className="job-section">
        <h3 className="job-section-title">Summary</h3>
        <p>
          {resume.objective ||
            "Add a short summary in your profile builder to make this section stand out."}
        </p>
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
    </div>
  );
};

export default JobProfile;
