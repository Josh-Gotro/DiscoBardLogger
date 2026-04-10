import { NextResponse } from "next/server";

import { startBridgeOAuthFlow } from "@/lib/wcl/oauth";

async function startLoginFlow() {
  const secureCookies = process.env.NODE_ENV === "production";
  const bridge = await startBridgeOAuthFlow();
  const response = NextResponse.json({
    authorizeUrl: bridge.authorizeUrl,
    state: bridge.state,
  });
  response.cookies.set("wcl_oauth_state", bridge.state, {
    httpOnly: true,
    secure: secureCookies,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 30,
  });
  return response;
}

export async function GET() {
  return startLoginFlow();
}

export async function POST() {
  return startLoginFlow();
}
