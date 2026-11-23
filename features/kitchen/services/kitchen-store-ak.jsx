"use client";

// ─── Kitchen Store (ak & _akk) ────────────────────────────────────────────────
// Real database-backed state store for Kitchen Management & Food Waste Analytics.
// Fetches records from MongoDB backend via Next.js Kitchen APIs.
// Automatically persists batch logs, waste entries, and updates to the database.

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import {
  initialProductionRecords,
  initialWasteRecords,
} from "../data/kitchen-demo-data-ak";
import {
  fetchProductionRecords,
  createProductionBatch,
  updateProductionBatch,
  fetchWasteRecords,
  createWasteLog,
  fetchDemandData,
  fetchKitchenAnalytics,
} from "./kitchen-api_akk";

// ── Context ───────────────────────────────────────────────────────────────────
const KitchenStoreContext = createContext(null);

// ── Provider — wrap the kitchen layout with this ──────────────────────────────
export function KitchenStoreProvider({ children, isSuperAdmin: propIsSuperAdmin = false, userRole: propUserRole = null }) {
  const [role, setRole] = useState(propUserRole || "");
  const [isSuperAdmin, setIsSuperAdmin] = useState(Boolean(propIsSuperAdmin || propUserRole === "SUPER_ADMIN"));
  const [messes, setMesses] = useState([]);
  const [selectedMessId, setSelectedMessId] = useState("");
  const [productionRecords, setProductionRecords] = useState([]);
  const [wasteRecords, setWasteRecords] = useState([]);
  const [demandData, setDemandData] = useState(null);
  const [analyticsData, setAnalyticsData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isLive, setIsLive] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;
    async function loadMesses() {
      try {
        const res = await fetch("/api/queues/messes");
        const json = await res.json();
        if (mounted && json.success && Array.isArray(json.data) && json.data.length > 0) {
          setMesses(json.data);
          setSelectedMessId(json.data[0].id);
          if (json.role) {
            setRole(json.role);
            if (json.role === "SUPER_ADMIN") setIsSuperAdmin(true);
          }
        }
      } catch {
        // Silently ignore if messes route unavailable
      }
    }
    loadMesses();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      setLoading(true);
      try {
        const messParam = selectedMessId ? { messId: selectedMessId } : {};
        const [prods, wastes, analytics] = await Promise.all([
          fetchProductionRecords(messParam).catch(() => null),
          fetchWasteRecords(messParam).catch(() => null),
          fetchKitchenAnalytics(messParam).catch(() => null),
        ]);

        if (cancelled) return;

        if (prods !== null) {
          setProductionRecords(prods);
          setIsLive(true);
        } else {
          setProductionRecords(initialProductionRecords);
        }

        if (wastes !== null) {
          setWasteRecords(wastes);
        } else {
          setWasteRecords(initialWasteRecords);
        }

        if (analytics !== null) {
          setAnalyticsData(analytics);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message);
          setProductionRecords(initialProductionRecords);
          setWasteRecords(initialWasteRecords);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadData();

    return () => {
      cancelled = true;
    };
  }, [selectedMessId]);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const messParam = selectedMessId ? { messId: selectedMessId } : {};
      const [prods, wastes, analytics] = await Promise.all([
        fetchProductionRecords(messParam).catch(() => null),
        fetchWasteRecords(messParam).catch(() => null),
        fetchKitchenAnalytics(messParam).catch(() => null),
      ]);

      if (prods !== null) {
        setProductionRecords(prods);
        setIsLive(true);
      }
      if (wastes !== null) {
        setWasteRecords(wastes);
      }
      if (analytics !== null) {
        setAnalyticsData(analytics);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [selectedMessId]);

  // Load demand data for a specific meal slot
  const fetchDemandForSlot = useCallback(async (slotId = "lunch") => {
    try {
      const messParam = selectedMessId ? { messId: selectedMessId } : {};
      const demand = await fetchDemandData({ slotId, ...messParam });
      setDemandData(demand);
      return demand;
    } catch {
      return null;
    }
  }, [selectedMessId]);

  // Add a new production record (persists to DB)
  async function addProductionRecord(record) {
    try {
      const toSave = selectedMessId && !record.messId ? { ...record, messId: selectedMessId } : record;
      const saved = await createProductionBatch(toSave);
      setProductionRecords((prev) => [saved, ...prev]);
      setIsLive(true);
      // Refresh analytics in background
      fetchKitchenAnalytics(selectedMessId ? { messId: selectedMessId } : {})
        .then(setAnalyticsData)
        .catch(() => {});
      return saved;
    } catch (err) {
      const fallbackDoc = { id: `prod-${Date.now()}`, ...record };
      setProductionRecords((prev) => [fallbackDoc, ...prev]);
      throw err;
    }
  }

  // Update a production record status or served count (persists to DB)
  async function updateProductionRecord(id, changes) {
    try {
      const updated = await updateProductionBatch(id, changes);
      setProductionRecords((prev) =>
        prev.map((r) => (r.id === id ? { ...r, ...updated } : r))
      );
      fetchKitchenAnalytics(selectedMessId ? { messId: selectedMessId } : {})
        .then(setAnalyticsData)
        .catch(() => {});
      return updated;
    } catch (err) {
      setProductionRecords((prev) =>
        prev.map((r) => (r.id === id ? { ...r, ...changes } : r))
      );
      throw err;
    }
  }

  // Add a new waste record (persists to DB)
  async function addWasteRecord(record) {
    try {
      const toSave = selectedMessId && !record.messId ? { ...record, messId: selectedMessId } : record;
      const saved = await createWasteLog(toSave);
      setWasteRecords((prev) => [saved, ...prev]);
      setIsLive(true);
      fetchKitchenAnalytics(selectedMessId ? { messId: selectedMessId } : {})
        .then(setAnalyticsData)
        .catch(() => {});
      return saved;
    } catch (err) {
      const fallbackDoc = { id: `waste-${Date.now()}`, ...record };
      setWasteRecords((prev) => [fallbackDoc, ...prev]);
      throw err;
    }
  }

  return (
    <KitchenStoreContext.Provider
      value={{
        messes,
        selectedMessId,
        setSelectedMessId,
        selectedMess: messes.find((m) => m.id === selectedMessId) || null,
        isSuperAdmin: Boolean(isSuperAdmin || propIsSuperAdmin || role === "SUPER_ADMIN"),
        userRole: role,
        productionRecords,
        wasteRecords,
        demandData,
        analyticsData,
        loading,
        isLive,
        error,
        addProductionRecord,
        updateProductionRecord,
        addWasteRecord,
        fetchDemandForSlot,
        refreshAll,
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
