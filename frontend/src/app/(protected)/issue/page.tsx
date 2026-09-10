"use client";

import { useEffect, useState, FormEvent, Fragment } from "react";
import { api, buildQuery, ApiError } from "@/lib/api";
import { Location, Product, Issue, NewIssueItem } from "@/lib/types";

const TRADE_CODES = [
  { code: "01", label: "Transfer" },
  { code: "55", label: "Adjust / Stock tracking" },
  { code: "99", label: "Wasted" },
];

interface LineDraft {
  product_id: number;
  serialInput: string;
  quantityInput: number;
}

const emptyLine: LineDraft = { product_id: 0, serialInput: "", quantityInput: 1 };

export default function IssuePage() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [isLoadingIssues, setIsLoadingIssues] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const [filterLocation, setFilterLocation] = useState<number | "">("");

  // form state
  const [issueNo, setIssueNo] = useState("");
  const [locationId, setLocationId] = useState<number | "">("");
  const [toLocationId, setToLocationId] = useState<number | "">("");
  const [reasonMode, setReasonMode] = useState<"trade_code" | "trade_description">("trade_code");
  const [tradeCode, setTradeCode] = useState("01");
  const [remark, setRemark] = useState("");
  const [lines, setLines] = useState<LineDraft[]>([{ ...emptyLine }]);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    api.get<Location[]>("/locations").then(setLocations).catch(() => {});
    api.get<Product[]>("/products").then(setProducts).catch(() => {});
    fetchIssues();
  }, []);

  async function fetchIssues() {
    setIsLoadingIssues(true);
    setListError(null);
    try {
      const query = buildQuery({ location_id: filterLocation || undefined });
      const data = await api.get<Issue[]>(`/issues${query}`);
      setIssues(data);
    } catch (err) {
      setListError(err instanceof ApiError ? err.message : "Could not load issue history.");
    } finally {
      setIsLoadingIssues(false);
    }
  }

  function productById(id: number) {
    return products.find((p) => p.id === id);
  }

  function updateLine(index: number, patch: Partial<LineDraft>) {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  function addLine() {
    setLines((prev) => [...prev, { ...emptyLine }]);
  }

  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!locationId) {
      setFormError("Select a location.");
      return;
    }
    if (tradeCode === "01" && !toLocationId) {
      setFormError("Select a destination location for the transfer.");
      return;
    }
    if (tradeCode === "01" && toLocationId === locationId) {
      setFormError("Destination must be different from the source location.");
      return;
    }

    const items: NewIssueItem[] = [];
    for (const line of lines) {
      const product = productById(line.product_id);
      if (!product) {
        setFormError("Every line needs a product selected.");
        return;
      }
      if (product.is_serialized) {
        if (!line.serialInput.trim()) {
          setFormError(`Enter a serial number for ${product.name}.`);
          return;
        }
        items.push({ product_id: product.id, serial_number: line.serialInput.trim() });
      } else {
        if (line.quantityInput <= 0) {
          setFormError(`Enter a quantity greater than 0 for ${product.name}.`);
          return;
        }
        items.push({ product_id: product.id, quantity: line.quantityInput });
      }
    }

    setIsSaving(true);
    try {
      await api.post("/issues", {
        issue_no: issueNo,
        location_id: locationId,
        to_location_id: tradeCode === "01" ? toLocationId : undefined,
        reason_type: reasonMode,
        trade_code: tradeCode,
        remark: remark || undefined,
        items,
      });
      setIssueNo("");
      setLocationId("");
      setToLocationId("");
      setRemark("");
      setLines([{ ...emptyLine }]);
      fetchIssues();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Could not create issue.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div>
      <h1 className="text-xl font-semibold text-neutral-900 mb-6">Issue</h1>

      <form onSubmit={handleSubmit} className="border border-neutral-300 bg-white p-4 mb-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          <label className="block">
            <span className="block text-xs text-neutral-500 mb-1">Issue No.</span>
            <input
              required
              value={issueNo}
              onChange={(e) => setIssueNo(e.target.value)}
              className="input"
              placeholder="ISS-0001"
            />
          </label>
          <label className="block">
            <span className="block text-xs text-neutral-500 mb-1">Location</span>
            <select
              required
              value={locationId}
              onChange={(e) => setLocationId(e.target.value ? Number(e.target.value) : "")}
              className="input"
            >
              <option value="">Select…</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="block text-xs text-neutral-500 mb-1">Remark (optional)</span>
            <input value={remark} onChange={(e) => setRemark(e.target.value)} className="input" />
          </label>
        </div>

        <div className="mb-4">
          <span className="block text-xs text-neutral-500 mb-2">Reason</span>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex gap-3 text-sm">
              <label className="flex items-center gap-1.5">
                <input
                  type="radio"
                  checked={reasonMode === "trade_code"}
                  onChange={() => setReasonMode("trade_code")}
                />
                By trade code
              </label>
              <label className="flex items-center gap-1.5">
                <input
                  type="radio"
                  checked={reasonMode === "trade_description"}
                  onChange={() => setReasonMode("trade_description")}
                />
                By description
              </label>
            </div>

            {reasonMode === "trade_code" ? (
              <select value={tradeCode} onChange={(e) => setTradeCode(e.target.value)} className="input w-auto">
                {TRADE_CODES.map((t) => (
                  <option key={t.code} value={t.code}>
                    {t.code}
                  </option>
                ))}
              </select>
            ) : (
              <select value={tradeCode} onChange={(e) => setTradeCode(e.target.value)} className="input w-auto">
                {TRADE_CODES.map((t) => (
                  <option key={t.code} value={t.code}>
                    {t.label}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {tradeCode === "01" && (
          <div className="mb-4">
            <label className="block max-w-xs">
              <span className="block text-xs text-neutral-500 mb-1">Transfer to location</span>
              <select
                required
                value={toLocationId}
                onChange={(e) => setToLocationId(e.target.value ? Number(e.target.value) : "")}
                className="input"
              >
                <option value="">Select destination…</option>
                {locations
                  .filter((loc) => loc.id !== locationId)
                  .map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name}
                    </option>
                  ))}
              </select>
            </label>
          </div>
        )}

        <div className="border border-neutral-200">
          <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-neutral-50 text-xs text-neutral-500 font-medium">
            <div className="col-span-5">Product</div>
            <div className="col-span-5">Serial / Quantity</div>
            <div className="col-span-2 text-right"></div>
          </div>
          {lines.map((line, i) => {
            const product = productById(line.product_id);
            return (
              <div key={i} className="grid grid-cols-12 gap-2 px-3 py-2 border-t border-neutral-200 items-center">
                <select
                  className="input col-span-5"
                  value={line.product_id || ""}
                  onChange={(e) => updateLine(i, { product_id: Number(e.target.value) })}
                >
                  <option value="">Select product…</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} {p.storage_size ? `(${p.storage_size})` : ""}
                    </option>
                  ))}
                </select>

                {!line.product_id ? (
                  <div className="col-span-5 text-xs text-neutral-400">Pick a product first</div>
                ) : product?.is_serialized ? (
                  <input
                    placeholder="Serial / IMEI"
                    value={line.serialInput}
                    onChange={(e) => updateLine(i, { serialInput: e.target.value })}
                    className="input col-span-5"
                  />
                ) : (
                  <input
                    type="number"
                    min={1}
                    value={line.quantityInput}
                    onChange={(e) => updateLine(i, { quantityInput: Number(e.target.value) })}
                    className="input col-span-5"
                  />
                )}

                <div className="col-span-2 text-right">
                  {lines.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeLine(i)}
                      className="text-sm text-red-600 hover:underline"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <button type="button" onClick={addLine} className="text-sm text-[#1E3A5F] hover:underline mt-3">
          + Add line
        </button>

        <div className="flex items-center gap-3 mt-4">
          <button
            type="submit"
            disabled={isSaving}
            className="bg-[#1E3A5F] text-white text-sm font-medium px-4 py-2 hover:bg-[#16304d] disabled:opacity-50 transition-colors"
          >
            {isSaving ? "Submitting…" : "Submit issue"}
          </button>
          {formError && <p className="text-sm text-red-700">{formError}</p>}
        </div>
      </form>

      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-medium text-neutral-700">Issue history</h2>
        <div className="flex items-center gap-2">
          <select
            value={filterLocation}
            onChange={(e) => setFilterLocation(e.target.value ? Number(e.target.value) : "")}
            className="input w-auto"
          >
            <option value="">All locations</option>
            {locations.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.name}
              </option>
            ))}
          </select>
          <button
            onClick={fetchIssues}
            className="bg-neutral-900 text-white text-sm font-medium px-3 py-2 hover:bg-neutral-700 transition-colors"
          >
            Filter
          </button>
        </div>
      </div>

      {listError && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 px-3 py-2 mb-4">{listError}</p>
      )}

      <div className="border border-neutral-300 bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-300 bg-neutral-50 text-left text-neutral-500">
              <th className="px-3 py-2 font-medium">Issue No.</th>
              <th className="px-3 py-2 font-medium">Location</th>
              <th className="px-3 py-2 font-medium">Reason</th>
              <th className="px-3 py-2 font-medium">Date</th>
              <th className="px-3 py-2 font-medium">Items</th>
            </tr>
          </thead>
          <tbody>
            {isLoadingIssues ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-neutral-400">
                  Loading…
                </td>
              </tr>
            ) : issues.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-neutral-400">
                  No issues yet.
                </td>
              </tr>
            ) : (
              issues.map((iss) => {
                const label = TRADE_CODES.find((t) => t.code === iss.trade_code)?.label ?? iss.trade_code;
                const isExpanded = expandedId === iss.id;
                return (
                  <Fragment key={iss.id}>
                    <tr
                      onClick={() => setExpandedId(isExpanded ? null : iss.id)}
                      className="border-b border-neutral-200 last:border-0 hover:bg-neutral-50 cursor-pointer"
                    >
                      <td className="px-3 py-2 font-mono text-xs">{iss.issue_no}</td>
                      <td className="px-3 py-2 text-neutral-600">{iss.location_name}</td>
                      <td className="px-3 py-2 text-neutral-500">
                        {iss.trade_code} · {label}
                        {iss.to_location_name && (
                          <span className="text-neutral-400"> → {iss.to_location_name}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-neutral-500">{iss.issue_date}</td>
                      <td className="px-3 py-2 text-neutral-500">{iss.items.length}</td>
                    </tr>
                    {isExpanded && (
                      <tr className="border-b border-neutral-200 bg-neutral-50">
                        <td colSpan={5} className="px-3 py-3">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-neutral-500">
                                <th className="text-left font-medium py-1">Product</th>
                                <th className="text-left font-medium py-1">Serial</th>
                                <th className="text-right font-medium py-1">Qty</th>
                              </tr>
                            </thead>
                            <tbody>
                              {iss.items.map((item) => (
                                <tr key={item.id}>
                                  <td className="py-1">{item.product_name}</td>
                                  <td className="py-1 font-mono">{item.serial_number ?? "—"}</td>
                                  <td className="py-1 text-right">{item.quantity}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {iss.remark && (
                            <p className="text-xs text-neutral-500 mt-2">Remark: {iss.remark}</p>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}