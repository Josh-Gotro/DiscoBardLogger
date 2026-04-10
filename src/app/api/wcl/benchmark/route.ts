import { NextRequest, NextResponse } from "next/server";

import { fetchBenchmarkCandidates } from "@/lib/wcl/queries";

function parseOptionalNumber(value: string | null) {
  if (!value) {
    return undefined;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

export async function GET(request: NextRequest) {
  const encounterID = parseOptionalNumber(
    request.nextUrl.searchParams.get("encounterID"),
  );
  if (!encounterID) {
    return NextResponse.json({ error: "Missing encounterID." }, { status: 400 });
  }

  try {
    const result = await fetchBenchmarkCandidates({
      encounterID,
      difficulty: parseOptionalNumber(request.nextUrl.searchParams.get("difficulty")),
      className: request.nextUrl.searchParams.get("className") ?? undefined,
      specName: request.nextUrl.searchParams.get("specName") ?? undefined,
      metric: request.nextUrl.searchParams.get("metric") ?? "dps",
      size: parseOptionalNumber(request.nextUrl.searchParams.get("size")),
      partition: parseOptionalNumber(request.nextUrl.searchParams.get("partition")),
      serverRegion: request.nextUrl.searchParams.get("serverRegion") ?? undefined,
      bracket: parseOptionalNumber(request.nextUrl.searchParams.get("bracket")),
      page: parseOptionalNumber(request.nextUrl.searchParams.get("page")) ?? 1,
    });
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load benchmarks.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
