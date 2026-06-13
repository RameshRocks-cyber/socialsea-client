import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";

const clientDir = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = path.resolve(clientDir, "..");
const reuseExistingServer = !process.env.CI;

const fakeMediaArgs = [
  "--use-fake-ui-for-media-stream",
  "--use-fake-device-for-media-stream",
  "--autoplay-policy=no-user-gesture-required",
];

const backendCommand =
  process.platform === "win32" ? ".\\mvnw.cmd spring-boot:run" : "./mvnw spring-boot:run";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 180_000,
  expect: {
    timeout: 30_000,
  },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:5173",
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    launchOptions: {
      args: fakeMediaArgs,
    },
  },
  webServer: [
    {
      command: backendCommand,
      cwd: repoRoot,
      url: "http://127.0.0.1:8080/api/feed",
      reuseExistingServer,
      timeout: 180_000,
      env: {
        ...process.env,
        SPRING_PROFILES_ACTIVE: process.env.SPRING_PROFILES_ACTIVE || "dev",
      },
    },
    {
      command: "npm run dev -- --host 127.0.0.1",
      cwd: clientDir,
      url: "http://127.0.0.1:5173",
      reuseExistingServer,
      timeout: 120_000,
      env: {
        ...process.env,
        VITE_DEV_PROXY_TARGET: process.env.VITE_DEV_PROXY_TARGET || "http://127.0.0.1:8080",
        VITE_DEV_PROXY_ORIGIN: process.env.VITE_DEV_PROXY_ORIGIN || "http://127.0.0.1:5173",
      },
    },
  ],
});
