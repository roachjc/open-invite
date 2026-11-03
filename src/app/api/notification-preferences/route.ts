import { NextResponse } from "next/server";
import { z } from "zod";
import { getStore } from "@/lib/server/database";
import { identity, errorResponse, checkOrigin } from "@/lib/server/http";

const preferencesSchema = z.object({ enabled: z.boolean() }).strict();

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const id = await identity();
    const preferences = preferencesSchema.parse(await request.json());
    return NextResponse.json(
      getStore().setNotificationPreferences(id, preferences),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
