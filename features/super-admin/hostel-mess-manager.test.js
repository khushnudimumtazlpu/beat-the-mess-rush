import { describe, expect, it } from "vitest";
import {
  createLatestRequestGuard,
  messDataMatchesHostel,
} from "./hostel-mess-manager.jsx";

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

describe("Hostel-scoped Mess loading", () => {
  it("hides old Hostel Messes and ignores a pending response after switching Hostels", async () => {
    const guard = createLatestRequestGuard();
    let selectedHostelId = "hostel-a";
    let loadedHostelId = "hostel-a";
    let visibleMesses = ["Mess A"];
    const hostelAResponse = deferred();
    const hostelBResponse = deferred();

    const hostelARequest = guard.begin();
    const pendingA = hostelAResponse.promise.then((records) => {
      if (hostelARequest.isCurrent()) {
        visibleMesses = records;
        loadedHostelId = "hostel-a";
      }
    });

    selectedHostelId = "hostel-b";
    expect(messDataMatchesHostel(loadedHostelId, selectedHostelId)).toBe(false);
    const visibleForSelection = () => (
      messDataMatchesHostel(loadedHostelId, selectedHostelId) ? visibleMesses : []
    );
    expect(visibleForSelection()).toEqual([]);

    const hostelBRequest = guard.begin();
    const pendingB = hostelBResponse.promise.then((records) => {
      if (hostelBRequest.isCurrent()) {
        visibleMesses = records;
        loadedHostelId = "hostel-b";
      }
    });

    hostelAResponse.resolve(["Stale Mess A"]);
    await pendingA;
    expect(visibleForSelection()).toEqual([]);

    hostelBResponse.resolve(["Mess B"]);
    await pendingB;
    expect(visibleForSelection()).toEqual(["Mess B"]);
  });
});
