import type { APIRoute } from "astro";
import { getStore } from "@/lib/server/database";
import { identity, errorResponse, checkOrigin } from "@/lib/server/http";
export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    checkOrigin(request);
    const id = identity(cookies);
    const plan = getStore().create(id, await request.json());
    return Response.json({ plan }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
};
