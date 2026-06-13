import { Buffer } from "node:buffer";
import { expect, test } from "@playwright/test";
import {
  deleteThreadMessageForEveryone,
  nowId,
  openDirectChat,
  registerUser,
  sendAttachmentFile,
  sendComposerMessage,
  sendVoiceNote,
  takeDebugShot,
  waitForDeletedThreadMessage,
  waitForFileAttachmentMessage,
  waitForThreadMessage,
  waitForVoiceNoteMessage,
} from "./chat-test-helpers";

test.describe("chat media smoke", () => {
  test("supports attachments, voice notes, and delete-for-everyone", async ({ browser }, testInfo) => {
    test.slow();

    const baseUrl = String(testInfo.project.use.baseURL || "http://127.0.0.1:5173");
    const summary = {
      attachment: { ok: false },
      voiceNote: { ok: false },
      deleteForEveryone: { ok: false },
    };

    let sender;
    let recipient;

    try {
      sender = await registerUser(browser, baseUrl, "mediacaller", { mockVoiceRecorder: true });
      recipient = await registerUser(browser, baseUrl, "mediacallee", { mockVoiceRecorder: true });

      await openDirectChat(sender.page, baseUrl, recipient.user.id);
      await openDirectChat(recipient.page, baseUrl, sender.user.id);

      await test.step("send a file attachment", async () => {
        const fileName = `chat-attachment-${nowId()}.pdf`;
        await sendAttachmentFile(sender.page, {
          name: fileName,
          mimeType: "application/pdf",
          buffer: Buffer.from(`%PDF-1.4\n% socialsea smoke ${nowId()}\n`, "utf8"),
        });

        await waitForFileAttachmentMessage(sender.page, fileName);
        await openDirectChat(recipient.page, baseUrl, sender.user.id);
        await waitForFileAttachmentMessage(recipient.page, fileName);

        summary.attachment = {
          ok: true,
          fileName,
        };

        expect(summary.attachment.ok).toBe(true);
      });

      await test.step("record and deliver a voice note", async () => {
        await sendVoiceNote(sender.page);
        await waitForVoiceNoteMessage(sender.page);
        await openDirectChat(recipient.page, baseUrl, sender.user.id);
        await waitForVoiceNoteMessage(recipient.page);

        const senderVoiceNotes = sender.page.locator(".chat-thread .chat-audio");
        const recipientVoiceNotes = recipient.page.locator(".chat-thread .chat-audio");
        await expect(senderVoiceNotes).toHaveCount(1);
        await expect(recipientVoiceNotes).toHaveCount(1);

        summary.voiceNote = {
          ok: true,
        };

        expect(summary.voiceNote.ok).toBe(true);
      });

      await test.step("delete a message for everyone and keep it deleted after reload", async () => {
        const deleteText = `delete everyone ${nowId()}`;
        await sendComposerMessage(sender.page, deleteText);
        await waitForThreadMessage(sender.page, deleteText);
        await waitForThreadMessage(recipient.page, deleteText);

        await deleteThreadMessageForEveryone(sender.page, deleteText);
        await waitForDeletedThreadMessage(sender.page, deleteText);
        await waitForDeletedThreadMessage(recipient.page, deleteText);

        await openDirectChat(sender.page, baseUrl, recipient.user.id);
        await openDirectChat(recipient.page, baseUrl, sender.user.id);
        await waitForDeletedThreadMessage(sender.page, deleteText);
        await waitForDeletedThreadMessage(recipient.page, deleteText);

        summary.deleteForEveryone = {
          ok: true,
          deleteText,
        };

        expect(summary.deleteForEveryone.ok).toBe(true);
      });
    } catch (error) {
      if (sender?.page) {
        await takeDebugShot(sender.page, testInfo.outputPath("media-sender-fail.png"));
      }
      if (recipient?.page) {
        await takeDebugShot(recipient.page, testInfo.outputPath("media-recipient-fail.png"));
      }

      throw new Error(
        `${String(error?.stack || error?.message || error)}\n\nsummary=${JSON.stringify(summary, null, 2)}`
      );
    } finally {
      await sender?.context?.close().catch(() => {});
      await recipient?.context?.close().catch(() => {});
    }
  });
});
