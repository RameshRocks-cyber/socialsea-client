import { expect } from "@playwright/test";

export const nowId = () => `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const installFakeVoiceRecorder = async (context) => {
  await context.addInitScript(() => {
    if (window.__ssFakeVoiceRecorderInstalled) return;
    window.__ssFakeVoiceRecorderInstalled = true;

    class FakeAudioTrack {
      constructor() {
        this.kind = "audio";
        this.enabled = true;
        this.id = `fake-audio-track-${Math.random().toString(36).slice(2, 8)}`;
      }

      stop() {}

      getSettings() {
        return { sampleRate: 48_000 };
      }
    }

    class FakeAudioStream {
      constructor() {
        this._tracks = [new FakeAudioTrack()];
      }

      getTracks() {
        return [...this._tracks];
      }

      getAudioTracks() {
        return [...this._tracks];
      }

      addTrack(track) {
        if (track && !this._tracks.includes(track)) this._tracks.push(track);
      }

      removeTrack(track) {
        this._tracks = this._tracks.filter((candidate) => candidate !== track);
      }
    }

    const originalMediaDevices = navigator.mediaDevices || {};
    const originalGetUserMedia =
      typeof originalMediaDevices.getUserMedia === "function"
        ? originalMediaDevices.getUserMedia.bind(originalMediaDevices)
        : null;
    const patchedMediaDevices = Object.create(originalMediaDevices);
    patchedMediaDevices.getUserMedia = async (constraints) => {
      const wantsOnlyAudio = Boolean(constraints?.audio) && !constraints?.video;
      if (wantsOnlyAudio) return new FakeAudioStream();
      if (originalGetUserMedia) return originalGetUserMedia(constraints);
      return new FakeAudioStream();
    };
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: patchedMediaDevices,
    });

    class FakeMediaRecorder {
      constructor(stream, options = {}) {
        this.stream = stream;
        this.mimeType = String(options?.mimeType || "audio/webm");
        this.state = "inactive";
        this.ondataavailable = null;
        this.onerror = null;
        this.onstop = null;
      }

      start() {
        this.state = "recording";
      }

      stop() {
        if (this.state !== "recording") return;
        this.state = "inactive";
        const payload = new Blob(["socialsea-voice-note"], {
          type: this.mimeType || "audio/webm",
        });
        window.setTimeout(() => {
          try {
            this.ondataavailable?.({ data: payload });
            this.onstop?.();
          } catch (error) {
            this.onerror?.({ error });
          }
        }, 20);
      }

      pause() {
        if (this.state === "recording") this.state = "paused";
      }

      resume() {
        if (this.state === "paused") this.state = "recording";
      }

      requestData() {
        if (this.state !== "recording") return;
        this.ondataavailable?.({
          data: new Blob(["socialsea-voice-note"], {
            type: this.mimeType || "audio/webm",
          }),
        });
      }

      static isTypeSupported(mimeType) {
        return String(mimeType || "").toLowerCase().startsWith("audio/");
      }
    }

    Object.defineProperty(window, "MediaRecorder", {
      configurable: true,
      value: FakeMediaRecorder,
    });
  });
};

export const waitForText = async (page, texts, timeout = 30_000) => {
  const expected = Array.isArray(texts) ? texts : [texts];
  await page.waitForFunction(
    (values) => values.some((value) => document.body.innerText.includes(value)),
    expected,
    { timeout }
  );
};

export const bodyText = async (page) => page.locator("body").innerText().catch(() => "");

export const ensureAuthStorage = async (page, user) => {
  await page.evaluate((nextUser) => {
    const sessionKey = "socialsea_auth_session_v1";
    const recoveryLockKey = "socialsea_auth_recovery_lock_v1";
    const id = String(nextUser?.id || "");
    const email = String(nextUser?.email || "");
    const name = String(nextUser?.name || nextUser?.username || "");
    const role = String(nextUser?.role || "USER").replace(/^ROLE_/i, "");
    const completed = String(Boolean(nextUser?.profileCompleted));

    const write = (storage) => {
      storage.removeItem(recoveryLockKey);
      storage.setItem(sessionKey, "1");
      if (id) storage.setItem("userId", id);
      if (email) storage.setItem("email", email);
      if (name) {
        storage.setItem("name", name);
        storage.setItem("username", name);
      }
      storage.setItem("role", role);
      storage.setItem("profileCompleted", completed);
    };

    write(window.sessionStorage);
    write(window.localStorage);
  }, user);
};

export const registerUser = async (browser, baseUrl, label, options = {}) => {
  const context = await browser.newContext({
    baseURL: baseUrl,
    viewport: { width: 1440, height: 900 },
  });
  await context.grantPermissions(["camera", "microphone", "notifications"], { origin: baseUrl });
  if (options?.mockVoiceRecorder) {
    await installFakeVoiceRecorder(context);
  }

  const page = await context.newPage();
  const identity = {
    username: `pw_${label}_${nowId()}`,
    email: `pw_${label}_${nowId()}@example.com`,
    password: "Passw0rd!234",
  };

  await page.goto(`${baseUrl}/login`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});

  const result = await page.evaluate(async (payload) => {
    const response = await fetch("/api/auth/register", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    let data = {};
    try {
      data = await response.json();
    } catch {
      data = {};
    }

    return {
      ok: response.ok,
      status: response.status,
      data,
    };
  }, identity);

  if (!result.ok) {
    throw new Error(`register_${label}_failed_${result.status}: ${JSON.stringify(result.data)}`);
  }

  const user = result.data?.user || result.data || {};
  if (!user?.id) {
    throw new Error(`register_${label}_missing_user_id`);
  }

  await ensureAuthStorage(page, user);
  await page.goto(`${baseUrl}/chat`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  await waitForText(page, "Messages", 20_000);

  return {
    context,
    page,
    user: {
      id: String(user.id),
      email: String(user.email || ""),
      name: String(user.name || user.username || identity.username),
      username: String(user.username || user.name || identity.username),
      role: String(user.role || "USER"),
    },
  };
};

export const waitForThreadReady = async (page) => {
  await page.locator(".chat-thread").waitFor({ timeout: 20_000 });
  await page.getByPlaceholder("Message...").waitFor({ timeout: 20_000 });
};

export const waitForChatHome = async (page, baseUrl) => {
  await page.goto(`${baseUrl}/chat`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  await waitForText(page, "Messages", 20_000);
};

export const openThread = async (page, baseUrl, threadId) => {
  await page.goto(`${baseUrl}/chat/${encodeURIComponent(String(threadId))}`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  await waitForThreadReady(page);
};

export const openDirectChat = async (page, baseUrl, otherId) => {
  await openThread(page, baseUrl, otherId);
  await page.getByLabel("Call options").waitFor({ timeout: 20_000 });
};

export const sendComposerMessage = async (page, text) => {
  const composer = page.getByPlaceholder("Message...");
  await composer.fill(text);
  await expect(page.getByLabel("Send message")).toBeVisible({ timeout: 5_000 });
  await page.getByLabel("Send message").click();
  await expect(composer).toHaveValue("", { timeout: 10_000 });
};

export const waitForThreadMessage = async (page, text, timeout = 30_000) => {
  const message = page.locator(".chat-thread .chat-bubble").filter({ hasText: text }).last();
  await expect(message).toBeVisible({ timeout });
  return message;
};

export const sendAttachmentFile = async (page, filePayload) => {
  const chooserPromise = page.waitForEvent("filechooser");
  await page.getByTitle("Attach").click();
  const chooser = await chooserPromise;
  await chooser.setFiles(filePayload);
};

export const waitForFileAttachmentMessage = async (page, fileName, timeout = 30_000) => {
  const link = page.locator(".chat-thread .chat-file-link").filter({ hasText: fileName }).last();
  await expect(link).toBeVisible({ timeout });
  return link;
};

export const sendVoiceNote = async (page, durationMs = 600) => {
  const button = page.locator(".composer-voice-note-btn");
  await expect(button).toBeVisible({ timeout: 10_000 });
  await button.click();
  await expect(button).toHaveClass(/active/, { timeout: 10_000 });
  await page.waitForTimeout(durationMs);
  await button.click();
  await expect(button).not.toHaveClass(/active/, { timeout: 10_000 });
};

export const waitForVoiceNoteMessage = async (page, timeout = 30_000) => {
  const audio = page.locator(".chat-thread .chat-audio").last();
  await expect(audio).toBeVisible({ timeout });
  return audio;
};

export const deleteThreadMessageForEveryone = async (page, text, timeout = 30_000) => {
  const bubble = page.locator(".chat-thread .chat-bubble").filter({ hasText: text }).last();
  await expect(bubble).toBeVisible({ timeout });
  await bubble.click({ button: "right" });
  await page.getByRole("button", { name: "Delete for everyone" }).click();
};

export const waitForDeletedThreadMessage = async (page, originalText, timeout = 30_000) => {
  await expect(page.locator(".chat-thread .chat-bubble").filter({ hasText: originalText })).toHaveCount(0, {
    timeout,
  });
  const deletedBubble = page
    .locator(".chat-thread .chat-bubble")
    .filter({ hasText: "This message was deleted" })
    .last();
  await expect(deletedBubble).toBeVisible({ timeout });
  return deletedBubble;
};

export const startVoiceCall = async (page) => {
  await page.getByLabel("Call options").click();
  await page.getByRole("menuitem", { name: "Voice call" }).click();
};

export const acceptIncomingCall = async (page) => {
  await waitForText(page, ["Incoming audio call", "Audio call from"], 30_000);
  await page.getByRole("button", { name: /Attend/i }).first().click();
};

export const waitForCallEstablished = async (page) => {
  await page.waitForFunction(
    () =>
      document.body.innerText.includes("Connected") ||
      document.body.innerText.includes("Connecting media...") ||
      document.body.innerText.includes("Audio call with") ||
      document.body.innerText.includes("Video call with"),
    null,
    { timeout: 30_000 }
  );
  return bodyText(page);
};

export const endAnyCall = async (page) => {
  const endButtons = [
    page.getByRole("button", { name: /End Call/i }),
    page.locator(".call-hangup"),
    page.getByTitle("End call"),
  ];

  for (const locator of endButtons) {
    try {
      const count = await locator.count();
      if (count > 0) {
        await locator.first().click({ timeout: 5_000 });
        return true;
      }
    } catch {
      // Try the next visible control.
    }
  }

  return false;
};

export const createGroupViaUi = async (page, baseUrl, memberName, nextGroupName = `Smoke Group ${nowId()}`) => {
  await waitForChatHome(page, baseUrl);
  await page.locator(".chat-sidebar-menu-btn").click();
  await page.getByRole("menuitem", { name: /New Group/i }).click();
  await page.getByRole("dialog", { name: "Create group chat" }).waitFor({ timeout: 10_000 });
  await page.getByPlaceholder("Group name").fill(nextGroupName);
  await page.getByPlaceholder("Search people").fill(memberName);

  let memberRow = page.locator(".group-call-item").filter({ hasText: memberName }).first();
  try {
    await memberRow.waitFor({ timeout: 4_000 });
  } catch {
    memberRow = page.locator(".group-call-item").first();
    await memberRow.waitFor({ timeout: 10_000 });
  }
  await memberRow.click();

  await page.getByRole("button", { name: /Create group/i }).click();
  await page.waitForURL(/\/chat\/group(?::|%3A)/, { timeout: 20_000 });
  await waitForThreadReady(page);

  const url = new URL(page.url());
  return {
    threadId: decodeURIComponent(url.pathname.split("/chat/")[1] || ""),
    groupName: nextGroupName,
  };
};

export const waitForGroupVoiceCall = async (page) => {
  await waitForText(page, ["Group voice call", "Connecting media...", "Connected"], 30_000);
};

export const openSidebarMenu = async (page) => {
  await page.locator(".chat-sidebar-menu-btn").click();
  await page.locator(".chat-sidebar-menu[role='menu']").waitFor({ timeout: 10_000 });
};

export const openNewChatModal = async (page) => {
  await openSidebarMenu(page);
  await page.getByRole("menuitem", { name: /New Chat/i }).click();
  const modal = page.locator(".new-chat-modal");
  await modal.waitFor({ timeout: 10_000 });
  return modal;
};

export const searchNewChatCandidate = async (page, query) => {
  const modal = page.locator(".new-chat-modal");
  const input = modal.getByPlaceholder("Search people");
  await input.fill(query);
  return modal;
};

export const waitForNewChatRow = async (page, preferredText, timeout = 20_000) => {
  const list = page.locator(".new-chat-list");
  let row = list.locator(".chat-contact-row").filter({ hasText: preferredText }).first();
  try {
    await row.waitFor({ timeout: Math.min(timeout, 5_000) });
  } catch {
    row = list.locator(".chat-contact-row").first();
    await row.waitFor({ timeout });
  }
  return row;
};

export const waitForSidebarContact = async (page, preferredText, timeout = 30_000) => {
  const list = page.locator(".chat-contact-list");
  let card = list.locator(".chat-contact-card").filter({ hasText: preferredText }).first();
  try {
    await card.waitFor({ timeout: Math.min(timeout, 5_000) });
  } catch {
    card = list.locator(".chat-contact-card").first();
    await card.waitFor({ timeout });
  }
  return card;
};

export const waitForUnreadBadge = async (page, preferredText, expectedText = "1", timeout = 30_000) => {
  const card = await waitForSidebarContact(page, preferredText, timeout);
  const badge = card.locator(".chat-unread-badge");
  await expect(badge).toBeVisible({ timeout });
  await expect(badge).toHaveText(String(expectedText), { timeout });
  return badge;
};

export const openContactActions = async (page, preferredText, timeout = 20_000) => {
  const card = await waitForSidebarContact(page, preferredText, timeout);
  await card.locator("button.chat-contact").first().click({ button: "right" });
  await card.locator(".chat-contact-actions").waitFor({ timeout });
  return card;
};

export const openChatRequestsPage = async (page, baseUrl) => {
  await page.goto(`${baseUrl}/chat/requests`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  await waitForText(page, "Chat Requests", 20_000);
};

export const waitForChatRequestCard = async (page, baseUrl, preferredText, section = "incoming", timeout = 30_000) => {
  const sectionSelector =
    section === "sent" ? ".chat-requests.chat-requests-sent" : ".chat-requests:not(.chat-requests-sent)";
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    await openChatRequestsPage(page, baseUrl);
    let card = page.locator(sectionSelector).locator(".chat-request-card").filter({ hasText: preferredText }).first();
    if (await card.count()) {
      try {
        await expect(card).toBeVisible({ timeout: 2_000 });
        return card;
      } catch {
        // Fall through to retry.
      }
    }

    card = page.locator(sectionSelector).locator(".chat-request-card").first();
    if (await card.count()) {
      try {
        await expect(card).toBeVisible({ timeout: 2_000 });
        return card;
      } catch {
        // Fall through to retry.
      }
    }

    await page.waitForTimeout(1_000);
  }

  throw new Error(`request_card_not_found_${section}_${preferredText}`);
};

export const waitForChatRequestCardToDisappear = async (
  page,
  baseUrl,
  preferredText,
  section = "incoming",
  timeout = 30_000
) => {
  const sectionSelector =
    section === "sent" ? ".chat-requests.chat-requests-sent" : ".chat-requests:not(.chat-requests-sent)";
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    await openChatRequestsPage(page, baseUrl);
    const card = page.locator(sectionSelector).locator(".chat-request-card").filter({ hasText: preferredText }).first();
    if (!(await card.count())) {
      return true;
    }
    await page.waitForTimeout(1_000);
  }

  throw new Error(`request_card_still_visible_${section}_${preferredText}`);
};

export const takeDebugShot = async (page, outputPath) => {
  try {
    await page.screenshot({ path: outputPath, fullPage: true });
  } catch {
    // Screenshot failures should not hide the real test failure.
  }
};
