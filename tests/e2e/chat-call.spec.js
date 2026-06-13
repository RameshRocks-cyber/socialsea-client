import { expect, test } from "@playwright/test";
import {
  acceptIncomingCall,
  endAnyCall,
  openDirectChat,
  openThread,
  registerUser,
  startVoiceCall,
  takeDebugShot,
  waitForCallEstablished,
  waitForGroupVoiceCall,
  createGroupViaUi,
} from "./chat-test-helpers";

test.describe("chat call smoke", () => {
  test("supports direct audio and group voice calls", async ({ browser }, testInfo) => {
    test.slow();

    const baseUrl = String(testInfo.project.use.baseURL || "http://127.0.0.1:5173");
    const summary = {
      directCall: { ok: false },
      groupCall: { ok: false },
    };

    let caller;
    let callee;

    try {
      caller = await registerUser(browser, baseUrl, "caller");
      callee = await registerUser(browser, baseUrl, "callee");

      await test.step("complete a direct voice call", async () => {
        await openDirectChat(caller.page, baseUrl, callee.user.id);
        await openDirectChat(callee.page, baseUrl, caller.user.id);

        await startVoiceCall(caller.page);
        await acceptIncomingCall(callee.page);

        const callerText = await waitForCallEstablished(caller.page);
        const calleeText = await waitForCallEstablished(callee.page);

        summary.directCall = {
          ok: true,
          callerId: caller.user.id,
          calleeId: callee.user.id,
          callerConnected: /Connected|Connecting media|Audio call with|Video call with/i.test(callerText),
          calleeConnected: /Connected|Connecting media|Audio call with|Video call with/i.test(calleeText),
        };

        expect(summary.directCall.callerConnected).toBe(true);
        expect(summary.directCall.calleeConnected).toBe(true);

        const ended = await endAnyCall(caller.page);
        expect(ended).toBe(true);
        await caller.page.waitForTimeout(2_500);
        await callee.page.waitForTimeout(2_500);
      });

      await test.step("create a group and place a group voice call", async () => {
        const { threadId: groupThreadId } = await createGroupViaUi(caller.page, baseUrl, callee.user.name);
        expect(groupThreadId).toMatch(/^group:/i);

        await openThread(callee.page, baseUrl, groupThreadId);

        await startVoiceCall(caller.page);
        await waitForGroupVoiceCall(caller.page);
        await waitForGroupVoiceCall(callee.page);

        summary.groupCall = {
          ok: true,
          groupThreadId,
        };

        expect(summary.groupCall.ok).toBe(true);

        const ended = await endAnyCall(caller.page);
        expect(ended).toBe(true);
        await caller.page.waitForTimeout(1_500);
        await callee.page.waitForTimeout(1_500);
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
