import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAllJobs } from "../data/jobStore";
import {
  buildResumeMatchProfile,
  rankJobsForResume
} from "../services/jobMatching";
import { loadResume, readResumeSnapshot } from "../services/resumeStorage";
import "./JobPages.css";

const JOBS_KEY = "socialsea_company_jobs_v1";
const RESUME_KEY = "socialsea_resume_snapshot_v1";

const averageScore = (items, key) => {
  if (!Array.isArray(items) || items.length === 0) return 0;
  const total = items.reduce((sum, item) => sum + Number(item?.[key] || 0), 0);
  return Math.round(total / items.length);
};

const getCompanyName = (job) => String(job?.companyName || "Company").trim() || "Company";

const getFitLabel = (score) => {
  if (score >= 80) return "Excellent fit";
  if (score >= 65) return "Strong fit";
  if (score >= 50) return "Possible fit";
  if (score >= 35) return "Emerging fit";
  return "Needs profile updates";
};

const getChanceLabel = (score) => {
  if (score >= 75) return "High shortlist chance";
  if (score >= 55) return "Good chance";
  if (score >= 40) return "Moderate chance";
  return "Low chance right now";
};

const sectionSuggestionMap = {
  skills: {
    title: "Update your skills",
    body: "Add the tools and technologies you actually use so matching can detect them better.",
    target: "skills"
  },
  projects: {
    title: "Show project proof",
    body: "Projects with real stack details make your job match score much stronger.",
    target: "projects"
  },
  experience: {
    title: "Add experience details",
    body: "Role names, dates, and responsibilities help the system estimate your fit more accurately.",
    target: "experience"
  },
  objective: {
    title: "Write a short summary",
    body: "A clear objective helps your profile line up with job titles and tracks.",
    target: "objective"
  },
  education: {
    title: "Complete education",
    body: "Degrees, certifications, and training improve your profile strength for entry and campus roles.",
    target: "education"
  },
  achievements: {
    title: "Add achievements",
    body: "Awards, certifications, and wins can lift your chance score for competitive roles.",
    target: "achievements"
  },
  personal: {
    title: "Finish personal details",
    body: "A complete profile with title, email, and location makes your resume more usable.",
    target: "personal"
  }
};

const buildSuggestions = (matchResults, resumeProfile) => {
  const cards = [];
  const seenTitles = new Set();
  const missingSections = resumeProfile?.completeness?.missingSections || [];

  missingSections.forEach((section) => {
    const suggestion = sectionSuggestionMap[section.key];
    if (!suggestion || seenTitles.has(suggestion.title) || cards.length >= 3) return;
    seenTitles.add(suggestion.title);
    cards.push(suggestion);
  });

  const missingSkillCounts = new Map();
  matchResults.slice(0, 6).forEach((item) => {
    (item?.missingSkills || []).forEach((skill) => {
      const key = String(skill || "").trim();
      if (!key) return;
      missingSkillCounts.set(key, (missingSkillCounts.get(key) || 0) + 1);
    });
  });

  const topMissingSkills = Array.from(missingSkillCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([skill]) => skill);

  if (topMissingSkills.length > 0 && cards.length < 4) {
    cards.push({
      title: "Common missing skills",
      body: `These jobs often ask for ${topMissingSkills.join(", ")}. Add them only if they are really part of your profile.`,
      target: "skills"
    });
  }

  if (cards.length === 0) {
    cards.push({
      title: "Keep your profile fresh",
      body: "Update recent projects and skills so newly posted jobs can match you faster.",
      target: "projects"
    });
  }

  return cards.slice(0, 4);
};

