import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./specs",
  timeout: 60_000,
  use: { baseURL: "http://localhost:3000", trace: "off", screenshot: "off", video: "off" },
  reporter: [["list"]],
  workers: 1,
});
