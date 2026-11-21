import type { APIRoute } from "astro";
import { z } from "zod";
import { getStore } from "@/lib/server/database";
import { identity, errorResponse, checkOrigin } from "@/lib/server/http";
const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("join") }),
  z.object({ action: z.literal("leave") }),
  z.object({
    action: z.literal("edit"),
    version: z.number().int().positive(),
    input: z.unknown(),
  }),
]);
export const POST: APIRoute = async ({ request, cookies, params }) => {
  try {
    checkOrigin(request);
    const personId = identity(cookies);
    const id = params.id!;
    const body = actionSchema.parse(await request.json());
    const store = getStore();
    const plan =
      body.action === "edit"
        ? store.edit(personId, id, body.version, body.input)
        : store.participate(personId, id, body.action === "join");
    return Response.json({ plan });
  } catch (error) {
    return errorResponse(error);
  }
};
