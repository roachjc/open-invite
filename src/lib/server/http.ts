import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { getStore, ServiceError } from "./database";

export function localOnly() {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.OPEN_INVITE_LOCAL_DEMO !== "true"
  )
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
export async function identity() {
  localOnly();
  const id = (await cookies()).get("open-invite-demo-person")?.value || "jon";
  getStore().person(id);
  return id;
}
export function errorResponse(error: unknown) {
  if (error instanceof ZodError)
    return NextResponse.json(
      { error: error.issues[0]?.message || "Please check the plan details." },
      { status: 400 },
    );
  if (error instanceof ServiceError)
    return NextResponse.json(
      { error: error.message },
      { status: error.status },
    );
  if (error instanceof SyntaxError)
    return NextResponse.json(
      { error: "That request wasn't valid JSON." },
      { status: 400 },
    );
  console.error(
    "Request failed:",
    error instanceof Error ? error.name : "unknown",
  );
  return NextResponse.json(
    {
      error:
        error instanceof Error &&
        !/api|key|token|sqlite|fetch|connect/i.test(error.message)
          ? error.message
          : "Something went wrong. Please try again.",
    },
    { status: 400 },
  );
}
