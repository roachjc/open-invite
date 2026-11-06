import { DateTime } from "luxon";
import { z } from "zod";
import type { PlanInput, Plan, AgeGroup, PlanDraft } from "./types";

export function ageGroupsDescription(groups: readonly AgeGroup[]): string {
  return groups.includes("kids") ? "With kids" : "";
}
export const planInputSchema = z.object({
  activity: z.string().trim().min(2, "What are you doing?").max(100),
  category: z.enum(["bike", "library", "walk", "park", "coffee", "other"]),
  ageGroups: z
    .array(z.enum(["kids", "adults"]))
    .min(1, "Which age groups are coming?")
    .transform((groups) => [...new Set(groups)].sort())
    .default(["adults"]),
  attendeeDetail: z.string().trim().max(140).default(""),
  place: z.string().trim().min(2, "Where are you going?").max(160),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }).nullable(),
  timezone: z
    .string()
    .refine(
      (zone) => DateTime.now().setZone(zone).isValid,
      "Choose a valid time zone.",
    ),
  note: z.string().trim().max(500).default(""),
});

export function normalizePlan(
  input: unknown,
): Omit<Plan, "id" | "participants" | "version" | "status"> {
  const data = planInputSchema.parse(input);
  const start = DateTime.fromISO(data.startsAt, { zone: data.timezone });
  const end = data.endsAt
    ? DateTime.fromISO(data.endsAt, { zone: data.timezone })
    : start.plus({ days: 1 }).startOf("day");
  if (!start.isValid || !end.isValid || end <= start)
    throw new Error("The end must be after the start.");
  return {
    ...data,
    startsAt: start.toUTC().toISO()!,
    endsAt: end.toUTC().toISO()!,
    endWasDefault: data.endsAt === null,
  };
}

export function planDescription(
  plan: Pick<
    PlanInput,
    | "activity"
    | "place"
    | "startsAt"
    | "timezone"
    | "ageGroups"
    | "attendeeDetail"
  >,
): string {
  const when = DateTime.fromISO(plan.startsAt)
    .setZone(plan.timezone)
    .toFormat("ccc, LLL d 'at' h:mma")
    .replace(/AM/g, "am")
    .replace(/PM/g, "pm");
  const attendees = [ageGroupsDescription(plan.ageGroups), plan.attendeeDetail]
    .filter(Boolean)
    .join(" · ");
  return `${plan.activity} at ${plan.place}. ${when}.${attendees ? ` ${attendees}.` : ""}`;
}

export function isCurrent(plan: Plan, now = DateTime.now()): boolean {
  return (
    plan.status === "shared" &&
    DateTime.fromISO(plan.endsAt) > now &&
    plan.participants.length > 0
  );
}

export function mergePlanDraft(
  current: PlanDraft,
  changes: PlanDraft,
  timezone: string,
): PlanDraft {
  const draft: PlanDraft = {
    attendeeDetail: "",
    note: "",
    endsAt: null,
    ...current,
    ...changes,
    timezone,
  };
  draft.ageGroups ??= ["adults"];
  if (changes.endsAt !== undefined && changes.durationMinutes === undefined) {
    delete draft.durationMinutes;
  }
  if (draft.durationMinutes && draft.startsAt && !changes.endsAt) {
    draft.endsAt = DateTime.fromISO(draft.startsAt)
      .plus({ minutes: draft.durationMinutes })
      .toUTC()
      .toISO()!;
  }
  return draft;
}
