"use client";

import { useEffect, useState, FormEvent } from "react";
import { api, buildQuery, ApiError } from "@/lib/api";
import { Location, StockTrackingRow } from "@/lib/types";

const STATUS_STYLES: Record<string, string> = {
  in_stock: "text-green-700",
  issued: "text-amber-700",
  transferred: "text-blue-700",
  wasted: "text-red-700",
};

export default function StockTrackingPage() {
  const [rows, setRows] = useState<StockTrackingRow[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [locationId, setLocationId] = useState<number | "">("");
  const [productName, setProductName] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    api.get<Location[]>("/locations").then(setLocations).catch(() => {});
    fetchTracking();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchTracking() {
    setIsLoading(true);
    setError(null);
    try {
      const query = buildQuery({
        location_id: locationId || undefined,
        product_name: productName,
        status: status || undefined,
      });
      const data = await api.get<StockTrackingRow[]>(`/stock/tracking${query}`);
      setRows(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load stock tracking.");
    } finally {
      setIsLoading(false);
    }
  }

  function handleSearch(e: FormEvent) {
    e.preventDefault();
    fetchTracking();
  }

  return (
    <div>
      <h1 className="text-xl font-semibold text-neutral-900 mb-6">Stock Tracking</h1>

      <form
        onSubmit={handleSearch}
        className="border border-neutral-300 bg-white p-4 mb-4 grid grid-cols-1 md:grid-cols-4 gap-3 items-end"
      >
        <label className="block">
          <span className="block text-xs text-neutral-500 mb-1">Location</span>
          <select
            value={locationId}
            onChange={(e) => setLocationId(e.target.value ? Number(e.target.value) : "")}
            className="input"
          >
            <option value="">All locations</option>
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="block text-xs text-neutral-500 mb-1">Product name</span>
          <input value={productName} onChange={(e) => setProductName(e.target.value)} className="input" />
        </label>
        <label className="block">
          <span className="block text-xs text-neutral-500 mb-1">Status</span>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="input">
            <option value="">All statuses</option>
            <option value="in_stock">In stock</option>
            <option value="issued">Issued</option>
            <option value="transferred">Transferred</option>
            <option value="wasted">Wasted</option>
          </select>
        </label>
        <button
          type="submit"
          className="bg-neutral-900 text-white text-sm font-medium px-4 py-2 hover:bg-neutral-700 transition-colors"
        >
          Search
        </button>
      </form>

      {error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 px-3 py-2 mb-4">{error}</p>
      )}

      <div className="border border-neutral-300 bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-300 bg-neutral-50 text-left text-neutral-500">
              <th className="px-3 py-2 font-medium">Location</th>
              <th className="px-3 py-2 font-medium">Product</th>
              <th className="px-3 py-2 font-medium">Series</th>
              <th className="px-3 py-2 font-medium">Storage</th>
              <th className="px-3 py-2 font-medium">Color</th>
              <th className="px-3 py-2 font-medium">RAM</th>
              <th className="px-3 py-2 font-medium">Serial / Qty</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-neutral-400">
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-neutral-400">
                  No records found.
                </td>
              </tr>
            ) : (
              rows.map((r, i) => (
                <tr key={i} className="border-b border-neutral-200 last:border-0">
                  <td className="px-3 py-2 text-neutral-600">{r.location_name}</td>
                  <td className="px-3 py-2">{r.product_name}</td>
                  <td className="px-3 py-2 text-neutral-500">{r.series || "—"}</td>
                  <td className="px-3 py-2 text-neutral-500">{r.storage_size || "—"}</td>
                  <td className="px-3 py-2 text-neutral-500">{r.color || "—"}</td>
                  <td className="px-3 py-2 text-neutral-500">{r.ram || "—"}</td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {r.control_serial ?? (r.non_control_amount !== null ? `Qty: ${r.non_control_amount}` : "—")}
                  </td>
                  <td className="px-3 py-2">
                    <span className={STATUS_STYLES[r.status] ?? ""}>{r.status}</span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}