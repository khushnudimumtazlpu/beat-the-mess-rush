import { beforeEach, describe, expect, it, vi } from "vitest";

const { getAuthMock, authGetMock, authPostMock, toNextJsHandlerMock } = vi.hoisted(() => ({
  getAuthMock: vi.fn(),
  authGetMock: vi.fn(),
  authPostMock: vi.fn(),
  toNextJsHandlerMock: vi.fn(),
}));

vi.mock("better-auth/next-js", () => ({ toNextJsHandler: toNextJsHandlerMock }));
vi.mock("../../../../lib/auth.js", () => ({ getAuth: getAuthMock }));

const { GET, POST } = await import("./route.js");

describe("Better Auth route signup boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAuthMock.mockResolvedValue({});
    authGetMock.mockResolvedValue(Response.json({ session: true }));
    authPostMock.mockResolvedValue(Response.json({ signedIn: true }));
    toNextJsHandlerMock.mockReturnValue({ GET: authGetMock, POST: authPostMock });
  });

  it("blocks direct public email signup before initializing Better Auth", async () => {
    const response = await POST(new Request("http://localhost/api/auth/sign-up/email", {
      method: "POST",
      body: JSON.stringify({ name: "Person", email: "person@example.test", password: "a-password" }),
    }));

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "DIRECT_SIGNUP_DISABLED" });
    expect(getAuthMock).not.toHaveBeenCalled();
    expect(authPostMock).not.toHaveBeenCalled();
  });

  it("blocks a URL-encoded direct signup path too", async () => {
    const response = await POST(new Request("http://localhost/api/auth/%73ign-up/email/", {
      method: "POST",
    }));

    expect(response.status).toBe(403);
    expect(getAuthMock).not.toHaveBeenCalled();
  });

  it("continues routing sign-in requests to Better Auth", async () => {
    const request = new Request("http://localhost/api/auth/sign-in/email", { method: "POST" });
    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(getAuthMock).toHaveBeenCalledOnce();
    expect(authPostMock).toHaveBeenCalledWith(request);
  });

  it("delegates sign-out to Better Auth", async () => {
    const request = new Request("http://localhost/api/auth/sign-out", { method: "POST" });
    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(getAuthMock).toHaveBeenCalledOnce();
    expect(authPostMock).toHaveBeenCalledWith(request);
  });

  it("continues routing session reads to Better Auth", async () => {
    const request = new Request("http://localhost/api/auth/get-session");
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(authGetMock).toHaveBeenCalledWith(request);
  });
});
