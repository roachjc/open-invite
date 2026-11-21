import { DateTime } from "luxon";
import { inferCategory } from "../plans";
import type { Plan, PlanInput } from "../types";
import { localInput } from "./format";

export type PlanFormValues = {
  activity: string;
  withKids: boolean;
  attendeeDetail: string;
  place: string;
  start: string;
  end: string;
  note: string;
};

export function planFormValues(
  plan: Plan | undefined,
  zone: string,
): PlanFormValues {
  if (!plan)
    return {
      activity: "",
      withKids: false,
      attendeeDetail: "",
      place: "",
      start: DateTime.now()
        .setZone(zone)
        .plus({ days: 1 })
        .set({ hour: 10, minute: 0, second: 0, millisecond: 0 })
        .toFormat("yyyy-MM-dd'T'HH:mm"),
      end: "",
      note: "",
    };
  return {
    activity: plan.activity,
    withKids: plan.ageGroups.includes("kids"),
    attendeeDetail: plan.attendeeDetail,
    place: plan.place,
    start: localInput(plan.startsAt, zone),
    end: plan.endWasDefault ? "" : localInput(plan.endsAt, zone),
    note: plan.note,
  };
}

// Converts the form's wall-clock times in the plan's zone into a plan input.
export function readPlanForm(
  data: FormData,
  zone: string,
): { values: PlanFormValues; input?: PlanInput; error?: string } {
  const text = (name: string) => String(data.get(name) ?? "");
  const values: PlanFormValues = {
    activity: text("activity"),
    withKids: data.has("withKids"),
    attendeeDetail: text("attendeeDetail"),
    place: text("place"),
    start: text("start"),
    end: text("end"),
    note: text("note"),
  };
  const from = DateTime.fromISO(values.start, { zone });
  const to = values.end ? DateTime.fromISO(values.end, { zone }) : null;
  if (!from.isValid || (to && !to.isValid))
    return { values, error: "Check the start and end times." };
  return {
    values,
    input: {
      activity: values.activity,
      category: inferCategory(values.activity),
      ageGroups: values.withKids ? ["adults", "kids"] : ["adults"],
      attendeeDetail: values.attendeeDetail,
      place: values.place,
      startsAt: from.toISO()!,
      endsAt: to ? to.toISO()! : null,
      timezone: zone,
      note: values.note,
    },
  };
}
