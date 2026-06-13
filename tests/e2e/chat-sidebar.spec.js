import { expect, test } from "@playwright/test";
import {
  nowId,
  openContactActions,
  openDirectChat,
  openNewChatModal,
  registerUser,
  searchNewChatCandidate,
  sendComposerMessage,
  takeDebugShot,
  waitForChatHome,
  waitForChatRequestCard,
  waitForChatRequestCardToDisappear,
  waitForNewChatRow,
  waitForSidebarContact,
  waitForThreadMessage,
  waitForUnreadBadge,
} from "./chat-test-helpers";

test.describe("chat sidebar smoke", () => {
  test("shows unread badges and deletes a chat from the sidebar", async ({ browser }, testInfo) => {
    test.slow();

    const baseUrl = String(testInfo.project.use.baseURL || "http://127.0.0.1:5173");
    const summary = {
      unreadBadge: { ok: false },
      deleteChat: { ok: false },
    };

    let sender;
    let recipient;

    try {
      sender = await registerUser(browser, baseUrl, "sidebarsender");
      recipient = await registerUser(browser, baseUrl, "sidebarrecipient");

      await openDirectChat(sender.page, baseUrl, recipient.user.id);
      await openDirectChat(recipient.page, baseUrl, sender.user.id);

      const initialText = `sidebar seed ${nowId()}`;
      const unreadText = `sidebar unread ${nowId()}`;

      await sendComposerMessage(sender.page, initialText);
      await waitForThreadMessage(sender.page, initialText);
      await waitForThreadMessage(recipient.page, initialText);

      await waitForChatHome(recipient.page, baseUrl);
      await openDirectChat(sender.page, baseUrl, recipient.user.id);
      await sendComposerMessage(sender.page, unreadText);
      await waitForThreadMessage(sender.page, unreadText);

      await test.step("surface unread state in the sidebar", async () => {
        await waitForUnreadBadge(recipient.page, sender.user.name, "1");

        const card = await waitForSidebarContact(recipient.page, sender.user.name);
        await card.locator("button.chat-contact").first().click();
        await waitForThreadMessage(recipient.page, unreadText);
        await expect(card.locator(".chat-unread-badge")).toHaveCount(0);

        summary.unreadBadge = {
          ok: true,
          senderId: sender.user.id,
          recipientId: recipient.user.id,
          unreadText,
        };

        expect(summary.unreadBadge.ok).toBe(true);
      });

      await test.step("delete the chat from one side only", async () => {
        await waitForChatHome(recipient.page, baseUrl);
        const dialogPromise = recipient.page.waitForEvent("dialog").then((dialog) => dialog.accept());
        const card = await openContactActions(recipient.page, sender.user.name);
        await card.getByRole("button", { name: "Delete chat" }).click();
        await dialogPromise;

        await expect(recipient.page).toHaveURL(/\/chat$/, { timeout: 10_000 });
        await expect(recipient.page.locator(".chat-contact-list .chat-contact-card")).toHaveCount(0, { timeout: 20_000 });

        await openDirectChat(sender.page, baseUrl, recipient.user.id);
        await waitForThreadMessage(sender.page, unreadText);

        summary.deleteChat = {
          ok: true,
          senderStillHasThread: true,
        };

        expect(summary.deleteChat.ok).toBe(true);
      });
    } catch (error) {
      if (sender?.page) {
        await takeDebugShot(sender.page, testInfo.outputPath("sender-fail.png"));
      }
      if (recipient?.page) {
        await takeDebugShot(recipient.page, testInfo.outputPath("recipient-fail.png"));
      }

      throw new Error(
        `${String(error?.stack || error?.message || error)}\n\nsummary=${JSON.stringify(summary, null, 2)}`
      );
    } finally {
      await sender?.context?.close().catch(() => {});
      await recipient?.context?.close().catch(() => {});
    }
  });

  test("supports requesting chat access and accepting the request", async ({ browser }, testInfo) => {
    test.slow();

    const baseUrl = String(testInfo.project.use.baseURL || "http://127.0.0.1:5173");
    const summary = {
      requestSent: { ok: false },
      requestAccepted: { ok: false },
      postAcceptChat: { ok: false },
    };

    let requester;
    let approver;

    try {
      requester = await registerUser(browser, baseUrl, "requester");
      approver = await registerUser(browser, baseUrl, "approver");

      await test.step("send a chat request from new chat search", async () => {
        await waitForChatHome(requester.page, baseUrl);
        await openNewChatModal(requester.page);
        await searchNewChatCandidate(requester.page, approver.user.name);
        const row = await waitForNewChatRow(requester.page, approver.user.name);
        const requestButton = row.locator(".chat-request-btn");

        await expect(requestButton).toBeVisible({ timeout: 10_000 });
        await requestButton.click();
        await expect(requestButton).toHaveText(/Requested|Following/i, { timeout: 10_000 });

        const sentCard = await waitForChatRequestCard(requester.page, baseUrl, approver.user.name, "sent");
        await expect(sentCard).toContainText("Pending");

        summary.requestSent = {
          ok: true,
          requesterId: requester.user.id,
          approverId: approver.user.id,
        };

        expect(summary.requestSent.ok).toBe(true);
      });

      await test.step("accept the chat request from the requests page", async () => {
        const incomingCard = await waitForChatRequestCard(approver.page, baseUrl, requester.user.name, "incoming");
        await incomingCard.getByRole("button", { name: "Accept" }).click();

        await waitForChatRequestCardToDisappear(approver.page, baseUrl, requester.user.name, "incoming");
        await waitForChatRequestCardToDisappear(requester.page, baseUrl, approver.user.name, "sent");

        summary.requestAccepted = {
          ok: true,
        };

        expect(summary.requestAccepted.ok).toBe(true);
      });

      await test.step("start chatting after the request is accepted", async () => {
        await waitForChatHome(requester.page, baseUrl);
        await openNewChatModal(requester.page);
        await searchNewChatCandidate(requester.page, approver.user.name);
        const row = await waitForNewChatRow(requester.page, approver.user.name);
        const chatButton = row.locator("button.chat-contact").first();

        await expect(chatButton).toBeEnabled({ timeout: 10_000 });
        await expect(row.locator(".chat-request-btn")).toHaveCount(0);
        await chatButton.click();

        const messageText = `request flow ${nowId()}`;
        await sendComposerMessage(requester.page, messageText);
        await openDirectChat(approver.page, baseUrl, requester.user.id);
        await waitForThreadMessage(approver.page, messageText);

        summary.postAcceptChat = {
          ok: true,
          messageText,
        };

        expect(summary.postAcceptChat.ok).toBe(true);
      });
    } catch (error) {
      if (requester?.page) {
        await takeDebugShot(requester.page, testInfo.outputPath("requester-fail.png"));
      }
      if (approver?.page) {
        await takeDebugShot(approver.page, testInfo.outputPath("approver-fail.png"));
      }

      throw new Error(
        `${String(error?.stack || error?.message || error)}\n\nsummary=${JSON.stringify(summary, null, 2)}`
      );
    } finally {
      await requester?.context?.close().catch(() => {});
      await approver?.context?.close().catch(() => {});
    }
  });
});
