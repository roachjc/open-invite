import { defineConfig } from "@playwright/test";
import { join } from "node:path";
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://localhost:3100",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run build && npm run start -- --port 3100",
    env: {
      OPEN_INVITE_LOCAL_DEMO: "true",
      OPEN_INVITE_DATA_DIR: join(process.cwd(), ".data", "e2e"),
      OPENAI_API_KEY: "",
    },
    url: "http://localhost:3100",
    reuseExistingServer: false,
  },
});
