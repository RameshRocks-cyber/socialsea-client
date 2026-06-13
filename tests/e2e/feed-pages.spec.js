import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const uploadsRoot = path.join(repoRoot, "uploads");

const MEDIA_FILES = {
  biologyImage: "08549c3b-9086-4ad1-a52d-96940d58d9a5.jpg",
  gamingImage: "a76020b9-43cb-4277-bf42-174059a7b4de.jpg",
  longVideo: "d3148903-c259-44bd-9e13-dcf3f4051d5b.webm",
};

const VIEWER_USER = {
  id: "feed-tester",
  userId: "feed-tester",
  username: "feed_tester",
  name: "Feed Tester",
  email: "feed.tester@example.com",
  role: "USER",
  profileCompleted: true,
  profilePicUrl: `/uploads/${MEDIA_FILES.biologyImage}`,
};

const mainFeedPosts = [
  {
    id: 101,
    username: "Ava Scientist",
    name: "Ava Scientist",
    email: "ava.scientist@example.com",
    userId: "ava-scientist",
    description: "Biology notes for cell structure",
    content: "Biology notes for cell structure",
    category: "study",
    tags: ["biology"],
    contentUrl: `/uploads/${MEDIA_FILES.biologyImage}`,
    mediaUrl: `/uploads/${MEDIA_FILES.biologyImage}`,
    type: "IMAGE",
    mediaType: "IMAGE",
    createdAt: "2026-06-11T08:30:00.000Z",
    likeCount: 4,
    profilePicUrl: `/uploads/${MEDIA_FILES.biologyImage}`,
    user: {
      id: "ava-scientist",
      username: "Ava Scientist",
      name: "Ava Scientist",
      email: "ava.scientist@example.com",
      profilePicUrl: `/uploads/${MEDIA_FILES.biologyImage}`,
    },
  },
  {
    id: 102,
    username: "Ben Gamer",
    name: "Ben Gamer",
    email: "ben.gamer@example.com",
    userId: "ben-gamer",
    description: "Cricket training montage",
    content: "Cricket training montage",
    category: "gaming",
    tags: ["cricket"],
    contentUrl: `/uploads/${MEDIA_FILES.gamingImage}`,
    mediaUrl: `/uploads/${MEDIA_FILES.gamingImage}`,
    type: "IMAGE",
    mediaType: "IMAGE",
    createdAt: "2026-06-10T08:30:00.000Z",
    likeCount: 2,
    profilePicUrl: `/uploads/${MEDIA_FILES.gamingImage}`,
    user: {
      id: "ben-gamer",
      username: "Ben Gamer",
      name: "Ben Gamer",
      email: "ben.gamer@example.com",
      profilePicUrl: `/uploads/${MEDIA_FILES.gamingImage}`,
    },
  },
  {
    id: 201,
    username: "Video Host",
    name: "Video Host",
    email: "video.host@example.com",
    userId: "video-host",
    description: "Physics explainer in long form",
    content: "Physics explainer in long form",
    category: "study",
    tags: ["physics"],
    contentUrl: `/uploads/${MEDIA_FILES.longVideo}`,
    mediaUrl: `/uploads/${MEDIA_FILES.longVideo}`,
    type: "VIDEO",
    mediaType: "VIDEO",
    sourceType: "long_video",
    videoSettings: JSON.stringify({
      distributionSurface: "video_feed",
      uploadType: "long_video",
    }),
    createdAt: "2026-06-09T08:30:00.000Z",
    likeCount: 9,
    profilePicUrl: `/uploads/${MEDIA_FILES.biologyImage}`,
    user: {
      id: "video-host",
      username: "Video Host",
      name: "Video Host",
      email: "video.host@example.com",
      profilePicUrl: `/uploads/${MEDIA_FILES.biologyImage}`,
    },
  },
];

const anonymousFeedItem = {
  id: 901,
  username: "Anonymous Post",
  name: "Anonymous Post",
  description: "Anonymous retry handling",
  content: "Anonymous post for retry handling",
  visibility: "anonymous",
  isAnonymous: true,
  anonymous: true,
  contentUrl: `/uploads/${MEDIA_FILES.biologyImage}`,
  mediaUrl: `/uploads/${MEDIA_FILES.biologyImage}`,
  type: "IMAGE",
  mediaType: "IMAGE",
  createdAt: "2026-06-08T08:30:00.000Z",
  likeCount: 2,
  viewCount: 0,
};

