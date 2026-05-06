import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../api/axios";
import { recordAccountHistoryEntry } from "../services/activityStore";
import "./Settings.css";

const SETTINGS_KEY = "socialsea_settings_v1";
const CLOSE_FRIENDS_KEY = "socialsea_close_friends_v1";
const BLOCKED_KEY = "socialsea_blocked_users_v1";

const DEFAULT_PREFS = {
  crossposting: false,
  storyLocationEnabled: true,
  activityInFriendsTab: true,
  showSosInNavbar: false,
  messageReplies: "Everyone",
  tagsMentions: "People You Follow",
  comments: "Everyone",
  studyModeReels: false,
  gestureCursorEnabled: false,
  dailyTimeLimit: "2h/day",
  trafficAlerts: false,
  ambulanceNavigation: false,
  jobMode: "profile",
  showMyStoriesOnProfile: true,
  showAnonymousShortcutsOnProfile: true
};

const BOOL_OPTIONS = [
  {
    id: "study-mode",
    title: "Study Mode",
    subtitle: "Hide clips while studying.",
    prefKey: "studyModeReels",
    label: "Study mode (hide Clips)"
  },
  {
    id: "gesture-cursor",
    title: "Hand Gesture Cursor",
    subtitle: "Thumb + middle finger = left click, thumb + ring finger = right click.",
    prefKey: "gestureCursorEnabled",
    label: "Hand gesture cursor"
  },
  {
    id: "sos-navbar",
    title: "SOS on Navbar",
    subtitle: "Show or hide SOS shortcut in bottom navigation.",
    prefKey: "showSosInNavbar",
    label: "SOS on Navbar"
  },
  {
    id: "stories-profile",
    title: "My Stories on Profile",
    subtitle: "Show your story ring on your profile.",
    prefKey: "showMyStoriesOnProfile",
    label: "My Stories on profile"
  },
  {
    id: "anonymous-profile",
    title: "Anonymous Shortcuts on Profile",
    subtitle: "Show or hide Anonymous Upload and Anonymous Feed shortcuts on profile.",
    prefKey: "showAnonymousShortcutsOnProfile",
    label: "Anonymous shortcuts on profile"
  },
  {
    id: "crossposting",
    title: "Crossposting",
    subtitle: "Allow content crossposting to linked areas.",
    prefKey: "crossposting",
    label: "Crossposting"
  },
  {
    id: "story-live-location",
    title: "Story, Live and Location",
    subtitle: "Allow story/live/location visibility features.",
    prefKey: "storyLocationEnabled",
    label: "Story, live and location"
  },
  {
    id: "activity-friends",
    title: "Activity in Friends Tab",
    subtitle: "Show your activity updates in Friends tab.",
    prefKey: "activityInFriendsTab",
    label: "Activity in Friends tab"
  }
];

const CHOICE_OPTIONS = [
  {
    id: "time-management",
    title: "Time Management",
    subtitle: "Set your daily usage reminder limit.",
    prefKey: "dailyTimeLimit",
    label: "Time management",
    values: ["30m/day", "1h/day", "2h/day", "3h/day", "No limit"]
  },
  {
    id: "message-replies",
    title: "Messages and Story Replies",
    subtitle: "Control who can message you and reply to stories.",
    prefKey: "messageReplies",
    label: "Messages and story replies",
    values: ["Everyone", "People You Follow", "No one"]
  },
  {
    id: "tags-mentions",
    title: "Tags and Mentions",
    subtitle: "Choose who can tag or mention you.",
    prefKey: "tagsMentions",
    label: "Tags and mentions",
    values: ["Everyone", "People You Follow", "No one"]
  },
  {
    id: "comments",
    title: "Comments",
    subtitle: "Choose who can comment on your content.",
    prefKey: "comments",
    label: "Comments",
    values: ["Everyone", "People You Follow", "No one"]
  }
];

const JOB_MODE_OPTIONS = [
  { value: "profile", label: "Jobs on profile" },
  { value: "post", label: "Post a Job" },
  { value: "storage", label: "Storage Vault" },
  { value: "off", label: "Off" }
];

const JOB_MODE_ROUTES = new Set(["jobs-profile", "jobs-post", "jobs-storage"]);

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

const normalizeJobMode = (mode) => {
  if (mode === "post" || mode === "profile" || mode === "off" || mode === "storage") return mode;
  return "profile";
};

const readPrefs = () => {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const next = { ...DEFAULT_PREFS, ...(parsed || {}) };
    next.jobMode = normalizeJobMode(next.jobMode);
    return next;
  } catch {
    return { ...DEFAULT_PREFS };
  }
};

