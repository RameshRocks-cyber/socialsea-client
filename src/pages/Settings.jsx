import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/axios";
import { DEFAULT_SOUND_PREFS, SETTINGS_KEY, getSoundLabel, readSoundPrefs } from "./soundPrefs";
import {
  CONTENT_TYPE_OPTIONS,
  DEFAULT_CONTENT_TYPES,
  getContentTypeLabel,
  normalizeContentTypeList
} from "./contentPrefs";
import { COLOR_THEME_OPTIONS, readTheme, setTheme, readCustomThemeColors, setCustomThemeColors } from "../theme";
import { recordAccountHistoryEntry } from "../services/activityStore";
import { getLanguageLabel } from "../i18n/languages";
import "./Settings.css";

const CLOSE_FRIENDS_KEY = "socialsea_close_friends_v1";
const BLOCKED_KEY = "socialsea_blocked_users_v1";
const NOTIFICATION_CHARACTERS = [
  "Lion",
  "Dog",
  "Puppy",
  "Cat",
  "Panda",
  "Bunny",
  "Penguin",
  "Anime Hero",
  "Robot Cat",
  "Cartoon Kid"
];
const defaultPrefs = {
  accountPrivate: true,
  crossposting: false,
  storyLocationEnabled: true,
  activityInFriendsTab: true,
  showSosInNavbar: false,
  messageReplies: "Everyone",
  tagsMentions: "People You Follow",
  comments: "Everyone",
  notifications: true,
  notificationBuddy: true,
  notificationBuddyCharacter: "Cat",
  notificationBuddyHideWhenEmpty: false,
  notificationBuddyVoiceEnabled: true,
  notificationBuddyVoiceName: "",
  notificationBuddyVoiceRate: 1,
  notificationBuddyVoicePitch: 1,
  studyModeReels: false,
  gestureCursorEnabled: false,
  dailyTimeLimit: "2h/day",
  notificationSound: DEFAULT_SOUND_PREFS.notificationSound,
  ringtoneSound: DEFAULT_SOUND_PREFS.ringtoneSound,
  trafficAlerts: false,
  ambulanceNavigation: false,
  preferredLanguage: "en",
  contentTypes: DEFAULT_CONTENT_TYPES,
  jobMode: "profile",
  showMyStoriesOnProfile: true
};