const respondJson = (route, payload, status = 200) =>
  route.fulfill({
    status,
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify(payload),
  });

const loadAsset = (fileName) => fs.readFileSync(path.join(uploadsRoot, fileName));

const imageBytes = loadAsset(MEDIA_FILES.biologyImage);
const altImageBytes = loadAsset(MEDIA_FILES.gamingImage);
const videoBytes = loadAsset(MEDIA_FILES.longVideo);

const attachDebugListeners = (page) => {
  if (String(process.env.PW_FEED_DEBUG || "").trim() !== "1") return;
  page.on("console", (msg) => {
    console.log(`[browser:${msg.type()}] ${msg.text()}`);
  });
  page.on("pageerror", (err) => {
    console.log(`[pageerror] ${String(err?.stack || err?.message || err)}`);
  });
  page.on("requestfailed", (request) => {
    const failure = request.failure()?.errorText || "unknown";
    console.log(`[requestfailed] ${request.method()} ${request.url()} -> ${failure}`);
  });
};

const seedAuthStorage = async (context, user = VIEWER_USER) => {
  await context.addInitScript((nextUser) => {
    const sessionKey = "socialsea_auth_session_v1";
    const recoveryLockKey = "socialsea_auth_recovery_lock_v1";
    const baseKey = "socialsea_auth_base_url";
    const role = String(nextUser?.role || "USER").replace(/^ROLE_/i, "");
    const completed = String(Boolean(nextUser?.profileCompleted));

    const write = (storage) => {
      storage.setItem(sessionKey, "1");
      storage.setItem("userId", String(nextUser?.id || ""));
      storage.setItem("email", String(nextUser?.email || ""));
      storage.setItem("username", String(nextUser?.username || ""));
      storage.setItem("name", String(nextUser?.name || ""));
      storage.setItem("role", role);
      storage.setItem("profileCompleted", completed);
      storage.setItem(baseKey, "/api");
      storage.removeItem(recoveryLockKey);
    };

    try {
      write(window.sessionStorage);
      write(window.localStorage);
    } catch {
      // ignore storage failures in the test harness
    }
  }, user);
};

const createTestState = ({
  savedIds = [],
  comments = {},
  likeCounts = {},
  anonymousItems = [],
  anonymousShouldFail = false,
} = {}) => {
  const saved = new Set(savedIds.map((value) => String(Number(value))).filter((value) => value !== "NaN" && value !== "0"));
  const likes = new Map(Object.entries(likeCounts).map(([id, count]) => [String(id), Math.max(0, Number(count) || 0)]));
  const commentStore = new Map(
    Object.entries(comments).map(([id, list]) => [
      String(id),
      (Array.isArray(list) ? list : []).map((comment, index) => ({
        id: comment?.id || `${id}-comment-${index + 1}`,
        text: String(comment?.text || ""),
        user: comment?.user || { name: "You" },
        createdAt: comment?.createdAt || new Date().toISOString(),
      })),
    ])
  );
  let anonFail = Boolean(anonymousShouldFail);
  const anonLikes = new Map(
    (Array.isArray(anonymousItems) ? anonymousItems : []).map((item) => [String(item.id), Math.max(0, Number(item.likeCount) || 0)])
  );
  const anonViews = new Map(
    (Array.isArray(anonymousItems) ? anonymousItems : []).map((item) => [String(item.id), Math.max(0, Number(item.viewCount) || 0)])
  );

  return {
    saved,
    likes,
    commentStore,
    anonymousItems,
    anonLikes,
    anonViews,
    get anonymousShouldFail() {
      return anonFail;
    },
    set anonymousShouldFail(value) {
      anonFail = Boolean(value);
    },
  };
};

