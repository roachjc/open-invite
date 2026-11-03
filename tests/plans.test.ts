import { afterEach, describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import { Store } from "@/lib/server/database";
import { normalizePlan, mergePlanDraft } from "@/lib/plans";
import { parseExample } from "@/lib/server/extraction";
import { processMessage } from "@/lib/server/messages";
import type { PlanInput, Notice, Plan } from "@/lib/types";

const zone = "America/Los_Angeles";
function input(overrides: Partial<PlanInput> = {}): PlanInput {
  return {
    activity: "Mountain biking",
    category: "bike",
    ageGroups: ["adults"],
    attendeeDetail: "",
    place: "Chickity",
    startsAt: DateTime.now().plus({ days: 2 }).toISO()!,
    endsAt: null,
    timezone: zone,
    note: "",
    ...overrides,
  };
}
const stores: Store[] = [];
function store() {
  const db = new Store(":memory:");
  db.seed();
  stores.push(db);
  return db;
}
afterEach(() => stores.splice(0).forEach((s) => s.db.close()));

describe("plan rules", () => {
  it("uses local midnight, including the 25-hour day when daylight saving ends", () => {
    const plan = normalizePlan(
      input({ startsAt: "2026-11-01T00:15:00-07:00" }),
    );
    expect(plan.endsAt).toBe("2026-11-02T08:00:00.000Z");
    expect(plan.endWasDefault).toBe(true);
  });
  it("does not assume a company type and rejects end before start", () => {
    expect(
      normalizePlan({ ...input(), ageGroups: undefined }).ageGroups,
    ).toEqual(["adults"]);
    expect(() =>
      normalizePlan(
        input({
          startsAt: "2026-11-01T12:00:00-08:00",
          endsAt: "2026-11-01T11:00:00-08:00",
        }),
      ),
    ).toThrow("after");
  });
  it("lets any participant edit, not other circle members, and detects stale updates", () => {
    const db = store();
    const plan = db.create("jon", input());
    expect(() => db.edit("eric", plan.id, plan.version, input())).toThrow(
      "Join",
    );
    const joined = db.participate("eric", plan.id, true);
    const edited = db.edit(
      "eric",
      plan.id,
      joined.version,
      input({ place: "Cedar loop" }),
    );
    expect(edited.place).toBe("Cedar loop");
    expect(() => db.edit("jon", plan.id, joined.version, input())).toThrow(
      "Someone changed",
    );
    expect(
      db
        .rows<Notice>("notices")
        .filter((n) => n.kind === "change")
        .map((n) => n.recipientId),
    ).toEqual(["jon"]);
  });
  it("does not expand the audience when people join or cancel the plan when its first participant leaves", () => {
    const db = store();
    const plan = db.create("jon", input());
    expect(
      db.rows<Notice>("notices").filter((n) => n.kind === "new"),
    ).toHaveLength(5);
    db.participate("eric", plan.id, true);
    const remaining = db.participate("jon", plan.id, false);
    expect(remaining.status).toBe("shared");
    expect(remaining.participants).toEqual(["eric"]);
    expect(db.participate("eric", plan.id, false).status).toBe("withdrawn");
  });
  it("joining twice is idempotent and strangers cannot join", () => {
    const db = store();
    const plan = db.create("jon", input());
    db.participate("eric", plan.id, true);
    const count = db.rows("notices").length;
    db.participate("eric", plan.id, true);
    expect(db.rows("notices")).toHaveLength(count);
    expect(() => db.participate("stranger", plan.id, true)).toThrow("not in");
  });
});

describe("text posting", () => {
  const now = DateTime.fromISO("2026-10-26T10:00:00", { zone });
  const offline = async (text: string, ref: DateTime) =>
    parseExample(text, ref);
  it("extracts supplied fields and leaves age-group defaults to draft merging", () => {
    const result = parseExample(
      "Mountain biking at Chickity in 30 minutes for two hours",
      now,
    );
    expect(result.place).toBe("Chickity");
    expect(result.ageGroups).toBeUndefined();
    expect(result.startsAt).toBe("2026-10-26T17:30:00.000Z");
    expect(result.endsAt).toBe("2026-10-26T19:30:00.000Z");
  });
  it("keeps a private draft across a follow-up, then publishes once", async () => {
    const db = store();
    const before = db.rows("plans").length;
    const draft = await processMessage(
      db,
      "jon",
      "Mountain biking at Chickity",
      "first",
      now,
      offline,
    );
    expect(draft.reply).toContain("when");
    expect(db.getDraft("jon").ageGroups).toEqual(["adults"]);
    expect(draft.planId).toBeNull();
    expect(db.rows("plans")).toHaveLength(before);
    const published = await processMessage(
      db,
      "jon",
      "tomorrow at noon",
      "second",
      now.plus({ minutes: 2 }),
      offline,
    );
    expect(published.planId).not.toBeNull();
    expect(db.plan(published.planId!).startsAt).toBe(
      "2026-10-27T19:00:00.000Z",
    );
    const replay = await processMessage(
      db,
      "jon",
      "tomorrow at noon",
      "second",
      now.plus({ minutes: 3 }),
      offline,
    );
    expect(replay).toEqual(published);
    expect(db.rows("plans")).toHaveLength(before + 1);
  });
  it("retains company context and can discard an unfinished draft", async () => {
    const db = store();
    const result = await processMessage(
      db,
      "sarah",
      "Going to the library on Saturday at 10am with my five-year-old, for an hour.",
      "kids",
      now,
      offline,
    );
    const plan = db.plan(result.planId!);
    expect(plan.ageGroups).toEqual(["adults", "kids"]);
    expect(plan.attendeeDetail).toBe("five-year-old");
    await processMessage(db, "jon", "Going biking", "partial", now, offline);
    await processMessage(db, "jon", "cancel", "cancel", now, offline);
    expect(db.getDraft("jon")).toEqual({});
  });
  it("does not reveal one person's draft or notices through another person's thread", async () => {
    const db = store();
    await processMessage(db, "jon", "Going biking", "jon-draft", now, offline);
    expect(db.getDraft("eric")).toEqual({});
    const existing = db.rows<Plan>("plans").length;
    await processMessage(db, "eric", "no kids", "eric-draft", now, offline);
    expect(db.rows("plans")).toHaveLength(existing);
  });
});

it("preserves an optional duration while asking for a missing start time", async () => {
  const db = store();
  const now = DateTime.now().setZone(zone);
  const offline = async (text: string, ref: DateTime) =>
    parseExample(text, ref);
  await processMessage(
    db,
    "jon",
    "Mountain biking at Chickity, no kids, for two hours",
    "duration-first",
    now,
    offline,
  );
  const result = await processMessage(
    db,
    "jon",
    "tomorrow at noon",
    "duration-second",
    now,
    offline,
  );
  const plan = db.plan(result.planId!);
  expect(
    DateTime.fromISO(plan.endsAt).diff(
      DateTime.fromISO(plan.startsAt),
      "minutes",
    ).minutes,
  ).toBe(120);
  expect(plan.endWasDefault).toBe(false);
});

describe("age groups", () => {
  const now = DateTime.now().setZone(zone);
  it.each(["no kids", "without children", "no kids, everyone welcome"])(
    "recognizes %s as no children coming",
    (text) => {
      expect(parseExample(text, now).ageGroups).toEqual(["adults"]);
    },
  );
  it("records kids coming even when adults without kids are invited", () => {
    expect(
      parseExample("With kids, adults are welcome too", now).ageGroups,
    ).toEqual(["kids", "adults"]);
  });
  it.each(["everyone welcome", "anyone can come", "kids welcome too"])(
    "does not infer children are coming from %s",
    (text) => {
      expect(parseExample(text, now).ageGroups).toBeUndefined();
    },
  );
  it.each(["no_kids", "with_kids", "anyone"])(
    "rejects the removed %s option in new plans",
    (company) => {
      expect(() =>
        normalizePlan({ ...input(), ageGroups: [company] }),
      ).toThrow();
    },
  );
});

it("defaults new drafts to adults and retains or replaces explicit age groups on follow-up", () => {
  const adultDraft = mergePlanDraft({}, { activity: "Mountain biking" }, zone);
  expect(adultDraft.ageGroups).toEqual(["adults"]);
  const familyDraft = mergePlanDraft(
    adultDraft,
    { ageGroups: ["kids", "adults"] },
    zone,
  );
  expect(
    mergePlanDraft(familyDraft, { place: "Chickadee" }, zone).ageGroups,
  ).toEqual(["kids", "adults"]);
  expect(
    mergePlanDraft(familyDraft, { ageGroups: ["adults"] }, zone).ageGroups,
  ).toEqual(["adults"]);
});

it("keeps a corrected end time through later follow-ups instead of reusing an old duration", () => {
  const original = mergePlanDraft(
    {},
    {
      startsAt: "2026-11-10T18:00:00.000Z",
      durationMinutes: 120,
      endsAt: "2026-11-10T20:00:00.000Z",
    },
    zone,
  );
  const corrected = mergePlanDraft(
    original,
    {
      endsAt: "2026-11-10T21:00:00.000Z",
    },
    zone,
  );
  expect(corrected.durationMinutes).toBeUndefined();
  const followUp = mergePlanDraft(corrected, { place: "River path" }, zone);
  expect(followUp.endsAt).toBe("2026-11-10T21:00:00.000Z");
  const defaultEnd = mergePlanDraft(original, { endsAt: null }, zone);
  expect(
    mergePlanDraft(defaultEnd, { place: "River path" }, zone).endsAt,
  ).toBeNull();
  const newDuration = mergePlanDraft(corrected, { durationMinutes: 60 }, zone);
  expect(newDuration.endsAt).toBe("2026-11-10T19:00:00.000Z");
});

it("publishes a complete message without asking for age groups", async () => {
  const db = store();
  const now = DateTime.now().setZone(zone);
  const result = await processMessage(
    db,
    "jon",
    "Mountain biking at Chickadee tomorrow at noon",
    "default-adults",
    now,
    async (text, ref) => parseExample(text, ref),
  );
  expect(result.planId).toBeTruthy();
  expect(db.plan(result.planId!).ageGroups).toEqual(["adults"]);
});
