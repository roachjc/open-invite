import { NextResponse } from "next/server";
import { getStore, TIMEZONE } from "@/lib/server/database";
import { identity, errorResponse } from "@/lib/server/http";
import { isCurrent } from "@/lib/plans";
import type { Person, Plan, Message, Notice } from "@/lib/types";
export const runtime = "nodejs";
export async function GET() {
  try {
    const currentPersonId = await identity();
    const store = getStore();
    return NextResponse.json(
      {
        currentPersonId,
        circleName: "The usual people",
        timezone: TIMEZONE,
        people: store.rows<Person>("people"),
        plans: store.rows<Plan>("plans").filter((p) => isCurrent(p)),
        messages: store
          .rows<Message>("messages")
          .filter((m) => m.personId === currentPersonId),
        notices: store
          .rows<Notice>("notices")
          .filter((n) => n.recipientId === currentPersonId)
          .slice(-40),
        parser: process.env.OPENAI_API_KEY ? "openai" : "examples",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
