import { DateTime } from "luxon";
import { z } from "zod";
import { inspectExtraction } from "./extraction";
import { planInputSchema, normalizePlan, mergePlanDraft } from "../plans";
import type { Person, Plan, PlanDraft } from "../types";

export const draftSchema = planInputSchema
  .partial()
  .extend({ durationMinutes: z.number().positive().optional() })
  .strict();

export type Inspection = {
  parser: "openai" | "examples";
  trace: { request: unknown; response: unknown; elapsedMs: number };
  changes: PlanDraft;
  draft: PlanDraft;
  missingFields: string[];
  planPreview: Omit<Plan, "id"> | null;
  validationError: string | null;
};

// Runs extraction and shows what would be published, without publishing.
export async function inspectMessage(
  person: Person,
  text: string,
  draft: PlanDraft,
): Promise<Inspection> {
  const { changes, trace } = await inspectExtraction(
    text,
    DateTime.now().setZone(person.timezone),
    draft,
  );
  const merged = mergePlanDraft(draft, changes, person.timezone);
  const missingFields = [
    !merged.activity && "activity",
    !merged.ageGroups?.length && "ageGroups",
    !merged.place && "place",
    !merged.startsAt && "startsAt",
  ].filter((field): field is string => Boolean(field));
  let planPreview: Inspection["planPreview"] = null;
  let validationError: string | null = null;
  if (!missingFields.length) {
    try {
      planPreview = {
        ...normalizePlan({
          attendeeDetail: "",
          note: "",
          endsAt: null,
          category: "other",
          ...merged,
        }),
        participants: [person.id],
        status: "shared",
        version: 1,
      };
      if (
        DateTime.fromISO(planPreview.startsAt) <
        DateTime.now().minus({ minutes: 5 })
      ) {
        validationError = "Choose a start time that hasn't passed.";
        planPreview = null;
      }
    } catch (error) {
      validationError =
        error instanceof Error ? error.message : "Check the plan details.";
    }
  }
  return {
    parser: trace.parser,
    trace,
    changes,
    draft: merged,
    missingFields,
    planPreview,
    validationError,
  };
}

export type InspectionRun = {
  text: string;
  submittedDraft: PlanDraft;
  result: Inspection;
};
