import { NextResponse } from "next/server";
import { DateTime } from "luxon";
import { z } from "zod";
import { inspectExtraction } from "@/lib/server/extraction";
import { getStore } from "@/lib/server/database";
import { identity, checkOrigin, errorResponse } from "@/lib/server/http";
import { planInputSchema, normalizePlan, mergePlanDraft } from "@/lib/plans";

const requestSchema = z
  .object({
    text: z.string().trim().min(1).max(1500),
    draft: planInputSchema
      .partial()
      .extend({ durationMinutes: z.number().positive().optional() })
      .strict()
      .default({}),
  })
  .strict();

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const person = getStore().person(await identity());
    const { text, draft } = requestSchema.parse(await request.json());
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
    ].filter(Boolean);
    let planPreview = null;
    let validationError = null;
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
    return NextResponse.json(
      {
        parser: trace.parser,
        trace,
        changes,
        draft: merged,
        missingFields,
        planPreview,
        validationError,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
