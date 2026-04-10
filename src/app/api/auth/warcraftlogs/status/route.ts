import { NextRequest, NextResponse } from "next/server";

import { getBridgeOAuthStatus } from "@/lib/wcl/oauth";

export async function GET(request: NextRequest) {
  const state = request.cookies.get("wcl_oauth_state")?.value;
  if (!state) {
    return NextResponse.json(
      { status: "idle", message: "No pending Warcraft Logs bridge flow." },
      { status: 200 },
    );
  }

  try {
    const result = await getBridgeOAuthStatus(state);
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to check OAuth bridge status.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
