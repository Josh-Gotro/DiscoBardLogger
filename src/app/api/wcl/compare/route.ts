import { NextRequest, NextResponse } from "next/server";

import { compareFightPair } from "@/lib/wcl/queries";

type ComparePayload = {
  userReportCode: string;
  userFightID: number;
  userSourceID: number;
  referenceReportCode: string;
  referenceFightID: number;
  referenceSourceID: number;
};

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function validatePayload(payload: unknown): payload is ComparePayload {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const record = payload as Record<string, unknown>;
  return (
    typeof record.userReportCode === "string" &&
    isNumber(record.userFightID) &&
    isNumber(record.userSourceID) &&
    typeof record.referenceReportCode === "string" &&
    isNumber(record.referenceFightID) &&
    isNumber(record.referenceSourceID)
  );
}

export async function POST(request: NextRequest) {
  const payload = (await request.json()) as unknown;
  if (!validatePayload(payload)) {
    return NextResponse.json(
      { error: "Invalid payload for comparison route." },
      { status: 400 },
    );
  }

  try {
    const result = await compareFightPair(payload);
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to compare selected fights.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
