"use client";

// ─── Kitchen Store (ak) ───────────────────────────────────────────────────────
// In-memory state store for kitchen module.
// Uses React Context so all kitchen pages share the same records.
// Data resets on page refresh (mock only — no localStorage).

import { createContext, useContext, useState } from "react";
import {
  initialProductionRecords,
  initialWasteRecords,
} from "../data/kitchen-demo-data-ak";

// ── Context ───────────────────────────────────────────────────────────────────
const KitchenStoreContext = createContext(null);

// ── Provider — wrap the kitchen layout with this ──────────────────────────────
export function KitchenStoreProvider({ children }) {
  const [productionRecords, setProductionRecords] = useState(initialProductionRecords);
  const [wasteRecords, setWasteRecords] = useState(initialWasteRecords);

  // Add a new production record
  function addProductionRecord(record) {
    const id = `prod-${Date.now()}`;
    setProductionRecords((prev) => [{ id, ...record }, ...prev]);
  }

  // Update a production record status or served count
  function updateProductionRecord(id, changes) {
    setProductionRecords((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...changes } : r))
    );
  }

  // Add a new waste record
  function addWasteRecord(record) {
    const id = `waste-${Date.now()}`;
    setWasteRecords((prev) => [{ id, ...record }, ...prev]);
  }

  return (
    <KitchenStoreContext.Provider
      value={{
        productionRecords,
        wasteRecords,
        addProductionRecord,
        updateProductionRecord,
        addWasteRecord,
      }}
    >
      {children}
    </KitchenStoreContext.Provider>
  );
}

// ── Hook — use inside any kitchen component ───────────────────────────────────
export function useKitchenStore() {
  const ctx = useContext(KitchenStoreContext);
  if (!ctx) {
    throw new Error("useKitchenStore must be used inside KitchenStoreProvider");
  }
  return ctx;
}
