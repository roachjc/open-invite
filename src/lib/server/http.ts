import { ZodError } from "zod";
import { getStore, ServiceError } from "./database";

export function localOnly() {
  // PROD is fixed at build time, so a production build fails closed even when
  // the server process starts without NODE_ENV.
  const production =
    import.meta.env.PROD || process.env.NODE_ENV === "production";
  if (production && process.env.OPEN_INVITE_LOCAL_DEMO !== "true")
    throw new ServiceError(
      "Hosted mode is not configured. This build is a local preview only.",
      503,
    );
}
export function checkOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host") || new URL(request.url).host;
  if (
    request.headers.get("sec-fetch-site") === "cross-site" ||
    (origin && new URL(origin).host !== host)
  )
    throw new ServiceError("Please make changes from the app.", 403);
}
export const IDENTITY_COOKIE = "open-invite-demo-person";
type CookieReader = { get(name: string): { value: string } | undefined };
export function identity(cookies: CookieReader) {
  localOnly();
  const id = cookies.get(IDENTITY_COOKIE)?.value || "jon";
  getStore().person(id);
  return id;
}
// Shared by the JSON API and server-rendered forms so both report errors the
// same way and never leak internal details.
export function publicError(error: unknown): {
  message: string;
  status: number;
} {
  if (error instanceof ZodError)
    return {
      message: error.issues[0]?.message || "Please check the plan details.",
      status: 400,
    };
  if (error instanceof ServiceError)
    return { message: error.message, status: error.status };
  if (error instanceof SyntaxError)
    return { message: "That request wasn't valid JSON.", status: 400 };
  console.error(
    "Request failed:",
    error instanceof Error ? error.name : "unknown",
  );
  return {
    message:
      error instanceof Error &&
      !/api|key|token|sqlite|fetch|connect/i.test(error.message)
        ? error.message
        : "Something went wrong. Please try again.",
    status: 400,
  };
}
export function errorResponse(error: unknown) {
  const { message, status } = publicError(error);
  return Response.json({ error: message }, { status });
}
// Only follow same-site relative paths after a form post.
export function safeReturn(value: unknown, fallback = "/"): string {
  return typeof value === "string" && /^\/(?![/\\])/.test(value)
    ? value
    : fallback;
}
