import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/axios";
import "./Settings.css";

const SETTINGS_KEY = "socialsea_settings_v1";
const CLOSE_FRIENDS_KEY = "socialsea_close_friends_v1";
const BLOCKED_KEY = "socialsea_blocked_users_v1";

const defaultPrefs = {
  accountPrivate: true,
  crossposting: false,
  storyLocationEnabled: true,
  activityInFriendsTab: true,
  messageReplies: "Everyone",
  tagsMentions: "People You Follow",
  comments: "Everyone",
  notifications: true,
  dailyTimeLimit: "2h/day"
};

const readIds = (key) => {
  try {
    const raw = localStorage.getItem(key);
    const arr = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(arr)) return [];
    return arr.map((x) => Number(x)).filter((x) => Number.isFinite(x));
  } catch {
    return [];
  }
};

const readJsonArray = (key) => {
  try {
    const raw = localStorage.getItem(key);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
};

const readPrefs = () => {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return defaultPrefs;
    const parsed = JSON.parse(raw);
    return { ...defaultPrefs, ...(parsed || {}) };
  } catch {
    return defaultPrefs;
  }
};

export default function Settings() {
  const navigate = useNavigate();
  const [itemsById, setItemsById] = useState({});
  const [loading, setLoading] = useState(true);
  const [savedIds, setSavedIds] = useState(() => {
    const merged = [...readIds("savedPostIds"), ...readIds("savedReelIds")];
    return Array.from(new Set(merged));
  });
  const [watchLaterIds, setWatchLaterIds] = useState(() => readIds("watchLaterPostIds"));
  const [archiveIds, setArchiveIds] = useState(() => readIds("archivedPostIds"));
  const [prefs, setPrefs] = useState(readPrefs);
  const [activePanel, setActivePanel] = useState("");

  const [closeFriends, setCloseFriends] = useState(() => readJsonArray(CLOSE_FRIENDS_KEY));
  const [blockedUsers, setBlockedUsers] = useState(() => readJsonArray(BLOCKED_KEY));
  const [userQuery, setUserQuery] = useState("");
  const [userResults, setUserResults] = useState([]);

  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(prefs));
  }, [prefs]);

  useEffect(() => {
    localStorage.setItem(CLOSE_FRIENDS_KEY, JSON.stringify(closeFriends));
  }, [closeFriends]);

  useEffect(() => {
    localStorage.setItem(BLOCKED_KEY, JSON.stringify(blockedUsers));
  }, [blockedUsers]);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const [feedRes, reelsRes] = await Promise.all([
          api.get("/api/feed").catch(() => ({ data: [] })),
          api.get("/api/reels").catch(() => ({ data: [] }))
        ]);
        const all = [
          ...(Array.isArray(feedRes.data) ? feedRes.data : []),
          ...(Array.isArray(reelsRes.data) ? reelsRes.data : [])
        ];
        const next = {};
        all.forEach((item) => {
          if (!item?.id) return;
          next[item.id] = item;
        });
        if (mounted) setItemsById(next);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const q = userQuery.trim();
    if ((activePanel !== "closeFriends" && activePanel !== "blocked") || q.length < 1) {
      setUserResults([]);
      return undefined;
    }

    const timer = setTimeout(async () => {
      try {
        const res = await api.get("/api/profile/search", { params: { q } });
        if (cancelled) return;
        setUserResults(Array.isArray(res.data) ? res.data : []);
      } catch {
        if (!cancelled) setUserResults([]);
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [activePanel, userQuery]);

  const resolveUrl = (url) => {
    if (!url) return "";
    if (url.startsWith("http")) return url;
    const base = api.defaults.baseURL || "";
    return `${base}${url}`;
  };

  const emailToName = (email) => {
    const raw = (email || "").split("@")[0] || "";
    const cleaned = raw.replace(/[._-]+/g, " ").trim();
    if (!cleaned) return "User";
    return cleaned
      .split(" ")
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  };

  const usernameFor = (post) => {
    const raw = post?.user?.name || post?.username || post?.user?.email || "User";
    return raw.includes("@") ? emailToName(raw) : raw;
  };

  const panelIds = useMemo(() => {
    if (activePanel === "saved") return savedIds;
    if (activePanel === "watchLater") return watchLaterIds;
    if (activePanel === "archive") return archiveIds;
    return [];
  }, [activePanel, archiveIds, savedIds, watchLaterIds]);

  const panelItems = useMemo(
    () => panelIds.map((id) => itemsById[id]).filter(Boolean),
    [itemsById, panelIds]
  );

  const setToggle = (key) => setPrefs((prev) => ({ ...prev, [key]: !prev[key] }));
  const setChoice = (key, value) => setPrefs((prev) => ({ ...prev, [key]: value }));

  const removeFromPanel = (id) => {
    if (activePanel === "saved") {
      const next = savedIds.filter((x) => x !== id);
      setSavedIds(next);
      localStorage.setItem("savedPostIds", JSON.stringify(next));
      localStorage.setItem("savedReelIds", JSON.stringify(next));
      return;
    }
    if (activePanel === "watchLater") {
      const next = watchLaterIds.filter((x) => x !== id);
      setWatchLaterIds(next);
      localStorage.setItem("watchLaterPostIds", JSON.stringify(next));
      return;
    }
    if (activePanel === "archive") {
      const next = archiveIds.filter((x) => x !== id);
      setArchiveIds(next);
      localStorage.setItem("archivedPostIds", JSON.stringify(next));
    }
  };

  const clearPanel = () => {
    if (activePanel === "saved") {
      setSavedIds([]);
      localStorage.setItem("savedPostIds", JSON.stringify([]));
      localStorage.setItem("savedReelIds", JSON.stringify([]));
      return;
    }
    if (activePanel === "watchLater") {
      setWatchLaterIds([]);
      localStorage.setItem("watchLaterPostIds", JSON.stringify([]));
      return;
    }
    if (activePanel === "archive") {
      setArchiveIds([]);
      localStorage.setItem("archivedPostIds", JSON.stringify([]));
    }
  };

  const addUserToList = (listName, user) => {
    const payload = {
      id: Number(user?.id),
      name: user?.name || emailToName(user?.email || ""),
      email: user?.email || "",
      profilePic: user?.profilePic || ""
    };

    if (!payload.id) return;

    if (listName === "closeFriends") {
      setCloseFriends((prev) => (prev.some((u) => Number(u.id) === payload.id) ? prev : [payload, ...prev]));
      return;
    }

    if (listName === "blocked") {
      setBlockedUsers((prev) => (prev.some((u) => Number(u.id) === payload.id) ? prev : [payload, ...prev]));
    }
  };

  const removeUserFromList = (listName, id) => {
    if (listName === "closeFriends") {
      setCloseFriends((prev) => prev.filter((u) => Number(u.id) !== Number(id)));
      return;
    }
    setBlockedUsers((prev) => prev.filter((u) => Number(u.id) !== Number(id)));
  };

  const Row = ({ icon, title, value, onClick }) => (
    <button type="button" className="settings-row" onClick={onClick}>
      <span className="settings-row-icon">{icon}</span>
      <span className="settings-row-title">{title}</span>
      <span className="settings-row-value">{value || ""}</span>
      <span className="settings-row-arrow">{">"}</span>
    </button>
  );

  return (
    <div className="settings-page">
      <div className="max-w-2xl mx-auto space-y-6">
        <header className="settings-top">
          <button type="button" className="settings-back" onClick={() => navigate(-1)}>{"<"}</button>
          <h1>Settings and Activity</h1>
        </header>

        <section className="settings-section">
          <h2>How you use SocialSea</h2>
          <Row icon={"B"} title="Saved" value={savedIds.length} onClick={() => navigate("/saved")} />
          <Row icon={"A"} title="Archive" value={archiveIds.length} onClick={() => setActivePanel("archive")} />
          <Row icon={"Y"} title="Your activity" onClick={() => setActivePanel("activity")} />
          <Row
            icon={"N"}
            title="Notifications"
            value={prefs.notifications ? "On" : "Off"}
            onClick={() => navigate("/notifications")}
          />
          <Row icon={"T"} title="Time management" value={prefs.dailyTimeLimit} onClick={() => setActivePanel("time")} />
        </section>

        <section className="settings-section">
          <h2>Who can see your content</h2>
          <Row
            icon={"P"}
            title="Account privacy"
            value={prefs.accountPrivate ? "Private" : "Public"}
            onClick={() => setToggle("accountPrivate")}
          />
          <Row icon={"C"} title="Close Friends" value={String(closeFriends.length)} onClick={() => setActivePanel("closeFriends")} />
          <Row
            icon={"X"}
            title="Crossposting"
            value={prefs.crossposting ? "On" : "Off"}
            onClick={() => setToggle("crossposting")}
          />
          <Row icon={"B"} title="Blocked" value={String(blockedUsers.length)} onClick={() => setActivePanel("blocked")} />
          <Row
            icon={"S"}
            title="Story, live and location"
            value={prefs.storyLocationEnabled ? "On" : "Off"}
            onClick={() => setToggle("storyLocationEnabled")}
          />
          <Row
            icon={"F"}
            title="Activity in Friends tab"
            value={prefs.activityInFriendsTab ? "On" : "Off"}
            onClick={() => setToggle("activityInFriendsTab")}
          />
        </section>

        <section className="settings-section">
          <h2>How others can interact with you</h2>
          <Row icon={"M"} title="Messages and story replies" value={prefs.messageReplies} onClick={() => setActivePanel("messages")} />
          <Row icon={"@"} title="Tags and mentions" value={prefs.tagsMentions} onClick={() => setActivePanel("tags")} />
          <Row icon={"C"} title="Comments" value={prefs.comments} onClick={() => setActivePanel("comments")} />
        </section>

        <section className="settings-section">
          <h2>Anonymous Space</h2>
          <Row icon={"U"} title="Anonymous Upload" onClick={() => navigate("/anonymous/upload")} />
          <Row icon={"F"} title="Anonymous Feed" onClick={() => navigate("/anonymous-feed")} />
        </section>

        {(activePanel === "saved" || activePanel === "watchLater" || activePanel === "archive") && (
          <section className="settings-panel">
            <header className="settings-panel-head">
              <h3>
                {activePanel === "saved" && "Saved Videos"}
                {activePanel === "watchLater" && "Watch Later"}
                {activePanel === "archive" && "Archive"}
              </h3>
              <div>
                <button type="button" onClick={clearPanel}>Clear</button>
                <button type="button" onClick={() => setActivePanel("")}>Close</button>
              </div>
            </header>

            {loading && <p className="settings-empty">Loading items...</p>}
            {!loading && panelItems.length === 0 && <p className="settings-empty">No items yet.</p>}

            {!loading && panelItems.map((item) => {
              const rawUrl = item?.contentUrl || item?.mediaUrl || "";
              const mediaUrl = resolveUrl(String(rawUrl).trim());
              const type = (item?.type || "").toUpperCase() || (item?.reel ? "VIDEO" : "IMAGE");
              const title = item?.description || item?.content || "Untitled post";
              const author = usernameFor(item);
              return (
                <article className="settings-item" key={`${activePanel}-${item.id}`}>
                  <div className="settings-thumb-wrap">
                    {type === "VIDEO" ? (
                      <video src={mediaUrl} className="settings-thumb" muted playsInline preload="metadata" />
                    ) : (
                      <img src={mediaUrl} alt={title} className="settings-thumb" />
                    )}
                  </div>
                  <div className="settings-item-text">
                    <h4>{title}</h4>
                    <p>{author}</p>
                  </div>
                  <button type="button" className="settings-remove" onClick={() => removeFromPanel(item.id)}>
                    Remove
                  </button>
                </article>
              );
            })}
          </section>
        )}

        {activePanel === "activity" && (
          <section className="settings-panel">
            <header className="settings-panel-head">
              <h3>Your Activity</h3>
              <button type="button" onClick={() => setActivePanel("")}>Close</button>
            </header>
            <div className="settings-select-grid">
              <button type="button" onClick={() => setActivePanel("saved")}>Saved ({savedIds.length})</button>
              <button type="button" onClick={() => setActivePanel("watchLater")}>Watch Later ({watchLaterIds.length})</button>
              <button type="button" onClick={() => setActivePanel("archive")}>Archive ({archiveIds.length})</button>
            </div>
          </section>
        )}

        {activePanel === "time" && (
          <section className="settings-panel">
            <header className="settings-panel-head">
              <h3>Time Management</h3>
              <button type="button" onClick={() => setActivePanel("")}>Close</button>
            </header>
            <div className="settings-select-grid">
              {["30m/day", "1h/day", "2h/day", "3h/day", "No limit"].map((opt) => (
                <button
                  key={opt}
                  type="button"
                  className={prefs.dailyTimeLimit === opt ? "active" : ""}
                  onClick={() => setChoice("dailyTimeLimit", opt)}
                >
                  {opt}
                </button>
              ))}
            </div>
            <button type="button" className="watch-later-shortcut" onClick={() => setActivePanel("watchLater")}>
              Open Watch Later ({watchLaterIds.length})
            </button>
          </section>
        )}

        {(activePanel === "messages" || activePanel === "tags" || activePanel === "comments") && (
          <section className="settings-panel">
            <header className="settings-panel-head">
              <h3>
                {activePanel === "messages" && "Messages and Story Replies"}
                {activePanel === "tags" && "Tags and Mentions"}
                {activePanel === "comments" && "Comments"}
              </h3>
              <button type="button" onClick={() => setActivePanel("")}>Close</button>
            </header>

            <div className="settings-select-grid">
              {["Everyone", "People You Follow", "No one"].map((opt) => (
                <button
                  key={opt}
                  type="button"
                  className={
                    (activePanel === "messages" && prefs.messageReplies === opt) ||
                    (activePanel === "tags" && prefs.tagsMentions === opt) ||
                    (activePanel === "comments" && prefs.comments === opt)
                      ? "active"
                      : ""
                  }
                  onClick={() => {
                    if (activePanel === "messages") setChoice("messageReplies", opt);
                    if (activePanel === "tags") setChoice("tagsMentions", opt);
                    if (activePanel === "comments") setChoice("comments", opt);
                  }}
                >
                  {opt}
                </button>
              ))}
            </div>
          </section>
        )}

        {(activePanel === "closeFriends" || activePanel === "blocked") && (
          <section className="settings-panel">
            <header className="settings-panel-head">
              <h3>{activePanel === "closeFriends" ? "Close Friends" : "Blocked Users"}</h3>
              <button type="button" onClick={() => setActivePanel("")}>Close</button>
            </header>

            <input
              type="text"
              className="settings-user-search"
              placeholder="Type name or email"
              value={userQuery}
              onChange={(e) => setUserQuery(e.target.value)}
            />

            <div className="settings-user-list">
              {userResults.map((u) => (
                <button
                  key={`${activePanel}-suggest-${u.id}`}
                  type="button"
                  className="settings-user-row"
                  onClick={() => addUserToList(activePanel, u)}
                >
                  <span className="settings-user-avatar">{(u?.name?.[0] || u?.email?.[0] || "U").toUpperCase()}</span>
                  <span className="settings-user-meta">
                    <strong>{u?.name || emailToName(u?.email || "")}</strong>
                    <small>{u?.email || ""}</small>
                  </span>
                </button>
              ))}
              {userQuery.trim().length > 0 && userResults.length === 0 && (
                <p className="settings-empty">No matching users.</p>
              )}
            </div>

            <hr className="settings-divider" />
            <div className="settings-user-list">
              {(activePanel === "closeFriends" ? closeFriends : blockedUsers).map((u) => (
                <article className="settings-item" key={`${activePanel}-picked-${u.id}`}>
                  <div className="settings-item-text">
                    <h4>{u.name || emailToName(u.email || "")}</h4>
                    <p>{u.email || ""}</p>
                  </div>
                  <button
                    type="button"
                    className="settings-remove"
                    onClick={() => removeUserFromList(activePanel, u.id)}
                  >
                    Remove
                  </button>
                </article>
              ))}
              {(activePanel === "closeFriends" ? closeFriends : blockedUsers).length === 0 && (
                <p className="settings-empty">No users in this list.</p>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