const installMediaAndApiMocks = async (page, state, { mainPosts = mainFeedPosts } = {}) => {
  await page.route("**/uploads/**", async (route) => {
    const url = new URL(route.request().url());
    const pathname = url.pathname.toLowerCase();

    if (pathname.endsWith(MEDIA_FILES.biologyImage.toLowerCase())) {
      await route.fulfill({ status: 200, contentType: "image/jpeg", body: imageBytes });
      return;
    }
    if (pathname.endsWith(MEDIA_FILES.gamingImage.toLowerCase())) {
      await route.fulfill({ status: 200, contentType: "image/jpeg", body: altImageBytes });
      return;
    }
    if (pathname.endsWith(MEDIA_FILES.longVideo.toLowerCase())) {
      await route.fulfill({ status: 200, contentType: "video/webm", body: videoBytes });
      return;
    }

    await route.fulfill({ status: 404, contentType: "text/plain; charset=utf-8", body: "missing asset" });
  });

  const handleApiRoute = async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;
    const method = request.method().toUpperCase();

    if (
      !pathname.startsWith("/api/") &&
      pathname !== "/chat/presence" &&
      pathname !== "/api/chat/presence" &&
      pathname !== "/anonymous/feed"
    ) {
      await route.fallback();
      return;
    }

    const mainPostsById = new Map((Array.isArray(mainPosts) ? mainPosts : []).map((post) => [String(post.id), post]));
    const anonymousPosts = Array.isArray(state.anonymousItems) ? state.anonymousItems : [];
    const anonymousPostsById = new Map(anonymousPosts.map((post) => [String(post.id), post]));

    if (pathname === "/api/profile/me" && method === "GET") {
      await respondJson(route, {
        ...VIEWER_USER,
        profilePicUrl: `/uploads/${MEDIA_FILES.biologyImage}`,
      });
      return;
    }

    if (pathname.startsWith("/api/profile/") && method === "GET") {
      const identifier = decodeURIComponent(pathname.split("/").pop() || "");
      await respondJson(route, {
        id: identifier || "profile-id",
        username: identifier || "Profile User",
        name: identifier || "Profile User",
        email: `${String(identifier || "profile").replace(/\s+/g, ".").toLowerCase()}@example.com`,
        profilePicUrl: `/uploads/${MEDIA_FILES.biologyImage}`,
      });
      return;
    }

    if (pathname === "/api/chat/unread-count" && method === "GET") {
      await respondJson(route, 0);
      return;
    }

    if (pathname === "/api/chat/conversations" && method === "GET") {
      await respondJson(route, { content: [], page: 0, size: 200, hasNext: false });
      return;
    }

    if (pathname === "/api/calls/inbox" && method === "GET") {
      await respondJson(route, { content: [], page: 0, size: 20, hasNext: false });
      return;
    }

    if (pathname === "/api/notifications" && method === "GET") {
      await respondJson(route, { content: [], page: 0, size: 20, hasNext: false });
      return;
    }

    if (pathname === "/api/chat/presence" || pathname === "/chat/presence") {
      await respondJson(route, {});
      return;
    }

    if (pathname === "/api/feed" && method === "GET") {
      if (state.anonymousShouldFail) {
        await respondJson(route, { message: "anonymous feed unavailable" }, 404);
        return;
      }

      const page = Math.max(0, Number(url.searchParams.get("page") || 0) || 0);
      const size = Math.max(1, Number(url.searchParams.get("size") || mainPosts.length || 20) || 20);
      const content = page === 0 ? mainPosts.slice(0, size) : [];
      await respondJson(route, {
        content,
        page,
        size,
        hasNext: false,
        nextPage: page,
        totalPages: 1,
      });
      return;
    }

    if (pathname === "/api/feed/anonymous" || pathname === "/api/anonymous/feed" || pathname === "/anonymous/feed") {
      if (state.anonymousShouldFail) {
        await respondJson(route, { message: "anonymous feed unavailable" }, 404);
        return;
      }

      await respondJson(route, anonymousPosts);
      return;
    }

    if (pathname === "/api/saved" && method === "GET") {
      const savedPosts = Array.from(state.saved)
        .map((id) => mainPostsById.get(String(id)))
        .filter(Boolean);
      await respondJson(route, savedPosts);
      return;
    }

    if (pathname.startsWith("/api/saved/") && method === "POST") {
      const id = String(pathname.split("/").pop() || "");
      let isSaved = false;
      if (state.saved.has(id)) {
        state.saved.delete(id);
        isSaved = false;
      } else {
        state.saved.add(id);
        isSaved = true;
      }
      await respondJson(route, { isSaved });
      return;
    }

    const likesCountMatch = pathname.match(/^\/api\/likes\/([^/]+)\/count$/i);
    if (likesCountMatch && method === "GET") {
      const id = decodeURIComponent(likesCountMatch[1]);
      await respondJson(route, state.likes.get(String(id)) || 0);
      return;
    }

    const likesActionMatch = pathname.match(/^\/api\/likes\/([^/]+)$/i);
    if (likesActionMatch && method === "POST") {
      const id = decodeURIComponent(likesActionMatch[1]);
      const next = (state.likes.get(String(id)) || 0) + 1;
      state.likes.set(String(id), next);
      await respondJson(route, { ok: true, likeCount: next });
      return;
    }

    if (likesActionMatch && method === "DELETE") {
      const id = decodeURIComponent(likesActionMatch[1]);
      const next = Math.max(0, (state.likes.get(String(id)) || 0) - 1);
      state.likes.set(String(id), next);
      await respondJson(route, { ok: true, likeCount: next });
      return;
    }

    const commentsMatch = pathname.match(/^\/api\/comments\/([^/]+)$/i);
    if (commentsMatch && method === "GET") {
      const id = decodeURIComponent(commentsMatch[1]);
      await respondJson(route, state.commentStore.get(String(id)) || []);
      return;
    }

    if (commentsMatch && method === "POST") {
      const id = decodeURIComponent(commentsMatch[1]);
      const text = String(request.postData() || "").trim();
      const nextComment = {
        id: `comment-${id}-${Date.now()}`,
        text,
        user: { name: "You" },
        createdAt: new Date().toISOString(),
      };
      const next = [...(state.commentStore.get(String(id)) || []), nextComment];
      state.commentStore.set(String(id), next);
      await respondJson(route, { ok: true, comment: nextComment });
      return;
    }

    const anonymousActionMatch = pathname.match(/^\/api\/anonymous\/([^/]+)\/(like|view)$/i);
    if (anonymousActionMatch && method === "POST") {
      const id = decodeURIComponent(anonymousActionMatch[1]);
      const action = anonymousActionMatch[2].toLowerCase();
      const item = anonymousPostsById.get(String(id));
      if (!item) {
        await respondJson(route, { ok: true, likeCount: 0, viewCount: 0 });
        return;
      }

      if (action === "like") {
        const next = (state.anonLikes.get(String(id)) || 0) + 1;
        state.anonLikes.set(String(id), next);
        await respondJson(route, { ...item, likeCount: next, viewCount: state.anonViews.get(String(id)) || 0 });
        return;
      }

      const next = (state.anonViews.get(String(id)) || 0) + 1;
      state.anonViews.set(String(id), next);
      await respondJson(route, { ...item, likeCount: state.anonLikes.get(String(id)) || 0, viewCount: next });
      return;
    }

    await respondJson(route, {});
  };

  await page.route("**/api/**", handleApiRoute);
  await page.route("**/anonymous/feed**", handleApiRoute);
};

