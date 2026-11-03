import { afterEach, describe, expect, it, vi } from "vitest";
import { DateTime } from "luxon";
import { extract, inspectExtraction } from "@/lib/server/extraction";

const { parse } = vi.hoisted(() => ({ parse: vi.fn() }));
vi.mock("openai", () => ({
  default: class {
    responses = { parse };
  },
}));
const now = DateTime.fromISO("2026-10-30T09:00:00", {
  zone: "America/Los_Angeles",
});
const empty = {
  activity: null,
  category: null,
  ageGroups: null,
  attendeeDetail: null,
  place: null,
  startTimeEvidence: null,
  startLocal: null,
  startsInMinutes: null,
  endLocal: null,
  durationMinutes: null,
  note: null,
};
afterEach(() => {
  vi.unstubAllEnvs();
  parse.mockReset();
});

describe("AI extraction boundary", () => {
  it("keeps nulls out of draft changes and applies a duration to an existing start", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    parse.mockResolvedValue({
      output_parsed: {
        ...empty,
        durationMinutes: 90,
        endLocal: "2026-10-30T10:30:00",
        ageGroups: ["adults"],
      },
    });
    const changes = await extract("Adults only, for an hour and a half", now, {
      place: "Chickadee",
      startsAt: now.plus({ seconds: 25 }).toUTC().toISO()!,
    });
    expect(changes).toEqual({
      ageGroups: ["adults"],
      durationMinutes: 90,
      endsAt: "2026-10-30T17:30:25.000Z",
    });
    expect(parse.mock.calls[0][0].store).toBe(false);
  });
  it("exposes the actual request body and structured response without the API key", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    parse.mockResolvedValue({
      id: "response-1",
      model: "test-model",
      status: "completed",
      output: [],
      usage: { total_tokens: 100 },
      output_parsed: { ...empty, activity: "Skiing" },
    });
    const inspection = await inspectExtraction("Going skiing", now, {});
    expect(inspection.trace.request).toEqual(parse.mock.calls[0][0]);
    expect(inspection.trace.response).toMatchObject({
      id: "response-1",
      usage: { total_tokens: 100 },
      output_parsed: { activity: "Skiing" },
    });
    expect(JSON.stringify(inspection)).not.toContain("test-key");
    expect(inspection.changes).toEqual({ activity: "Skiing" });
  });
  it("does not fall back or expose provider error bodies after an API error", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    parse.mockRejectedValue(new Error("Sensitive provider error body"));
    await expect(
      extract("Ride at Chickadee in 30 minutes, no kids", now, {}),
    ).rejects.toThrow("The plan reader is unavailable. Please try again.");
  });
  it("rejects refusals and invalid dates without producing a draft", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    parse.mockResolvedValueOnce({ output_parsed: null });
    await expect(extract("hello", now, {})).rejects.toThrow("couldn't read");
    parse.mockResolvedValueOnce({
      output_parsed: {
        ...empty,
        startLocal: "not a date",
        startTimeEvidence: "now",
      },
    });
    await expect(extract("now", now, {})).rejects.toThrow("What time");
  });
});
