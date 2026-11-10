import { describe, expect, it, vi } from "vitest";
import { logoutWorkflow } from "./logout-workflow.js";

describe("logout workflow", () => {
  it("waits for Better Auth sign-out before replacing the page", async () => {
    let resolveSignOut;
    const signOut = vi.fn(() => new Promise((resolve) => {
      resolveSignOut = resolve;
    }));
    const navigate = vi.fn();

    const result = logoutWorkflow(signOut, navigate);
    expect(signOut).toHaveBeenCalledOnce();
    expect(navigate).not.toHaveBeenCalled();

    resolveSignOut({ data: { success: true }, error: null });
    await expect(result).resolves.toEqual({ ok: true });
    expect(navigate).toHaveBeenCalledOnce();
  });

  it("does not navigate or report success when Better Auth returns an error", async () => {
    const signOut = vi.fn().mockResolvedValue({ error: { message: "request failed" } });
    const navigate = vi.fn();

    await expect(logoutWorkflow(signOut, navigate)).resolves.toEqual({
      ok: false,
      message: "We couldn't end your session. Please try again.",
    });
    expect(navigate).not.toHaveBeenCalled();
  });

  it("does not navigate when sign-out fails or does not confirm success", async () => {
    const navigate = vi.fn();
    const failedSignOut = vi.fn().mockRejectedValue(new Error("network failure"));
    const unconfirmedSignOut = vi.fn().mockResolvedValue({ data: { success: false } });

    await expect(logoutWorkflow(failedSignOut, navigate)).resolves.toMatchObject({ ok: false });
    await expect(logoutWorkflow(unconfirmedSignOut, navigate)).resolves.toMatchObject({ ok: false });
    expect(navigate).not.toHaveBeenCalled();
  });
});
