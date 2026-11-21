import type { APIRoute } from "astro";
// Fail closed until real membership, hosted persistence, and delivery jobs are connected.
export const POST: APIRoute = () =>
  Response.json(
    { error: "Live SMS is not connected. Use the local text simulator." },
    { status: 503 },
  );
