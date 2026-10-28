import { NextResponse } from "next/server";
import { getStore } from "@/lib/server/database";
import { identity, errorResponse, checkOrigin } from "@/lib/server/http";
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const id = await identity();
    const plan = getStore().create(id, await request.json());
    return NextResponse.json({ plan }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
