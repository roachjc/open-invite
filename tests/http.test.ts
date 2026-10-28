import { afterEach, describe, expect, it, vi } from "vitest";
import { checkOrigin, localOnly } from "@/lib/server/http";
afterEach(() => vi.unstubAllEnvs());
describe("local preview boundaries", () => {
  it("accepts a real same-origin browser POST when Next binds to 0.0.0.0", () => {
    const request = new Request("http://0.0.0.0:3000/api/plans", {
      headers: {
        host: "localhost:3000",
        origin: "http://localhost:3000",
        "sec-fetch-site": "same-origin",
      },
    });
    expect(() => checkOrigin(request)).not.toThrow();
  });
  it("rejects another site's POST", () => {
    const request = new Request("http://0.0.0.0:3000/api/plans", {
      headers: {
        host: "localhost:3000",
        origin: "https://another-site.example",
        "sec-fetch-site": "cross-site",
      },
    });
    expect(() => checkOrigin(request)).toThrow("from the app");
  });
  it("refuses production API access without an explicit local-preview opt-in", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("OPEN_INVITE_LOCAL_DEMO", "");
    expect(() => localOnly()).toThrow("local preview only");
    vi.stubEnv("OPEN_INVITE_LOCAL_DEMO", "true");
    expect(() => localOnly()).not.toThrow();
  });
});
