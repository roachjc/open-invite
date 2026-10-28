import { NextResponse } from "next/server";
// Fail closed until real membership, hosted persistence, and delivery jobs are connected.
export async function POST() {
  return NextResponse.json(
    { error: "Live SMS is not connected. Use the local text simulator." },
    { status: 503 },
  );
}
