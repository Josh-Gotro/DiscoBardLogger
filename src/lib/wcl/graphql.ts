import {
  WARCRAFTLOGS_CLIENT_API_URI,
  WARCRAFTLOGS_USER_API_URI,
} from "@/lib/wcl/env";
import { getClientCredentialsAccessToken } from "@/lib/wcl/oauth";

type GraphqlResult<T> = {
  data?: T;
  errors?: Array<{ message: string }>;
};

async function graphqlRequest<T>(args: {
  endpoint: string;
  accessToken: string;
  query: string;
  variables?: Record<string, unknown>;
}) {
  const response = await fetch(args.endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: args.query,
      variables: args.variables ?? {},
    }),
    cache: "no-store",
  });

  const body = (await response.json()) as GraphqlResult<T>;
  if (!response.ok) {
    throw new Error(`GraphQL HTTP ${response.status}: ${JSON.stringify(body)}`);
  }

  if (body.errors && body.errors.length > 0) {
    throw new Error(body.errors.map((e) => e.message).join("; "));
  }

  if (!body.data) {
    throw new Error("GraphQL response had no data");
  }

  return body.data;
}

export async function wclClientQuery<T>(query: string, variables?: Record<string, unknown>) {
  const token = await getClientCredentialsAccessToken();
  return graphqlRequest<T>({
    endpoint: WARCRAFTLOGS_CLIENT_API_URI,
    accessToken: token,
    query,
    variables,
  });
}

export async function wclUserQuery<T>(args: {
  query: string;
  accessToken: string;
  variables?: Record<string, unknown>;
}) {
  return graphqlRequest<T>({
    endpoint: WARCRAFTLOGS_USER_API_URI,
    accessToken: args.accessToken,
    query: args.query,
    variables: args.variables,
  });
}
