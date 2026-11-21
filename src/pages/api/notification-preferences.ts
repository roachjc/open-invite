import type { APIRoute } from "astro";
import { z } from "zod";
import { getStore } from "@/lib/server/database";
import { identity, errorResponse, checkOrigin } from "@/lib/server/http";

const preferencesSchema = z.object({ enabled: z.boolean() }).strict();

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    checkOrigin(request);
    const id = identity(cookies);
    const preferences = preferencesSchema.parse(await request.json());
    return Response.json(
      getStore().setNotificationPreferences(id, preferences),
    );
  } catch (error) {
    return errorResponse(error);
  }
};
