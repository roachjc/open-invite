import { defineMiddleware } from "astro:middleware";
import { createHash } from "node:crypto";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";
import { localOnly, publicError, safeReturn } from "@/lib/server/http";
import { setFlash } from "@/lib/server/flash";
import { LOCATION_HEADER, PARTIAL_HEADER } from "@/lib/server/respond";

const escape = (text: string) =>
  text.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

function statusPage(message: string, status: number) {
  return new Response(
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Open Invite</title><body style="font:15px/1.5 system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#f3f4f3;color:#131816"><main style="text-align:center;padding:24px"><h1 style="font-size:26px">Open Invite</h1><p>${escape(message)}</p><p><a href="/" style="color:#385d43">Back to the plans</a></p></main>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

// Same-origin referrer path, used to return a failed form submission.
function referrerPath(request: Request) {
  const referrer = request.headers.get("referer");
  if (!referrer) return "/";
  const url = new URL(referrer);
  return url.host === new URL(request.url).host
    ? safeReturn(url.pathname + url.search)
    : "/";
}

function compress(body: Uint8Array, accept: string) {
  if (/\bbr\b/.test(accept))
    return {
      encoding: "br",
      body: brotliCompressSync(body, {
        params: {
          [constants.BROTLI_PARAM_QUALITY]: 5,
          [constants.BROTLI_PARAM_SIZE_HINT]: body.length,
        },
      }),
    };
  if (/\bgzip\b/.test(accept))
    return { encoding: "gzip", body: gzipSync(body, { level: 6 }) };
  return null;
}

export const onRequest = defineMiddleware(async (context, next) => {
  const { request, url } = context;
  const isApi = url.pathname.startsWith("/api/");
  let response: Response;
  try {
    if (!isApi) localOnly();
    response = await next();
  } catch (error) {
    if (isApi) throw error;
    const { message, status } = publicError(error);
    if (request.method !== "POST") return statusPage(message, status);
    setFlash(context.cookies, message);
    return context.redirect(referrerPath(request), 303);
  }

  const type = response.headers.get("content-type") || "";
  const html = type.startsWith("text/html");
  const location = context.locals.location;
  if (
    response.status === 304 ||
    response.status === 204 ||
    !response.body ||
    !(html || type.includes("json")) ||
    // A rewritten page has already been through this middleware.
    response.headers.has("content-encoding")
  ) {
    if (!location) return response;
    const headers = new Headers(response.headers);
    headers.set(LOCATION_HEADER, location);
    return new Response(response.body, { status: response.status, headers });
  }

  // Pages are small, so buffering lets us validate and compress them.
  let body = new Uint8Array(await response.arrayBuffer());
  const headers = new Headers(response.headers);
  if (html) {
    headers.append("Vary", PARTIAL_HEADER);
    // The script only uses the title and the app's markup.
    if (request.headers.has(PARTIAL_HEADER)) {
      const page = new TextDecoder().decode(body);
      const title = page.match(/<title>[\s\S]*?<\/title>/)?.[0];
      const app = page.match(
        /<div id="app"[\s\S]*(?=<template id="toast-template">)/,
      )?.[0];
      if (title && app)
        body = new TextEncoder().encode(
          `<!DOCTYPE html><html><head>${title}</head><body>${app}</body></html>`,
        );
    }
  }
  if (location) headers.set(LOCATION_HEADER, location);
  if (html && request.method === "GET" && response.status === 200) {
    // Per-person pages: browsers may keep a copy but must revalidate.
    const etag = `W/"${createHash("sha1").update(body).digest("base64url")}"`;
    headers.set("ETag", etag);
    headers.set("Cache-Control", "private, no-cache");
    headers.append("Vary", "Cookie");
    if (request.headers.get("if-none-match") === etag)
      return new Response(null, { status: 304, headers });
  }
  const packed =
    import.meta.env.PROD && body.length > 1024
      ? compress(body, request.headers.get("accept-encoding") || "")
      : null;
  if (packed) {
    headers.set("Content-Encoding", packed.encoding);
    headers.append("Vary", "Accept-Encoding");
  }
  headers.delete("Content-Length");
  return new Response(packed ? packed.body : body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
});