const JobNotifications = () => {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState(() => getAllJobs());
  const [resume, setResume] = useState(() => readResumeSnapshot());
  const [loadingResume, setLoadingResume] = useState(true);

  useEffect(() => {
    let mounted = true;

    const syncFromServer = async () => {
      const nextResume = await loadResume();
      if (!mounted) return;
      setResume(nextResume);
      setLoadingResume(false);
    };

    const refreshJobs = () => setJobs(getAllJobs());

    const handleFocus = () => {
      refreshJobs();
      syncFromServer();
    };

    const handleStorage = (event) => {
      if (!event || event.key === JOBS_KEY) {
        refreshJobs();
      }
      if (!event || event.key === RESUME_KEY) {
        setResume(readResumeSnapshot());
      }
    };

    syncFromServer();
    window.addEventListener("focus", handleFocus);
    window.addEventListener("storage", handleStorage);

    return () => {
      mounted = false;
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  const resumeProfile = useMemo(() => buildResumeMatchProfile(resume), [resume]);

  const rankedJobs = useMemo(() => rankJobsForResume(jobs, resume), [jobs, resume]);

  const matchedJobs = useMemo(
    () =>
      rankedJobs.filter(
        (item) =>
          item.matchPercentage >= 30 ||
          item.matchedSkills.length > 0 ||
          item.keywordHits.length >= 2
      ),
    [rankedJobs]
  );

  const topMatches = useMemo(() => matchedJobs.slice(0, 6), [matchedJobs]);

  const stats = useMemo(() => {
    const strongMatches = topMatches.filter((item) => item.matchPercentage >= 60).length;
    return {
      profileStrength: resumeProfile.completeness.score,
      strongMatches,
      averageChance: averageScore(topMatches, "chancePercentage")
    };
  }, [resumeProfile, topMatches]);

  const suggestions = useMemo(
    () => buildSuggestions(topMatches, resumeProfile),
    [topMatches, resumeProfile]
  );

  const openJob = (jobId) => {
    navigate(`/jobs/${jobId}`);
  };

  const goToBuilder = (section) => {
    const query = section ? `?section=${encodeURIComponent(section)}` : "";
    navigate(`/resume-builder${query}`);
  };

  const exitPage = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate("/feed");
  };

  return (
    <div className="job-page">
      <header className="job-page-header">
        <div className="job-page-header-top">
          <h1 className="job-page-title">Job Notifications</h1>
          <button
            type="button"
            className="job-page-exit"
            onClick={exitPage}
            aria-label="Exit page"
            title="Exit"
          >
            ←
          </button>
        </div>
        <p className="job-page-subtitle">
          Jobs are ranked from your resume skills, projects, experience, and profile strength.
        </p>
      </header>

      <section className="job-section">
        <h3 className="job-section-title">Match Snapshot</h3>
        <div className="job-card-grid">
          <div className="job-card">
            <h4>{stats.profileStrength}% profile strength</h4>
            <p>Resume completeness based on your personal details, skills, experience, and projects.</p>
          </div>
          <div className="job-card">
            <h4>{stats.strongMatches} strong matches</h4>
            <p>Roles with a match score of at least 60% from your current resume.</p>
          </div>
          <div className="job-card">
            <h4>{stats.averageChance}% average chance</h4>
            <p>Estimated shortlist chance across your current top matched jobs.</p>
          </div>
        </div>
      </section>

      <section className="job-section">
        <h3 className="job-section-title">Matched Jobs</h3>
        {loadingResume ? (
          <p className="job-empty">Checking your resume against open roles...</p>
        ) : topMatches.length === 0 ? (
          <div className="job-card">
            <h4>No strong matches yet</h4>
            <p>
              Add more resume details, especially skills, projects, and experience, so posted jobs can
              match you here.
            </p>
            <div className="job-pill-row">
              <span className="job-pill">{resumeProfile.completeness.score}% profile strength</span>
              <span className="job-pill">0 matched jobs right now</span>
            </div>
          </div>
        ) : (
          <div className="job-card-grid">
            {topMatches.map((item) => {
              const job = item.job;
              const companyName = getCompanyName(job);
              return (
                <div
                  key={job.id}
                  className="job-card job-match-card clickable"
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
                  <div className="job-match-head">
                    <div>
                      <h4>{job.title || "Job opening"}</h4>
                      <p>
                        {[companyName, job.location].filter(Boolean).join(" - ") || "Location not set"}
                      </p>
                    </div>
                    <div className="job-match-score-stack">
                      <span className="job-pill job-pill-accent">{item.matchPercentage}% match</span>
                      <span className="job-pill">{item.chancePercentage}% chance</span>
                    </div>
                  </div>

                  <div className="job-match-meter-group">
                    <div className="job-match-meter">
                      <div
                        className="job-match-meter-fill match"
                        style={{ width: `${item.matchPercentage}%` }}
                      />
                    </div>
                    <div className="job-match-meter">
                      <div
                        className="job-match-meter-fill chance"
                        style={{ width: `${item.chancePercentage}%` }}
                      />
                    </div>
                  </div>

                  <p>
                    {(item.reasons && item.reasons[0]) ||
                      "This role shares keywords and skills with your profile."}
                  </p>

                  {item.matchedSkills.length > 0 && (
                    <div className="job-pill-row">
                      {item.matchedSkills.slice(0, 4).map((skill) => (
                        <span className="job-pill job-pill-success" key={`${job.id}-match-${skill}`}>
                          {skill}
                        </span>
                      ))}
                    </div>
                  )}

                  {item.missingSkills.length > 0 && (
                    <div className="job-pill-row">
                      {item.missingSkills.slice(0, 3).map((skill) => (
                        <span className="job-pill job-pill-muted" key={`${job.id}-missing-${skill}`}>
                          Need: {skill}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="job-match-footer">
                    <span>{getFitLabel(item.matchPercentage)}</span>
                    <span>{getChanceLabel(item.chancePercentage)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="job-section">
        <h3 className="job-section-title">How To Improve</h3>
        <div className="job-card-grid">
          {suggestions.map((card) => (
            <div
              key={card.title}
              className="job-card clickable"
              role="button"
              tabIndex={0}
              onClick={() => goToBuilder(card.target)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  goToBuilder(card.target);
                }
              }}
            >
              <h4>{card.title}</h4>
              <p>{card.body}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

export default JobNotifications;
