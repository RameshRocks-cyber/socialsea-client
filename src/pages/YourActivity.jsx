import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  FiActivity,
  FiArchive,
  FiArrowLeft,
  FiChevronRight,
  FiClock,
  FiGrid,
  FiHeart,
  FiLink2,
  FiMessageCircle,
  FiPlayCircle,
  FiRefreshCw,
  FiSearch,
  FiShield,
  FiSmile,
  FiStar,
  FiTag,
  FiTrash2,
  FiEyeOff
} from "react-icons/fi";
import { ACTIVITY_SECTION_GROUPS, ACTIVITY_SECTIONS, loadActivitySnapshot } from "../services/activityStore";
import "./YourActivity.css";

const iconMap = {
  heart: FiHeart,
  "message-circle": FiMessageCircle,
  repeat: FiRefreshCw,
  tag: FiTag,
  smile: FiSmile,
  star: FiStar,
  trash: FiTrash2,
  archive: FiArchive,
  grid: FiGrid,
  "play-circle": FiPlayCircle,
  sparkles: FiActivity,
  "eye-off": FiEyeOff,
  "heart-plus": FiHeart,
  clock: FiClock,
  history: FiRefreshCw,
  shield: FiShield,
  search: FiSearch,
  link: FiLink2
};

const formatRelative = (value) => {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "";
  const diff = Math.max(1, Math.floor((Date.now() - timestamp) / 1000));
  if (diff < 60) return `${diff}s ago`;
  const minutes = Math.floor(diff / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
};

const formatDuration = (milliseconds) => {
  const totalSeconds = Math.max(0, Math.round((Number(milliseconds) || 0) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
};

const isInteractiveEntry = (entry) => Boolean(entry?.route || entry?.url);

export default function YourActivity() {
  const navigate = useNavigate();
  const { sectionId = "" } = useParams();
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      const data = await loadActivitySnapshot();
      if (!cancelled) {
        setSnapshot(data);
        setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const activeSection = useMemo(
    () => (sectionId ? snapshot?.sections?.[sectionId] || ACTIVITY_SECTIONS[sectionId] || null : null),
    [sectionId, snapshot]
  );

  const renderSectionIcon = (section) => {
    const Icon = iconMap[section?.iconKey] || FiActivity;
    return <Icon />;
  };

  const openEntry = (entry) => {
    if (!entry) return;
    if (entry.url) {
      window.open(entry.url, "_blank", "noopener,noreferrer");
      return;
    }
    if (entry.route) navigate(entry.route);
  };

  const renderRow = (entry) => {
    const clickable = isInteractiveEntry(entry);
    const timeLabel = entry?.milliseconds ? formatDuration(entry.milliseconds) : formatRelative(entry?.createdAt);
    const Wrapper = clickable ? "button" : "div";

    return (
      <Wrapper
        key={entry?.id || entry?.title}
        type={clickable ? "button" : undefined}
        className={`your-activity-entry ${clickable ? "is-clickable" : ""}`}
        onClick={clickable ? () => openEntry(entry) : undefined}
      >
        {entry?.mediaUrl ? (
          <div className="your-activity-thumb-wrap">
            {entry.isVideo ? (
              <video src={entry.mediaUrl} className="your-activity-thumb" muted playsInline preload="metadata" />
            ) : (
              <img src={entry.mediaUrl} alt={entry?.title || "Activity"} className="your-activity-thumb" />
            )}
          </div>
        ) : (
          <div className="your-activity-entry-icon">
            {activeSection ? renderSectionIcon(activeSection) : <FiActivity />}
          </div>
        )}
        <div className="your-activity-entry-text">
          <div className="your-activity-entry-head">
            <h3>{entry?.title || "Activity"}</h3>
            {timeLabel ? <span>{timeLabel}</span> : null}
          </div>
          {entry?.subtitle ? <p className="your-activity-entry-subtitle">{entry.subtitle}</p> : null}
          {entry?.description ? <p className="your-activity-entry-description">{entry.description}</p> : null}
        </div>
        {clickable ? <FiChevronRight className="your-activity-entry-arrow" /> : null}
      </Wrapper>
    );
  };

  if (loading) {
    return (
      <div className="your-activity-page">
        <div className="your-activity-shell">
          <header className="your-activity-header">
            <button type="button" className="your-activity-back" onClick={() => navigate(-1)}>
              <FiArrowLeft />
            </button>
            <h1>Your activity</h1>
          </header>
          <div className="your-activity-loading">Loading your activity...</div>
        </div>
      </div>
    );
  }

  if (sectionId && activeSection) {
    const items = Array.isArray(snapshot?.sections?.[sectionId]?.items) ? snapshot.sections[sectionId].items : [];
    return (
      <div className="your-activity-page">
        <div className="your-activity-shell">
          <header className="your-activity-header">
            <button type="button" className="your-activity-back" onClick={() => navigate("/settings/activity")}>
              <FiArrowLeft />
            </button>
            <div>
              <h1>{activeSection.title}</h1>
              <p>{activeSection.description}</p>
            </div>
          </header>

          {sectionId === "timeSpent" && typeof snapshot?.sections?.timeSpent?.summaryValue === "number" ? (
            <section className="your-activity-summary-card">
              <div>
                <small>Total time</small>
                <strong>{formatDuration(snapshot.sections.timeSpent.summaryValue)}</strong>
              </div>
              <div>
                <small>Tracked screens</small>
                <strong>{snapshot.sections.timeSpent.count || 0}</strong>
              </div>
            </section>
          ) : null}

          <section className="your-activity-list">
            {items.length === 0 ? <div className="your-activity-empty">{activeSection.emptyMessage}</div> : items.map(renderRow)}
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="your-activity-page">
      <div className="your-activity-shell">
        <header className="your-activity-header">
          <button type="button" className="your-activity-back" onClick={() => navigate("/settings")}>
            <FiArrowLeft />
          </button>
          <div>
            <h1>Your activity</h1>
          </div>
        </header>

        <section className="your-activity-hero">
          <h2>One place to manage your activity</h2>
          <p>View and manage your interactions, content and account activity in one place.</p>
        </section>

        {ACTIVITY_SECTION_GROUPS.map((group) => (
          <section key={group.id} className="your-activity-group">
            <h3>{group.title}</h3>
            <div className="your-activity-group-list">
              {group.sectionIds.map((id) => {
                const section = snapshot?.sections?.[id] || ACTIVITY_SECTIONS[id];
                if (!section) return null;
                const summaryValue =
                  id === "timeSpent" && typeof section.summaryValue === "number"
                    ? formatDuration(section.summaryValue)
                    : `${section.count || 0}`;

                return (
                  <button
                    type="button"
                    key={id}
                    className="your-activity-nav-row"
                    onClick={() => navigate(`/settings/activity/${id}`)}
                  >
                    <span className="your-activity-nav-icon">{renderSectionIcon(section)}</span>
                    <span className="your-activity-nav-text">
                      <strong>{section.title}</strong>
                      <small>{section.description}</small>
                    </span>
                    <span className="your-activity-nav-meta">{summaryValue}</span>
                    <FiChevronRight className="your-activity-nav-arrow" />
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
