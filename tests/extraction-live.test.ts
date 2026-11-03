import { describe, it, expect } from "vitest";
import { DateTime } from "luxon";
import { extract } from "@/lib/server/extraction";
import { Store } from "@/lib/server/database";
import { processMessage } from "@/lib/server/messages";

// Explicit opt-in keeps routine tests offline and avoids API charges.
describe.skipIf(process.env.OPEN_INVITE_LIVE_AI_TEST !== "true")(
  "live OpenAI extraction",
  () => {
    const now = DateTime.fromISO("2026-10-30T09:00:00", {
      zone: "America/Los_Angeles",
    });
    it("extracts a ride, relative time, duration and adult attendees", async () => {
      expect(process.env.OPENAI_API_KEY).toBeTruthy();
      const result = await extract(
        "I'm going mountain biking at Chickadee in 30 minutes for two hours, no kids.",
        now,
        {},
      );
      expect(result.activity?.toLowerCase()).toContain("mountain biking");
      expect(result.place).toBe("Chickadee");
      expect(result.ageGroups).toEqual(["adults"]);
      expect(result.attendeeDetail).toBeUndefined();
      expect(result.startsAt).toBe("2026-10-30T16:30:00.000Z");
      expect(result.endsAt).toBe("2026-10-30T18:30:00.000Z");
    }, 45000);
    it("preserves a skiing activity and records children without inventing a location", async () => {
      const result = await extract(
        "Taking my five-year-old cross-country skiing tomorrow at 10am.",
        now,
        {},
      );
      expect(result.activity?.toLowerCase()).toMatch(/cross.country skiing/);
      expect(result.place).toBeUndefined();
      expect(result.ageGroups?.slice().sort()).toEqual(["adults", "kids"]);
      expect(result.attendeeDetail).toMatch(/five|5/);
      expect(result.startsAt).toBe("2026-10-31T17:00:00.000Z");
    }, 45000);
    it("leaves the time, place and attendees unresolved in a vague skiing message", async () => {
      const result = await extract(
        "Going skiing tomorrow, everyone welcome",
        now,
        {},
      );
      expect(result.activity?.toLowerCase()).toBe("skiing");
      expect(result.place).toBeUndefined();
      expect(result.startsAt).toBeUndefined();
      expect(result.ageGroups).toBeUndefined();
    }, 45000);
    it("defaults to adults and completes an isolated draft on follow-up", async () => {
      const store = new Store(":memory:");
      store.seed(now);
      try {
        const count = store.rows("plans").length;
        const first = await processMessage(
          store,
          "jon",
          "Mountain biking at Chickadee, everyone welcome.",
          "live-first",
          now,
        );
        expect(first.planId).toBeNull();
        expect(store.getDraft("jon").ageGroups).toEqual(["adults"]);
        expect(store.rows("plans")).toHaveLength(count);
        const next = await processMessage(
          store,
          "jon",
          "Tomorrow at noon",
          "live-next",
          now.plus({ minutes: 2 }),
        );
        expect(next.planId).toBeTruthy();
        expect(store.plan(next.planId!).ageGroups).toEqual(["adults"]);
        expect(store.plan(next.planId!).place).toBe("Chickadee");
        expect(store.plan(next.planId!).startsAt).toBe(
          "2026-10-31T19:00:00.000Z",
        );
      } finally {
        store.db.close();
      }
    }, 90000);
  },
);
