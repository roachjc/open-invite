import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { getStore } from "@/lib/server/database";
import { checkOrigin, localOnly, errorResponse } from "@/lib/server/http";
export async function POST(request: Request) {
  try {
    localOnly();
    checkOrigin(request);
    const { personId } = z
      .object({ personId: z.string() })
      .parse(await request.json());
    getStore().person(personId);
    (await cookies()).set("open-invite-demo-person", personId, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
