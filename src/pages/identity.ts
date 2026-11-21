import type { APIRoute } from "astro";
import { getStore } from "@/lib/server/database";
import { finish } from "@/lib/server/respond";
import {
  checkOrigin,
  localOnly,
  safeReturn,
  IDENTITY_COOKIE,
} from "@/lib/server/http";

// Form counterpart of /api/demo/identity for the sidebar switcher.
export const POST: APIRoute = async (context) => {
  const { request, cookies } = context;
  localOnly();
  checkOrigin(request);
  const data = await request.formData();
  const personId = String(data.get("personId") ?? "");
  getStore().person(personId);
  cookies.set(IDENTITY_COOKIE, personId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return finish(
    context,
    safeReturn(data.get("return")),
    "Switched perspective.",
    { [IDENTITY_COOKIE]: personId },
  );
};
