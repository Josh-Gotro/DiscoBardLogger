import { NextRequest, NextResponse } from "next/server";

import { fetchReportOverview } from "@/lib/wcl/queries";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (!code) {
    return NextResponse.json({ error: "Missing report code." }, { status: 400 });
  }

  try {
    const report = await fetchReportOverview(code);
    return NextResponse.json(report);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load report details.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
