import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const uploadsRoot = path.join(repoRoot, "uploads");

const MEDIA_FILES = {
  avatar: "08549c3b-9086-4ad1-a52d-96940d58d9a5.jpg",
  clipVideo: "d3148903-c259-44bd-9e13-dcf3f4051d5b.webm",
  watchPhysicsVideo: "0c1e9296-da5a-478d-82de-6b47b90ffbf7.webm",
  watchGamingVideo: "1bb92237-dca1-4873-9518-2143e0a8baa9.mp4",
};

const VIEWER_USER = {
  id: "media-tester",
  userId: "media-tester",
  username: "media_tester",
  name: "Media Tester",
  email: "media.tester@example.com",
  role: "USER",
  profileCompleted: true,
  profilePicUrl: `/uploads/${MEDIA_FILES.avatar}`,
};

const reelItems = [
  {
    id: 311,
    username: "Reel Maker",
    name: "Reel Maker",
    email: "reel.maker@example.com",
    userId: "reel-maker",
    description: "Quick sprint drill",
    content: "Quick sprint drill",
    category: "gaming",
    tags: ["sports"],
    contentUrl: `/uploads/${MEDIA_FILES.clipVideo}`,
    mediaUrl: `/uploads/${MEDIA_FILES.clipVideo}`,
    type: "VIDEO",
    mediaType: "VIDEO",
    reel: true,
    isReel: true,
    originalReel: true,
    sourceType: "reel",
    createdAt: "2026-06-11T10:00:00.000Z",
    likeCount: 3,
    profilePicUrl: `/uploads/${MEDIA_FILES.avatar}`,
    user: {
      id: "reel-maker",
      username: "Reel Maker",
      name: "Reel Maker",
      email: "reel.maker@example.com",
      profilePicUrl: `/uploads/${MEDIA_FILES.avatar}`,
    },
  },
];

const watchItems = [
  {
    id: 601,
    username: "Physics Host",
    name: "Physics Host",
    email: "physics.host@example.com",
    userId: "physics-host",
    description: "Physics lecture on gravity",
    content: "Physics lecture on gravity",
    category: "study",
    tags: ["physics"],
    contentUrl: `/uploads/${MEDIA_FILES.watchPhysicsVideo}`,
    mediaUrl: `/uploads/${MEDIA_FILES.watchPhysicsVideo}`,
    type: "VIDEO",
    mediaType: "VIDEO",
    sourceType: "long_video",
    videoSettings: JSON.stringify({
      distributionSurface: "video_feed",
      uploadType: "long_video",
    }),
    durationSeconds: 240,
    createdAt: "2026-06-10T10:00:00.000Z",
    likeCount: 5,
    profilePicUrl: `/uploads/${MEDIA_FILES.avatar}`,
    user: {
      id: "physics-host",
      username: "Physics Host",
      name: "Physics Host",
      email: "physics.host@example.com",
      profilePicUrl: `/uploads/${MEDIA_FILES.avatar}`,
    },
  },
  {
    id: 602,
    username: "Gaming Host",
    name: "Gaming Host",
    email: "gaming.host@example.com",
    userId: "gaming-host",
    description: "Gaming highlights and strategy",
    content: "Gaming highlights and strategy",
    category: "gaming",
    tags: ["gaming"],
    contentUrl: `/uploads/${MEDIA_FILES.watchGamingVideo}`,
    mediaUrl: `/uploads/${MEDIA_FILES.watchGamingVideo}`,
    type: "VIDEO",
    mediaType: "VIDEO",
    sourceType: "long_video",
    videoSettings: JSON.stringify({
      distributionSurface: "video_feed",
      uploadType: "long_video",
    }),
    durationSeconds: 180,
    createdAt: "2026-06-09T10:00:00.000Z",
    likeCount: 9,
    profilePicUrl: `/uploads/${MEDIA_FILES.avatar}`,
    user: {
      id: "gaming-host",
      username: "Gaming Host",
      name: "Gaming Host",
      email: "gaming.host@example.com",
      profilePicUrl: `/uploads/${MEDIA_FILES.avatar}`,
    },
  },
];

