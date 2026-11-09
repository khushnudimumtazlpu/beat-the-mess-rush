import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "../../../../lib/auth.js";

export const runtime = "nodejs";

async function handleAuthRequest(method, request) {
  const auth = await getAuth();
  const handler = toNextJsHandler(auth)[method];
  return handler(request);
}

function isDirectEmailSignup(request) {
  let pathname = new URL(request.url).pathname;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    pathname = pathname.replace(/\/+$/, "");
    if (pathname.endsWith("/sign-up/email")) return true;
    try {
      const decoded = decodeURIComponent(pathname);
      if (decoded === pathname) return false;
      pathname = decoded;
    } catch {
      return false;
    }
  }
  return pathname.replace(/\/+$/, "").endsWith("/sign-up/email");
}

export async function GET(request) {
  return handleAuthRequest("GET", request);
}

export async function POST(request) {
  if (isDirectEmailSignup(request)) {
    return Response.json(
      {
        message: "Public registration is available through the RushLess registration endpoint.",
        code: "DIRECT_SIGNUP_DISABLED",
      },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }
  return handleAuthRequest("POST", request);
}
