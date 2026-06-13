import { expect, test } from "@playwright/test";

const VIEWER_USER = {
  id: "notif-tester",
  userId: "notif-tester",
  username: "notif_tester",
  name: "Notif Tester",
  email: "notif.tester@example.com",
  role: "USER",
  profileCompleted: true,
};

const DATA_IMAGE =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='8' height='8'></svg>";

const FEED_POST = {
  id: 101,
  username: "Ava Scientist",
  name: "Ava Scientist",
  email: "ava.scientist@example.com",
  userId: "ava-scientist",
  description: "Biology notes for cell structure",
  content: "Biology notes for cell structure",
  category: "study",
  tags: ["biology"],
  contentUrl: DATA_IMAGE,
  mediaUrl: DATA_IMAGE,
  type: "IMAGE",
  mediaType: "IMAGE",
  createdAt: "2026-06-11T08:30:00.000Z",
  likeCount: 4,
  profilePicUrl: DATA_IMAGE,
  user: {
    id: "ava-scientist",
    username: "Ava Scientist",
    name: "Ava Scientist",
    email: "ava.scientist@example.com",
    profilePicUrl: DATA_IMAGE,
  },
};

const respondJson = (route, payload, status = 200) =>
  route.fulfill({
    status,
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify(payload),
  });

const attachDebugListeners = (page) => {
  if (String(process.env.PW_NOTIFICATIONS_DEBUG || "").trim() !== "1") return;
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
      // Ignore storage failures in the test harness.
    }
  }, user);
};

const createState = ({
  notifications = [],
  followRequests = [],
  feedPosts = [],
  likes = {},
  comments = {},
  savedIds = [],
} = {}) => {
  const feedItems = Array.isArray(feedPosts) ? feedPosts : [];
  const saved = new Set(
    (Array.isArray(savedIds) ? savedIds : [])
      .map((value) => String(Number(value)))
      .filter((value) => value !== "NaN" && value !== "0")
  );

  return {
    notifications: Array.isArray(notifications) ? [...notifications] : [],
    followRequests: Array.isArray(followRequests) ? [...followRequests] : [],
    feedPosts: feedItems,
    feedPostById: new Map(feedItems.map((item) => [String(item.id), item])),
    likes: new Map(Object.entries(likes).map(([id, count]) => [String(id), Math.max(0, Number(count) || 0)])),
    comments: new Map(
      Object.entries(comments).map(([id, list]) => [
        String(id),
        (Array.isArray(list) ? list : []).map((comment, index) => ({
          id: comment?.id || `${id}-comment-${index + 1}`,
          text: String(comment?.text || ""),
          user: comment?.user || { name: "You" },
          createdAt: comment?.createdAt || new Date().toISOString(),
        })),
      ])
    ),
    saved,
    readAllCalls: 0,
    readByIds: [],
    followCalls: [],
    acceptCalls: [],
    rejectCalls: [],
  };
};

