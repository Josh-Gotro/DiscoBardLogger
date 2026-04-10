import { getWarcraftLogsEnv, WARCRAFTLOGS_TOKEN_URI } from "@/lib/wcl/env";

type TokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
};

type ClientCredentialsCache = {
  accessToken: string;
  expiresAt: number;
};

type BridgeStartResponse = {
  state: string;
  authorizeUrl: string;
};

type BridgeStatusResponse = {
  state: string;
  status: "pending" | "completed" | "failed" | "expired";
  error?: string;
};

type BridgeConsumeResponse = {
  state: string;
  status: "completed";
  token: TokenResponse;
};

let cachedClientCredentials: ClientCredentialsCache | null = null;

function getBridgeHeaders() {
  const env = getWarcraftLogsEnv();
  return {
    "Content-Type": "application/json",
    "x-api-key": env.DISCOBARD_OAUTH_BRIDGE_API_KEY,
    Authorization: `Bearer ${env.DISCOBARD_OAUTH_BRIDGE_API_KEY}`,
  };
}

function getBridgeApiBaseUrl() {
  const env = getWarcraftLogsEnv();
  return env.DISCOBARD_OAUTH_BRIDGE_API_URL;
}

export async function getClientCredentialsAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedClientCredentials && cachedClientCredentials.expiresAt > now) {
    return cachedClientCredentials.accessToken;
  }

  const env = getWarcraftLogsEnv();
  const basic = Buffer.from(
    `${env.WARCRAFTLOGS_CLIENT_ID}:${env.WARCRAFTLOGS_CLIENT_SECRET}`,
  ).toString("base64");

  const response = await fetch(WARCRAFTLOGS_TOKEN_URI, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OAuth client credentials failed: ${response.status} ${body}`);
  }

  const token = (await response.json()) as TokenResponse;
  const expiresAt = Date.now() + Math.max(token.expires_in - 60, 30) * 1000;

  cachedClientCredentials = {
    accessToken: token.access_token,
    expiresAt,
  };

  return token.access_token;
}

export async function startBridgeOAuthFlow() {
  const response = await fetch(`${getBridgeApiBaseUrl()}/api/oauth/discobard/start`, {
    method: "POST",
    headers: getBridgeHeaders(),
    body: JSON.stringify({
      provider: "warcraftlogs",
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Bridge start failed: ${response.status} ${body}`);
  }

  return (await response.json()) as BridgeStartResponse;
}

export async function getBridgeOAuthStatus(state: string) {
  const url = new URL("/api/oauth/discobard/status", getBridgeApiBaseUrl());
  url.searchParams.set("state", state);

  const response = await fetch(url, {
    method: "GET",
    headers: getBridgeHeaders(),
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Bridge status failed: ${response.status} ${body}`);
  }

  return (await response.json()) as BridgeStatusResponse;
}

export async function consumeBridgeOAuthToken(state: string) {
  const response = await fetch(
    `${getBridgeApiBaseUrl()}/api/oauth/discobard/consume`,
    {
      method: "POST",
      headers: getBridgeHeaders(),
      body: JSON.stringify({
        state,
      }),
      cache: "no-store",
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Bridge consume failed: ${response.status} ${body}`);
  }

  return (await response.json()) as BridgeConsumeResponse;
}
