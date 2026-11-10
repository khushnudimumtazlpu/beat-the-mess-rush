import { ACCOUNT_STATUS } from "../../lib/auth-contracts.js";
import { loginDestinationForUser } from "../../lib/auth-redirects.js";

export function readLoginCredentials(formData) {
  return {
    email: String(formData.get("email") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
  };
}

export function resolveLoginOutcome(result, callbackUrl) {
  if (result?.error) {
    const code = result.error.code;

    if (code === "INVALID_EMAIL_OR_PASSWORD" || code === "INVALID_EMAIL") {
      return { type: "error", message: "We couldn't sign you in with those details." };
    }

    if (code === "INVALID_ORIGIN") {
      return {
        type: "error",
        message: "Sign-in is unavailable from this address. Refresh the page and try again.",
      };
    }

    return { type: "error", message: "Sign in is temporarily unavailable. Please try again." };
  }

  const user = result?.data?.user;
  if (user?.status === ACCOUNT_STATUS.PENDING) {
    return { type: "redirect", destination: "/pending" };
  }

  if (user?.status === ACCOUNT_STATUS.ACTIVE) {
    return {
      type: "redirect",
      destination: loginDestinationForUser(user, callbackUrl),
    };
  }

  return { type: "redirect", destination: "/access-denied" };
}
