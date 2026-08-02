import { defineConfig } from "@playwright/test";
/** E2E gate. The webServer block boots the review queue automatically in CI and locally. */
export default defineConfig({
  testDir: "./tests/e2e",
  use: { baseURL: process.env.BASE_URL ?? "http://localhost:3000", trace: "on-first-retry" },
  reporter: [["list"]],
  webServer: {
    command: "npm run dev --workspace web",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
