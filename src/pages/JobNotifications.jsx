import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { getAllJobs } from "../data/jobStore";
import "./JobPages.css";

const JobNotifications = () => {
  const navigate = useNavigate();
  const topMatches = useMemo(() => getAllJobs().slice(0, 3), []);

  const openJob = (jobId) => {
    navigate(`/jobs/${jobId}`);
  };

  const goToBuilder = (section) => {
    const query = section ? `?section=${encodeURIComponent(section)}` : "";
    navigate(`/resume-builder${query}`);
  };

  return (
    <div className="job-page">
      <header className="job-page-header">
        <h1 className="job-page-title">Job Notifications</h1>
        <p className="job-page-subtitle">Roles matched to your skills, interests, and recent activity.</p>
      </header>

      <section className="job-section">
        <h3 className="job-section-title">Top Matches</h3>
        <div className="job-card-grid">
          {topMatches.map((job, index) => {
            const matchScore = 92 - index * 4;
            return (
              <div
                key={job.id}
                className="job-card clickable"
                role="button"
                tabIndex={0}
                onClick={() => openJob(job.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openJob(job.id);
                  }
                }}
              >
                <h4>{job.title}</h4>
                <p>Match reason: {(job.skills || []).slice(0, 3).join(", ") || "High potential fit"}.</p>
                <div className="job-pill-row">
                  <span className="job-pill">{matchScore}% match</span>
                  <span className="job-pill">{job.location}</span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="job-section">
        <h3 className="job-section-title">Suggested Updates</h3>
        <div className="job-card-grid">
          <div
            className="job-card clickable"
            role="button"
            tabIndex={0}
            onClick={() => goToBuilder("projects")}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                goToBuilder("projects");
              }
            }}
          >
            <h4>Boost your profile</h4>
            <p>Add recent projects to increase match scores by up to 15%.</p>
          </div>
          <div
            className="job-card clickable"
            role="button"
            tabIndex={0}
            onClick={() => goToBuilder("achievements")}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                goToBuilder("achievements");
              }
            }}
          >
            <h4>Highlight certifications</h4>
            <p>Certs in cloud, security, or AI help unlock senior roles.</p>
          </div>
          <div
            className="job-card clickable"
            role="button"
            tabIndex={0}
            onClick={() => goToBuilder("skills")}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                goToBuilder("skills");
              }
            }}
          >
            <h4>Update skills</h4>
            <p>Skills tied to real projects get prioritized in matching.</p>
          </div>
        </div>
      </section>
    </div>
  );
};

export default JobNotifications;