const respondJson = (route, payload, status = 200) =>
  route.fulfill({
    status,
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify(payload),
  });

const loadAsset = (fileName) => fs.readFileSync(path.join(uploadsRoot, fileName));

const avatarBytes = loadAsset(MEDIA_FILES.avatar);
const clipBytes = loadAsset(MEDIA_FILES.clipVideo);
const physicsBytes = loadAsset(MEDIA_FILES.watchPhysicsVideo);
const gamingBytes = loadAsset(MEDIA_FILES.watchGamingVideo);

const attachDebugListeners = (page) => {
  if (String(process.env.PW_MEDIA_DEBUG || "").trim() !== "1") return;
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
      storage.setItem("reelsMutedAll", "1");
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

const createMediaState = ({
  reels = [],
  watch = [],
  savedIds = [],
  likes = {},
  comments = {},
} = {}) => {
  const saved = new Set(
    savedIds.map((value) => String(Number(value))).filter((value) => value !== "NaN" && value !== "0")
  );
  const likeCounts = new Map(
    Object.entries(likes).map(([id, count]) => [String(id), Math.max(0, Number(count) || 0)])
  );
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
  const allItems = [...(Array.isArray(reels) ? reels : []), ...(Array.isArray(watch) ? watch : [])];
  const itemsById = new Map(allItems.map((item) => [String(item.id), item]));

  return {
    reels,
    watch,
    saved,
    likeCounts,
    commentStore,
    itemsById,
  };
};

const getSavedItems = (state) =>
  Array.from(state.saved)
    .map((id) => state.itemsById.get(String(id)))
    .filter(Boolean);

const installMediaAndApiMocks = async (page, state, options = {}) => {
  const failReelsLoad = Boolean(options.failReelsLoad);

  await page.route("**/uploads/**", async (route) => {
    const url = new URL(route.request().url());
    const pathname = url.pathname.toLowerCase();

    if (pathname.endsWith(MEDIA_FILES.avatar.toLowerCase())) {
      await route.fulfill({ status: 200, contentType: "image/jpeg", body: avatarBytes });
      return;
    }
    if (pathname.endsWith(MEDIA_FILES.clipVideo.toLowerCase())) {
      await route.fulfill({ status: 200, contentType: "video/webm", body: clipBytes });
      return;
    }
    if (pathname.endsWith(MEDIA_FILES.watchPhysicsVideo.toLowerCase())) {
      await route.fulfill({ status: 200, contentType: "video/webm", body: physicsBytes });
      return;
    }
    if (pathname.endsWith(MEDIA_FILES.watchGamingVideo.toLowerCase())) {
      await route.fulfill({ status: 200, contentType: "video/mp4", body: gamingBytes });
      return;
    }

    await route.fulfill({
      status: 404,
      contentType: "text/plain; charset=utf-8",
      body: "missing asset",
    });
  });

  const handleApiRoute = async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;
    const method = request.method().toUpperCase();

    const isApiPath = pathname.startsWith("/api/");
    const isReelsPath = pathname === "/reels" || pathname.startsWith("/reels/");
    const isAnonFeedPath = pathname === "/anonymous/feed" || pathname.startsWith("/anonymous/feed/");

    if (!isApiPath && !isReelsPath && !isAnonFeedPath) {
      await route.fallback();
      return;
    }

    if (pathname === "/api/profile/me" && method === "GET") {
      await respondJson(route, {
        ...VIEWER_USER,
        profilePicUrl: `/uploads/${MEDIA_FILES.avatar}`,
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
        profilePicUrl: `/uploads/${MEDIA_FILES.avatar}`,
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

    if (pathname === "/api/reels" || pathname === "/reels") {
      if (method === "GET") {
        if (failReelsLoad) {
          await route.fulfill({
            status: 500,
            contentType: "application/json; charset=utf-8",
            body: JSON.stringify({ error: "Failed to load clips" }),
          });
          return;
        }
        await respondJson(route, state.reels);
        return;
      }
    }

    const reelItemMatch = pathname.match(/^\/(?:api\/)?reels\/([^/]+)$/i);
    if (reelItemMatch && method === "GET") {
      const id = decodeURIComponent(reelItemMatch[1]);
      await respondJson(route, state.itemsById.get(String(id)) || null);
      return;
    }

    if (pathname === "/api/feed/videos" && method === "GET") {
      await respondJson(route, state.watch);
      return;
    }

    if (pathname === "/api/feed" && method === "GET") {
      await respondJson(route, state.watch);
      return;
    }

    if (pathname === "/api/profile/me/posts" && method === "GET") {
      await respondJson(route, []);
      return;
    }

    if (pathname === "/api/profile/posts" && method === "GET") {
      await respondJson(route, []);
      return;
    }

    if (
      pathname === "/api/feed/anonymous" ||
      pathname === "/api/anonymous/feed" ||
      pathname === "/anonymous/feed"
    ) {
      await respondJson(route, []);
      return;
    }

    const feedItemMatch = pathname.match(/^\/api\/feed\/([^/]+)$/i);
    if (feedItemMatch && method === "GET") {
      const id = decodeURIComponent(feedItemMatch[1]);
      await respondJson(route, state.itemsById.get(String(id)) || null);
      return;
    }

    if (pathname === "/api/saved" && method === "GET") {
      await respondJson(route, getSavedItems(state));
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
      await respondJson(route, state.likeCounts.get(String(id)) || 0);
      return;
    }

    const likesActionMatch = pathname.match(/^\/api\/likes\/([^/]+)$/i);
    if (likesActionMatch && method === "POST") {
      const id = decodeURIComponent(likesActionMatch[1]);
      const next = (state.likeCounts.get(String(id)) || 0) + 1;
      state.likeCounts.set(String(id), next);
      await respondJson(route, { ok: true, likeCount: next });
      return;
    }

    if (likesActionMatch && method === "DELETE") {
      const id = decodeURIComponent(likesActionMatch[1]);
      const next = Math.max(0, (state.likeCounts.get(String(id)) || 0) - 1);
      state.likeCounts.set(String(id), next);
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

    await respondJson(route, {});
  };

  await page.route("**/api/**", handleApiRoute);
  await page.route("**/reels**", handleApiRoute);
  await page.route("**/anonymous/feed**", handleApiRoute);
};

const createContext = async (browser, baseUrl) =>
  browser.newContext({
    baseURL: baseUrl,
    viewport: { width: 1440, height: 900 },
  });

const openClipsPage = async (page, baseUrl) => {
  await page.goto(`${baseUrl}/clips`, { waitUntil: "commit" });
  await expect(page.getByRole("heading", { name: "Clips" })).toBeVisible({ timeout: 30_000 });
};

const openWatchBrowsePage = async (page, baseUrl) => {
  await page.goto(`${baseUrl}/watch`, { waitUntil: "commit" });
  await expect(page.getByRole("heading", { name: "SocialSea Watch" })).toBeVisible({ timeout: 30_000 });
};

const openWatchVideoPage = async (page, baseUrl, postId) => {
  await page.goto(`${baseUrl}/watch/${encodeURIComponent(postId)}`, { waitUntil: "commit" });
  await expect(page.locator(".watch-title")).toBeVisible({ timeout: 30_000 });
};

test.describe("video and clips pages", () => {
  test("renders clips, likes a reel, and restores comments after reload", async ({ browser }, testInfo) => {
    const baseUrl = String(testInfo.project.use.baseURL || "http://127.0.0.1:5173");
    const context = await createContext(browser, baseUrl);

    try {
      await seedAuthStorage(context);
      const page = await context.newPage();
      attachDebugListeners(page);
      const state = createMediaState({
        reels: reelItems,
        comments: {
          311: [{ id: "reel-comment-1", text: "This is slick!", user: { name: "Mina" } }],
        },
        likes: {
          311: 3,
        },
      });
      await installMediaAndApiMocks(page, state);

      await openClipsPage(page, baseUrl);

      const reelCard = page.locator(".reel-item").first();
      await expect(reelCard).toBeVisible();
      await expect(page.locator(".reel-top-title")).toHaveText("Clips");
      await expect(page.getByText("Quick sprint drill")).toBeVisible();

      const muteButton = page.locator('.reel-action-btn[title="Unmute all clips"]');
      await expect(muteButton).toBeVisible();
      await muteButton.click();
      await expect(page.locator('.reel-action-btn[title="Mute all clips"]')).toBeVisible();

      const likeButton = page.locator('.reel-action-btn[title="Like"]');
      await expect(likeButton.locator("small")).toHaveText("3");
      await likeButton.click();
      await expect(likeButton.locator("small")).toHaveText("4");

      await page.locator('.reel-action-btn[title="Comment"]').click();
      const commentInput = page.getByPlaceholder("Write a comment...");
      await expect(commentInput).toBeVisible();
      await expect(page.locator(".reel-comment-item")).toContainText("This is slick!");

      await commentInput.fill("Great clip!");
      await page.getByRole("button", { name: /^Post$/ }).click();

      await page.reload({ waitUntil: "commit" });
      await page.locator('.reel-action-btn[title="Comment"]').click();

      await expect(page.locator(".reel-action-btn[title='Like'] small")).toHaveText("4");
      // TanStack Query can keep the pre-submit comments in cache, so verify persistence after reload.
      await expect(page.locator(".reel-comments")).toContainText("Great clip!");
      await expect(page.locator(".reel-comments")).toContainText("This is slick!");
    } finally {
      await context.close().catch(() => {});
    }
  });

  test("shows the clips error state when the reels API fails", async ({ browser }, testInfo) => {
    const baseUrl = String(testInfo.project.use.baseURL || "http://127.0.0.1:5173");
    const context = await createContext(browser, baseUrl);

    try {
      await seedAuthStorage(context);
      const page = await context.newPage();
      attachDebugListeners(page);
      const state = createMediaState({ reels: reelItems });
      await installMediaAndApiMocks(page, state, { failReelsLoad: true });

      await page.goto(`${baseUrl}/clips`, { waitUntil: "commit" });
      await expect(page.locator(".reel-state.is-error")).toHaveText("Failed to load clips");
      await expect(page.locator(".reels-container")).toHaveClass(/has-error/);
    } finally {
      await context.close().catch(() => {});
    }
  });

  test("filters the watch browse grid by search and category", async ({ browser }, testInfo) => {
    const baseUrl = String(testInfo.project.use.baseURL || "http://127.0.0.1:5173");
    const context = await createContext(browser, baseUrl);

    try {
      await seedAuthStorage(context);
      const page = await context.newPage();
      attachDebugListeners(page);
      const state = createMediaState({
        watch: watchItems,
        likes: {
          601: 5,
          602: 9,
        },
      });
      await installMediaAndApiMocks(page, state);

      await openWatchBrowsePage(page, baseUrl);

      const cards = page.locator(".yt-home-card");
      await expect(cards).toHaveCount(2);

      await page.getByPlaceholder("Search videos").fill("physics");
      await expect(cards).toHaveCount(1);
      await expect(page.locator(".yt-home-card").filter({ hasText: "Physics lecture on gravity" })).toBeVisible();

      await page.getByPlaceholder("Search videos").fill("");
      await expect(cards).toHaveCount(2);

      await page.locator(".yt-chip-row").getByRole("button", { name: "Gaming", exact: true }).click();
      await expect(cards).toHaveCount(1);
      await expect(page.locator(".yt-home-card").filter({ hasText: "Gaming highlights and strategy" })).toBeVisible();

      await page.locator(".yt-chip-row").getByRole("button", { name: "All", exact: true }).click();
      await expect(cards).toHaveCount(2);
    } finally {
      await context.close().catch(() => {});
    }
  });

  test("shows the watch browse empty state when no videos are returned", async ({ browser }, testInfo) => {
    const baseUrl = String(testInfo.project.use.baseURL || "http://127.0.0.1:5173");
    const context = await createContext(browser, baseUrl);

    try {
      await seedAuthStorage(context);
      const page = await context.newPage();
      attachDebugListeners(page);
      const state = createMediaState({ watch: [] });
      await installMediaAndApiMocks(page, state);

      await openWatchBrowsePage(page, baseUrl);

      await expect(page.locator(".watch-empty")).toContainText("No videos found.");
      await expect(page.locator(".yt-home-card")).toHaveCount(0);
    } finally {
      await context.close().catch(() => {});
    }
  });

  test("opens a watch video, comments, likes, saves, and watch later persist after reload", async ({
    browser,
  }, testInfo) => {
    const baseUrl = String(testInfo.project.use.baseURL || "http://127.0.0.1:5173");
    const context = await createContext(browser, baseUrl);

    try {
      await seedAuthStorage(context);
      const page = await context.newPage();
      attachDebugListeners(page);
      const state = createMediaState({
        watch: watchItems,
        savedIds: [],
        comments: {
          601: [{ id: "watch-comment-1", text: "Loved the explanation!", user: { name: "Mina" } }],
        },
        likes: {
          601: 5,
          602: 9,
        },
      });
      await installMediaAndApiMocks(page, state);

      await openWatchVideoPage(page, baseUrl, 601);
      await expect(page.locator(".watch-title")).toHaveText("Physics lecture on gravity");

      const actionButtons = page.locator(".watch-actions-row .watch-action-btn");
      const likeButton = actionButtons.nth(0);
      const commentButton = actionButtons.nth(2);
      const saveButton = actionButtons.nth(3);
      const watchLaterButton = actionButtons.nth(4);

      await expect(likeButton).toContainText("5");
      await commentButton.click();
      await expect(page.getByRole("heading", { name: "Comments" })).toBeVisible();
      await expect(page.locator(".watch-comment-text")).toContainText("Loved the explanation!");

      await likeButton.click();
      await expect(likeButton).toContainText("6");

      await saveButton.click();
      await expect(saveButton).toContainText("Saved");

      await watchLaterButton.click();
      await expect(watchLaterButton).toContainText("Added");

      const commentInput = page.getByPlaceholder("Add a comment...");
      await commentInput.fill("Great lecture!");
      await page.getByRole("button", { name: "Post" }).click();
      await expect(page.locator(".watch-comments-list")).toContainText("Great lecture!");

      await page.reload({ waitUntil: "commit" });
      await expect(page.locator(".watch-title")).toHaveText("Physics lecture on gravity");

      const reloadedButtons = page.locator(".watch-actions-row .watch-action-btn");
      await expect(reloadedButtons.nth(0)).toContainText("6");
      await expect(reloadedButtons.nth(3)).toContainText("Saved");
      await expect(reloadedButtons.nth(4)).toContainText("Added");

      await reloadedButtons.nth(2).click();
      await expect(page.getByRole("heading", { name: "Comments" })).toBeVisible();
      await expect(page.locator(".watch-comments-list")).toContainText("Great lecture!");
      await expect(page.locator(".watch-comments-list")).toContainText("Loved the explanation!");
    } finally {
      await context.close().catch(() => {});
    }
  });

  test("falls back to the first watch video when the direct id is missing", async ({ browser }, testInfo) => {
    const baseUrl = String(testInfo.project.use.baseURL || "http://127.0.0.1:5173");
    const context = await createContext(browser, baseUrl);

    try {
      await seedAuthStorage(context);
      const page = await context.newPage();
      attachDebugListeners(page);
      const state = createMediaState({
        watch: watchItems,
        likes: {
          601: 5,
          602: 9,
        },
      });
      await installMediaAndApiMocks(page, state);

      await page.goto(`${baseUrl}/watch/999999`, { waitUntil: "commit" });
      await expect(page.locator(".watch-title")).toHaveText("Physics lecture on gravity");
      await expect(page.locator(".watch-player")).toBeVisible();
    } finally {
      await context.close().catch(() => {});
    }
  });
});
