const LOGOUT_ERROR_MESSAGE = "We couldn't end your session. Please try again.";

export async function logoutWorkflow(signOut, navigate) {
  try {
    const result = await signOut();

    if (result?.error || result?.data?.success !== true) {
      return { ok: false, message: LOGOUT_ERROR_MESSAGE };
    }

    navigate();
    return { ok: true };
  } catch {
    return { ok: false, message: LOGOUT_ERROR_MESSAGE };
  }
}
