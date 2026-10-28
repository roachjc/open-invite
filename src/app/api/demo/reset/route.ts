import { NextResponse } from "next/server";
import { checkOrigin, localOnly, errorResponse } from "@/lib/server/http";
import { getStore } from "@/lib/server/database";
export async function POST(request: Request) {
  try {
    localOnly();
    checkOrigin(request);
    getStore().reset();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
