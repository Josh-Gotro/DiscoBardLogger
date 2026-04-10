const requiredVariables = [
  "WARCRAFTLOGS_CLIENT_ID",
  "WARCRAFTLOGS_CLIENT_SECRET",
  "WARCRAFTLOGS_REDIRECT_URI",
  "DISCOBARD_OAUTH_BRIDGE_API_URL",
  "DISCOBARD_OAUTH_BRIDGE_API_KEY",
] as const;

type RequiredVariableName = (typeof requiredVariables)[number];

export type WarcraftLogsEnv = Record<RequiredVariableName, string>;

export function getWarcraftLogsEnv(): WarcraftLogsEnv {
  const missing: string[] = [];
  const env = {} as WarcraftLogsEnv;

  for (const key of requiredVariables) {
    const value = process.env[key]?.trim();
    if (!value) {
      missing.push(key);
      continue;
    }
    env[key] = value;
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required Warcraft Logs env vars: ${missing.join(", ")}`,
    );
  }

  return env;
}

export const WARCRAFTLOGS_AUTHORIZE_URI =
  "https://www.warcraftlogs.com/oauth/authorize";
export const WARCRAFTLOGS_TOKEN_URI = "https://www.warcraftlogs.com/oauth/token";
export const WARCRAFTLOGS_CLIENT_API_URI =
  "https://www.warcraftlogs.com/api/v2/client";
export const WARCRAFTLOGS_USER_API_URI =
  "https://www.warcraftlogs.com/api/v2/user";
