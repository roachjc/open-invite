import type { AstroCookies } from "astro";
import { setFlash } from "./flash";

// Sent by the enhancement script with form submissions.
export const ENHANCED_HEADER = "x-open-invite-enhanced";
// Sent by the script when it only needs the app's markup.
export const PARTIAL_HEADER = "x-open-invite-partial";
// Tells the script which page a submission ended on.
export const LOCATION_HEADER = "x-open-invite-location";

type Context = {
  request: Request;
  url: URL;
  locals: App.Locals;
  cookies: AstroCookies;
  redirect(path: string, status?: 301 | 302 | 303 | 307 | 308): Response;
  rewrite(payload: Request): Promise<Response>;
};

// Finishes a form submission. Plain browsers get a 303 redirect. The script
// gets the destination page directly, saving a round trip.
export function finish(
  context: Context,
  location: string,
  flash?: string | null,
  newCookies: Record<string, string> = {},
) {
  if (!context.request.headers.has(ENHANCED_HEADER)) {
    if (flash) setFlash(context.cookies, flash);
    return context.redirect(location, 303);
  }
  context.locals.flash = flash ?? null;
  context.locals.location = location;
  const headers = new Headers(context.request.headers);
  for (const name of ["content-type", "content-length", ENHANCED_HEADER])
    headers.delete(name);
  const jar = new Map(
    (headers.get("cookie") || "")
      .split(/;\s*/)
      .filter(Boolean)
      .map((pair) => {
        const at = pair.indexOf("=");
        return [pair.slice(0, at), pair.slice(at + 1)] as const;
      }),
  );
  for (const [name, value] of Object.entries(newCookies))
    jar.set(name, encodeURIComponent(value));
  headers.set(
    "cookie",
    [...jar].map(([name, value]) => `${name}=${value}`).join("; "),
  );
  return context.rewrite(
    new Request(new URL(location, context.url), { headers }),
  );
}
