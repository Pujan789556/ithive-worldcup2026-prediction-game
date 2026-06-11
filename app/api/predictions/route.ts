import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { storePrediction } from "@/app/actions";

export async function POST(request: Request) {
  try {
    const member = await requireAuth();
    const formData = await request.formData();
    await storePrediction(member.id, formData);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Prediction could not be saved.";
    const status = message === "Not authenticated." ? 401 : 400;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
