import { NextResponse } from "next/server";
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
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    checkOrigin(request);
    const personId = await identity();
    const { id } = await context.params;
    const body = actionSchema.parse(await request.json());
    const store = getStore();
    const plan =
      body.action === "edit"
        ? store.edit(personId, id, body.version, body.input)
        : store.participate(personId, id, body.action === "join");
    return NextResponse.json({ plan });
  } catch (error) {
    return errorResponse(error);
  }
}
