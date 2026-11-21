import type { AstroCookies } from "astro";

const FLASH_COOKIE = "open-invite-flash";
// Prefetches and background refreshes must not consume a pending message.
export const BACKGROUND_HEADER = "x-open-invite-background";

export function setFlash(cookies: AstroCookies, message: string) {
  cookies.set(FLASH_COOKIE, message, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60,
  });
}
export function takeFlash(
  cookies: AstroCookies,
  request: Request,
  locals: App.Locals,
) {
  if (locals.flash !== undefined) return locals.flash;
  if (request.headers.has(BACKGROUND_HEADER)) return null;
  const message = cookies.get(FLASH_COOKIE)?.value;
  if (message) cookies.delete(FLASH_COOKIE, { path: "/" });
  return message || null;
}
