import type { APIRoute } from "astro";
import { z } from "zod";
import { getStore } from "@/lib/server/database";
import { identity, checkOrigin, errorResponse } from "@/lib/server/http";
import { draftSchema, inspectMessage } from "@/lib/server/inspect";

const requestSchema = z
  .object({
    text: z.string().trim().min(1).max(1500),
    draft: draftSchema.default({}),
  })
  .strict();

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    checkOrigin(request);
    const person = getStore().person(identity(cookies));
    const { text, draft } = requestSchema.parse(await request.json());
    return Response.json(await inspectMessage(person, text, draft), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
};
