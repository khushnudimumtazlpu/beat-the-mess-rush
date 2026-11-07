// ─── Kitchen API Client Service (_akk) ─────────────────────────────────────────
// Connects the Kitchen UI components to real backend database endpoints.
// All requests interact with MongoDB collections through Next.js App Router APIs.

async function handleResponse(response) {
  const json = await response.json().catch(() => ({}));
  if (!response.ok || !json.success) {
    const error = new Error(json.error || `HTTP request failed: ${response.status}`);
    error.status = response.status;
    error.code = json.code;
    error.details = json.details;
    throw error;
  }
  return json.data;
}

/**
 * Fetch daily food production records from the database.
 */
export async function fetchProductionRecords({ slotId, date, hostelId } = {}) {
  const params = new URLSearchParams();
  if (slotId) params.append("slotId", slotId);
  if (date) params.append("date", date);
  if (hostelId) params.append("hostelId", hostelId);

  const query = params.toString() ? `?${params.toString()}` : "";
  const res = await fetch(`/api/kitchen/production${query}`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
  });

  return handleResponse(res);
}

/**
 * Record a new food production batch.
 */
export async function createProductionBatch(record) {
  const res = await fetch("/api/kitchen/production", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(record),
  });

  return handleResponse(res);
}

/**
 * Update an existing production record (status, portions served, chef).
 */
export async function updateProductionBatch(id, changes) {
  const res = await fetch("/api/kitchen/production", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, ...changes }),
  });

  return handleResponse(res);
}

/**
 * Fetch food waste records with optional filters.
 */
export async function fetchWasteRecords({
  slotId,
  date,
  category,
  startDate,
  endDate,
  hostelId,
} = {}) {
  const params = new URLSearchParams();
  if (slotId) params.append("slotId", slotId);
  if (date) params.append("date", date);
  if (category) params.append("category", category);
  if (startDate) params.append("startDate", startDate);
  if (endDate) params.append("endDate", endDate);
  if (hostelId) params.append("hostelId", hostelId);

  const query = params.toString() ? `?${params.toString()}` : "";
  const res = await fetch(`/api/kitchen/waste${query}`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
  });

  return handleResponse(res);
}

/**
 * Record food waste after service.
 */
export async function createWasteLog(wasteEntry) {
  const res = await fetch("/api/kitchen/waste", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(wasteEntry),
  });

  return handleResponse(res);
}

/**
 * Fetch student demand data with safety buffer and hourly flow.
 */
export async function fetchDemandData({ slotId = "lunch", date, hostelId } = {}) {
  const params = new URLSearchParams();
  if (slotId) params.append("slotId", slotId);
  if (date) params.append("date", date);
  if (hostelId) params.append("hostelId", hostelId);

  const query = params.toString() ? `?${params.toString()}` : "";
  const res = await fetch(`/api/kitchen/demand${query}`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
  });

  return handleResponse(res);
}

/**
 * Fetch comprehensive waste analytics and food efficiency reports.
 */
export async function fetchKitchenAnalytics({ startDate, endDate, hostelId } = {}) {
  const params = new URLSearchParams();
  if (startDate) params.append("startDate", startDate);
  if (endDate) params.append("endDate", endDate);
  if (hostelId) params.append("hostelId", hostelId);

  const query = params.toString() ? `?${params.toString()}` : "";
  const res = await fetch(`/api/kitchen/analytics${query}`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
  });

  return handleResponse(res);
}
