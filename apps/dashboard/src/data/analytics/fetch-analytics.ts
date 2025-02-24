import "server-only";
import { getAuthToken } from "../../app/api/lib/getAuthToken";

export async function fetchAnalytics(
  input: string | URL,
  init?: RequestInit,
): Promise<Response> {
  const token = await getAuthToken();

  if (!token) {
    throw new Error("You are not authorized to perform this action");
  }

  const [pathname, searchParams] = input.toString().split("?");
  if (!pathname) {
    throw new Error("Invalid input, no pathname provided");
  }

  // create a new URL object for the analytics server
  const ANALYTICS_SERVICE_URL = new URL(
    process.env.ANALYTICS_SERVICE_URL || "https://analytics.thirdweb.com",
  );
  ANALYTICS_SERVICE_URL.pathname = pathname;
  for (const param of searchParams?.split("&") || []) {
    const [key, value] = param.split("=");
    if (!key || !value) {
      throw new Error("Invalid input, no key or value provided");
    }
    ANALYTICS_SERVICE_URL.searchParams.append(
      decodeURIComponent(key),
      decodeURIComponent(value),
    );
  }
  // client id DEBUG OVERRIDE
  // ANALYTICS_SERVICE_URL.searchParams.delete("clientId");
  // ANALYTICS_SERVICE_URL.searchParams.delete("accountId");
  // ANALYTICS_SERVICE_URL.searchParams.append(
  //   "clientId",
  //   "...",
  // );

  return fetch(ANALYTICS_SERVICE_URL, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...init?.headers,
      authorization: `Bearer ${token}`,
    },
  });
}
