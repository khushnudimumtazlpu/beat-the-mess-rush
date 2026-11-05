import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "../../../../lib/auth.js";

export const runtime = "nodejs";

async function handleAuthRequest(method, request) {
  const auth = await getAuth();
  const handler = toNextJsHandler(auth)[method];
  return handler(request);
}

export async function GET(request) {
  return handleAuthRequest("GET", request);
}

export async function POST(request) {
  return handleAuthRequest("POST", request);
}
