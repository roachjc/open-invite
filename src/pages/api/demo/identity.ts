import type { APIRoute } from "astro";
import { z } from "zod";
import { getStore } from "@/lib/server/database";
import {
  checkOrigin,
  localOnly,
  errorResponse,
  IDENTITY_COOKIE,
} from "@/lib/server/http";
export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    localOnly();
    checkOrigin(request);
    const { personId } = z
      .object({ personId: z.string() })
      .parse(await request.json());
    getStore().person(personId);
    cookies.set(IDENTITY_COOKIE, personId, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
};