const openFeedPage = async (page, baseUrl) => {
  await page.goto(`${baseUrl}/feed`, { waitUntil: "commit" });
  await expect(page.getByPlaceholder("Search people or captions")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTitle("Ava Scientist")).toBeVisible({ timeout: 30_000 });
};

const openAnonymousFeedPage = async (page, baseUrl) => {
  await page.goto(`${baseUrl}/anonymous-feed`, { waitUntil: "commit" });
  await expect(page.getByRole("heading", { name: "Anonymous Feed" })).toBeVisible({ timeout: 30_000 });
};

test.describe("feed pages", () => {
  test("renders the main feed, filters posts, and switches modes", async ({ browser }, testInfo) => {
    const baseUrl = String(testInfo.project.use.baseURL || "http://127.0.0.1:5173");
    const context = await browser.newContext({
      baseURL: baseUrl,
      viewport: { width: 1440, height: 900 },
    });

    try {
      await seedAuthStorage(context);
      const page = await context.newPage();
      attachDebugListeners(page);
      const state = createTestState();
      await installMediaAndApiMocks(page, state);

      await openFeedPage(page, baseUrl);

      const tiles = page.locator(".instagram-grid .instagram-tile:not(.live-explore-tile):visible");
      await expect(tiles).toHaveCount(2);

      await page.getByPlaceholder("Search people or captions").fill("biology");
      await expect(tiles).toHaveCount(1);
      await expect(page.getByTitle("Ava Scientist")).toBeVisible();
      await expect(page.getByTitle("Ben Gamer")).toHaveCount(0);

      await page.getByPlaceholder("Search people or captions").fill("");
      await expect(tiles).toHaveCount(2);

      await page.locator(".feed-filter-inline").getByRole("tab", { name: "Study" }).click();
      await expect(page.getByRole("tablist", { name: "Study subjects" })).toBeVisible();
      await page.getByRole("tablist", { name: "Study subjects" }).getByRole("tab", { name: "Biology" }).click();
      await expect(tiles).toHaveCount(1);
      await expect(page.getByTitle("Ava Scientist")).toBeVisible();

      await page.locator(".feed-filter-inline").getByRole("tab", { name: "All" }).click();
      await expect(tiles).toHaveCount(2);

      await page.locator(".feed-mode-switch").getByRole("tab", { name: "Video" }).click();
      await expect(page).toHaveURL(/\/feed\?mode=long$/);
      await expect(page.getByTitle("Video Host")).toBeVisible({ timeout: 30_000 });

      await page.locator(".feed-mode-switch").getByRole("tab", { name: "Feed" }).click();
      await expect(page).toHaveURL(/\/feed$/);
    } finally {
      await context.close().catch(() => {});
    }
  });

  test("opens a post viewer, comments, likes, and saves persist after reload", async ({ browser }, testInfo) => {
    const baseUrl = String(testInfo.project.use.baseURL || "http://127.0.0.1:5173");
    const context = await browser.newContext({
      baseURL: baseUrl,
      viewport: { width: 1440, height: 900 },
    });

    try {
      await seedAuthStorage(context);
      const page = await context.newPage();
      attachDebugListeners(page);
      const state = createTestState({
        savedIds: [],
        comments: {
          101: [{ id: "seed-comment-1", text: "Loved the breakdown!", user: { name: "Mina" } }],
        },
        likeCounts: {
          101: 4,
          102: 2,
          201: 9,
        },
      });
      await installMediaAndApiMocks(page, state);

      await openFeedPage(page, baseUrl);
      await page.getByPlaceholder("Search people or captions").fill("biology");
      await expect(page.locator(".instagram-grid .instagram-tile:not(.live-explore-tile):visible")).toHaveCount(1);

      await page.getByTitle("Ava Scientist").click();
      await expect(page).toHaveURL(/post=101/);

      const viewer = page.locator(".post-view-card").first();
      const likeButton = viewer.locator('button[title="Like"]');
      const saveButton = viewer.locator('button[title="Save"]');
      const commentInput = viewer.getByPlaceholder("Add a comment...");
      const postCommentButton = viewer.getByRole("button", { name: "Post" });

      await expect(page.getByLabel("Close viewer")).toBeVisible();
      await expect(viewer.locator(".ig-post-tags")).toHaveText("Biology notes for cell structure");
      await expect(viewer.locator(".feed-comments")).toContainText("Loved the breakdown!");

      await likeButton.click();
      await expect(likeButton).toContainText("5");

      await commentInput.fill("Great breakdown!");
      await postCommentButton.click();
      await expect(commentInput).toHaveValue("");

      await saveButton.click();
      await expect(saveButton).toHaveClass(/is-saved/);

      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page.getByLabel("Close viewer")).toBeVisible({ timeout: 30_000 });

      const reloadedViewer = page.locator(".post-view-card").first();
      const reloadedLikeButton = reloadedViewer.locator('button[title="Like"]');
      const reloadedSaveButton = reloadedViewer.locator('button[title="Save"]');

      await expect(reloadedLikeButton).toContainText("5");
      await expect(reloadedSaveButton).toHaveClass(/is-saved/);
      await expect(reloadedViewer.locator(".feed-comments")).toContainText("Great breakdown!");
    } finally {
      await context.close().catch(() => {});
    }
  });

  test("loads the anonymous feed after retry and records interactions", async ({ browser }, testInfo) => {
    const baseUrl = String(testInfo.project.use.baseURL || "http://127.0.0.1:5173");
    const context = await browser.newContext({
      baseURL: baseUrl,
      viewport: { width: 1440, height: 900 },
    });

    try {
      await seedAuthStorage(context);
      const page = await context.newPage();
      attachDebugListeners(page);
      const state = createTestState({
        anonymousItems: [anonymousFeedItem],
        anonymousShouldFail: true,
      });
      await installMediaAndApiMocks(page, state, { mainPosts: [] });

      await openAnonymousFeedPage(page, baseUrl);
      await expect(page.getByRole("button", { name: /Retry/i })).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText("Anonymous feed endpoint is not available.")).toBeVisible({ timeout: 30_000 });

      state.anonymousShouldFail = false;
      await page.getByRole("button", { name: /Retry/i }).click();

      await expect(page.getByText("Anonymous retry handling")).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText("1 views")).toBeVisible();

      const likeButton = page.getByRole("button", { name: /^Like \(2\)$/ });
      await likeButton.click();
      await expect(page.getByRole("button", { name: /^Like \(3\)$/ })).toBeVisible();
    } finally {
      await context.close().catch(() => {});
    }
  });
});
