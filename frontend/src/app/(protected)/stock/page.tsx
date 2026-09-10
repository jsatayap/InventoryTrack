"use client";

import { useEffect, useState, FormEvent } from "react";
import { api, buildQuery, ApiError } from "@/lib/api";
import { Location, CurrentStockRow } from "@/lib/types";

export default function CurrentStockPage() {
  const [rows, setRows] = useState<CurrentStockRow[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [locationId, setLocationId] = useState<number | "">("");
  const [name, setName] = useState("");
  const [series, setSeries] = useState("");

  useEffect(() => {
    api.get<Location[]>("/locations").then(setLocations).catch(() => {});
    fetchStock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchStock() {
    setIsLoading(true);
    setError(null);
    try {
      const query = buildQuery({ location_id: locationId || undefined, name, series });
      const data = await api.get<CurrentStockRow[]>(`/stock/current${query}`);
      setRows(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load current stock.");
    } finally {
      setIsLoading(false);
    }
  }

  function handleSearch(e: FormEvent) {
    e.preventDefault();
    fetchStock();
  }

  const totalQuantity = rows.reduce((sum, r) => sum + r.quantity, 0);

  return (
    <div>
      <h1 className="text-xl font-semibold text-neutral-900 mb-6">Current Stock</h1>

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
          <span className="block text-xs text-neutral-500 mb-1">Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className="input" />
        </label>
        <label className="block">
          <span className="block text-xs text-neutral-500 mb-1">Series</span>
          <input value={series} onChange={(e) => setSeries(e.target.value)} className="input" />
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
              <th className="px-3 py-2 font-medium">SKU</th>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Series</th>
              <th className="px-3 py-2 font-medium">Storage</th>
              <th className="px-3 py-2 font-medium">Color</th>
              <th className="px-3 py-2 font-medium">Location</th>
              <th className="px-3 py-2 font-medium">Tracking</th>
              <th className="px-3 py-2 font-medium text-right">Qty</th>
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
                  No stock found.
                </td>
              </tr>
            ) : (
              rows.map((r, i) => (
                <tr key={`${r.product_id}-${r.location_id}-${i}`} className="border-b border-neutral-200 last:border-0">
                  <td className="px-3 py-2 font-mono text-xs">{r.sku}</td>
                  <td className="px-3 py-2">{r.name}</td>
                  <td className="px-3 py-2 text-neutral-500">{r.series || "—"}</td>
                  <td className="px-3 py-2 text-neutral-500">{r.storage_size || "—"}</td>
                  <td className="px-3 py-2 text-neutral-500">{r.color || "—"}</td>
                  <td className="px-3 py-2 text-neutral-600">{r.location_name}</td>
                  <td className="px-3 py-2 text-neutral-500">
                    {r.is_serialized ? "Control serial" : "Non-control"}
                  </td>
                  <td className="px-3 py-2 text-right font-medium">{r.quantity}</td>
                </tr>
              ))
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="border-t border-neutral-300 bg-neutral-50">
                <td colSpan={7} className="px-3 py-2 text-right text-xs text-neutral-500 font-medium">
                  Total units
                </td>
                <td className="px-3 py-2 text-right font-semibold">{totalQuantity}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}