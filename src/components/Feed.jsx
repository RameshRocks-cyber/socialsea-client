import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { FiBookmark } from "react-icons/fi";
import { BsBookmarkFill } from "react-icons/bs";
import { IoArrowRedoOutline } from "react-icons/io5";
import api from "../api/axios";
import { getApiBaseUrl, toApiUrl } from "../api/baseUrl";
import { recordCommentActivity, recordRepostActivity, recordSearchActivity } from "../services/activityStore";
import { readIdListFromStorage, readIdMapFromStorage, writeIdListToStorage, writeIdMapToStorage } from "../utils/idStorage";
import { readLiveBroadcast, subscribeLiveBroadcast } from "../utils/liveBroadcast";
import { buildProfilePath } from "../utils/profileRoute";
import { classifyVideoBucket, isExplicitReelPost, mediaTypeForPost, SHORT_VIDEO_SECONDS } from "../utils/videoFeedClassifier";
import { isYouTubeMedia } from "../utils/youtubeMedia";
import { CONTENT_TYPE_OPTIONS } from "../pages/contentPrefs";
import "./Feed.css";

const CHAT_SHARE_DRAFT_KEY = "socialsea_chat_share_draft_v1";
const POST_GENRE_MAP_KEY = "socialsea_post_genre_map_v1";
const FEED_CACHE_KEY = "socialsea_feed_cache_v1";
const LIVE_PREVIEW_FRAME_KEY = "socialsea_live_preview_frame_v1";
const FEED_YT_RAIL_ITEMS = ["Home", "Trending", "Subscriptions", "History", "Playlists", "Watch Later"];
const FEED_FILTER_PRIORITY_ORDER = [
  "general",
  "study",
  "movies",
  "gaming",
  "trending",
  "entertainment",
  "social",
  "news"
];
const FEED_FILTER_LABEL_OVERRIDES = {
  gaming: "Games"
};
const FEED_CONTENT_TYPES = (() => {
  const byValue = new Map(
    CONTENT_TYPE_OPTIONS.map((option) => {
      const value = String(option?.value || "").trim().toLowerCase();
      const label = FEED_FILTER_LABEL_OVERRIDES[value] || option?.label || value;
      return [value, { value, label }];
    })
  );

  // Ensure these choices are always available and visible near the top.
  if (!byValue.has("movies")) byValue.set("movies", { value: "movies", label: "Movies" });
  if (!byValue.has("gaming")) byValue.set("gaming", { value: "gaming", label: "Games" });
  if (!byValue.has("trending")) byValue.set("trending", { value: "trending", label: "Trending" });

  const ordered = [];
  FEED_FILTER_PRIORITY_ORDER.forEach((value) => {
    const option = byValue.get(value);
    if (!option) return;
    ordered.push(option);
    byValue.delete(value);
  });

  ordered.push(...Array.from(byValue.values()));
  return [{ value: "all", label: "All" }, ...ordered];
})();
const CONTENT_SUB_FILTERS = {
  study: {
    ariaLabel: "Study subjects",
    options: [
      { value: "all", label: "All" },
      { value: "biology", label: "Biology" },
      { value: "zoology", label: "Zoology" },
      { value: "botany", label: "Botany" },
      { value: "physics", label: "Physics" },
      { value: "chemistry", label: "Chemistry" },
      { value: "mathematics", label: "Mathematics" },
      { value: "computer science", label: "Computer Science" },
      { value: "history", label: "History" },
      { value: "geography", label: "Geography" },
      { value: "economics", label: "Economics" }
    ],
    keywords: {
      biology: ["biology", "biological", "cell", "genetics", "anatomy", "physiology"],
      zoology: ["zoology", "zology", "zoological", "animal", "wildlife", "fauna", "vertebrate", "invertebrate"],
      botany: ["botany", "botanical", "plant", "flora", "photosynthesis", "plant cell"],
      physics: ["physics", "mechanics", "thermodynamics", "optics", "electromagnetism", "quantum"],
      chemistry: ["chemistry", "chemical", "organic chemistry", "inorganic chemistry", "reaction", "molecule"],
      mathematics: ["mathematics", "math", "algebra", "geometry", "calculus", "trigonometry", "statistics"],
      "computer science": ["computer science", "computer", "programming", "coding", "algorithm", "data structures", "software"],
      history: ["history", "historical", "ancient", "medieval", "civilization", "war history"],
      geography: ["geography", "geographical", "maps", "climate", "earth science", "landforms"],
      economics: ["economics", "economy", "microeconomics", "macroeconomics", "finance", "market"]
    }
  },
  movies: {
    ariaLabel: "Movie topics",
    options: [
      { value: "all", label: "All" },
      { value: "hollywood", label: "Hollywood" },
      { value: "bollywood", label: "Bollywood" },
      { value: "tollywood", label: "Tollywood" },
      { value: "kollywood", label: "Kollywood" },
      { value: "mollywood", label: "Mollywood" },
      { value: "sandalwood", label: "Sandalwood" },
      { value: "marathi cinema", label: "Marathi Cinema" },
      { value: "bengali cinema", label: "Bengali Cinema" },
      { value: "bhojpuri cinema", label: "Bhojpuri Cinema" },
      { value: "korean cinema", label: "Korean Cinema" },
      { value: "japanese cinema", label: "Japanese Cinema" },
      { value: "chinese cinema", label: "Chinese Cinema" },
      { value: "anime movies", label: "Anime Movies" },
      { value: "action", label: "Action" },
      { value: "comedy", label: "Comedy" },
      { value: "thriller", label: "Thriller" },
      { value: "horror", label: "Horror" },
      { value: "sci fi", label: "Sci-Fi" },
      { value: "fantasy", label: "Fantasy" },
      { value: "romance", label: "Romance" },
      { value: "drama", label: "Drama" },
      { value: "documentary", label: "Documentary" },
      { value: "animation", label: "Animation" },
      { value: "biopic", label: "Biopic" },
      { value: "superhero", label: "Superhero" },
      { value: "marvel", label: "Marvel" },
      { value: "dc", label: "DC" },
      { value: "hbo", label: "HBO" },
      { value: "max", label: "MAX" },
      { value: "fox", label: "Fox" },
      { value: "netflix", label: "Netflix" },
      { value: "hotstar", label: "Hotstar" },
      { value: "disney", label: "Disney+" },
      { value: "prime video", label: "Prime Video" },
      { value: "apple tv plus", label: "Apple TV+" },
      { value: "hulu", label: "Hulu" },
      { value: "zee5", label: "ZEE5" },
      { value: "sonyliv", label: "SonyLIV" },
      { value: "warner bros", label: "Warner Bros" },
      { value: "universal", label: "Universal" },
      { value: "paramount", label: "Paramount" },
      { value: "sony pictures", label: "Sony Pictures" },
      { value: "a24", label: "A24" }
    ],
    keywords: {
      hollywood: ["hollywood", "american cinema", "warner bros", "universal pictures", "paramount", "sony pictures"],
      bollywood: ["bollywood", "hindi cinema", "hindi movie"],
      tollywood: ["tollywood", "telugu cinema", "telugu movie"],
      kollywood: ["kollywood", "tamil cinema", "tamil movie"],
      mollywood: ["mollywood", "malayalam cinema", "malayalam movie"],
      sandalwood: ["sandalwood", "kannada cinema", "kannada movie"],
      "marathi cinema": ["marathi cinema", "marathi movie"],
      "bengali cinema": ["bengali cinema", "bengali movie", "tollygunge"],
      "bhojpuri cinema": ["bhojpuri cinema", "bhojpuri movie"],
      "korean cinema": ["korean cinema", "k-movie", "korean movie"],
      "japanese cinema": ["japanese cinema", "japanese movie", "j cinema"],
      "chinese cinema": ["chinese cinema", "chinese movie", "mandarin movie"],
      "anime movies": ["anime movie", "anime film", "studio ghibli", "anime cinema"],
      action: ["action", "fight scene", "stunt", "action thriller"],
      comedy: ["comedy", "funny", "humor", "comic"],
      thriller: ["thriller", "suspense", "mystery thriller", "crime thriller"],
      horror: ["horror", "scary", "haunted", "supernatural horror"],
      "sci fi": ["sci-fi", "science fiction", "future tech", "space movie"],
      fantasy: ["fantasy", "magic", "mythical", "epic fantasy"],
      romance: ["romance", "romantic", "love story", "rom-com"],
      drama: ["drama", "emotional", "family drama", "period drama"],
      documentary: ["documentary", "docu", "true story", "docuseries"],
      animation: ["animation", "animated", "cartoon movie", "cg movie"],
      biopic: ["biopic", "biography", "based on true life"],
      superhero: ["superhero", "super hero", "comic book movie"],
      marvel: ["marvel", "mcu", "avengers", "marvel studios"],
      dc: ["dc", "dc comics", "dceu", "justice league", "batman", "superman"],
      hbo: ["hbo", "hbo original", "hbo series"],
      max: ["hbo max", "max original", "max series", "warner bros discovery"],
      fox: ["fox", "20th century fox", "fox studios", "fx"],
      netflix: ["netflix", "netflix original", "netflix series"],
      hotstar: ["hotstar", "jiohotstar", "disney hotstar", "star network"],
      disney: ["disney+", "disney plus", "disney", "pixar", "marvel studios"],
      "prime video": ["prime video", "amazon prime", "amazon prime video", "prime original"],
      "apple tv plus": ["apple tv+", "apple tv plus", "apple original", "apple studios"],
      hulu: ["hulu", "hulu original"],
      zee5: ["zee5", "zee 5", "zee original"],
      sonyliv: ["sonyliv", "sony liv", "sony original"],
      "warner bros": ["warner bros", "warner brothers", "wb pictures"],
      universal: ["universal", "universal pictures", "illumination"],
      paramount: ["paramount", "paramount pictures", "paramount+"],
      "sony pictures": ["sony pictures", "columbia pictures", "screen gems"],
      a24: ["a24", "a24 films", "a24 studio"]
    }
  },
  gaming: {
    ariaLabel: "Physical game topics",
    options: [
      { value: "all", label: "All" },
      { value: "cricket", label: "Cricket" },
      { value: "football", label: "Football" },
      { value: "badminton", label: "Badminton" },
      { value: "volleyball", label: "Volleyball" },
      { value: "basketball", label: "Basketball" },
      { value: "kabaddi", label: "Kabaddi" },
      { value: "tennis", label: "Tennis" },
      { value: "hockey", label: "Hockey" },
      { value: "athletics", label: "Athletics" },
      { value: "wrestling", label: "Wrestling" },
      { value: "boxing", label: "Boxing" },
      { value: "table tennis", label: "Table Tennis" }
    ],
    keywords: {
      cricket: ["cricket", "ipl", "test match", "odi", "t20", "batsman", "bowler"],
      football: ["football", "soccer", "premier league", "fifa", "uefa", "goal", "striker"],
      badminton: ["badminton", "shuttle", "shuttlecock", "smash", "bwf"],
      volleyball: ["volleyball", "spike", "block", "fivb"],
      basketball: ["basketball", "nba", "dunk", "hoops", "three pointer"],
      kabaddi: ["kabaddi", "pro kabaddi", "raid", "defender"],
      tennis: ["tennis", "atp", "wta", "grand slam", "serve", "rally"],
      hockey: ["hockey", "field hockey", "hockey india", "stick", "goalkeeper"],
      athletics: ["athletics", "track and field", "sprint", "marathon", "relay", "javelin"],
      wrestling: ["wrestling", "freestyle wrestling", "greco", "mat wrestling"],
      boxing: ["boxing", "boxer", "ring", "knockout", "heavyweight"],
      "table tennis": ["table tennis", "ping pong", "tt", "paddle"]
    }
  }
};
const createDefaultLongMenuPlacement = () => ({
  postId: null,
  vertical: "down",
  horizontal: "right",
  maxHeight: 320,
});
const FEED_CATEGORY_KEYWORDS = {
  music: ["music", "song", "audio", "album", "lyrics", "singer", "melody"],
  mixes: ["mix", "mixes", "remix", "mashup", "medley", "dj"],
  news: ["news", "update", "breaking", "headline", "report"],
  live: ["live", "livestream", "live stream", "streaming", "stream"],
  comedy: ["comedy", "funny", "joke", "memes", "laugh", "standup"],
  movies: ["movie", "movies", "cinema", "film", "trailer", "scene"],
  gaming: ["games", "physical game", "outdoor game", "sport", "sports", "cricket", "football", "badminton", "volleyball", "basketball", "kabaddi", "tennis", "hockey", "athletics", "wrestling", "boxing"],
  trending: ["trending", "viral", "popular", "hot", "trend"]
};

