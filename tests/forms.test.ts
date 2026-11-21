import { describe, expect, it, vi } from "vitest";
import { DateTime } from "luxon";
import { planFormValues, readPlanForm } from "@/lib/server/forms";
import { groupByDay } from "@/lib/server/format";
import { safeReturn } from "@/lib/server/http";
import { finish } from "@/lib/server/respond";
import type { Plan } from "@/lib/types";

const zone = "America/Los_Angeles";
const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
};

describe("plan form", () => {
  it("reads wall-clock times in the plan's zone", () => {
    const { input, error } = readPlanForm(
      form({
        activity: "Gravel ride",
        place: "River road",
        start: "2026-12-01T09:30",
        end: "",
        withKids: "on",
      }),
      zone,
    );
    expect(error).toBeUndefined();
    expect(input).toMatchObject({
      category: "bike",
      ageGroups: ["adults", "kids"],
      endsAt: null,
      timezone: zone,
    });
    expect(DateTime.fromISO(input!.startsAt).toUTC().toISO()).toBe(
      "2026-12-01T17:30:00.000Z",
    );
  });
  it("keeps what was typed when the times are invalid", () => {
    const result = readPlanForm(
      form({ activity: "Run", place: "Cedar loop", start: "not a time" }),
      zone,
    );
    expect(result.error).toBe("Check the start and end times.");
    expect(result.values).toMatchObject({
      activity: "Run",
      place: "Cedar loop",
    });
  });
  it("fills an edit form without an end that was only a default", () => {
    const plan = {
      activity: "Hike",
      ageGroups: ["adults"],
      attendeeDetail: "",
      place: "Cedar loop",
      startsAt: "2026-12-01T17:30:00.000Z",
      endsAt: "2026-12-02T08:00:00.000Z",
      endWasDefault: true,
      note: "",
    } as unknown as Plan;
    expect(planFormValues(plan, zone)).toMatchObject({
      start: "2026-12-01T09:30",
      end: "",
      withKids: false,
    });
  });
});

describe("rendering helpers", () => {
  it("groups plans by local day", () => {
    const days = groupByDay(
      [
        { startsAt: "2026-12-01T17:00:00.000Z" },
        { startsAt: "2026-12-02T07:00:00.000Z" },
        { startsAt: "2026-12-02T09:00:00.000Z" },
      ],
      zone,
    );
    expect(days.map((day) => [day.date, day.plans.length])).toEqual([
      ["Tue, Dec 1", 2],
      ["Wed, Dec 2", 1],
    ]);
  });
  it("only returns to same-site paths after a form post", () => {
    expect(safeReturn("/?filter=kids")).toBe("/?filter=kids");
    expect(safeReturn("//evil.example")).toBe("/");
    expect(safeReturn("/\\evil.example")).toBe("/");
    expect(safeReturn("https://evil.example")).toBe("/");
    expect(safeReturn(null, "/texts")).toBe("/texts");
  });
});

describe("finishing a form submission", () => {
  const context = (headers: Record<string, string>) => ({
    request: new Request("http://localhost/identity", {
      method: "POST",
      headers,
    }),
    url: new URL("http://localhost/identity"),
    locals: {} as App.Locals,
    cookies: { set: vi.fn() },
    redirect: vi.fn(() => new Response(null, { status: 303 })),
    rewrite: vi.fn(async (request: Request) => new Response(request.url)),
  });
  it("redirects plain browsers and keeps the message in a cookie", () => {
    const plain = context({});
    finish(plain as unknown as Parameters<typeof finish>[0], "/texts", "Done.");
    expect(plain.redirect).toHaveBeenCalledWith("/texts", 303);
    expect(plain.cookies.set).toHaveBeenCalled();
  });
  it("renders the destination for the script, with updated cookies", async () => {
    const enhanced = context({
      "x-open-invite-enhanced": "1",
      cookie: "open-invite-demo-person=jon; other=1",
      "content-type": "application/x-www-form-urlencoded",
    });
    await finish(
      enhanced as unknown as Parameters<typeof finish>[0],
      "/circle",
      "Switched.",
      {
        "open-invite-demo-person": "eric",
      },
    );
    const request = enhanced.rewrite.mock.calls[0][0];
    expect(request.method).toBe("GET");
    expect(request.url).toBe("http://localhost/circle");
    expect(request.headers.get("cookie")).toBe(
      "open-invite-demo-person=eric; other=1",
    );
    expect(request.headers.has("x-open-invite-enhanced")).toBe(false);
    expect(enhanced.locals).toEqual({
      flash: "Switched.",
      location: "/circle",
    });
  });
});