const installApiMocks = async (page, state) => {
  await page.route("**/api/**", async (route) => {
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

    if (pathname === "/api/profile/me" && method === "GET") {
      await respondJson(route, {
        ...VIEWER_USER,
        profilePicUrl: DATA_IMAGE,
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
        profilePicUrl: DATA_IMAGE,
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

    if (pathname === "/api/chat/presence" || pathname === "/chat/presence") {
      await respondJson(route, {});
      return;
    }

    if (pathname === "/api/notifications" && method === "GET") {
      await respondJson(route, state.notifications);
      return;
    }

    if (pathname === "/api/notifications/read-all" && method === "POST") {
      state.readAllCalls += 1;
      await respondJson(route, { ok: true });
      return;
    }

    if (pathname === "/api/notifications/mark-all-read" && method === "POST") {
      state.readAllCalls += 1;
      await respondJson(route, { ok: true });
      return;
    }

    if (pathname === "/api/notifications" && method === "PATCH") {
      state.readAllCalls += 1;
      await respondJson(route, { ok: true });
      return;
    }

    const notificationReadMatch = pathname.match(/^\/api\/notifications\/([^/]+)\/read$/i);
    if (notificationReadMatch && method === "POST") {
      const id = decodeURIComponent(notificationReadMatch[1]);
      state.readByIds.push(String(id));
      await respondJson(route, { ok: true });
      return;
    }

    const notificationReadLegacyMatch = pathname.match(/^\/api\/notifications\/read\/([^/]+)$/i);
    if (notificationReadLegacyMatch && method === "POST") {
      const id = decodeURIComponent(notificationReadLegacyMatch[1]);
      state.readByIds.push(String(id));
      await respondJson(route, { ok: true });
      return;
    }

    const notificationPatchMatch = pathname.match(/^\/api\/notifications\/([^/]+)$/i);
    if (notificationPatchMatch && method === "PATCH") {
      const id = decodeURIComponent(notificationPatchMatch[1]);
      state.readByIds.push(String(id));
      await respondJson(route, { ok: true });
      return;
    }

    if (pathname === "/api/follow/requests" && method === "GET") {
      await respondJson(route, state.followRequests);
      return;
    }

    if (pathname === "/api/follow/pending-requests" && method === "GET") {
      await respondJson(route, state.followRequests);
      return;
    }

    const acceptMatch = pathname.match(/^\/api\/follow\/requests\/([^/]+)\/accept$/i);
    if (acceptMatch && method === "POST") {
      const id = decodeURIComponent(acceptMatch[1]);
      state.acceptCalls.push(String(id));
      state.followRequests = state.followRequests.filter((requestItem) => String(requestItem?.id) !== String(id));
      await respondJson(route, { ok: true });
      return;
    }

    const rejectMatch = pathname.match(/^\/api\/follow\/requests\/([^/]+)\/reject$/i);
    if (rejectMatch && method === "POST") {
      const id = decodeURIComponent(rejectMatch[1]);
      state.rejectCalls.push(String(id));
      state.followRequests = state.followRequests.filter((requestItem) => String(requestItem?.id) !== String(id));
      await respondJson(route, { ok: true });
      return;
    }

    const followMatch = pathname.match(/^\/api\/follow\/([^/]+)$/i);
    if (followMatch && method === "POST") {
      const target = decodeURIComponent(followMatch[1]);
      state.followCalls.push(String(target));
      await respondJson(route, { status: "following" });
      return;
    }

    if (pathname === "/api/feed" && method === "GET") {
      const page = Math.max(0, Number(url.searchParams.get("page") || 0) || 0);
      const size = Math.max(1, Number(url.searchParams.get("size") || state.feedPosts.length || 20) || 20);
      const content = page === 0 ? state.feedPosts.slice(0, size) : [];
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

    if (pathname === "/api/feed/videos" && method === "GET") {
      await respondJson(route, state.feedPosts);
      return;
    }

    if (pathname === "/api/feed/anonymous" || pathname === "/api/anonymous/feed" || pathname === "/anonymous/feed") {
      await respondJson(route, []);
      return;
    }

    const feedItemMatch = pathname.match(/^\/api\/feed\/([^/]+)$/i);
    if (feedItemMatch && method === "GET") {
      const id = decodeURIComponent(feedItemMatch[1]);
      await respondJson(route, state.feedPostById.get(String(id)) || null);
      return;
    }

    if (pathname === "/api/saved" && method === "GET") {
      const savedPosts = Array.from(state.saved)
        .map((id) => state.feedPostById.get(String(id)))
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
      await respondJson(route, state.comments.get(String(id)) || []);
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
      const next = [...(state.comments.get(String(id)) || []), nextComment];
      state.comments.set(String(id), next);
      await respondJson(route, { ok: true, comment: nextComment });
      return;
    }

    await respondJson(route, {});
  });
};

const openNotificationsPage = async (page, baseUrl) => {
  await page.goto(`${baseUrl}/notifications`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Notifications" })).toBeVisible({ timeout: 30_000 });
};

test.describe("notifications page", () => {
  test("shows the empty state when no notifications are available", async ({ browser }, testInfo) => {
    const baseUrl = String(testInfo.project.use.baseURL || "http://127.0.0.1:5173");
    const context = await browser.newContext({
      baseURL: baseUrl,
      viewport: { width: 1440, height: 900 },
    });

    try {
      await seedAuthStorage(context);
      const page = await context.newPage();
      attachDebugListeners(page);
      const state = createState();
      await installApiMocks(page, state);

      await openNotificationsPage(page, baseUrl);

      await expect(page.getByText("0 unread alerts")).toBeVisible({ timeout: 30_000 });
      await expect(page.locator(".notify-empty")).toHaveText("No notifications yet.");
      await expect(page.locator(".notify-card")).toHaveCount(0);
      await expect.poll(() => state.readAllCalls).toBe(0);
    } finally {
      await context.close().catch(() => {});
    }
  });

  test("marks a follow notification as following after the action", async ({ browser }, testInfo) => {
    const baseUrl = String(testInfo.project.use.baseURL || "http://127.0.0.1:5173");
    const context = await browser.newContext({
      baseURL: baseUrl,
      viewport: { width: 1440, height: 900 },
    });

    try {
      await seedAuthStorage(context);
      const page = await context.newPage();
      attachDebugListeners(page);
      const state = createState({
        notifications: [
          {
            id: 201,
            kind: "follow",
            actorName: "Maria Ray",
            actorIdentifier: "maria",
            actorEmail: "maria@example.com",
            actorUsername: "maria",
            message: "Maria Ray started following you",
            createdAt: "2026-06-12T08:30:00.000Z",
            read: false,
          },
        ],
      });
      await installApiMocks(page, state);

      await openNotificationsPage(page, baseUrl);

      await expect(page.getByText("0 unread alerts")).toBeVisible({ timeout: 30_000 });
      await expect(page.locator(".notify-card")).toHaveCount(1);
      await expect(page.locator(".notify-card")).toContainText("Maria Ray");
      await expect(page.locator(".notify-follow-btn")).toHaveText("Follow");
      await expect.poll(() => state.readAllCalls).toBe(1);

      await page.locator(".notify-follow-btn").click();
      await expect(page.locator(".notify-follow-btn")).toHaveText("Following", { timeout: 30_000 });
      await expect.poll(() => state.followCalls).toContain("maria");
    } finally {
      await context.close().catch(() => {});
    }
  });

  test("opens a post notification target and records the read request", async ({ browser }, testInfo) => {
    const baseUrl = String(testInfo.project.use.baseURL || "http://127.0.0.1:5173");
    const context = await browser.newContext({
      baseURL: baseUrl,
      viewport: { width: 1440, height: 900 },
    });

    try {
      await seedAuthStorage(context);
      const page = await context.newPage();
      attachDebugListeners(page);
      const state = createState({
        notifications: [
          {
            id: 101,
            kind: "comment",
            actorName: "Ava Scientist",
            actorIdentifier: "ava-scientist",
            message: "Ava Scientist commented on your post [postid: 101]",
            postId: 101,
            createdAt: "2026-06-12T08:00:00.000Z",
            read: false,
          },
        ],
        feedPosts: [FEED_POST],
      });
      await installApiMocks(page, state);

      await openNotificationsPage(page, baseUrl);

      await expect(page.locator(".notify-card")).toHaveCount(1);
      await expect.poll(() => state.readAllCalls).toBe(1);
      await page.locator(".notify-card").first().click();
      await page.waitForURL(/\/feed\?post=101/);
      await expect.poll(() => state.readByIds).toContain("101");
    } finally {
      await context.close().catch(() => {});
    }
  });

  test("accepts and rejects follow requests from the list", async ({ browser }, testInfo) => {
    const baseUrl = String(testInfo.project.use.baseURL || "http://127.0.0.1:5173");
    const context = await browser.newContext({
      baseURL: baseUrl,
      viewport: { width: 1440, height: 900 },
    });

    try {
      await seedAuthStorage(context);
      const page = await context.newPage();
      attachDebugListeners(page);
      const state = createState({
        followRequests: [
          {
            id: 501,
            status: "PENDING",
            sender: {
              id: "alex",
              name: "Alex",
              email: "alex@example.com",
            },
            createdAt: "2026-06-12T08:10:00.000Z",
          },
          {
            id: 502,
            status: "PENDING",
            sender: {
              id: "jamie",
              name: "Jamie",
              email: "jamie@example.com",
            },
            createdAt: "2026-06-12T08:15:00.000Z",
          },
        ],
      });
      await installApiMocks(page, state);

      await openNotificationsPage(page, baseUrl);

      await expect(page.locator(".notify-card")).toHaveCount(2);
      const alexRequest = page.locator(".notify-card").filter({ hasText: "Alex requested to follow you" });
      const jamieRequest = page.locator(".notify-card").filter({ hasText: "Jamie requested to follow you" });
      await expect(alexRequest).toHaveCount(1);
      await expect(jamieRequest).toHaveCount(1);
      await expect.poll(() => state.readAllCalls).toBe(1);

      await page.locator(".notify-request-btn.accept").first().click();
      await expect(alexRequest).toHaveCount(0);
      await expect(page.locator(".notify-card")).toHaveCount(1);
      await expect.poll(() => state.acceptCalls).toContain("501");

      await page.locator(".notify-request-btn.reject").first().click();
      await expect(jamieRequest).toHaveCount(0);
      await expect(page.locator(".notify-card")).toHaveCount(0);
      await expect.poll(() => state.rejectCalls).toContain("502");
    } finally {
      await context.close().catch(() => {});
    }
  });
});
