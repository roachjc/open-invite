import type { APIRoute } from "astro";
import { checkOrigin, localOnly, errorResponse } from "@/lib/server/http";
import { getStore } from "@/lib/server/database";
export const POST: APIRoute = ({ request }) => {
  try {
    localOnly();
    checkOrigin(request);
    getStore().reset();
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
};
