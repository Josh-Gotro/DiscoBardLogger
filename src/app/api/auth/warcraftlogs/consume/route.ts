import { NextRequest, NextResponse } from "next/server";

import { consumeBridgeOAuthToken } from "@/lib/wcl/oauth";

export async function POST(request: NextRequest) {
  const secureCookies = process.env.NODE_ENV === "production";
  const state = request.cookies.get("wcl_oauth_state")?.value;

  if (!state) {
    return NextResponse.json(
      { error: "No pending Warcraft Logs bridge state found." },
      { status: 400 },
    );
  }

  try {
    const result = await consumeBridgeOAuthToken(state);
    const response = NextResponse.json({
      status: "connected",
      expiresIn: result.token.expires_in,
      tokenType: result.token.token_type,
    });

    response.cookies.set("wcl_user_access_token", result.token.access_token, {
      httpOnly: true,
      secure: secureCookies,
      sameSite: "lax",
      path: "/",
      maxAge: result.token.expires_in,
    });
    response.cookies.delete("wcl_oauth_state");
    return response;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to consume Warcraft Logs token.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
