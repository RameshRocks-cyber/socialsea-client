import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getJobsByCompanyId } from "../data/jobStore";
import { readCompanyProfile } from "../services/companyProfileStore";
import "./CompanyHub.css";

const optionCards = [
  {
    id: "post-job",
    title: "Post a Job",
    description: "Publish a new opening and reach candidates fast.",
    actionLabel: "Create Job",
    action: "/post-job?mode=job"
  },
  {
    id: "manage-jobs",
    title: "Manage Openings",
    description: "Edit, pause, or close roles across your company.",
    actionLabel: "View Jobs",
    action: "/post-job?mode=openings"
  },
  {
    id: "applicants",
    title: "Applicant Inbox",
    description: "Track submissions, shortlist, and stay organized.",
    actionLabel: "Open Inbox",
    action: "/applicant-inbox"
  },
  {
    id: "company-updates",
    title: "Company Updates",
    description: "Share culture stories and hiring wins.",
    actionLabel: "Create Update",
    action: "/story/create"
  },
  {
    id: "team-access",
    title: "Team Access",
    description: "Invite recruiters and teammates to collaborate.",
    actionLabel: "Coming Soon",
    disabled: true
  },
  {
    id: "insights",
    title: "Hiring Insights",
    description: "Measure profile views, applies, and conversion.",
    actionLabel: "Coming Soon",
    disabled: true
  }
];

export default function CompanyHub() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(() => readCompanyProfile());

  useEffect(() => {
    const refresh = () => setProfile(readCompanyProfile());
    window.addEventListener("focus", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const hasProfile = Boolean(profile.name);
  const openRoles = useMemo(() => {
    if (!profile.companyId) return 0;
    return getJobsByCompanyId(profile.companyId).length;
  }, [profile.companyId]);

  const handleOpenProfile = () => {
    if (!profile.companyId) return;
    navigate(`/companies/${profile.companyId}`);
  };

  return (
    <div className="company-hub-page">
      <div className="company-hub-shell">
        <header className="company-hub-hero">
          <button type="button" className="company-hub-back" onClick={() => navigate(-1)}>
            {"<"}
          </button>
          <div className="company-hub-hero-copy">
            <p className="company-hub-eyebrow">Company Hub</p>
            <h1>Human-first hiring, built for modern teams.</h1>
            <p className="company-hub-subtitle">
              Build your company profile, post jobs, and keep recruiting beautifully organized.
            </p>
          </div>
          <div className="company-hub-hero-actions">
            <button type="button" className="company-hub-primary" onClick={() => navigate("/post-job?mode=profile")}>
              {hasProfile ? "Edit Profile" : "Create Profile"}
            </button>
            <button type="button" className="company-hub-secondary" onClick={() => navigate("/jobs")}>
              View Jobs
            </button>
          </div>
        </header>

        <section className="company-hub-profile">
          <div className="company-hub-profile-copy">
            <h2>Company Profile</h2>
            <p>
              {hasProfile
                ? "Highlight your mission, values, and what makes your team human."
                : "Create your company profile to share what your team builds."}
            </p>
            <div className="company-hub-stats">
              <div className="company-hub-stat-card">
                <span>Open Roles</span>
                <strong>{openRoles}</strong>
              </div>
              <div className="company-hub-stat-card">
                <span>Profile Status</span>
                <strong>{hasProfile ? "Live" : "Not set"}</strong>
              </div>
              <div className="company-hub-stat-card">
                <span>Hiring Focus</span>
                <strong>{profile.industry || "Not set"}</strong>
              </div>
            </div>
          </div>

          <div className="company-hub-profile-panel">
            <div className="company-hub-profile-logo">
              {profile.logoUrl ? (
                <img src={profile.logoUrl} alt="Company logo" />
              ) : (
                <span className="company-hub-logo-placeholder">Logo</span>
              )}
            </div>
            <div className="company-hub-profile-meta">
              <strong>{profile.name || "Company name not set"}</strong>
              <p>{profile.location || "Location not set"}</p>
              <p>{profile.size ? `${profile.size} people` : "Team size not set"}</p>
              <p>{profile.stage || "Stage not set"}</p>
            </div>
            <div className="company-hub-profile-actions">
              <button
                type="button"
                className="company-hub-primary"
                onClick={handleOpenProfile}
                disabled={!hasProfile}
              >
                Open Profile
              </button>
              <button
                type="button"
                className="company-hub-ghost"
                onClick={() => navigate("/post-job?mode=profile")}
              >
                {hasProfile ? "Edit Profile" : "Create Profile"}
              </button>
            </div>
          </div>
        </section>

        <section className="company-hub-options">
          <div className="company-hub-options-header">
            <h2>Company Options</h2>
            <p>Everything you need to run a clean, confident hiring flow.</p>
          </div>
          <div className="company-hub-grid">
            {optionCards.map((card) => (
              <article key={card.id} className={`company-hub-card ${card.disabled ? "is-muted" : ""}`}>
                <div>
                  <h3>{card.title}</h3>
                  <p>{card.description}</p>
                </div>
                <button
                  type="button"
                  className={card.disabled ? "company-hub-ghost" : "company-hub-primary"}
                  onClick={() => {
                    if (card.disabled) return;
                    if (card.action) navigate(card.action);
                  }}
                  disabled={card.disabled}
                >
                  {card.actionLabel}
                </button>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
