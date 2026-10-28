import { NextResponse } from "next/server";
import { z } from "zod";
import { getStore } from "@/lib/server/database";
import { processMessage } from "@/lib/server/messages";
import { identity, errorResponse, checkOrigin } from "@/lib/server/http";
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const id = await identity();
    const { body, messageId } = z
      .object({
        body: z.string().trim().min(1).max(1500),
        messageId: z.string().uuid(),
      })
      .parse(await request.json());
    return NextResponse.json(
      await processMessage(getStore(), id, body, messageId),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
