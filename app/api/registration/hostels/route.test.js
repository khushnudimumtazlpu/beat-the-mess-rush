import { beforeEach, describe, expect, it, vi } from "vitest";
import { HOSTEL_COLLECTION } from "../../../../lib/auth-contracts.js";

const { getMongoDbMock, findMock, sortMock, toArrayMock } = vi.hoisted(() => ({
  getMongoDbMock: vi.fn(),
  findMock: vi.fn(),
  sortMock: vi.fn(),
  toArrayMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("../../../../lib/mongodb.js", () => ({ getMongoDb: getMongoDbMock }));

const { GET } = await import("./route.js");

describe("public registration Hostel options API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    toArrayMock.mockResolvedValue([
      { _id: { toString: () => "active-id" }, name: "North Hall", code: "NORTH", status: "ACTIVE", createdBy: "private" },
    ]);
    sortMock.mockReturnValue({ toArray: toArrayMock });
    findMock.mockReturnValue({ sort: sortMock });
    getMongoDbMock.mockResolvedValue({ collection: vi.fn(() => ({ find: findMock })) });
  });

  it("queries only ACTIVE Hostels and returns only id and name", async () => {
    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(findMock).toHaveBeenCalledWith(
      { status: "ACTIVE" },
      { projection: { _id: 1, name: 1 } },
    );
    expect(sortMock).toHaveBeenCalledWith({ name: 1, _id: 1 });
    expect(payload.data).toEqual([{ id: "active-id", name: "North Hall" }]);
    expect(payload.data[0]).not.toHaveProperty("code");
    expect(payload.data[0]).not.toHaveProperty("createdBy");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("returns a generic service error without leaking database details", async () => {
    getMongoDbMock.mockRejectedValueOnce(new Error("private Atlas connection string"));
    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload).toMatchObject({ success: false, error: { code: "HOSTELS_UNAVAILABLE" } });
    expect(JSON.stringify(payload)).not.toContain("Atlas");
  });
});
