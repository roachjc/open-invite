import { test, expect } from "@playwright/test";
import { DateTime } from "luxon";

test.beforeEach(async ({ request }) => {
  await request.post("/api/demo/reset", { data: {} });
});
test.afterAll(async ({ request }) => {
  await request.post("/api/demo/reset", { data: {} });
});

test("browse, join, edit as an equal participant, and leave without cancelling the others", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "What are we doing?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "This weekend", exact: true }).click();
  await page.getByLabel("Filter by age group").selectOption("kids");
  await expect(page.locator(".plan-card")).toHaveCount(2);
  await page.getByLabel("Filter by age group").selectOption("all");
  await page.getByRole("button", { name: "Coming up", exact: true }).click();
  await page
    .getByRole("button", { name: "View A ride at Chickity", exact: true })
    .click();
  await page.getByRole("button", { name: "I'm coming", exact: true }).click();
  await expect(page.getByText("You're going. See you there.")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Jon (you)", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Edit plan", exact: true }).click();
  await page
    .getByLabel("Where?", { exact: true })
    .fill("Chickity north entrance");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(
    page
      .getByRole("dialog")
      .getByText("Chickity north entrance", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "I can't make it", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "I'm coming", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".detail-person")).toHaveCount(2);
});

test("share a plan from the form, preserve it across reloads, and default its end to midnight", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Share a plan", exact: true }).click();
  await page
    .getByLabel("What are you doing?", { exact: true })
    .fill("An evening walk");
  await page.getByRole("checkbox", { name: "Adults", exact: true }).check();
  await page.getByLabel("Where?", { exact: true }).fill("River path");
  await page
    .getByLabel("When?", { exact: true })
    .fill(
      DateTime.now()
        .setZone("America/Los_Angeles")
        .plus({ days: 1 })
        .set({ hour: 17, minute: 0 })
        .toFormat("yyyy-MM-dd'T'HH:mm"),
    );
  await page.getByRole("button", { name: "Share with the circle" }).click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("heading", { name: "An evening walk", exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/until the end of the day/)).toBeVisible();
  await page.reload();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("heading", { name: "An evening walk", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Jon (you)", { exact: true })).toBeVisible();
});

test("text follow-ups hold a draft until all four required details are present", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Try a text", exact: true }).click();
  await page
    .getByLabel("Your text to the service")
    .fill("Mountain biking at Chickity");
  await page.getByRole("button", { name: "Send text" }).click();
  await expect(page.getByText(/Before I share it, tell me when/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "View plan", exact: true }),
  ).toHaveCount(0);
  await page.getByLabel("Your text to the service").fill("tomorrow at noon");
  await page.getByRole("button", { name: "Send text" }).click();
  await expect(page.getByText(/Shared with your circle/)).toBeVisible();
  await page.getByRole("button", { name: "View plan", exact: true }).click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("heading", { name: "Mountain biking", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByLabel("Preview as a friend").selectOption("eric");
  await page.getByRole("button", { name: /^Notifications/ }).click();
  await expect(
    page.getByText(/Mountain biking at Chickity.*Jon going/),
  ).toBeVisible();
});

test("mobile browsing fits the screen and supports joining", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "What are we doing?" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "View A ride at Chickity", exact: true })
    .click();
  await page.getByRole("button", { name: "I'm coming", exact: true }).click();
  await expect(page.getByText("You're going. See you there.")).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: "Our circle", exact: false }).click();
  await expect(
    page.getByRole("heading", { name: "The usual people.", exact: true }),
  ).toBeVisible();
});

test("notification switch persists per person and controls new previews", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Notifications/ }).click();
  const toggle = page.getByRole("switch", { name: "Text notifications" });
  await expect(toggle).toBeChecked();
  await toggle.click();
  await expect(toggle).not.toBeChecked();
  await page.reload();
  await page.getByRole("button", { name: /Notifications/ }).click();
  await expect(toggle).not.toBeChecked();
  const details = {
    activity: "Mountain biking",
    category: "bike",
    ageGroups: ["adults"],
    attendeeDetail: "",
    place: "Chickity",
    startsAt: DateTime.now().plus({ days: 2 }).toISO(),
    endsAt: null,
    timezone: "America/Los_Angeles",
    note: "",
  };
  await request.post("/api/demo/identity", { data: { personId: "eric" } });
  expect((await request.get("/api/state")).ok()).toBe(true);
  expect((await request.post("/api/plans", { data: details })).ok()).toBe(true);
  await request.post("/api/demo/identity", { data: { personId: "jon" } });
  const muted = await (await request.get("/api/state")).json();
  expect(muted.notices).toHaveLength(0);
  expect(muted.notificationPreferences.enabled).toBe(false);
  await toggle.click();
  await expect(toggle).toBeChecked();
  await request.post("/api/demo/identity", { data: { personId: "eric" } });
  const eric = await (await request.get("/api/state")).json();
  expect(eric.notificationPreferences.enabled).toBe(true);
  expect((await request.post("/api/plans", { data: details })).ok()).toBe(true);
  await request.post("/api/demo/identity", { data: { personId: "jon" } });
  const active = await (await request.get("/api/state")).json();
  expect(active.notices).toHaveLength(1);
  expect(
    (
      await request.post("/api/notification-preferences", {
        data: { enabled: "false" },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await request.post("/api/notification-preferences", {
        data: { enabled: false, personId: "eric" },
      })
    ).status(),
  ).toBe(400);
});
