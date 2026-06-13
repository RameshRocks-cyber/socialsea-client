import { expect, test } from "@playwright/test";
import {
  createGroupViaUi,
  openDirectChat,
  openThread,
  registerUser,
  sendComposerMessage,
  takeDebugShot,
  waitForThreadMessage,
  nowId,
} from "./chat-test-helpers";

test.describe("chat message smoke", () => {
  test("supports direct and group message delivery", async ({ browser }, testInfo) => {
    test.slow();

    const baseUrl = String(testInfo.project.use.baseURL || "http://127.0.0.1:5173");
    const summary = {
      directMessage: { ok: false },
      groupMessage: { ok: false },
    };

    let caller;
    let callee;

    try {
      caller = await registerUser(browser, baseUrl, "msgcaller");
      callee = await registerUser(browser, baseUrl, "msgcallee");

      await test.step("deliver direct messages in both directions", async () => {
        const outbound = `direct outbound ${nowId()}`;
        const reply = `direct reply ${nowId()}`;

        await openDirectChat(caller.page, baseUrl, callee.user.id);
        await openDirectChat(callee.page, baseUrl, caller.user.id);

        await sendComposerMessage(caller.page, outbound);
        await waitForThreadMessage(caller.page, outbound);
        await waitForThreadMessage(callee.page, outbound);

        await sendComposerMessage(callee.page, reply);
        await waitForThreadMessage(caller.page, reply);
        await waitForThreadMessage(callee.page, reply);

        summary.directMessage = {
          ok: true,
          callerId: caller.user.id,
          calleeId: callee.user.id,
          outbound,
          reply,
        };

        expect(summary.directMessage.ok).toBe(true);
      });

      await test.step("create a group and deliver group messages", async () => {
        const groupName = `Smoke Group Messages ${nowId()}`;
        const outbound = `group outbound ${nowId()}`;
        const reply = `group reply ${nowId()}`;
        const { threadId: groupThreadId } = await createGroupViaUi(
          caller.page,
          baseUrl,
          callee.user.name,
          groupName
        );

        expect(groupThreadId).toMatch(/^group:/i);

        await openThread(callee.page, baseUrl, groupThreadId);

        await sendComposerMessage(caller.page, outbound);
        await waitForThreadMessage(caller.page, outbound);
        await waitForThreadMessage(callee.page, outbound);

        await sendComposerMessage(callee.page, reply);
        await waitForThreadMessage(caller.page, reply);
        await waitForThreadMessage(callee.page, reply);

        summary.groupMessage = {
          ok: true,
          groupThreadId,
          groupName,
          outbound,
          reply,
        };

        expect(summary.groupMessage.ok).toBe(true);
      });
    } catch (error) {
      if (caller?.page) {
        await takeDebugShot(caller.page, testInfo.outputPath("caller-fail.png"));
      }
      if (callee?.page) {
        await takeDebugShot(callee.page, testInfo.outputPath("callee-fail.png"));
      }

      throw new Error(
        `${String(error?.stack || error?.message || error)}\n\nsummary=${JSON.stringify(summary, null, 2)}`
      );
    } finally {
      await caller?.context?.close().catch(() => {});
      await callee?.context?.close().catch(() => {});
    }
  });
});
