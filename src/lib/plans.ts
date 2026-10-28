import { DateTime } from "luxon";
import { z } from "zod";
import type { PlanInput, Plan, Company } from "./types";

export const companyLabels: Record<Company, string> = {
  no_kids: "No kids",
  with_kids: "With kids",
};
export const planInputSchema = z.object({
  activity: z.string().trim().min(2, "What are you doing?").max(100),
  category: z.enum(["bike", "library", "walk", "park", "coffee", "other"]),
  company: z.enum(["no_kids", "with_kids"]),
  companyDetail: z.string().trim().max(140).default(""),
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
    "activity" | "place" | "startsAt" | "timezone" | "company" | "companyDetail"
  >,
): string {
  const when = DateTime.fromISO(plan.startsAt)
    .setZone(plan.timezone)
    .toFormat("ccc, LLL d 'at' h:mma")
    .replace(/AM/g, "am")
    .replace(/PM/g, "pm");
  return `${plan.activity} at ${plan.place}. ${when}. ${companyLabels[plan.company]}${plan.companyDetail ? ` (${plan.companyDetail})` : ""}.`;
}

export function isCurrent(plan: Plan, now = DateTime.now()): boolean {
  return (
    plan.status === "shared" &&
    DateTime.fromISO(plan.endsAt) > now &&
    plan.participants.length > 0
  );
}