const writePrefs = (updater) => {
  try {
    const current = readPrefs();
    const next = typeof updater === "function" ? updater(current) : { ...current, ...(updater || {}) };
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  } catch {
    // ignore storage failures
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("ss-settings-update"));
  }
};

const resolveMediaUrl = (url) => {
  if (!url) return "";
  if (url.startsWith("http")) return url;
  const base = api.defaults.baseURL || "";
  return `${base}${url}`;
};

const describeJobIntent = (optionId) => {
  if (optionId === "jobs-post") return "Post a Job";
  if (optionId === "jobs-storage") return "Storage Vault";
  return "Jobs on profile";
};

export default function SettingsManage() {
  const navigate = useNavigate();
  const { optionId = "" } = useParams();
  const [prefs, setPrefs] = useState(readPrefs);
  const [busy, setBusy] = useState(false);
  const [ambulanceApproved, setAmbulanceApproved] = useState(false);

  const [itemsById, setItemsById] = useState({});
  const [loadingItems, setLoadingItems] = useState(false);
  const [archiveIds, setArchiveIds] = useState(() => readIds("archivedPostIds"));

  const [closeFriends, setCloseFriends] = useState(() => readJsonArray(CLOSE_FRIENDS_KEY));
  const [blockedUsers, setBlockedUsers] = useState(() => readJsonArray(BLOCKED_KEY));
  const [userQuery, setUserQuery] = useState("");
  const [userResults, setUserResults] = useState([]);

  const boolConfig = useMemo(() => BOOL_OPTIONS.find((opt) => opt.id === optionId), [optionId]);
  const choiceConfig = useMemo(() => CHOICE_OPTIONS.find((opt) => opt.id === optionId), [optionId]);
  const isJobsConfig = JOB_MODE_ROUTES.has(optionId);
  const isArchiveConfig = optionId === "archive";
  const isCloseFriendsConfig = optionId === "close-friends";
  const isBlockedConfig = optionId === "blocked";
  const isTrafficConfig = optionId === "traffic-alerts";
  const isAmbulanceConfig = optionId === "ambulance-navigation";

  const panelUsers = isCloseFriendsConfig ? closeFriends : blockedUsers;
  const archiveItems = useMemo(
    () => archiveIds.map((id) => itemsById[id]).filter(Boolean),
    [archiveIds, itemsById]
  );

  useEffect(() => {
    setPrefs(readPrefs());
  }, [optionId]);

  useEffect(() => {
    if (!isArchiveConfig) return undefined;
    let mounted = true;
    setLoadingItems(true);
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
        if (mounted) setLoadingItems(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, [isArchiveConfig]);

  useEffect(() => {
    localStorage.setItem(CLOSE_FRIENDS_KEY, JSON.stringify(closeFriends));
  }, [closeFriends]);

  useEffect(() => {
    localStorage.setItem(BLOCKED_KEY, JSON.stringify(blockedUsers));
  }, [blockedUsers]);

  useEffect(() => {
    if (!isCloseFriendsConfig && !isBlockedConfig) return undefined;
    const q = userQuery.trim();
    if (q.length < 1) {
      setUserResults([]);
      return undefined;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await api.get("/api/profile/search", { params: { q } });
        if (!cancelled) {
          setUserResults(Array.isArray(res.data) ? res.data : []);
        }
      } catch {
        if (!cancelled) setUserResults([]);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isBlockedConfig, isCloseFriendsConfig, userQuery]);

  useEffect(() => {
    if (!isAmbulanceConfig && !isTrafficConfig) return undefined;
    let cancelled = false;
    const loadProfileBits = async () => {
      try {
        const res = await api.get("/api/profile/me");
        const data = res?.data?.user || res?.data || {};
        const trafficValue = data?.trafficAlertsEnabled ?? data?.trafficAlerts;
        const approved = data?.ambulanceDriverApproved;
        if (!cancelled && typeof trafficValue === "boolean") {
          setPrefs((prev) => ({ ...prev, trafficAlerts: trafficValue }));
          writePrefs((prev) => ({ ...prev, trafficAlerts: trafficValue }));
        }
        if (!cancelled && typeof approved === "boolean") {
          setAmbulanceApproved(approved);
        }
      } catch {
        // keep local preference if backend is unavailable
      }
    };
    loadProfileBits();
    return () => {
      cancelled = true;
    };
  }, [isAmbulanceConfig, isTrafficConfig]);

  const updatePref = (key, value, label) => {
    setPrefs((prev) => ({ ...prev, [key]: value }));
    writePrefs((prev) => ({ ...prev, [key]: value }));
    recordAccountHistoryEntry({
      action: label || key,
      detail: typeof value === "boolean" ? (value ? "Turned on" : "Turned off") : String(value),
      source: "settings"
    });
  };

  const setTrafficAlerts = async (next) => {
    if (busy || next === !!prefs.trafficAlerts) return;
    setBusy(true);
    updatePref("trafficAlerts", next, "Traffic Alerts");
    try {
      await api.post("/api/profile/me/traffic-alerts", { enabled: next });
    } catch {
      // keep local selection if backend is unavailable
    } finally {
      setBusy(false);
    }
  };

  const setJobMode = (mode) => {
    const nextMode = normalizeJobMode(mode);
    updatePref("jobMode", nextMode, "Jobs on profile");
  };

  const removeArchiveItem = (id) => {
    const next = archiveIds.filter((x) => x !== Number(id));
    setArchiveIds(next);
    localStorage.setItem("archivedPostIds", JSON.stringify(next));
  };

  const clearArchive = () => {
    setArchiveIds([]);
    localStorage.setItem("archivedPostIds", JSON.stringify([]));
  };

  const addUserToList = (listName, user) => {
    const payload = {
      id: Number(user?.id),
      name: user?.name || emailToName(user?.email || ""),
      email: user?.email || "",
      profilePic: user?.profilePic || ""
    };
    if (!payload.id) return;
    if (listName === "close-friends") {
      setCloseFriends((prev) => (prev.some((u) => Number(u.id) === payload.id) ? prev : [payload, ...prev]));
      return;
    }
    setBlockedUsers((prev) => (prev.some((u) => Number(u.id) === payload.id) ? prev : [payload, ...prev]));
  };

  const removeUserFromList = (listName, id) => {
    if (listName === "close-friends") {
      setCloseFriends((prev) => prev.filter((u) => Number(u.id) !== Number(id)));
      return;
    }
    setBlockedUsers((prev) => prev.filter((u) => Number(u.id) !== Number(id)));
  };

  const renderHeader = (title, subtitle) => (
    <header className="settings-top">
      <button type="button" className="settings-back" onClick={() => navigate("/settings")}>
        {"<"}
      </button>
      <div>
        <h1>{title}</h1>
        <p className="settings-subtitle">{subtitle}</p>
      </div>
    </header>
  );

  if (boolConfig) {
    const current = !!prefs[boolConfig.prefKey];
    return (
      <div className="settings-page">
        <div className="settings-shell">
          {renderHeader(boolConfig.title, boolConfig.subtitle)}
          <section className="settings-panel">
            <header className="settings-panel-head">
              <h3>{boolConfig.label}</h3>
            </header>
            <div className="settings-select-grid">
              <button type="button" className={current ? "active" : ""} onClick={() => updatePref(boolConfig.prefKey, true, boolConfig.label)}>
                On
              </button>
              <button type="button" className={!current ? "active" : ""} onClick={() => updatePref(boolConfig.prefKey, false, boolConfig.label)}>
                Off
              </button>
            </div>
          </section>
        </div>
      </div>
    );
  }

  if (choiceConfig) {
    const current = prefs[choiceConfig.prefKey];
    return (
      <div className="settings-page">
        <div className="settings-shell">
          {renderHeader(choiceConfig.title, choiceConfig.subtitle)}
          <section className="settings-panel">
            <header className="settings-panel-head">
              <h3>{choiceConfig.label}</h3>
            </header>
            <div className="settings-select-grid">
              {choiceConfig.values.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  className={current === opt ? "active" : ""}
                  onClick={() => updatePref(choiceConfig.prefKey, opt, choiceConfig.label)}
                >
                  {opt}
                </button>
              ))}
            </div>
          </section>
        </div>
      </div>
    );
  }

  if (isJobsConfig) {
    const current = normalizeJobMode(prefs.jobMode);
    return (
      <div className="settings-page">
        <div className="settings-shell">
          {renderHeader("Jobs", `Adjust ${describeJobIntent(optionId)} visibility mode.`)}
          <section className="settings-panel">
            <header className="settings-panel-head">
              <h3>Job mode</h3>
            </header>
            <div className="settings-select-grid">
              {JOB_MODE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={current === opt.value ? "active" : ""}
                  onClick={() => setJobMode(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </section>
        </div>
      </div>
    );
  }

  if (isTrafficConfig) {
    const enabled = !!prefs.trafficAlerts;
    return (
      <div className="settings-page">
        <div className="settings-shell">
          {renderHeader("Traffic Alerts", "Enable live traffic notices while you browse.")}
          <section className="settings-panel">
            <header className="settings-panel-head">
              <h3>Traffic alerts</h3>
            </header>
            <div className="settings-select-grid">
              <button type="button" className={enabled ? "active" : ""} disabled={busy} onClick={() => setTrafficAlerts(true)}>
                On
              </button>
              <button type="button" className={!enabled ? "active" : ""} disabled={busy} onClick={() => setTrafficAlerts(false)}>
                Off
              </button>
            </div>
          </section>
        </div>
      </div>
    );
  }

  if (isAmbulanceConfig) {
    const enabled = !!prefs.ambulanceNavigation;
    return (
      <div className="settings-page">
        <div className="settings-shell">
          {renderHeader("Ambulance Navigation", "Control emergency navigation mode access and toggle.")}
          <section className="settings-panel">
            <header className="settings-panel-head">
              <h3>Ambulance navigation</h3>
            </header>
            {!ambulanceApproved ? (
              <>
                <p className="settings-note">Your account is not approved yet. Request access first.</p>
                <button type="button" className="watch-later-shortcut" onClick={() => navigate("/ambulance")}>
                  Request Access
                </button>
              </>
            ) : (
              <div className="settings-select-grid">
                <button type="button" className={enabled ? "active" : ""} onClick={() => updatePref("ambulanceNavigation", true, "Ambulance Navigation")}>
                  On
                </button>
                <button type="button" className={!enabled ? "active" : ""} onClick={() => updatePref("ambulanceNavigation", false, "Ambulance Navigation")}>
                  Off
                </button>
              </div>
            )}
          </section>
        </div>
      </div>
    );
  }

  if (isArchiveConfig) {
    return (
      <div className="settings-page">
        <div className="settings-shell">
          {renderHeader("Archive", "Review and manage archived items.")}
          <section className="settings-panel">
            <header className="settings-panel-head">
              <h3>Archive items</h3>
              <div>
                <button type="button" onClick={clearArchive}>Clear</button>
              </div>
            </header>
            {loadingItems && <p className="settings-empty">Loading items...</p>}
            {!loadingItems && archiveItems.length === 0 && <p className="settings-empty">No items yet.</p>}
            {!loadingItems && archiveItems.map((item) => {
              const rawUrl = item?.contentUrl || item?.mediaUrl || "";
              const mediaUrl = resolveMediaUrl(String(rawUrl).trim());
              const type = (item?.type || "").toUpperCase() || (item?.reel ? "VIDEO" : "IMAGE");
              const title = item?.description || item?.content || "Untitled post";
              const author = usernameFor(item);
              return (
                <article className="settings-item" key={`archive-${item.id}`}>
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
                  <button type="button" className="settings-remove" onClick={() => removeArchiveItem(item.id)}>
                    Remove
                  </button>
                </article>
              );
            })}
          </section>
        </div>
      </div>
    );
  }

  if (isCloseFriendsConfig || isBlockedConfig) {
    const key = isCloseFriendsConfig ? "close-friends" : "blocked";
    return (
      <div className="settings-page">
        <div className="settings-shell">
          {renderHeader(
            isCloseFriendsConfig ? "Close Friends" : "Blocked Users",
            isCloseFriendsConfig ? "Manage your close friends list." : "Manage blocked users."
          )}
          <section className="settings-panel">
            <header className="settings-panel-head">
              <h3>{isCloseFriendsConfig ? "Close Friends" : "Blocked Users"}</h3>
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
                  key={`${key}-suggest-${u.id}`}
                  type="button"
                  className="settings-user-row"
                  onClick={() => addUserToList(key, u)}
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
              {panelUsers.map((u) => (
                <article className="settings-item" key={`${key}-picked-${u.id}`}>
                  <div className="settings-item-text">
                    <h4>{u.name || emailToName(u.email || "")}</h4>
                    <p>{u.email || ""}</p>
                  </div>
                  <button type="button" className="settings-remove" onClick={() => removeUserFromList(key, u.id)}>
                    Remove
                  </button>
                </article>
              ))}
              {panelUsers.length === 0 && <p className="settings-empty">No users in this list.</p>}
            </div>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="settings-page">
      <div className="settings-shell">
        {renderHeader("Settings", "This option is not configured yet.")}
        <section className="settings-panel">
          <p className="settings-empty">Unknown settings option: {optionId}</p>
        </section>
      </div>
    </div>
  );
}