const SETTING_LABELS = {
  accountPrivate: "Account privacy",
  crossposting: "Crossposting",
  storyLocationEnabled: "Story, live and location",
  activityInFriendsTab: "Activity in Friends tab",
  showSosInNavbar: "SOS on Navbar",
  studyModeReels: "Study mode",
  gestureCursorEnabled: "Hand gesture cursor",
  notifications: "Notifications",
  notificationBuddy: "Notification Character",
  trafficAlerts: "Traffic Alerts",
  ambulanceNavigation: "Ambulance Navigation",
  preferredLanguage: "Language",
  showMyStoriesOnProfile: "My Stories on profile"
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

const normalizeJobMode = (prefs) => {
  if (prefs?.jobMode === "post" || prefs?.jobMode === "profile" || prefs?.jobMode === "off" || prefs?.jobMode === "storage") {
    return prefs.jobMode;
  }
  if (typeof prefs?.showJobsOnProfile === "boolean") {
    return prefs.showJobsOnProfile ? "profile" : "off";
  }
  return "profile";
};

const normalizeNotificationCharacter = (value) =>
  NOTIFICATION_CHARACTERS.includes(value) ? value : defaultPrefs.notificationBuddyCharacter;
const normalizeNotificationHideEmpty = (value) =>
  typeof value === "boolean" ? value : defaultPrefs.notificationBuddyHideWhenEmpty;

const readPrefs = () => {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) {
      const base = { ...defaultPrefs, ...readSoundPrefs() };
      const normalized = { ...base, jobMode: normalizeJobMode(base) };
      normalized.notificationBuddyCharacter = normalizeNotificationCharacter(normalized.notificationBuddyCharacter);
      normalized.notificationBuddyHideWhenEmpty = normalizeNotificationHideEmpty(
        normalized.notificationBuddyHideWhenEmpty
      );
      normalized.contentTypes = normalizeContentTypeList(normalized.contentTypes);
      return normalized;
    }
    const parsed = JSON.parse(raw);
    const base = { ...defaultPrefs, ...(parsed || {}), ...readSoundPrefs() };
    const normalized = { ...base, jobMode: normalizeJobMode(base) };
    normalized.notificationBuddyCharacter = normalizeNotificationCharacter(normalized.notificationBuddyCharacter);
    normalized.notificationBuddyHideWhenEmpty = normalizeNotificationHideEmpty(
      normalized.notificationBuddyHideWhenEmpty
    );
    normalized.contentTypes = normalizeContentTypeList(normalized.contentTypes);
    return normalized;
  } catch {
    const base = { ...defaultPrefs, ...readSoundPrefs() };
    const normalized = { ...base, jobMode: normalizeJobMode(base) };
    normalized.notificationBuddyCharacter = normalizeNotificationCharacter(normalized.notificationBuddyCharacter);
    normalized.notificationBuddyHideWhenEmpty = normalizeNotificationHideEmpty(
      normalized.notificationBuddyHideWhenEmpty
    );
    normalized.contentTypes = normalizeContentTypeList(normalized.contentTypes);
    return normalized;
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
  const [colorTheme, setColorTheme] = useState(readTheme);
  const [customThemeColors, setCustomThemeColorsState] = useState(readCustomThemeColors);
  const [privacyBusy, setPrivacyBusy] = useState(false);
  const [ambulanceApproved, setAmbulanceApproved] = useState(false);
  const [trafficAlertsBusy, setTrafficAlertsBusy] = useState(false);

  const [closeFriends, setCloseFriends] = useState(() => readJsonArray(CLOSE_FRIENDS_KEY));
  const [blockedUsers, setBlockedUsers] = useState(() => readJsonArray(BLOCKED_KEY));
  const [userQuery, setUserQuery] = useState("");
  const [userResults, setUserResults] = useState([]);
  const jobMode =
    prefs.jobMode === "post" ? "post" :
    prefs.jobMode === "storage" ? "storage" :
    prefs.jobMode === "off" ? "off" :
    "profile";
  const colorThemeLabel = useMemo(() => {
    const match = COLOR_THEME_OPTIONS.find((opt) => opt.id === colorTheme);
    return match ? match.label : "Ocean";
  }, [colorTheme]);
  const contentTypeSelection = useMemo(
    () => normalizeContentTypeList(prefs.contentTypes),
    [prefs.contentTypes]
  );
  const contentTypeSummary = useMemo(() => {
    const total = CONTENT_TYPE_OPTIONS.length;
    if (contentTypeSelection.length === 0 || contentTypeSelection.length >= total) return "All";
    if (contentTypeSelection.length === 1) return getContentTypeLabel(contentTypeSelection[0]);
    if (contentTypeSelection.length === 2) {
      return `${getContentTypeLabel(contentTypeSelection[0])}, ${getContentTypeLabel(contentTypeSelection[1])}`;
    }
    return `${contentTypeSelection.length} selected`;
  }, [contentTypeSelection]);
  const preferredLanguageLabel = useMemo(() => getLanguageLabel(prefs.preferredLanguage), [prefs.preferredLanguage]);

  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(prefs));
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("ss-settings-update"));
    }
  }, [prefs]);

  useEffect(() => {
    let cancelled = false;
    const loadPrivacy = async () => {
      try {
        const res = await api.get("/api/profile/me");
        const data = res?.data?.user || res?.data || {};
        const value = data?.privateAccount ?? data?.accountPrivate;
        const trafficValue = data?.trafficAlertsEnabled ?? data?.trafficAlerts;
        const ambulanceValue = data?.ambulanceDriverApproved;
        const languageValue = data?.preferredLanguage;
        if (!cancelled && typeof value === "boolean") {
          setPrefs((prev) => ({ ...prev, accountPrivate: value }));
        }
        if (!cancelled && typeof trafficValue === "boolean") {
          setPrefs((prev) => ({ ...prev, trafficAlerts: trafficValue }));
        }
        if (!cancelled && typeof ambulanceValue === "boolean") {
          setAmbulanceApproved(ambulanceValue);
        }
        if (!cancelled && typeof languageValue === "string" && languageValue.trim()) {
          setPrefs((prev) => ({ ...prev, preferredLanguage: languageValue.trim() }));
        }
      } catch {
        // keep local preference if backend is unavailable
      }
    };
    loadPrivacy();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(CLOSE_FRIENDS_KEY, JSON.stringify(closeFriends));
  }, [closeFriends]);

  useEffect(() => {
    localStorage.setItem(BLOCKED_KEY, JSON.stringify(blockedUsers));
  }, [blockedUsers]);

  useEffect(() => {
    setTheme(colorTheme);
  }, [colorTheme]);

  useEffect(() => {
    setCustomThemeColors(customThemeColors);
  }, [customThemeColors]);

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

  const setAccountPrivacy = async (next) => {
    if (privacyBusy || next === prefs.accountPrivate) return;
    setPrefs((prev) => ({ ...prev, accountPrivate: next }));
    recordAccountHistoryEntry({
      action: "Account privacy",
      detail: next ? "Private" : "Public",
      source: "settings"
    });
    setPrivacyBusy(true);
    try {
      await api.post("/api/profile/me/privacy", { privateAccount: next });
    } catch {
      // Keep local selection if the backend is unavailable
    } finally {
      setPrivacyBusy(false);
    }
  };

  const setTrafficAlerts = async (next) => {
    if (trafficAlertsBusy || next === prefs.trafficAlerts) return;
    setPrefs((prev) => ({ ...prev, trafficAlerts: next }));
    recordAccountHistoryEntry({
      action: "Traffic Alerts",
      detail: next ? "Turned on" : "Turned off",
      source: "settings"
    });
    setTrafficAlertsBusy(true);
    try {
      await api.post("/api/profile/me/traffic-alerts", { enabled: next });
    } catch {
      // Keep local selection if the backend is unavailable
    } finally {
      setTrafficAlertsBusy(false);
    }
  };

  const setToggle = (key) => {
    if (key === "accountPrivate") {
      setAccountPrivacy(!prefs.accountPrivate);
      return;
    }
    if (key === "trafficAlerts") {
      setTrafficAlerts(!prefs.trafficAlerts);
      return;
    }
    const nextValue = !prefs[key];
    setPrefs((prev) => ({ ...prev, [key]: nextValue }));
    recordAccountHistoryEntry({
      action: SETTING_LABELS[key] || key,
      detail: typeof nextValue === "boolean" ? (nextValue ? "Turned on" : "Turned off") : String(nextValue),
      source: "settings"
    });
  };
  const setChoice = (key, value) => {
    setPrefs((prev) => ({ ...prev, [key]: value }));
    recordAccountHistoryEntry({
      action: SETTING_LABELS[key] || key,
      detail: String(value),
      source: "settings"
    });
  };
  const setJobMode = (mode) => {
    setPrefs((prev) => ({ ...prev, jobMode: mode }));
    recordAccountHistoryEntry({
      action: "Jobs on profile",
      detail:
        mode === "profile" ? "Show on profile" :
        mode === "post" ? "Post a job" :
        mode === "storage" ? "Storage Vault" :
        "Off",
      source: "settings"
    });
  };

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
      <div className="settings-shell">
        <header className="settings-top">
          <button type="button" className="settings-back" onClick={() => navigate(-1)}>{"<"}</button>
          <div>
            <h1>Settings and Activity</h1>
            <p className="settings-subtitle">Control privacy, activity, and experience in one place.</p>
          </div>
        </header>

        <section className="settings-section">
          <h2>Jobs</h2>
          <Row
            icon={"J"}
            title="Jobs on profile"
            value={jobMode === "profile" ? "On" : "Off"}
            onClick={() => {
              setJobMode(jobMode === "profile" ? "off" : "profile");
              setActivePanel("");
            }}
          />
          <Row
            icon={"PJ"}
            title="Post a Job"
            value={jobMode === "post" ? "On" : "Off"}
            onClick={() => {
              setJobMode(jobMode === "post" ? "off" : "post");
              setActivePanel("");
            }}
          />
          <Row
            icon={"SV"}
            title="Storage Vault"
            value={jobMode === "storage" ? "On" : "Off"}
            onClick={() => {
              setJobMode(jobMode === "storage" ? "off" : "storage");
              setActivePanel("");
            }}
          />
          <p className="settings-note">Turn one on, or keep all off to hide.</p>
        </section>

        <section className="settings-section">
          <h2>How you use SocialSea</h2>
          <Row icon={"AP"} title="Appearance" value={colorThemeLabel} onClick={() => navigate("/settings/appearance")} />
          <Row
            icon={"CT"}
            title="Content types"
            value={contentTypeSummary}
            onClick={() => navigate("/settings/content-types")}
          />
          <Row icon={"LG"} title="Language" value={preferredLanguageLabel} onClick={() => navigate("/settings/language")} />
          <Row
            icon={"ST"}
            title="Study mode (hide Reels)"
            value={prefs.studyModeReels ? "On" : "Off"}
            onClick={() => setToggle("studyModeReels")}
          />
          <Row
            icon={"HG"}
            title="Hand gesture cursor"
            value={prefs.gestureCursorEnabled ? "On" : "Off"}
            onClick={() => setToggle("gestureCursorEnabled")}
          />
          <Row icon={"B"} title="Saved" value={savedIds.length} onClick={() => navigate("/saved")} />
          <Row icon={"A"} title="Archive" value={archiveIds.length} onClick={() => setActivePanel("archive")} />
          <Row icon={"Y"} title="Your activity" onClick={() => navigate("/settings/activity")} />
          <Row icon={"LA"} title="Login activity" value="Open" onClick={() => navigate("/settings/login-activity")} />
          <Row
            icon={"SOS"}
            title="SOS on Navbar"
            value={prefs.showSosInNavbar ? "On" : "Off"}
            onClick={() => setToggle("showSosInNavbar")}
          />
          <Row
            icon={"!"}
            title="SOS Control Center"
            value="Open"
            onClick={() => navigate("/sos")}
          />
          <Row
            icon={"N"}
            title="Notifications"
            value={prefs.notifications ? "On" : "Off"}
            onClick={() => navigate("/notifications")}
          />
          <Row
            icon={"TA"}
            title="Traffic Alerts"
            value={prefs.trafficAlerts ? "On" : "Off"}
            onClick={() => setToggle("trafficAlerts")}
          />
          <Row
            icon={"AMB"}
            title="Ambulance Navigation"
            value={ambulanceApproved ? (prefs.ambulanceNavigation ? "On" : "Off") : "Request access"}
            onClick={() => {
              if (!ambulanceApproved) {
                navigate("/ambulance");
                return;
              }
              setToggle("ambulanceNavigation");
            }}
          />
          <Row
            icon={"MS"}
            title="My Stories on profile"
            value={prefs.showMyStoriesOnProfile ? "On" : "Off"}
            onClick={() => setToggle("showMyStoriesOnProfile")}
          />
          <Row
            icon={"NC"}
            title="Notification Character"
            value={prefs.notificationBuddy ? `On - ${prefs.notificationBuddyCharacter}` : "Off"}
            onClick={() => navigate("/settings/notification-buddy")}
          />
          <Row
            icon={"NS"}
            title="Notification sound"
            value={getSoundLabel("notification", prefs.notificationSound)}
            onClick={() => navigate("/settings/sounds")}
          />
          <Row
            icon={"R"}
            title="Ringtone"
            value={getSoundLabel("ringtone", prefs.ringtoneSound)}
            onClick={() => navigate("/settings/sounds")}
          />
          <Row icon={"T"} title="Time management" value={prefs.dailyTimeLimit} onClick={() => setActivePanel("time")} />
        </section>

        <section className="settings-section">
          <h2>Who can see your content</h2>
          <Row
            icon={"P"}
            title="Account privacy"
            value={prefs.accountPrivate ? "Private" : "Public"}
            onClick={() => navigate("/settings/privacy")}
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
            icon={"L"}
            title="My exact location"
            value="Open"
            onClick={() => navigate("/settings/location")}
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
          <Row icon={"AP"} title="Appearance" value={colorThemeLabel} onClick={() => navigate("/settings/appearance")} />
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

        {activePanel === "theme" && (
          <section className="settings-panel">
            <header className="settings-panel-head">
              <h3>Color Theme</h3>
              <button type="button" onClick={() => setActivePanel("")}>Close</button>
            </header>
            <div className="settings-theme-mode">
              <button
                type="button"
                className={colorTheme === "black" ? "active" : ""}
                onClick={() => setColorTheme("black")}
              >
                Dark
              </button>
              <button
                type="button"
                className={colorTheme === "white" ? "active" : ""}
                onClick={() => setColorTheme("white")}
              >
                Light
              </button>
            </div>
            <p className="settings-theme-note">Switch between dark and light mode, then pick an accent below.</p>
            <div className="settings-select-grid">
              {COLOR_THEME_OPTIONS.filter((theme) => theme.id !== "black" && theme.id !== "white").map((theme) => (
                <button
                  key={theme.id}
                  type="button"
                  className={colorTheme === theme.id ? "active" : ""}
                  onClick={() => setColorTheme(theme.id)}
                >
                  {theme.label}
                </button>
              ))}
            </div>
            {colorTheme === "custom" && (
              <div className="settings-custom-theme">
                <label><span>Primary</span><input type="color" value={customThemeColors.accent} onChange={(e) => setCustomThemeColorsState((prev) => ({ ...prev, accent: e.target.value }))} /></label>
                <label><span>Secondary</span><input type="color" value={customThemeColors.accent2} onChange={(e) => setCustomThemeColorsState((prev) => ({ ...prev, accent2: e.target.value }))} /></label>
                <label><span>Background</span><input type="color" value={customThemeColors.bg} onChange={(e) => setCustomThemeColorsState((prev) => ({ ...prev, bg: e.target.value }))} /></label>
                <label><span>Surface</span><input type="color" value={customThemeColors.bgSoft} onChange={(e) => setCustomThemeColorsState((prev) => ({ ...prev, bgSoft: e.target.value }))} /></label>
                <label><span>Border</span><input type="color" value={customThemeColors.border} onChange={(e) => setCustomThemeColorsState((prev) => ({ ...prev, border: e.target.value }))} /></label>
                <label><span>Text</span><input type="color" value={customThemeColors.text} onChange={(e) => setCustomThemeColorsState((prev) => ({ ...prev, text: e.target.value }))} /></label>
              </div>
            )}
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








