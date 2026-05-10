import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { loadResume, saveResume } from "../services/resumeStorage";
import {
  RESUME_TEMPLATE_OPTIONS,
  normalizeResumeTemplate,
} from "../utils/resumeTemplates";
import "./ResumeTemplates.css";

const isSafeNextPath = (value) => typeof value === "string" && value.startsWith("/");

function TemplatePreview({ templateId }) {
  if (templateId === "modern-professional") {
    return (
      <div className="mini-sheet mini-modern-professional">
        <div className="mini-mp-sidebar">
          <span className="mini-avatar mp-avatar" />
          <span className="mini-kicker">CONTACT</span>
          <span className="mini-row w-90" />
          <span className="mini-row w-82" />
          <span className="mini-row w-76" />
          <span className="mini-kicker">SKILLS</span>
          <span className="mini-row w-84" />
          <span className="mini-row w-68" />
          <span className="mini-row w-72" />
        </div>
        <div className="mini-mp-main">
          <div className="mini-name-stack">
            <span>JAMES</span>
            <span>ANDERSON</span>
          </div>
          <span className="mini-subtitle">Marketing Manager</span>
          <span className="mini-section">ABOUT ME</span>
          <span className="mini-line" />
          <span className="mini-line short" />
          <span className="mini-section">EXPERIENCE</span>
          <span className="mini-line" />
          <span className="mini-line" />
          <span className="mini-line short" />
        </div>
      </div>
    );
  }

  if (templateId === "creative-designer") {
    return (
      <div className="mini-sheet mini-creative-designer">
        <span className="mini-designer-orb orb-top" />
        <span className="mini-designer-orb orb-bottom" />
        <div className="mini-designer-top">
          <span className="mini-avatar designer-avatar" />
          <div className="mini-name-stack designer-name">
            <span>OLIVIA</span>
            <span>WILSON</span>
          </div>
        </div>
        <div className="mini-designer-columns">
          <div className="mini-designer-left">
            <span className="mini-kicker">CONTACT</span>
            <span className="mini-row w-86" />
            <span className="mini-row w-74" />
            <span className="mini-row w-70" />
            <span className="mini-kicker">SKILLS</span>
            <span className="mini-dots">
              <span />
              <span />
              <span />
              <span />
            </span>
          </div>
          <div className="mini-designer-right">
            <span className="mini-section">ABOUT ME</span>
            <span className="mini-line" />
            <span className="mini-line short" />
            <span className="mini-section">EXPERIENCE</span>
            <span className="mini-line" />
            <span className="mini-line" />
            <span className="mini-line short" />
          </div>
        </div>
      </div>
    );
  }

  if (templateId === "minimal-ats") {
    return (
      <div className="mini-sheet mini-minimal-ats">
        <div className="mini-ats-head">
          <span className="mini-ats-name">MICHAEL BROWN</span>
          <span className="mini-subtitle">SOFTWARE ENGINEER</span>
        </div>
        <span className="mini-divider" />
        <span className="mini-line" />
        <span className="mini-line short" />
        <span className="mini-section">EXPERIENCE</span>
        <span className="mini-line" />
        <span className="mini-line" />
        <span className="mini-line short" />
        <span className="mini-section">EDUCATION</span>
        <span className="mini-line short" />
        <span className="mini-section">SKILLS</span>
        <span className="mini-tags-row">
          <span />
          <span />
          <span />
          <span />
        </span>
      </div>
    );
  }

  if (templateId === "developer-resume") {
    return (
      <div className="mini-sheet mini-developer-resume">
        <div className="mini-dev-top">
          <span className="mini-avatar dev-avatar" />
          <div className="mini-name-stack dev-name">
            <span>ALEX</span>
            <span>THOMPSON</span>
          </div>
        </div>
        <span className="mini-subtitle dev-subtitle">FULL STACK DEVELOPER</span>
        <span className="mini-divider dev-divider" />
        <div className="mini-dev-grid">
          <div>
            <span className="mini-section">ABOUT ME</span>
            <span className="mini-line" />
            <span className="mini-line short" />
            <span className="mini-section">TECH STACK</span>
            <span className="mini-line short" />
            <span className="mini-line short" />
          </div>
          <div>
            <span className="mini-section">EXPERIENCE</span>
            <span className="mini-line" />
            <span className="mini-line" />
            <span className="mini-section">PROJECTS</span>
            <span className="mini-line" />
            <span className="mini-line short" />
          </div>
        </div>
      </div>
    );
  }

  if (templateId === "student-fresher") {
    return (
      <div className="mini-sheet mini-student-fresher">
        <div className="mini-sf-sidebar">
          <span className="mini-avatar sf-avatar" />
          <span className="mini-kicker">CONTACT</span>
          <span className="mini-row w-88" />
          <span className="mini-row w-72" />
          <span className="mini-row w-78" />
          <span className="mini-kicker">SKILLS</span>
          <span className="mini-row w-82" />
          <span className="mini-row w-64" />
          <span className="mini-row w-70" />
        </div>
        <div className="mini-sf-main">
          <div className="mini-name-stack sf-name">
            <span>ROHIT</span>
            <span>SHARMA</span>
          </div>
          <span className="mini-subtitle">B.Tech Student</span>
          <span className="mini-section">ABOUT ME</span>
          <span className="mini-line" />
          <span className="mini-line short" />
          <span className="mini-section">EDUCATION</span>
          <span className="mini-line" />
          <span className="mini-section">PROJECTS</span>
          <span className="mini-line short" />
        </div>
      </div>
    );
  }

  if (templateId === "elegant-classic") {
    return (
      <div className="mini-sheet mini-elegant-classic">
        <span className="mini-classic-corner tl" />
        <span className="mini-classic-corner tr" />
        <span className="mini-classic-corner bl" />
        <span className="mini-classic-corner br" />
        <div className="mini-classic-top">
          <span className="mini-avatar classic-avatar" />
          <div className="mini-name-stack classic-name">
            <span>DANIEL</span>
            <span>ROBERTS</span>
          </div>
        </div>
        <span className="mini-subtitle">FINANCIAL ANALYST</span>
        <div className="mini-classic-columns">
          <div>
            <span className="mini-kicker">CONTACT</span>
            <span className="mini-row w-84" />
            <span className="mini-row w-70" />
            <span className="mini-kicker">SKILLS</span>
            <span className="mini-row w-76" />
            <span className="mini-row w-68" />
          </div>
          <div>
            <span className="mini-section">PROFILE</span>
            <span className="mini-line" />
            <span className="mini-section">WORK EXPERIENCE</span>
            <span className="mini-line" />
            <span className="mini-line short" />
            <span className="mini-section">EDUCATION</span>
            <span className="mini-line short" />
          </div>
        </div>
      </div>
    );
  }

  if (templateId === "infographic-resume") {
    return (
      <div className="mini-sheet mini-infographic-resume">
        <div className="mini-info-top">
          <span className="mini-avatar info-avatar" />
          <div className="mini-name-stack info-name">
            <span>SOPHIA</span>
            <span>MARTINEZ</span>
          </div>
        </div>
        <div className="mini-info-columns">
          <div>
            <span className="mini-kicker">CONTACT</span>
            <span className="mini-row w-82" />
            <span className="mini-row w-66" />
            <span className="mini-kicker">EXPERTISE</span>
            <span className="mini-progress p1" />
            <span className="mini-progress p2" />
            <span className="mini-progress p3" />
            <span className="mini-progress p4" />
          </div>
          <div>
            <span className="mini-section">ABOUT ME</span>
            <span className="mini-line" />
            <span className="mini-line short" />
            <span className="mini-section">EXPERIENCE</span>
            <span className="mini-line" />
            <span className="mini-line" />
            <span className="mini-line short" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mini-sheet mini-modern-two-column">
      <div className="mini-tc-sidebar">
        <span className="mini-avatar tc-avatar" />
        <div className="mini-name-stack tc-name">
          <span>ETHAN</span>
          <span>PARKER</span>
        </div>
        <span className="mini-kicker">CONTACT</span>
        <span className="mini-row w-82" />
        <span className="mini-row w-70" />
        <span className="mini-kicker">SKILLS</span>
        <span className="mini-row w-84" />
        <span className="mini-row w-72" />
      </div>
      <div className="mini-tc-main">
        <span className="mini-section">ABOUT ME</span>
        <span className="mini-line" />
        <span className="mini-line short" />
        <span className="mini-section">WORK EXPERIENCE</span>
        <span className="mini-line" />
        <span className="mini-line" />
        <span className="mini-line short" />
        <span className="mini-section">EDUCATION</span>
        <span className="mini-line short" />
      </div>
    </div>
  );
}

export default function ResumeTemplates() {
  const navigate = useNavigate();
  const location = useLocation();
  const [resume, setResume] = useState(null);
  const [hydrated, setHydrated] = useState(false);
  const [savingId, setSavingId] = useState("");

  const nextPath = useMemo(() => {
    const params = new URLSearchParams(location.search || "");
    const next = params.get("next");
    return isSafeNextPath(next) ? next : "/job-profile";
  }, [location.search]);

  useEffect(() => {
    let mounted = true;
    loadResume().then((data) => {
      if (!mounted) return;
      setResume(data);
      setHydrated(true);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const activeTemplate = normalizeResumeTemplate(resume?.template);

  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate("/resume-builder");
  };

  const applyTemplate = async (templateId) => {
    if (!hydrated || savingId) return;
    const normalized = normalizeResumeTemplate(templateId);
    setSavingId(normalized);
    try {
      const next = { ...(resume || {}), template: normalized };
      setResume(next);
      await saveResume(next);
      navigate(nextPath);
    } finally {
      setSavingId("");
    }
  };

  return (
    <div className="resume-templates-page">
      <div className="resume-templates-shell">
        <header className="resume-templates-header">
          <button
            type="button"
            className="resume-templates-back"
            onClick={handleBack}
            aria-label="Go back"
          >
            <span aria-hidden="true">{"\u2190"}</span>
          </button>
          <div>
            <div className="resume-templates-title">Choose a CV Template</div>
            <div className="resume-templates-subtitle">
              Pick a style before viewing your Job Profile. You can change it anytime.
            </div>
          </div>
        </header>

        <div className="resume-templates-grid" role="list">
          {RESUME_TEMPLATE_OPTIONS.map((template, index) => {
            const selected = template.id === activeTemplate;
            const saving = template.id === savingId;
            return (
              <div
                key={template.id}
                role="listitem"
                className={`resume-template-card tpl-card-${template.id} ${
                  selected ? "selected" : ""
                }`}
              >
                <div className={`resume-template-preview tpl-${template.id}`} aria-hidden="true">
                  <TemplatePreview templateId={template.id} />
                </div>
                <div className="resume-template-meta">
                  <div className="resume-template-name">
                    <span className="resume-template-order">{index + 1}.</span>
                    {" "}
                    {template.name}
                  </div>
                  <div className="resume-template-tagline">{template.tagline}</div>
                </div>
                <button
                  type="button"
                  className="resume-template-select"
                  disabled={!hydrated || Boolean(savingId)}
                  onClick={() => applyTemplate(template.id)}
                >
                  {saving ? "Applying..." : selected ? "Selected" : "Select"}
                </button>
              </div>
            );
          })}
        </div>

        <div className="resume-templates-footer">
          <button
            type="button"
            className="resume-templates-skip"
            disabled={!hydrated || Boolean(savingId)}
            onClick={() => navigate(nextPath)}
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