const parseMaybeJson = (value) => {
  if (!value || typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw || (raw[0] !== "{" && raw[0] !== "[")) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const normalizeGenre = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ");

const collectGenreTokens = (post, localGenreMap) => {
  const tokens = new Set();
  const add = (value) => {
    const normalized = normalizeGenre(value);
    if (normalized) tokens.add(normalized);
  };
  const addMany = (arr) => {
    if (!Array.isArray(arr)) return;
    arr.forEach((entry) => add(entry));
  };

  add(post?.category);
  add(post?.genre);
  add(post?.videoCategory);
  add(post?.contentCategory);
  add(post?.postCategory);
  add(post?.creatorCategory);
  add(post?.user?.category);
  add(localGenreMap?.[String(post?.id || "")]);
  addMany(post?.tags);
  addMany(post?.hashtags);

  const settings = parseMaybeJson(post?.videoSettings) || parseMaybeJson(post?.settings) || parseMaybeJson(post?.metadata);
  if (settings && typeof settings === "object") {
    add(settings?.category);
    add(settings?.genre);
    addMany(settings?.tags);
    if (settings?.creatorSettings && typeof settings.creatorSettings === "object") {
      add(settings.creatorSettings.category);
      add(settings.creatorSettings.genre);
      addMany(settings.creatorSettings.tags);
    }
  }

  const text = `${post?.description || ""} ${post?.content || ""} ${post?.title || ""}`.toLowerCase();
  Object.entries(FEED_CATEGORY_KEYWORDS).forEach(([category, keywords]) => {
    if (keywords.some((word) => text.includes(word))) tokens.add(category);
  });

  return tokens;
};

const categoryMatchesPost = (post, selectedCategory, localGenreMap) => {
  const category = normalizeGenre(selectedCategory);
  if (!category || category === "all") return true;
  const tokens = collectGenreTokens(post, localGenreMap);
  if (tokens.has(category)) return true;
  const keywords = FEED_CATEGORY_KEYWORDS[category] || [];
  if (!keywords.length) return false;
  const searchable = `${post?.description || ""} ${post?.content || ""} ${post?.title || ""}`.toLowerCase();
  return keywords.some((word) => searchable.includes(word));
};

const contentSubFilterMatchesPost = (post, selectedCategory, selectedSubFilter, localGenreMap) => {
  const category = normalizeGenre(selectedCategory);
  const config = CONTENT_SUB_FILTERS[category];
  if (!config) return true;
  const subFilter = normalizeGenre(selectedSubFilter);
  if (!subFilter || subFilter === "all") return true;
  const tokens = collectGenreTokens(post, localGenreMap);
  if (tokens.has(subFilter)) return true;
  const keywords = config.keywords?.[subFilter] || [];
  if (!keywords.length) return false;
  const searchable = `${post?.description || ""} ${post?.content || ""} ${post?.title || ""}`.toLowerCase();
  return keywords.some((word) => searchable.includes(word));
};

const readCachedFeedPosts = () => {
  try {
    const raw = localStorage.getItem(FEED_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    const list = Array.isArray(parsed?.posts) ? parsed.posts : Array.isArray(parsed) ? parsed : [];
    return list.filter((post) => post && !isYouTubeMedia(post));
  } catch {
    return [];
  }
};

const FEED_PERSONALIZATION_VERSION = 1;
const FEED_PERSONALIZATION_KEY_PREFIX = "socialsea_feed_personalization_v1";
const FEED_SIGNAL_WEIGHTS = {
  view: 1.0,
  watch: 1.4,
  like: 3.5,
  share: 1.6,
  comment: 2.2,
};
const FEED_WATCH_TIME_CHUNK_SECONDS = 12;
const FEED_WATCH_TIME_CHUNK_WEIGHT = 0.32;
const FEED_WATCH_TIME_MAX_CHUNKS_PER_POST = 30;
const FEED_WATCH_TIME_MAX_STEP_SECONDS = 3;
const FEED_WATCH_PROGRESS_MILESTONES = [
  { ratio: 0.35, weight: 0.7 },
  { ratio: 0.6, weight: 1.05 },
  { ratio: 0.85, weight: 1.45 },
  { ratio: 0.98, weight: 2.1 },
];
const PERSONALIZATION_MAX_TOKENS = 260;
const PERSONALIZATION_MAX_POSTS = 320;

const createDefaultPersonalizationState = (userKey = "guest") => ({
  version: FEED_PERSONALIZATION_VERSION,
  userKey,
  updatedAt: 0,
  tokenWeights: {},
  postWeights: {},
});

const resolveFeedUserKey = () => {
  try {
    const userId =
      localStorage.getItem("userId") ||
      sessionStorage.getItem("userId") ||
      localStorage.getItem("username") ||
      sessionStorage.getItem("username");
    const normalized = String(userId || "").trim();
    return normalized || "guest";
  } catch {
    return "guest";
  }
};

const personalizationStorageKeyForUser = (userKey) =>
  `${FEED_PERSONALIZATION_KEY_PREFIX}:${String(userKey || "guest").trim() || "guest"}`;

const trimWeightMap = (input, limit) => {
  const entries = Object.entries(input || {})
    .map(([key, value]) => [String(key || "").trim(), Number(value)])
    .filter(([key, value]) => key && Number.isFinite(value) && Math.abs(value) > 0.0001);
  if (entries.length <= limit) {
    return Object.fromEntries(entries);
  }
  entries.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  return Object.fromEntries(entries.slice(0, limit));
};

const readFeedPersonalizationState = (userKey) => {
  const fallback = createDefaultPersonalizationState(userKey);
  try {
    const raw = localStorage.getItem(personalizationStorageKeyForUser(userKey));
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== "object") return fallback;
    return {
      version: FEED_PERSONALIZATION_VERSION,
      userKey,
      updatedAt: Number(parsed.updatedAt) || 0,
      tokenWeights: trimWeightMap(parsed.tokenWeights || {}, PERSONALIZATION_MAX_TOKENS),
      postWeights: trimWeightMap(parsed.postWeights || {}, PERSONALIZATION_MAX_POSTS),
    };
  } catch {
    return fallback;
  }
};

const persistFeedPersonalizationState = (userKey, state) => {
  try {
    const payload = {
      version: FEED_PERSONALIZATION_VERSION,
      userKey: String(userKey || "guest"),
      updatedAt: Number(state?.updatedAt) || Date.now(),
      tokenWeights: trimWeightMap(state?.tokenWeights || {}, PERSONALIZATION_MAX_TOKENS),
      postWeights: trimWeightMap(state?.postWeights || {}, PERSONALIZATION_MAX_POSTS),
    };
    localStorage.setItem(personalizationStorageKeyForUser(userKey), JSON.stringify(payload));
  } catch {
    // ignore storage errors
  }
};

const collectPersonalizationTokens = (post, localGenreMap) => {
  const tokens = collectGenreTokens(post, localGenreMap);
  const mediaType = String(mediaTypeForPost(post) || "").trim().toLowerCase();
  if (mediaType) tokens.add(mediaType);

  const searchable = `${post?.description || ""} ${post?.content || ""} ${post?.title || ""}`.toLowerCase();
  Object.entries(CONTENT_SUB_FILTERS).forEach(([category, config]) => {
    const categoryToken = normalizeGenre(category);
    if (categoryToken) tokens.add(categoryToken);
    Object.entries(config?.keywords || {}).forEach(([subFilter, keywords]) => {
      if (!Array.isArray(keywords) || !keywords.length) return;
      if (keywords.some((word) => searchable.includes(String(word || "").toLowerCase()))) {
        const subToken = normalizeGenre(subFilter);
        if (subToken) tokens.add(subToken);
      }
    });
  });

  return Array.from(tokens).filter(Boolean);
};

export default function Feed() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const feedUserKey = useMemo(() => resolveFeedUserKey(), []);
  const [feedMode, setFeedMode] = useState(() => {
    const mode = String(searchParams.get("mode") || "").trim().toLowerCase();
    return mode === "long" ? "long" : "all";
  });
  const [feedMenuOpen, setFeedMenuOpen] = useState(false);
  const [contentTypeFilter, setContentTypeFilter] = useState("all");
  const [contentSubFilter, setContentSubFilter] = useState("all");
  const [posts, setPosts] = useState(() => readCachedFeedPosts());
  const [personalizationState, setPersonalizationState] = useState(() => readFeedPersonalizationState(feedUserKey));
  const [liveBroadcast, setLiveBroadcast] = useState(() => readLiveBroadcast());
  const [livePreviewFrame, setLivePreviewFrame] = useState("");
  const [likeCounts, setLikeCounts] = useState({});
  const [likedPostIds, setLikedPostIds] = useState({});
  const [commentsByPost, setCommentsByPost] = useState({});
  const [commentTextByPost, setCommentTextByPost] = useState({});
  const [savedPostIds, setSavedPostIds] = useState({});
  const [watchLaterPostIds, setWatchLaterPostIds] = useState({});
  const [shareMessageByPost, setShareMessageByPost] = useState({});
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(() => readCachedFeedPosts().length === 0);
  const [query, setQuery] = useState("");
  const [localGenreMap, setLocalGenreMap] = useState({});
  const [activePostId, setActivePostId] = useState(null);
  const [videoDurationByPost, setVideoDurationByPost] = useState({});
  const [profilePicByOwner, setProfilePicByOwner] = useState({});
  const [mutedByPost, setMutedByPost] = useState({});
  const [followStateByOwner, setFollowStateByOwner] = useState({});
  const [followBusyByOwner, setFollowBusyByOwner] = useState({});
  const [menuOpenPostId, setMenuOpenPostId] = useState(null);
  const [menuPlacement, setMenuPlacement] = useState(() => createDefaultLongMenuPlacement());
  const [hiddenPostIds, setHiddenPostIds] = useState({});
  const [blockedOwnerKeys, setBlockedOwnerKeys] = useState({});
  const mediaClickTimerByPostRef = useRef({});
  const viewerVideoRefs = useRef({});
  const watchProgressByPostRef = useRef({});
  const retryTimerRef = useRef(0);
  const retryCountRef = useRef(0);
  const inFlightLoadRef = useRef(false);
  const lastLoadAtRef = useRef(0);
  const postsCountRef = useRef(Array.isArray(posts) ? posts.length : 0);
  const closingPostViewRef = useRef(false);
  const menuRef = useRef(null);
  const feedMenuRef = useRef(null);
  const postViewBackdropRef = useRef(null);

  const HIDDEN_POSTS_KEY = "feedHiddenPostIds";
  const BLOCKED_OWNERS_KEY = "feedBlockedOwnerKeys";
  const PLAYLIST_KEY = "playlistPostIds";
  const QUEUE_KEY = "postQueueIds";
  const PLAY_NEXT_KEY = "playNextPostId";

  useEffect(() => {
    persistFeedPersonalizationState(feedUserKey, personalizationState);
  }, [feedUserKey, personalizationState]);

  useEffect(() => {
    postsCountRef.current = Array.isArray(posts) ? posts.length : 0;
  }, [posts]);

  useEffect(() => {
    const unsubscribe = subscribeLiveBroadcast((next) => setLiveBroadcast(next));
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!liveBroadcast) {
      setLivePreviewFrame("");
      return undefined;
    }
    let disposed = false;
    const readFrame = () => {
      if (disposed) return;
      try {
        const raw = localStorage.getItem(LIVE_PREVIEW_FRAME_KEY);
        if (!raw) {
          setLivePreviewFrame((prev) => (prev ? "" : prev));
          return;
        }
        const data = JSON.parse(raw);
        const frame = String(data?.frame || "").trim();
        setLivePreviewFrame((prev) => (prev === frame ? prev : frame));
      } catch {
        // ignore preview read failures
      }
    };
    readFrame();
    const timer = window.setInterval(readFrame, 700);
    const onStorage = (event) => {
      if (event?.key === LIVE_PREVIEW_FRAME_KEY) readFrame();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      disposed = true;
      clearInterval(timer);
      window.removeEventListener("storage", onStorage);
    };
  }, [liveBroadcast]);

  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    document.body.classList.add("feed-no-swipe-back");
    return () => {
      document.body.classList.remove("feed-no-swipe-back");
    };
  }, []);

  useEffect(() => {
    const text = query.trim();
    if (text.length < 2) return undefined;
    const timer = window.setTimeout(() => {
      recordSearchActivity({ query: text, source: "feed" });
    }, 450);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!feedMenuOpen) return;
    const handleClick = (event) => {
      if (feedMenuRef.current && !feedMenuRef.current.contains(event.target)) {
        setFeedMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [feedMenuOpen]);

  useEffect(() => {
    const mode = String(searchParams.get("mode") || "").trim().toLowerCase();
    const nextMode = mode === "long" ? "long" : "all";
    setFeedMode((prev) => (prev === nextMode ? prev : nextMode));
  }, [searchParams]);

  useEffect(() => {
    const mode = String(searchParams.get("mode") || "").trim().toLowerCase();
    const nextMode = feedMode === "long" ? "long" : "all";
    if (mode === nextMode || (!mode && nextMode === "all")) return;
    const nextParams = new URLSearchParams(searchParams);
    if (nextMode === "long") nextParams.set("mode", "long");
    else nextParams.delete("mode");
    setSearchParams(nextParams, { replace: true });
  }, [feedMode, searchParams, setSearchParams]);

  useEffect(() => {
    const category = normalizeGenre(contentTypeFilter);
    const config = CONTENT_SUB_FILTERS[category];
    if (!config) {
      if (contentSubFilter !== "all") setContentSubFilter("all");
      return;
    }
    const selected = normalizeGenre(contentSubFilter);
    const isValid = config.options.some((option) => normalizeGenre(option.value) === selected);
    if (!isValid) setContentSubFilter("all");
  }, [contentTypeFilter, contentSubFilter]);

  useEffect(() => {
    let mounted = true;
    const buildBaseCandidates = () => {
      const isLocalDev =
        typeof window !== "undefined" &&
        ["localhost", "127.0.0.1"].includes(String(window.location.hostname || "").toLowerCase());
      const storedBase =
        typeof window !== "undefined"
          ? localStorage.getItem("socialsea_auth_base_url") || sessionStorage.getItem("socialsea_auth_base_url")
          : "";
      return [
        api.defaults.baseURL,
        storedBase,
        getApiBaseUrl(),
        import.meta.env.VITE_API_URL,
        ...(isLocalDev ? ["http://localhost:8080", "http://127.0.0.1:8080", "/api"] : ["/api"]),
      ].filter((v, i, arr) => v && arr.indexOf(v) === i);
    };
    const extractList = (payload) =>
      Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.items)
          ? payload.items
          : Array.isArray(payload?.data)
            ? payload.data
            : Array.isArray(payload?.content)
              ? payload.content
              : [];
    const clearRetryTimer = () => {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = 0;
      }
    };

    const scheduleRetry = () => {
      if (!mounted) return;
      if (retryCountRef.current >= 4) return;
      clearRetryTimer();
      const delays = [1200, 2200, 4000, 6500];
      const delay = delays[retryCountRef.current] || 6500;
      retryTimerRef.current = window.setTimeout(() => {
        if (!mounted) return;
        retryCountRef.current += 1;
        void load(true);
      }, delay);
    };

    const load = async (silent = false) => {
      if (inFlightLoadRef.current) return;
      inFlightLoadRef.current = true;
      lastLoadAtRef.current = Date.now();
      if (!silent) setIsLoading(true);
      try {
        const baseCandidates = buildBaseCandidates();
        const endpoints = ["/api/feed"];
        let res = null;
        let lastErr = null;
        let fallbackRes = null;
        for (const baseURL of baseCandidates) {
          for (const url of endpoints) {
            try {
              const r = await api.request({
                method: "GET",
                url,
                baseURL,
                timeout: 10000,
                suppressAuthRedirect: true,
              });
              const body = r?.data;
              const looksLikeHtml =
                typeof body === "string" && (/^\s*<!doctype html/i.test(body) || /<html[\s>]/i.test(body));
              if (looksLikeHtml) {
                const htmlErr = new Error("Received HTML instead of API JSON");
                htmlErr.response = { status: 404, data: body };
                throw htmlErr;
              }
              const listTry = extractList(body);
              if (Array.isArray(listTry)) {
                if (!fallbackRes) fallbackRes = { ...r, data: listTry };
                if (listTry.length > 0) {
                  res = { ...r, data: listTry };
                  lastErr = null;
                  break;
                }
              }
            } catch (err) {
              lastErr = err;
            }
          }
          if (res) break;
        }
        if (!res && fallbackRes) res = fallbackRes;
        if (!res) throw lastErr || new Error("Failed to load feed");
        const listRaw = Array.isArray(res.data) ? res.data : [];
        const list = listRaw.filter((post) => post && !isYouTubeMedia(post));
        if (!mounted) return;
        setPosts(list);
        try {
          localStorage.setItem(FEED_CACHE_KEY, JSON.stringify({ updatedAt: Date.now(), posts: list }));
        } catch {
          // ignore cache issues
        }
        if (list.length > 0) {
          setError("");
          retryCountRef.current = 0;
          clearRetryTimer();
        } else {
          scheduleRetry();
        }

        if (list.length === 0 && String(import.meta.env?.VITE_ENABLE_ACTUATOR_PROBE || "") === "true") {
          try {
            const healthRes = await api.get("/actuator/health", {
              skipAuth: true,
              suppressAuthRedirect: true,
              timeout: 4000
            });
            const health = String(healthRes?.data?.status || "").toUpperCase();
            if (health && health !== "UP") {
              setError(`Backend health is ${health}. Feed may be empty due to backend DB/service issue.`);
            }
          } catch {
            // ignore health probe failure
          }
        }
      } catch (err) {
        console.error(err);
        if (!mounted) return;
        const status = err?.response?.status;
        const message = err?.response?.data?.message || err?.response?.data || "";
        if (!postsCountRef.current) {
          setError(status ? `Failed to load feed (${status}) ${message}` : "Failed to load feed");
        }
        scheduleRetry();
      } finally {
        inFlightLoadRef.current = false;
        if (mounted) setIsLoading(false);
      }
    };

    const refreshIfStale = () => {
      if (!mounted) return;
      const staleForMs = Date.now() - lastLoadAtRef.current;
      if (staleForMs < 3000 && postsCountRef.current > 0) return;
      void load(true);
    };

    const onOnline = () => refreshIfStale();
    const onFocus = () => refreshIfStale();
    const onVisibility = () => {
      if (document.visibilityState === "visible") refreshIfStale();
    };

    window.addEventListener("online", onOnline);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    void load(postsCountRef.current > 0);
    return () => {
      mounted = false;
      clearRetryTimer();
      window.removeEventListener("online", onOnline);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  useEffect(() => {
    if (!posts.length) return;
    posts.forEach((post) => {
      api.get(`/api/likes/${post.id}/count`)
        .then((res) => {
          const count = Number(res.data) || 0;
          setLikeCounts((prev) => ({ ...prev, [post.id]: count }));
        })
        .catch(() => {});
    });
  }, [posts]);

  useEffect(() => {
    const map = readIdMapFromStorage("likedPostIds");
    if (Object.keys(map).length) setLikedPostIds(map);
  }, []);

  useEffect(() => {
    const map = readIdMapFromStorage("savedPostIds");
    if (Object.keys(map).length) setSavedPostIds(map);
  }, []);

  useEffect(() => {
    const map = readIdMapFromStorage("watchLaterPostIds");
    if (Object.keys(map).length) setWatchLaterPostIds(map);
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(POST_GENRE_MAP_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        setLocalGenreMap(parsed);
      }
    } catch {
      // ignore bad local cache
    }
  }, []);

  useEffect(() => {
    const onStorage = (event) => {
      if (event?.key !== POST_GENRE_MAP_KEY) return;
      try {
        const parsed = event?.newValue ? JSON.parse(event.newValue) : {};
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          setLocalGenreMap(parsed);
        }
      } catch {
        // ignore bad local cache
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    try {
      const hiddenRaw = localStorage.getItem(HIDDEN_POSTS_KEY);
      const hidden = hiddenRaw ? JSON.parse(hiddenRaw) : [];
      if (Array.isArray(hidden)) {
        setHiddenPostIds(hidden.reduce((acc, id) => ({ ...acc, [id]: true }), {}));
      }
    } catch {
      // ignore
    }
    try {
      const blockedRaw = localStorage.getItem(BLOCKED_OWNERS_KEY);
      const blocked = blockedRaw ? JSON.parse(blockedRaw) : [];
      if (Array.isArray(blocked)) {
        setBlockedOwnerKeys(blocked.reduce((acc, key) => ({ ...acc, [String(key)]: true }), {}));
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (!menuOpenPostId) return;
    const onDocClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpenPostId(null);
        setMenuPlacement(createDefaultLongMenuPlacement());
      }
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("touchstart", onDocClick, { passive: true });
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("touchstart", onDocClick);
    };
  }, [menuOpenPostId]);

  const measureLongMenuPlacement = (triggerEl) => {
    const fallback = { vertical: "down", horizontal: "right", maxHeight: 320 };
    if (!triggerEl || typeof window === "undefined") return fallback;

    const rect = triggerEl.getBoundingClientRect();
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 800;
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 1200;
    const estimatedMenuWidth = 236;
    const estimatedMenuHeight = 340;
    const viewportPadding = 12;

    const spaceBelow = viewportHeight - rect.bottom - viewportPadding;
    const spaceAbove = rect.top - viewportPadding;
    const vertical = spaceBelow >= estimatedMenuHeight || spaceBelow >= spaceAbove ? "down" : "up";
    const verticalRoom = vertical === "down" ? spaceBelow : spaceAbove;
    const maxHeight = Math.max(180, Math.min(420, Math.floor(verticalRoom)));

    const overflowLeftIfRightAligned = rect.right - estimatedMenuWidth < viewportPadding;
    const overflowRightIfLeftAligned = rect.left + estimatedMenuWidth > viewportWidth - viewportPadding;
    const horizontal =
      overflowLeftIfRightAligned && !overflowRightIfLeftAligned
        ? "left"
        : "right";

    return { vertical, horizontal, maxHeight };
  };

  const togglePostMenu = (event, postId) => {
    if (event?.stopPropagation) event.stopPropagation();
    if (menuOpenPostId === postId) {
      setMenuOpenPostId(null);
      setMenuPlacement(createDefaultLongMenuPlacement());
      return;
    }
    const placement = measureLongMenuPlacement(event?.currentTarget);
    setMenuPlacement({ postId, ...placement });
    setMenuOpenPostId(postId);
  };

  const selectContentType = (value) => {
    setContentTypeFilter(value);
    setFeedMenuOpen(false);
  };

  const resolveUrl = (url) => {
    if (!url) return "";
    return toApiUrl(url);
  };

  const normalizeDisplayName = (value) => {
    const raw = String(value || "").trim();
    if (!raw) return "User";
    const local = raw.includes("@") ? raw.split("@")[0] : raw;
    const withoutDigits = local.replace(/\d+$/g, "");
    const cleaned = withoutDigits.replace(/[._-]+/g, " ").replace(/\s+/g, " ").trim();
    if (!cleaned) return "User";
    return cleaned
      .split(" ")
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  };

  const usernameFor = (post) => {
    const raw = post?.user?.name || post?.username || post?.user?.email || "User";
    return normalizeDisplayName(raw);
  };

  const ownerCandidatesFor = (post) => {
    const values = [
      post?.user?.id,
      post?.userId,
      post?.user?.username,
      post?.username,
      post?.user?.email,
      post?.email,
      post?.user?.name,
      post?.name
    ]
      .map((v) => String(v || "").trim())
      .filter(Boolean);
    return values.filter((v, i, arr) => arr.indexOf(v) === i);
  };

  const ownerKeyFor = (post) => ownerCandidatesFor(post)[0] || "";

  const normalizeIdentityKey = (value) => String(value || "").trim().toLowerCase();

  const viewerIdentityKeys = useMemo(() => {
    const keys = [];
    try {
      const rawValues = [
        localStorage.getItem("userId"),
        sessionStorage.getItem("userId"),
        localStorage.getItem("username"),
        sessionStorage.getItem("username"),
        localStorage.getItem("email"),
        sessionStorage.getItem("email"),
        localStorage.getItem("name"),
        sessionStorage.getItem("name"),
        feedUserKey,
      ];
      rawValues.forEach((value) => {
        const normalized = normalizeIdentityKey(value);
        if (!normalized || normalized === "guest") return;
        keys.push(normalized);
      });
    } catch {
      const fallback = normalizeIdentityKey(feedUserKey);
      if (fallback && fallback !== "guest") keys.push(fallback);
    }
    return new Set(keys);
  }, [feedUserKey]);

  const followTargetFor = (post) => {
    const candidates = [
      post?.user?.email,
      post?.email,
      post?.user?.username,
      post?.username,
      post?.user?.id,
      post?.userId,
    ]
      .map((value) => String(value || "").trim())
      .filter(Boolean);
    return candidates[0] || "";
  };

  const isOwnPost = (post) => {
    if (!viewerIdentityKeys.size) return false;
    const candidates = [...ownerCandidatesFor(post), followTargetFor(post)]
      .map(normalizeIdentityKey)
      .filter(Boolean);
    return candidates.some((candidate) => viewerIdentityKeys.has(candidate));
  };

  const followStateHintFor = (post) => {
    const boolCandidates = [
      post?.isFollowing,
      post?.followState?.isFollowing,
      post?.followInfo?.isFollowing,
      post?.user?.isFollowing,
      post?.user?.followState?.isFollowing,
      post?.user?.followInfo?.isFollowing,
    ];
    if (boolCandidates.some((value) => value === true)) return "following";

    const statusCandidates = [
      post?.followStatus,
      post?.relationship,
      post?.followState?.status,
      post?.followInfo?.status,
      post?.user?.followStatus,
      post?.user?.relationship,
      post?.user?.followState?.status,
      post?.user?.followInfo?.status,
    ]
      .map((value) => String(value || "").trim().toLowerCase())
      .filter(Boolean);
    if (statusCandidates.some((value) => value.includes("request"))) return "requested";
    if (statusCandidates.some((value) => value.includes("following") || value.includes("followed"))) return "following";

    if (boolCandidates.some((value) => value === false)) return "not_following";
    return "not_following";
  };

  const resolveFollowStateFromResponse = (response) => {
    const text = String(
      response?.data?.status ||
      response?.data?.followStatus ||
      response?.data?.relationship ||
      response?.data ||
      ""
    ).trim().toLowerCase();
    if (text.includes("request")) return "requested";
    if (text.includes("following") || text.includes("followed")) return "following";
    return "following";
  };

  const followPostOwner = async (post) => {
    const followTarget = followTargetFor(post);
    const ownerKey = ownerKeyFor(post) || followTarget;
    if (!followTarget || !ownerKey || isOwnPost(post) || followBusyByOwner[ownerKey]) return;
    setFollowBusyByOwner((prev) => ({ ...prev, [ownerKey]: true }));
    try {
      const res = await api.post(`/api/follow/${encodeURIComponent(followTarget)}`);
      const nextState = resolveFollowStateFromResponse(res);
      setFollowStateByOwner((prev) => ({ ...prev, [ownerKey]: nextState }));
    } catch {
      // noop
    } finally {
      setFollowBusyByOwner((prev) => ({ ...prev, [ownerKey]: false }));
    }
  };

  const profilePicFor = (post) => {
    const ownerKey = ownerKeyFor(post);
    if (ownerKey && profilePicByOwner[ownerKey]) return profilePicByOwner[ownerKey];
    const raw =
      post?.user?.profilePicUrl ||
      post?.user?.profilePic ||
      post?.user?.avatarUrl ||
      post?.user?.avatar ||
      post?.profilePicUrl ||
      post?.profilePic ||
      post?.avatarUrl ||
      post?.avatar ||
      "";
    return raw ? resolveUrl(String(raw).trim()) : "";
  };

  useEffect(() => {
    if (!posts.length) return;
    const uniquePostsByOwner = [];
    const seen = new Set();
    posts.forEach((post) => {
      const ownerKey = ownerKeyFor(post);
      if (!ownerKey || seen.has(ownerKey)) return;
      seen.add(ownerKey);
      uniquePostsByOwner.push(post);
    });
    if (!uniquePostsByOwner.length) return;

    let cancelled = false;
    const run = async () => {
      const nextMap = {};
      for (const post of uniquePostsByOwner.slice(0, 40)) {
        const ownerKey = ownerKeyFor(post);
        if (!ownerKey || profilePicByOwner[ownerKey]) continue;
        if (profilePicFor(post)) continue;

        const candidates = ownerCandidatesFor(post);
        let found = "";
        for (const candidate of candidates) {
          const endpoints = [`/api/profile/${encodeURIComponent(candidate)}`];
          for (const url of endpoints) {
            try {
              const res = await api.get(url, { suppressAuthRedirect: true, timeout: 4000 });
              const user = res?.data?.user || res?.data || {};
              const rawPic =
                user?.profilePicUrl ||
                user?.profilePic ||
                user?.avatarUrl ||
                user?.avatar ||
                "";
              if (rawPic) {
                found = resolveUrl(String(rawPic).trim());
                break;
              }
            } catch {
              // try next candidate/endpoint
            }
          }
          if (found) break;
        }
        if (found) nextMap[ownerKey] = found;
      }
      if (cancelled || !Object.keys(nextMap).length) return;
      setProfilePicByOwner((prev) => ({ ...prev, ...nextMap }));
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [posts]);

  const postById = useMemo(() => {
    const map = {};
    posts.forEach((post) => {
      const id = String(post?.id || "").trim();
      if (!id) return;
      map[id] = post;
    });
    return map;
  }, [posts]);

  const personalizationTokensByPost = useMemo(() => {
    const map = {};
    posts.forEach((post) => {
      const id = String(post?.id || "").trim();
      if (!id) return;
      map[id] = collectPersonalizationTokens(post, localGenreMap);
    });
    return map;
  }, [posts, localGenreMap]);

  const trackFeedInteraction = (post, signal = "view", customWeight = null) => {
    if (!post?.id) return;
    const postId = String(post.id);
    const baseWeight = Number(FEED_SIGNAL_WEIGHTS[signal] || FEED_SIGNAL_WEIGHTS.view || 1);
    const overrideWeight = Number(customWeight);
    const weight = Number.isFinite(overrideWeight) ? overrideWeight : baseWeight;
    if (!Number.isFinite(weight) || weight === 0) return;
    const postTokens = personalizationTokensByPost[postId] || collectPersonalizationTokens(post, localGenreMap);

    setPersonalizationState((prevState) => {
      const prev = prevState && typeof prevState === "object" ? prevState : createDefaultPersonalizationState(feedUserKey);
      const nextTokenWeights = { ...(prev.tokenWeights || {}) };
      const nextPostWeights = { ...(prev.postWeights || {}) };

      postTokens.forEach((token) => {
        const key = normalizeGenre(token);
        if (!key) return;
        const previous = Number(nextTokenWeights[key] || 0);
        nextTokenWeights[key] = Math.max(-500, Math.min(500, previous + weight));
      });

      const prevPostWeight = Number(nextPostWeights[postId] || 0);
      nextPostWeights[postId] = Math.max(-500, Math.min(500, prevPostWeight + weight * 1.25));

      return {
        version: FEED_PERSONALIZATION_VERSION,
        userKey: feedUserKey,
        updatedAt: Date.now(),
        tokenWeights: trimWeightMap(nextTokenWeights, PERSONALIZATION_MAX_TOKENS),
        postWeights: trimWeightMap(nextPostWeights, PERSONALIZATION_MAX_POSTS),
      };
    });
  };

  const ensureWatchProgressEntry = (postId) => {
    const id = String(postId || "").trim();
    if (!id) return null;
    const existing = watchProgressByPostRef.current[id];
    if (existing) return existing;
    const next = {
      lastTime: 0,
      bufferedSeconds: 0,
      awardedChunks: 0,
      progressMilestones: {},
    };
    watchProgressByPostRef.current[id] = next;
    return next;
  };

  const syncWatchProgressCursor = (postId, currentTime = 0) => {
    const entry = ensureWatchProgressEntry(postId);
    if (!entry) return;
    entry.lastTime = Math.max(0, Number(currentTime) || 0);
  };

  const applyWatchTimeSignals = (post, event) => {
    if (!post?.id) return;
    const videoNode = event?.currentTarget;
    if (!videoNode) return;
    const postId = String(post.id);
    const currentTime = Math.max(0, Number(videoNode.currentTime) || 0);
    const duration = Math.max(0, Number(videoNode.duration) || 0);
    const entry = ensureWatchProgressEntry(postId);
    if (!entry) return;

    if (duration > 0) {
      setVideoDurationByPost((prev) => (prev[post.id] === duration ? prev : { ...prev, [post.id]: duration }));
    }

    const previousTime = Number(entry.lastTime || 0);
    entry.lastTime = currentTime;

    if (!videoNode.paused && !videoNode.seeking) {
      const watchedDelta = currentTime - previousTime;
      if (watchedDelta > 0 && watchedDelta <= FEED_WATCH_TIME_MAX_STEP_SECONDS) {
        entry.bufferedSeconds += watchedDelta;
        let safetyCount = 0;
        while (
          entry.bufferedSeconds >= FEED_WATCH_TIME_CHUNK_SECONDS &&
          entry.awardedChunks < FEED_WATCH_TIME_MAX_CHUNKS_PER_POST &&
          safetyCount < 6
        ) {
          entry.bufferedSeconds -= FEED_WATCH_TIME_CHUNK_SECONDS;
          entry.awardedChunks += 1;
          trackFeedInteraction(post, "watch", FEED_WATCH_TIME_CHUNK_WEIGHT);
          safetyCount += 1;
        }
      }
    }

    const durationHint = duration || Number(videoDurationByPost[post.id] || 0);
    if (durationHint > 0) {
      const progress = Math.max(0, Math.min(1, currentTime / durationHint));
      FEED_WATCH_PROGRESS_MILESTONES.forEach((milestone) => {
        const key = String(milestone.ratio);
        if (progress < milestone.ratio || entry.progressMilestones[key]) return;
        entry.progressMilestones[key] = true;
        trackFeedInteraction(post, "watch", milestone.weight);
      });
    }
  };

  const handleViewerVideoPlay = (post, event) => {
    if (!post?.id) return;
    syncWatchProgressCursor(post.id, event?.currentTarget?.currentTime || 0);
  };

  const handleViewerVideoPause = (post, event) => {
    if (!post?.id) return;
    syncWatchProgressCursor(post.id, event?.currentTarget?.currentTime || 0);
  };

  const handleViewerVideoSeeking = (post, event) => {
    if (!post?.id) return;
    syncWatchProgressCursor(post.id, event?.currentTarget?.currentTime || 0);
  };

  const personalizedPosts = useMemo(() => {
    if (!Array.isArray(posts) || posts.length < 2) return posts;
    const tokenWeights = personalizationState?.tokenWeights || {};
    const postWeights = personalizationState?.postWeights || {};
    if (!Object.keys(tokenWeights).length && !Object.keys(postWeights).length) return posts;

    const now = Date.now();
    const scored = posts.map((post, idx) => {
      const id = String(post?.id || "");
      const tokens = personalizationTokensByPost[id] || [];
      let score = 0;

      tokens.forEach((token) => {
        const key = normalizeGenre(token);
        if (!key) return;
        score += Number(tokenWeights[key] || 0);
      });

      if (id) score += Number(postWeights[id] || 0) * 1.8;

      const createdAtRaw = post?.createdAt || post?.createdDate || post?.createdOn || "";
      const createdAt = Date.parse(String(createdAtRaw || ""));
      if (Number.isFinite(createdAt)) {
        const ageHours = Math.max(0, (now - createdAt) / (1000 * 60 * 60));
        // Keep some freshness so newer posts can still surface.
        score += Math.max(0, 6 - ageHours * 0.08);
      }

      return { post, idx, score };
    });

    scored.sort((a, b) => (b.score - a.score) || (a.idx - b.idx));
    return scored.map((entry) => entry.post);
  }, [posts, personalizationState, personalizationTokensByPost]);

  const mediaTypeFor = (post) => {
    return mediaTypeForPost(post);
  };

  const captionFor = (post) => post?.description || post?.content || "Untitled video";

  const formatDuration = (seconds) => {
    const total = Math.max(0, Math.floor(Number(seconds) || 0));
    const hh = Math.floor(total / 3600);
    const mm = Math.floor((total % 3600) / 60);
    const ss = total % 60;
    if (hh > 0) return `${hh}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
    return `${mm}:${String(ss).padStart(2, "0")}`;
  };

  const formatCompactCount = (value) => {
    const n = Number(value) || 0;
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
    return `${n}`;
  };

  const relativePostTime = (value) => {
    const d = value ? new Date(value) : null;
    if (!d || Number.isNaN(d.getTime())) return "recently";
    const diffSec = Math.max(1, Math.floor((Date.now() - d.getTime()) / 1000));
    if (diffSec < 60) return `${diffSec} seconds ago`;
    const mins = Math.floor(diffSec / 60);
    if (mins < 60) return `${mins} minutes ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs} hours ago`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return `${days} days ago`;
    return d.toLocaleDateString();
  };

  const loadComments = async (postId) => {
    try {
      const res = await api.get(`/api/comments/${postId}`);
      setCommentsByPost((prev) => ({ ...prev, [postId]: Array.isArray(res.data) ? res.data : [] }));
    } catch {
      // noop
    }
  };

  const likePost = async (postId) => {
    const persistLikedMap = (next) => {
      writeIdMapToStorage("likedPostIds", next);
    };

    try {
      if (likedPostIds[postId]) {
        await api.delete(`/api/likes/${postId}`);
        setLikedPostIds((prev) => {
          if (!prev[postId]) return prev;
          const next = { ...prev };
          delete next[postId];
          persistLikedMap(next);
          return next;
        });
        setLikeCounts((prev) => ({ ...prev, [postId]: Math.max(0, (prev[postId] || 0) - 1) }));
        return;
      }

      const res = await api.post(`/api/likes/${postId}`);
      const message = String(res?.data || "").toLowerCase();
      if (message.includes("already")) {
        setLikedPostIds((prev) => {
          const next = { ...prev, [postId]: true };
          persistLikedMap(next);
          return next;
        });
        const targetPost = postById[String(postId)];
        if (targetPost) trackFeedInteraction(targetPost, "like");
        return;
      }
      setLikeCounts((prev) => ({ ...prev, [postId]: (prev[postId] || 0) + 1 }));
      setLikedPostIds((prev) => {
        const next = { ...prev, [postId]: true };
        persistLikedMap(next);
        return next;
      });
      const targetPost = postById[String(postId)];
      if (targetPost) trackFeedInteraction(targetPost, "like");
    } catch {
      // noop
    }
  };

  const toggleAllViewerVideosMute = () => {
    const videos = Object.values(viewerVideoRefs.current).filter(Boolean);
    if (!videos.length) return;
    const shouldMuteAll = videos.some((video) => !video.muted);
    setMutedByPost((prev) => {
      const next = { ...prev };
      viewerPosts.forEach((post) => {
        if (mediaTypeFor(post) !== "VIDEO") return;
        next[post.id] = shouldMuteAll;
      });
      return next;
    });
    videos.forEach((video) => {
      video.muted = shouldMuteAll;
    });
  };

  const formatLiveElapsed = (startedAt) => {
    const start = Number(startedAt || 0);
    if (!start) return "Just now";
    const diffSec = Math.max(0, Math.floor((Date.now() - start) / 1000));
    if (diffSec < 60) return `${diffSec}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    return `${diffHr}h ago`;
  };

  const handleViewerMediaClick = (post) => {
    if (!post || mediaTypeFor(post) !== "VIDEO") return;
    const existing = mediaClickTimerByPostRef.current[post.id];
    if (existing) clearTimeout(existing);
    mediaClickTimerByPostRef.current[post.id] = setTimeout(() => {
      toggleAllViewerVideosMute();
      mediaClickTimerByPostRef.current[post.id] = null;
    }, 240);
  };

  const toggleViewerFullscreen = async (postId, mediaNode) => {
    const node = mediaNode || viewerVideoRefs.current[String(postId || "")];
    if (!node) return;
    const currentFullscreenEl = document.fullscreenElement;
    if (currentFullscreenEl === node) {
      if (document.exitFullscreen) {
        await document.exitFullscreen().catch(() => {});
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      }
      return;
    }

    if (node.requestFullscreen) {
      await node.requestFullscreen().catch(() => {});
      return;
    }
    if (node.webkitRequestFullscreen) {
      node.webkitRequestFullscreen();
      return;
    }
    if (typeof node.webkitEnterFullscreen === "function") {
      try {
        node.webkitEnterFullscreen();
      } catch {
        // ignore unsupported platform behavior
      }
    }
  };

  const handleViewerMediaDoubleClick = async (post, event) => {
    if (!post) return;
    if (event?.preventDefault) event.preventDefault();
    if (event?.stopPropagation) event.stopPropagation();

    const existing = mediaClickTimerByPostRef.current[post.id];
    if (existing) {
      clearTimeout(existing);
      mediaClickTimerByPostRef.current[post.id] = null;
    }
    await toggleViewerFullscreen(post.id, event?.currentTarget || null);
  };

  const setViewerVideoRef = (postId, node) => {
    const id = String(postId || "").trim();
    if (!id) return;
    if (!node) {
      delete viewerVideoRefs.current[id];
      return;
    }
    viewerVideoRefs.current[id] = node;
    syncWatchProgressCursor(id, node.currentTime || 0);
  };

  const submitComment = async (postId) => {
    const text = (commentTextByPost[postId] || "").trim();
    if (!text) return;
    const targetPost = posts.find((post) => String(post?.id) === String(postId));
    try {
      await api.post(`/api/comments/${postId}`, text, {
        headers: { "Content-Type": "text/plain" }
      });
      setCommentTextByPost((prev) => ({ ...prev, [postId]: "" }));
      await loadComments(postId);
      if (targetPost) trackFeedInteraction(targetPost, "comment");
      recordCommentActivity({ postId, text, item: targetPost, source: "feed" });
    } catch {
      // noop
    }
  };

  const parseDurationSeconds = (value) => {
    const raw = Number(value);
    if (!Number.isFinite(raw) || raw <= 0) return 0;
    return raw > 10000 ? raw / 1000 : raw;
  };

  const inferIsShortVideo = (candidate) => {
    if (!candidate || mediaTypeFor(candidate) !== "VIDEO") return false;
    const durationHint =
      parseDurationSeconds(videoDurationByPost[candidate.id] || 0) ||
      parseDurationSeconds(candidate?.durationSeconds) ||
      parseDurationSeconds(candidate?.videoDurationSeconds) ||
      parseDurationSeconds(candidate?.duration) ||
      parseDurationSeconds(candidate?.videoDuration) ||
      parseDurationSeconds(candidate?.length) ||
      parseDurationSeconds(candidate?.videoLength) ||
      parseDurationSeconds(candidate?.durationMs) ||
      parseDurationSeconds(candidate?.videoDurationMs);
    const bucket = classifyVideoBucket(candidate, {
      durationHint,
      shortSeconds: SHORT_VIDEO_SECONDS,
      defaultUnknown: "long"
    });
    return bucket === "short" || bucket === "reel";
  };

  const buildPostShareUrl = (candidate) => {
    const postId = String(candidate?.id || "").trim();
    if (!postId) return `${window.location.origin}/feed`;
    const mediaType = mediaTypeFor(candidate);
    const previewMedia = String(
      candidate?.contentUrl ||
      candidate?.mediaUrl ||
      candidate?.videoUrl ||
      candidate?.video?.url ||
      ""
    ).trim();
    const previewPoster = String(
      candidate?.thumbnailUrl ||
      candidate?.thumbUrl ||
      candidate?.previewUrl ||
      candidate?.coverUrl ||
      candidate?.coverImageUrl ||
      candidate?.coverImage ||
      candidate?.posterUrl ||
      candidate?.poster ||
      candidate?.imageUrl ||
      ""
    ).trim();
    if (mediaType === "VIDEO") {
      if (inferIsShortVideo(candidate)) {
        const reelUrl = new URL("/clips", window.location.origin);
        reelUrl.searchParams.set("post", postId);
        if (previewMedia) reelUrl.searchParams.set("media", previewMedia);
        if (previewPoster) reelUrl.searchParams.set("poster", previewPoster);
        return reelUrl.toString();
      }
      const watchUrl = new URL(`/watch/${encodeURIComponent(postId)}`, window.location.origin);
      if (previewMedia) watchUrl.searchParams.set("media", previewMedia);
      if (previewPoster) watchUrl.searchParams.set("poster", previewPoster);
      return watchUrl.toString();
    }
    return `${window.location.origin}/feed?post=${encodeURIComponent(postId)}`;
  };

  const flashShareStatus = (postId, text, durationMs = 1200) => {
    if (!postId) return;
    setShareMessageByPost((prev) => ({ ...prev, [postId]: text }));
    setTimeout(() => {
      setShareMessageByPost((prev) => ({ ...prev, [postId]: "" }));
    }, durationMs);
  };

  const sharePostOutside = async (post) => {
    if (!post?.id) return;
    const shareUrl = buildPostShareUrl(post);
    const shareTitle = captionFor(post);
    const shareText = `${shareTitle} ${shareUrl}`.trim();

    try {
      if (navigator?.share) {
        await navigator.share({
          title: shareTitle,
          text: shareTitle,
          url: shareUrl
        });
        recordRepostActivity({ item: post, source: "feed", via: "outside" });
        trackFeedInteraction(post, "share");
        flashShareStatus(post.id, "Shared");
        return;
      }
    } catch (err) {
      if (err?.name === "AbortError") return;
    }

    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareText);
        recordRepostActivity({ item: post, source: "feed", via: "outside_copy" });
        trackFeedInteraction(post, "share");
        flashShareStatus(post.id, "Link copied");
        return;
      }
    } catch {
      // ignore clipboard failures and continue fallback
    }

    window.prompt("Copy and share this link", shareUrl);
    trackFeedInteraction(post, "share");
    flashShareStatus(post.id, "Share link ready");
  };

  const sharePost = async (post) => {
    const shareUrl = buildPostShareUrl(post);
    const shareText = `${post.description || post.content || "Check this post"} ${shareUrl}`;
    try {
      recordRepostActivity({ item: post, source: "feed", via: "chat" });
      try {
        sessionStorage.setItem(CHAT_SHARE_DRAFT_KEY, shareText);
      } catch {
        // ignore storage failures
      }
      navigate(`/chat?share=${encodeURIComponent(shareText)}`);
      trackFeedInteraction(post, "share");
      flashShareStatus(post.id, "Sharing to chat...");
    } catch {
      flashShareStatus(post.id, "Share failed");
    }
  };

  const toggleSave = (postId) => {
    setSavedPostIds((prev) => {
      const next = { ...prev };
      if (next[postId]) delete next[postId];
      else next[postId] = true;
      writeIdMapToStorage("savedPostIds", next);
      return next;
    });
  };

  const toggleWatchLater = (postId) => {
    setWatchLaterPostIds((prev) => {
      const next = { ...prev };
      if (next[postId]) delete next[postId];
      else next[postId] = true;
      writeIdMapToStorage("watchLaterPostIds", next);
      return next;
    });
  };

  const filteredPosts = useMemo(() => {
    if (!query.trim()) return personalizedPosts;
    const q = query.toLowerCase();
    return personalizedPosts.filter((post) => {
      const user = usernameFor(post).toLowerCase();
      const text = `${post.description || ""} ${post.content || ""}`.toLowerCase();
      return user.includes(q) || text.includes(q);
    });
  }, [personalizedPosts, query]);

  const visiblePosts = useMemo(() => {
    return filteredPosts.filter((post) => {
      if (hiddenPostIds[post.id]) return false;
      const ownerKey = ownerKeyFor(post);
      if (ownerKey && blockedOwnerKeys[ownerKey]) return false;
      return true;
    });
  }, [filteredPosts, hiddenPostIds, blockedOwnerKeys]);

  const typeFilteredPosts = useMemo(() => {
    if (!contentTypeFilter || contentTypeFilter === "all") return visiblePosts;
    return visiblePosts.filter((post) => categoryMatchesPost(post, contentTypeFilter, localGenreMap));
  }, [visiblePosts, contentTypeFilter, localGenreMap]);

  const subFilteredPosts = useMemo(() => {
    const category = normalizeGenre(contentTypeFilter);
    if (!CONTENT_SUB_FILTERS[category] || !contentSubFilter || contentSubFilter === "all") return typeFilteredPosts;
    return typeFilteredPosts.filter((post) => contentSubFilterMatchesPost(post, category, contentSubFilter, localGenreMap));
  }, [typeFilteredPosts, contentTypeFilter, contentSubFilter, localGenreMap]);

  const longVideoPosts = useMemo(() => {
    // "Video" tab should show all in-app playable videos (direct mp4/webm/etc),
    // not just >90s content.
    return subFilteredPosts.filter(
      (post) => mediaTypeFor(post) === "VIDEO" && !isYouTubeMedia(post) && !isExplicitReelPost(post)
    );
  }, [subFilteredPosts]);

  const longVideoFeedPosts = useMemo(() => longVideoPosts, [longVideoPosts]);

  const feedPosts = useMemo(() => {
    // Feed tab should show only photo posts (not reels / not long videos).
    return subFilteredPosts.filter((post) => mediaTypeFor(post) !== "VIDEO");
  }, [subFilteredPosts]);

  const activeFeedIndex = useMemo(
    () => feedPosts.findIndex((p) => p.id === activePostId),
    [feedPosts, activePostId]
  );
  const isFeedViewerOpen = feedMode === "all" && activeFeedIndex >= 0;

  const openPost = async (postId, syncUrl = false, replace = false, signal = "view") => {
    closingPostViewRef.current = false;
    setActivePostId(postId);
    const post = postById[String(postId)];
    if (post) trackFeedInteraction(post, signal);
    await loadComments(postId);
    if (syncUrl) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.set("post", postId);
      if (feedMode === "long") nextParams.set("mode", "long");
      else nextParams.delete("mode");
      const query = nextParams.toString();
      navigate(query ? `/feed?${query}` : "/feed", { replace });
    }
  };

  useEffect(() => {
    const postParam = String(searchParams.get("post") || "").trim();
    if (!postParam) {
      closingPostViewRef.current = false;
      return;
    }
    if (closingPostViewRef.current) return;
    const target = posts.find((p) => String(p?.id) === postParam);
    if (!target) return;
    if (String(activePostId || "") === postParam) return;
    void openPost(target.id, false);
  }, [searchParams, posts, activePostId, videoDurationByPost, navigate]);

  const openPostFromGrid = async (post) => {
    const type = mediaTypeFor(post);
    if (feedMode === "all" && type === "VIDEO") {
      trackFeedInteraction(post, "watch");
      navigate(`/clips?post=${post.id}`);
      return;
    }
    const bucket = classifyVideoBucket(post, {
      durationHint: Number(videoDurationByPost[post.id] || 0),
      shortSeconds: SHORT_VIDEO_SECONDS,
      defaultUnknown: "long"
    });
    const isShortVideo = type === "VIDEO" && bucket === "short";
    if (isShortVideo) {
      trackFeedInteraction(post, "watch");
      navigate(`/clips?post=${post.id}`);
      return;
    }
    await openPost(post.id, false, false, "watch");
  };

  const moveFeedItem = async (direction) => {
    if (activeFeedIndex < 0 || !feedPosts.length) return;
    const nextIndex = (activeFeedIndex + direction + feedPosts.length) % feedPosts.length;
    const nextPost = feedPosts[nextIndex];
    if (!nextPost) return;
    await openPost(nextPost.id, true, true, "feed");
  };

  useEffect(() => {
    if (!isFeedViewerOpen) return;
    const onKeyDown = (e) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        void moveFeedItem(1);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        void moveFeedItem(-1);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isFeedViewerOpen, feedPosts, activeFeedIndex]);

  const closePostView = () => {
    closingPostViewRef.current = true;
    setActivePostId(null);
    if (searchParams.get("post")) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete("post");
      if (feedMode === "long") nextParams.set("mode", "long");
      else nextParams.delete("mode");
      const query = nextParams.toString();
      navigate(query ? `/feed?${query}` : "/feed", { replace: true });
    }
  };

  const activePost = posts.find((p) => p.id === activePostId) || null;
  const isVideoViewer = activePost ? mediaTypeFor(activePost) === "VIDEO" : false;
  const viewerPosts = useMemo(() => {
    if (!activePost) return [];
    const activeType = mediaTypeFor(activePost);
    const videoPool = subFilteredPosts.filter((p) => mediaTypeFor(p) === "VIDEO");
    const pool = activeType === "VIDEO" ? videoPool : [activePost];
    const idx = pool.findIndex((p) => Number(p?.id) === Number(activePost.id));
    if (idx < 0) return [activePost];
    const ordered = [...pool.slice(idx), ...pool.slice(0, idx)];
    return ordered.length ? ordered : [activePost];
  }, [activePost, subFilteredPosts]);

  useEffect(() => {
    if (!activePostId) return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [activePostId]);

  useEffect(() => {
    if (!activePostId) return undefined;
    const rootEl = postViewBackdropRef.current || null;
    if (!rootEl) return undefined;

    const visibilityByVideo = new Map();
    const observedVideos = new Set();
    const pauseOthers = (keep) => {
      observedVideos.forEach((video) => {
        if (video === keep) return;
        try {
          video.pause();
        } catch {
          // ignore pause failures
        }
      });
    };

    const playMostVisible = () => {
      let bestVideo = null;
      let bestRatio = 0;
      observedVideos.forEach((video) => {
        const ratio = Number(visibilityByVideo.get(video) || 0);
        if (ratio > bestRatio) {
          bestRatio = ratio;
          bestVideo = video;
        }
      });

      pauseOthers(bestVideo);
      if (!bestVideo || bestRatio < 0.6) return;
      try {
        const playAttempt = bestVideo.play();
        if (playAttempt?.catch) playAttempt.catch(() => {});
      } catch {
        // ignore autoplay failures
      }
    };

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          visibilityByVideo.set(entry.target, entry.intersectionRatio);
        });
        playMostVisible();
      },
      { root: rootEl, threshold: [0, 0.25, 0.5, 0.75, 0.9, 1] }
    );

    const syncObservedVideos = () => {
      const videos = rootEl.querySelectorAll("video.feed-media-view");
      videos.forEach((video) => {
        if (observedVideos.has(video)) return;
        observedVideos.add(video);
        visibilityByVideo.set(video, 0);
        observer.observe(video);
      });
    };

    syncObservedVideos();
    const syncTimer = setInterval(() => {
      syncObservedVideos();
      playMostVisible();
    }, 220);
    const rafId = requestAnimationFrame(playMostVisible);
    return () => {
      cancelAnimationFrame(rafId);
      clearInterval(syncTimer);
      observer.disconnect();
      pauseOthers(null);
      observedVideos.clear();
      visibilityByVideo.clear();
    };
  }, [activePostId, viewerPosts]);

  useEffect(() => {
    return () => {
      Object.values(mediaClickTimerByPostRef.current).forEach((timer) => {
        if (timer) clearTimeout(timer);
      });
      mediaClickTimerByPostRef.current = {};
      watchProgressByPostRef.current = {};
    };
  }, []);

  const persistIdCollection = (key, map) => {
    writeIdMapToStorage(key, map);
  };

  const appendToIdList = (key, postId) => {
    const numericId = Number(postId);
    if (!Number.isFinite(numericId) || numericId <= 0) return;

    const current = readIdListFromStorage(key);
    const next = current.filter((id) => Number(id) !== numericId);
    next.push(numericId);
    writeIdListToStorage(key, next);
  };

  const showMenuStatus = (postId, text) => {
    flashShareStatus(postId, text, 1200);
  };

  const onMenuAction = async (action, post) => {
    if (!post?.id) return;
    const ownerKey = ownerKeyFor(post);

    if (action === "share") {
      await sharePostOutside(post);
    } else if (action === "playlist") {
      appendToIdList(PLAYLIST_KEY, post.id);
      showMenuStatus(post.id, "Saved to playlist");
    } else if (action === "not_interested") {
      setHiddenPostIds((prev) => {
        const next = { ...prev, [post.id]: true };
        persistIdCollection(HIDDEN_POSTS_KEY, next);
        return next;
      });
      showMenuStatus(post.id, "Hidden");
    } else if (action === "dont_recommend") {
        if (ownerKey) {
          setBlockedOwnerKeys((prev) => {
            const next = { ...prev, [ownerKey]: true };
            const keys = Object.keys(next).filter((k) => next[k]);
            try {
              localStorage.setItem(BLOCKED_OWNERS_KEY, JSON.stringify(keys));
            } catch {
              // ignore storage issues
            }
            return next;
          });
          showMenuStatus(post.id, "Won't recommend this video");
        }
    } else if (action === "report") {
      try {
        await api.post("/api/report", {
          postId: post.id,
          reason: "Inappropriate content",
        });
        showMenuStatus(post.id, "Reported");
      } catch {
        showMenuStatus(post.id, "Report submitted");
      }
    } else if (action === "watch_later") {
      const wasSaved = !!watchLaterPostIds[post.id];
      toggleWatchLater(post.id);
      showMenuStatus(post.id, wasSaved ? "Removed from Watch Later" : "Saved to Watch Later");
    } else if (action === "play_next") {
      try {
        localStorage.setItem(PLAY_NEXT_KEY, String(post.id));
      } catch {
        // ignore storage issues
      }
      showMenuStatus(post.id, "Set to play next");
    } else if (action === "queue") {
      appendToIdList(QUEUE_KEY, post.id);
      showMenuStatus(post.id, "Added to queue");
    }

    setMenuOpenPostId(null);
    setMenuPlacement(createDefaultLongMenuPlacement());
  };

  const handleMenuItemClick = async (event, action, post) => {
    if (event?.preventDefault) event.preventDefault();
    if (event?.stopPropagation) event.stopPropagation();
    await onMenuAction(action, post);
  };

  const liveHostName = liveBroadcast?.hostName || "Creator";
  const liveTitle = liveBroadcast?.title || `${liveHostName} is live`;
  const liveSubtitle = liveBroadcast?.startedAt ? formatLiveElapsed(liveBroadcast.startedAt) : "Live now";
  const hasLongContent = Boolean(liveBroadcast) || longVideoFeedPosts.length > 0;
  const hasFeedContent = Boolean(liveBroadcast) || feedPosts.length > 0;

  const renderLivePreview = (className) => {
    if (livePreviewFrame) {
      return <img src={livePreviewFrame} alt="Live preview" className={className} />;
    }
    return (
      <div className={`${className} live-preview-fallback`}>
        <span>Live</span>
      </div>
    );
  };

  return (
    <div className="feed-page">
      <div className="feed-top-row">
        <div className="explore-search-wrap">
          <span className="explore-search-icon">{"\u2315"}</span>
          <input
            type="text"
            placeholder="Search people or captions"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="explore-search-input"
          />
          <div className="feed-filter-menu" ref={feedMenuRef}>
            <button
              type="button"
              className="feed-filter-btn"
              aria-haspopup="menu"
              aria-expanded={feedMenuOpen}
              aria-label="Feed options"
              onClick={() => setFeedMenuOpen((prev) => !prev)}
            >
              ...
            </button>
            {feedMenuOpen && (
              <div className="feed-filter-panel" role="menu">
                {FEED_CONTENT_TYPES.map((item) => (
                  <button
                    key={`filter-${item.value}`}
                    type="button"
                    className={contentTypeFilter === item.value ? "is-active" : ""}
                    role="menuitemradio"
                    aria-checked={contentTypeFilter === item.value}
                    onClick={() => selectContentType(item.value)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="feed-mode-switch" role="tablist" aria-label="Feed mode">
          <button
            type="button"
            role="tab"
            aria-selected={feedMode === "long"}
            className={`feed-mode-btn ${feedMode === "long" ? "is-active" : ""}`}
            onClick={() => setFeedMode("long")}
          >
            Video
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={feedMode === "all"}
            className={`feed-mode-btn ${feedMode === "all" ? "is-active" : ""}`}
            onClick={() => setFeedMode("all")}
          >
            Feed
          </button>
        </div>
      </div>

      {CONTENT_SUB_FILTERS[normalizeGenre(contentTypeFilter)] && (
        <div
          className="feed-study-subject-row"
          role="tablist"
          aria-label={CONTENT_SUB_FILTERS[normalizeGenre(contentTypeFilter)].ariaLabel}
        >
          {CONTENT_SUB_FILTERS[normalizeGenre(contentTypeFilter)].options.map((subject) => (
            <button
              key={`study-${subject.value}`}
              type="button"
              role="tab"
              aria-selected={contentSubFilter === subject.value}
              className={`feed-study-subject-chip ${contentSubFilter === subject.value ? "is-active" : ""}`}
              onClick={() => setContentSubFilter(subject.value)}
            >
              {subject.label}
            </button>
          ))}
        </div>
      )}


      {error && <p>{error}</p>}
      {!error && isLoading && (
        <div className="feed-loading" role="status" aria-live="polite" aria-label="Loading feed">
          <span className="feed-loading-spinner" />
        </div>
      )}
      {!error && !isLoading && subFilteredPosts.length === 0 && <p className="feed-empty">No posts found</p>}
      {!error && !isLoading && feedMode === "long" && !longVideoFeedPosts.length && !liveBroadcast && (
        <p className="feed-empty">No videos found. Upload an MP4 to watch in-app.</p>
      )}
      {!error && !isLoading && feedMode === "all" && !feedPosts.length && !liveBroadcast && (
        <p className="feed-empty">No feed found</p>
      )}

      {hasLongContent && feedMode === "long" && (
        <section className="feed-yt-shell">
          <aside className="feed-yt-rail">
            {FEED_YT_RAIL_ITEMS.map((item, idx) => (
              <button key={item} type="button" className={`feed-yt-rail-item ${idx === 0 ? "is-active" : ""}`}>
                {item}
              </button>
            ))}
          </aside>

          <div className="feed-yt-main">
            <div className="long-video-feed">
          {liveBroadcast && (
            <article
              className="long-feed-card live-feed-card"
              onClick={() => navigate("/live/watch")}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  navigate("/live/watch");
                }
              }}
              role="button"
              tabIndex={0}
              title={liveTitle}
            >
              <div className="long-feed-thumb-wrap live-feed-thumb-wrap">
                {renderLivePreview("long-feed-thumb live-feed-thumb")}
                <span className="live-badge">
                  <span className="live-badge-dot" />
                  LIVE
                </span>
              </div>
              <div className="long-feed-meta">
                <span className="long-feed-avatar live-feed-avatar">
                  {liveHostName.charAt(0).toUpperCase()}
                </span>
                <div className="long-feed-text">
                  <p className="long-feed-title">{liveTitle}</p>
                  <p className="long-feed-sub">{liveHostName} - {liveSubtitle}</p>
                </div>
              </div>
            </article>
          )}
          {longVideoFeedPosts.map((post) => {
            const rawUrl = post.contentUrl || post.mediaUrl || "";
            const mediaUrl = rawUrl.trim() ? resolveUrl(rawUrl.trim()) : "";
            if (!mediaUrl) return null;
            const user = usernameFor(post);
            const profilePic = profilePicFor(post);
            const duration = videoDurationByPost[post.id] || 0;
            const isMenuOpen = menuOpenPostId === post.id;
            const menuClassName = [
              "long-feed-menu",
              isMenuOpen && menuPlacement.postId === post.id && menuPlacement.vertical === "up" ? "is-open-up" : "",
              isMenuOpen && menuPlacement.postId === post.id && menuPlacement.horizontal === "left" ? "is-open-left" : "",
            ]
              .filter(Boolean)
              .join(" ");
            const menuStyle =
              isMenuOpen && menuPlacement.postId === post.id
                ? { "--long-feed-menu-max-height": `${menuPlacement.maxHeight}px` }
                : undefined;
            return (
              <article
                key={`long-${post.id}`}
                className="long-feed-card"
                onClick={() => {
                  trackFeedInteraction(post, "watch");
                  navigate(`/watch/${post.id}`);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    trackFeedInteraction(post, "watch");
                    navigate(`/watch/${post.id}`);
                  }
                }}
                role="button"
                tabIndex={0}
                title={user}
              >
                <div className="long-feed-thumb-wrap">
                  <video
                    src={mediaUrl}
                    muted
                    playsInline
                    preload="metadata"
                    className="long-feed-thumb"
                    onLoadedMetadata={(e) => {
                      const next = Number(e.currentTarget.duration) || 0;
                      setVideoDurationByPost((prev) => (prev[post.id] === next ? prev : { ...prev, [post.id]: next }));
                    }}
                  />
                  <span className="long-feed-duration">{formatDuration(duration)}</span>
                </div>
                <div className="long-feed-meta">
                  {profilePic ? (
                    <img src={profilePic} alt={user} className="long-feed-avatar long-feed-avatar-img" />
                  ) : (
                    <span className="long-feed-avatar">{user.charAt(0).toUpperCase()}</span>
                  )}
                  <div className="long-feed-text">
                    <p className="long-feed-title">{captionFor(post)}</p>
                    <p className="long-feed-sub">{user} | {(likeCounts[post.id] || 0).toLocaleString()} likes</p>
                    {shareMessageByPost[post.id] && <p className="long-feed-status">{shareMessageByPost[post.id]}</p>}
                  </div>
                  <div className="long-feed-actions-wrap">
                    <button
                      type="button"
                      className="long-feed-share-btn"
                      title="Share outside SocialSea"
                      aria-label="Share outside SocialSea"
                      onClick={(e) => {
                        e.stopPropagation();
                        void sharePostOutside(post);
                      }}
                    >
                      <IoArrowRedoOutline className="long-feed-share-icon" aria-hidden="true" />
                    </button>
                    <div className="long-feed-menu-wrap" ref={isMenuOpen ? menuRef : null}>
                      <button
                        type="button"
                        className="long-feed-menu-btn"
                        aria-label="More options"
                        aria-haspopup="menu"
                        aria-expanded={isMenuOpen}
                        onPointerDown={(e) => {
                          e.stopPropagation();
                        }}
                        onTouchStart={(e) => {
                          e.stopPropagation();
                        }}
                        onClick={(e) => {
                          togglePostMenu(e, post.id);
                        }}
                      >
                        {"\u22EE"}
                      </button>
                      {isMenuOpen && (
                        <div
                          className={menuClassName}
                          style={menuStyle}
                          onPointerDown={(e) => e.stopPropagation()}
                          onTouchStart={(e) => e.stopPropagation()}
                          onTouchMove={(e) => e.stopPropagation()}
                          onWheel={(e) => e.stopPropagation()}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button type="button" onClick={(e) => void handleMenuItemClick(e, "share", post)}>Share outside SocialSea</button>
                          <button type="button" onClick={(e) => void handleMenuItemClick(e, "playlist", post)}>Save to playlist</button>
                          <button type="button" onClick={(e) => void handleMenuItemClick(e, "not_interested", post)}>Not interested</button>
                          <button type="button" onClick={(e) => void handleMenuItemClick(e, "dont_recommend", post)}>Don't recommend this video</button>
                          <button type="button" onClick={(e) => void handleMenuItemClick(e, "report", post)}>Report</button>
                          <button type="button" onClick={(e) => void handleMenuItemClick(e, "watch_later", post)}>Save to Watch Later</button>
                          <button type="button" onClick={(e) => void handleMenuItemClick(e, "play_next", post)}>Play next</button>
                          <button type="button" onClick={(e) => void handleMenuItemClick(e, "queue", post)}>In queue</button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
            </div>
          </div>
        </section>
      )}

      {feedMode === "all" && hasFeedContent && (
        <section className="explore-grid instagram-grid">
        {liveBroadcast && (
          <button
            type="button"
            className="explore-tile instagram-tile live-explore-tile"
            onClick={() => navigate("/live/watch")}
            title={liveTitle}
          >
            {renderLivePreview("explore-media live-explore-media")}
            <span className="live-badge">
              <span className="live-badge-dot" />
              LIVE
            </span>
            <div className="explore-overlay live-explore-overlay">
              <span>Watch Live</span>
              <span>{liveSubtitle}</span>
            </div>
          </button>
        )}
        {feedPosts.map((post) => {
          const rawUrl = post.contentUrl || post.mediaUrl || "";
          const mediaUrl = rawUrl.trim() ? resolveUrl(rawUrl.trim()) : "";
          const type = mediaTypeFor(post);
          if (!mediaUrl) return null;

          return (
            <button
              key={post.id}
              type="button"
              className="explore-tile instagram-tile"
              onClick={() => openPost(post.id, true, false, "feed")}
              title={usernameFor(post)}
            >
              {type === "VIDEO" ? (
                <video
                  src={mediaUrl}
                  autoPlay
                  loop
                  muted
                  playsInline
                  preload="auto"
                  className="explore-media"
                  onLoadedMetadata={(e) => {
                    const duration = Number(e.currentTarget.duration) || 0;
                    setVideoDurationByPost((prev) => {
                      if ((prev[post.id] || 0) === duration) return prev;
                      return { ...prev, [post.id]: duration };
                    });
                  }}
                />
              ) : (
                <img src={mediaUrl} alt="post" className="explore-media" />
              )}
              <div className="explore-overlay">
                <span>{"\u25B7"} {(likeCounts[post.id] || 0).toLocaleString()}</span>
              </div>
            </button>
          );
        })}
        </section>
      )}

      {activePost && (
        <div
          className={`post-view-backdrop ${isVideoViewer ? "is-video-viewer" : ""}`.trim()}
          ref={postViewBackdropRef}
          onClick={closePostView}
        >
          <div className="post-view-stack" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="post-view-exit-btn" onClick={closePostView} aria-label="Close viewer">
              {"<"}
            </button>
            {viewerPosts.map((post, idx) => {
              const isPrimary = idx === 0;
              const raw = post.contentUrl || post.mediaUrl || "";
              const mediaUrl = raw.trim() ? resolveUrl(raw.trim()) : "";
              const type = mediaTypeFor(post);
              const ownerKey = ownerKeyFor(post) || String(post?.id || "");
              const followState = followStateByOwner[ownerKey] || followStateHintFor(post);
              const isFollowing = followState === "following";
              const isRequested = followState === "requested";
              const isFollowBusy = !!followBusyByOwner[ownerKey];
              const showFollow = !isOwnPost(post);
              return (
                <article
                  className={`post-view-card instagram-post-card ${type === "VIDEO" ? "is-video-post" : ""}`.trim()}
                  key={`viewer-${post.id}-${idx}`}
                >
                  <div className="ig-post-context">
                    <p className="ig-post-tags">{post.description || post.content || "Post"}</p>
                    <p className="ig-post-time">{relativePostTime(post.createdAt || post.createdDate)}</p>
                  </div>

                  <header className="feed-post-head ig-post-head">
                    {profilePicFor(post) ? (
                      <img
                        src={profilePicFor(post)}
                        alt={usernameFor(post)}
                        className="feed-avatar feed-avatar-img"
                      />
                    ) : (
                      <div className="feed-avatar">{usernameFor(post).charAt(0).toUpperCase()}</div>
                    )}
                    <div className="ig-user-meta">
                      <button
                        type="button"
                        className="feed-username-link"
                        onClick={() => navigate(buildProfilePath(post))}
                        title={`Open ${usernameFor(post)} profile`}
                      >
                        {usernameFor(post)}
                      </button>
                      <small>{usernameFor(post)} | Original audio</small>
                    </div>
                    {showFollow && (
                      <div className="ig-user-actions">
                        <button
                          type="button"
                          className={`ig-follow-btn ${isFollowing || isRequested ? "is-following" : ""}`.trim()}
                          onClick={() => followPostOwner(post)}
                          disabled={isFollowBusy || isFollowing || isRequested}
                        >
                          {isFollowBusy ? "..." : isFollowing ? "Following" : isRequested ? "Requested" : "Follow"}
                        </button>
                      </div>
                    )}
                  </header>

                  {mediaUrl && (
                    type === "VIDEO" ? (
                      <video
                        ref={(node) => setViewerVideoRef(post.id, node)}
                        src={mediaUrl}
                        loop
                        controls
                        playsInline
                        preload="metadata"
                        muted={mutedByPost[post.id] ?? true}
                        className="feed-media-view is-video-media"
                        onClick={() => handleViewerMediaClick(post)}
                        onPlay={(event) => handleViewerVideoPlay(post, event)}
                        onPause={(event) => handleViewerVideoPause(post, event)}
                        onSeeking={(event) => handleViewerVideoSeeking(post, event)}
                        onTimeUpdate={(event) => applyWatchTimeSignals(post, event)}
                        onDoubleClick={(event) => {
                          void handleViewerMediaDoubleClick(post, event);
                        }}
                      />
                    ) : (
                      <img src={mediaUrl} alt="post" className="feed-media-view" />
                    )
                  )}

                  <div className="feed-actions ig-feed-actions">
                    <div className="feed-actions-left">
                      <button
                        type="button"
                        className={likedPostIds[post.id] ? "is-active" : ""}
                        onClick={() => likePost(post.id)}
                        title="Like"
                      >
                        <span className="action-icon">{"\u2665"}</span>
                        <span className="action-count">{formatCompactCount(likeCounts[post.id] || 0)}</span>
                      </button>
                      <button type="button" title="Comments">
                        <span className="action-icon">{"\u{1F4AC}"}</span>
                        <span className="action-count">{formatCompactCount((commentsByPost[post.id] || []).length)}</span>
                      </button>
                      <button type="button" onClick={() => sharePost(post)} title="Share">
                        <span className="action-icon">{"\u2934"}</span>
                      </button>
                    </div>

                    <button
                      type="button"
                      className={`feed-save-btn ${savedPostIds[post.id] ? "is-saved is-active" : ""}`}
                      onClick={() => toggleSave(post.id)}
                      title="Save"
                    >
                      <span className="action-icon action-icon-svg">
                        {savedPostIds[post.id] ? <BsBookmarkFill /> : <FiBookmark />}
                      </span>
                    </button>
                  </div>

                  {shareMessageByPost[post.id] && <p className="feed-share-status">{shareMessageByPost[post.id]}</p>}
                  {likeCounts[post.id] > 0 && <p className="feed-likes-line">{likeCounts[post.id]} likes</p>}
                  {(post.description || post.content) && (
                    <p className="feed-caption">
                      <strong>{usernameFor(post)}</strong>{" "}
                      {post.description || post.content}
                    </p>
                  )}

                  {isPrimary && (
                    <div className="feed-comments">
                      <div className="feed-comment-input-row">
                        <input
                          type="text"
                          placeholder="Add a comment..."
                          value={commentTextByPost[post.id] || ""}
                          onChange={(e) =>
                            setCommentTextByPost((prev) => ({ ...prev, [post.id]: e.target.value }))
                          }
                        />
                        <button type="button" onClick={() => submitComment(post.id)}>Post</button>
                      </div>

                      {(commentsByPost[post.id] || []).map((comment) => (
                        <div className="feed-comment-item" key={comment.id}>
                          <strong>{normalizeDisplayName(comment.user?.name || comment.user?.email || "User")}:</strong>{" "}
                          {comment.text}
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

