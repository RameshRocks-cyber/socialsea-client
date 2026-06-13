import { expect, test } from "@playwright/test";

const VOL0_PROFILE_PIC = "/icons/volo-symbol.png";

const VIEWER_USER = {
  id: "volo-tester",
  userId: "volo-tester",
  username: "volo_tester",
  name: "Volo Tester",
  email: "volo.tester@example.com",
  role: "USER",
  profileCompleted: true,
  profilePicUrl: VOL0_PROFILE_PIC,
};

const seededQuestion = {
  id: "question-1",
  entryType: "question",
  text: "What should we test next?",
  createdAt: "2026-06-11T09:00:00.000Z",
  owner: {
    userId: "question-host",
    username: "question_host",
    name: "Question Host",
    email: "question.host@example.com",
    profilePicUrl: VOL0_PROFILE_PIC,
  },
  answers: [
    {
      id: "answer-1",
      text: "Keep the happy path covered.",
      createdAt: "2026-06-11T09:05:00.000Z",
      owner: {
        userId: "mina",
        username: "mina",
        name: "Mina",
        email: "mina@example.com",
        profilePicUrl: VOL0_PROFILE_PIC,
      },
    },
  ],
  answerCount: 1,
};

const respondJson = (route, payload, status = 200) =>
  route.fulfill({
    status,
    contentType: "application/json; charset=utf-8",
    body: JSON.stringify(payload),
  });

const attachDebugListeners = (page) => {
  if (String(process.env.PW_VOLO_DEBUG || "").trim() !== "1") return;
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
    const avatar = String(nextUser?.profilePicUrl || "/icons/volo-symbol.png");
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
      storage.setItem("profilePicUrl", avatar);
      storage.setItem("profilePic", avatar);
      storage.setItem("avatar", avatar);
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

const seedVoloStorage = async (context, entries = []) => {
  await context.addInitScript((items) => {
    try {
      const seedFlagKey = "socialsea_volos_seeded_v1";
      if (sessionStorage.getItem(seedFlagKey) === "1") return;
      localStorage.setItem("socialsea_volos_v1", JSON.stringify(items));
      sessionStorage.setItem(seedFlagKey, "1");
    } catch {
      // ignore storage failures in the test harness
    }
  }, entries);
};

const installShellApiMocks = async (page) => {
  const handleApiRoute = async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;
    const method = request.method().toUpperCase();

    if (!pathname.startsWith("/api/")) {
      await route.fallback();
      return;
    }

    if (pathname === "/api/profile/me" && method === "GET") {
      await respondJson(route, VIEWER_USER);
      return;
    }

    if (pathname.startsWith("/api/profile/") && method === "GET") {
      const identifier = decodeURIComponent(pathname.split("/").pop() || "");
      const slug = String(identifier || "profile").replace(/\s+/g, ".").toLowerCase();
      await respondJson(route, {
        id: identifier || "profile-id",
        username: identifier || "Profile User",
        name: identifier || "Profile User",
        email: `${slug}@example.com`,
        profilePicUrl: VOL0_PROFILE_PIC,
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

    if (pathname === "/api/profile/me/posts" && method === "GET") {
      await respondJson(route, []);
      return;
    }

    if (pathname === "/api/profile/posts" && method === "GET") {
      await respondJson(route, []);
      return;
    }

    if (pathname === "/api/chat/presence" && method === "GET") {
      await respondJson(route, {});
      return;
    }

    await respondJson(route, {});
  };

  await page.route("**/api/**", handleApiRoute);
  await page.route("**/chat/presence", async (route) => {
    await respondJson(route, {});
  });
};

const createContext = async (browser, baseUrl) =>
  browser.newContext({
    baseURL: baseUrl,
    viewport: { width: 1440, height: 900 },
  });

const openVoloPage = async (page, baseUrl, search = "") => {
  await page.goto(`${baseUrl}/volo${search}`, { waitUntil: "commit" });
  await expect(page.getByRole("heading", { name: "Volo" })).toBeVisible({ timeout: 30_000 });
};

test.describe("Volo page", () => {
  test("creates a Volo post from the composer and persists it after reload", async ({ browser }, testInfo) => {
    const baseUrl = String(testInfo.project.use.baseURL || "http://127.0.0.1:5173");
    const context = await createContext(browser, baseUrl);

    try {
      await seedAuthStorage(context);
      await seedVoloStorage(context, []);

      const page = await context.newPage();
      attachDebugListeners(page);
      await installShellApiMocks(page);

      await openVoloPage(page, baseUrl, "?compose=1");
      await expect(page.locator(".volo-empty")).toHaveText("No volos yet. Create your first one.");

      const composer = page.getByPlaceholder("What's happening?");
      await expect(composer).toBeVisible();
      await composer.fill("Testing Volo post");
      await page.getByRole("button", { name: "Post Volo" }).click();

      const firstCard = page.locator(".volo-card").first();
      await expect(firstCard).toContainText("Testing Volo post");
      await expect(firstCard).toContainText("You");

      await page.reload({ waitUntil: "commit" });
      await expect(page.locator(".volo-card").first()).toContainText("Testing Volo post");
      await expect(page.locator(".volo-card").first()).toContainText("You");
    } finally {
      await context.close().catch(() => {});
    }
  });

  test("opens the questions panel, posts a question, and keeps seeded answers visible", async ({
    browser,
  }, testInfo) => {
    const baseUrl = String(testInfo.project.use.baseURL || "http://127.0.0.1:5173");
    const context = await createContext(browser, baseUrl);

    try {
      await seedAuthStorage(context);
      await seedVoloStorage(context, [seededQuestion]);

      const page = await context.newPage();
      attachDebugListeners(page);
      await installShellApiMocks(page);

      await openVoloPage(page, baseUrl);

      await page.getByLabel("Show questions panel").click();
      await expect(page.getByRole("heading", { name: "Volo Questions" })).toBeVisible();

      const seededQuestionCard = page
        .locator(".volo-card")
        .filter({ hasText: "What should we test next?" })
        .first();
      await expect(seededQuestionCard.locator(".volo-answer-item")).toContainText(
        "Keep the happy path covered."
      );

      const questionInput = page.getByPlaceholder("Ask a question to the Volo community...");
      await questionInput.fill("How do we keep this stable?");
      await page.getByRole("button", { name: "Post Question" }).click();

      await expect(page.locator(".volo-card").first()).toContainText("How do we keep this stable?");
      await expect(page.locator(".volo-card").first()).toContainText("Question");

      await page.reload({ waitUntil: "commit" });
      await expect(page.locator(".volo-card").first()).toContainText("How do we keep this stable?");
      await expect(
        page.locator(".volo-card").filter({ hasText: "What should we test next?" }).first()
      ).toContainText("Keep the happy path covered.");
    } finally {
      await context.close().catch(() => {});
    }
  });
});
