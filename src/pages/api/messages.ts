import type { APIRoute } from "astro";
import { z } from "zod";
import { getStore } from "@/lib/server/database";
import { processMessage } from "@/lib/server/messages";
import { identity, errorResponse, checkOrigin } from "@/lib/server/http";
export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    checkOrigin(request);
    const id = identity(cookies);
    const { body, messageId } = z
      .object({
        body: z.string().trim().min(1).max(1500),
        messageId: z.uuid(),
      })
      .parse(await request.json());
    return Response.json(await processMessage(getStore(), id, body, messageId));
  } catch (error) {
    return errorResponse(error);
  }
};
