import { ACCOUNT_STATUS, USER_ROLE } from "./auth-contracts.js";

export function safeInternalPath(value, fallback = "/student") {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    /[\u0000-\u001f]/.test(value)
  ) {
    return fallback;
  }

  try {
    const parsed = new URL(value, "https://rushless.invalid");
    if (parsed.origin !== "https://rushless.invalid") return fallback;
    if (["/login", "/pending", "/access-denied"].includes(parsed.pathname)) return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}

export function homeForUser(user) {
  if (user?.status !== ACCOUNT_STATUS.ACTIVE) return "/access-denied";
  if (user.role === USER_ROLE.STUDENT) return "/student";
  if (user.role === USER_ROLE.SUPER_ADMIN) return "/admin";
  if (user.role === USER_ROLE.MESS_ADMIN) return "/queue";
  return "/access-denied";
}

const allowedLoginRoots = {
  [USER_ROLE.STUDENT]: ["/student"],
  [USER_ROLE.MESS_ADMIN]: ["/queue", "/kitchen"],
  [USER_ROLE.SUPER_ADMIN]: ["/admin", "/queue", "/kitchen"],
};

export function loginDestinationForUser(user, callbackUrl) {
  const home = homeForUser(user);
  if (home === "/access-denied" || typeof callbackUrl !== "string") return home;

  const safeCallback = safeInternalPath(callbackUrl, null);
  if (!safeCallback) return home;

  const pathname = new URL(safeCallback, "https://rushless.invalid").pathname;
  const canAccessCallback = (allowedLoginRoots[user.role] ?? []).some(
    (root) => pathname === root || pathname.startsWith(`${root}/`),
  );

  return canAccessCallback ? safeCallback : home;
}
