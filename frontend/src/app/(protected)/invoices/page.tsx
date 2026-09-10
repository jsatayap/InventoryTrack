"use client";

import { useEffect, useState, FormEvent } from "react";
import Link from "next/link";
import { api, buildQuery, ApiError } from "@/lib/api";
import { Invoice, Location, Product, NewInvoiceItem } from "@/lib/types";

const STATUS_STYLES: Record<string, string> = {
  pending: "text-neutral-500",
  receiving: "text-amber-700",
  completed: "text-green-700",
  cancelled: "text-red-700",
};

const emptyLine: NewInvoiceItem = { product_id: 0, quantity: 1, unit_price: 0 };

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filterLocation, setFilterLocation] = useState<number | "">("");
  const [filterStatus, setFilterStatus] = useState<string>("");

  const [showAddForm, setShowAddForm] = useState(false);
  const [invoiceNo, setInvoiceNo] = useState("");
  const [invoiceLocation, setInvoiceLocation] = useState<number | "">("");
  const [lines, setLines] = useState<NewInvoiceItem[]>([{ ...emptyLine }]);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    api.get<Location[]>("/locations").then(setLocations).catch(() => {});
    api.get<Product[]>("/products").then(setProducts).catch(() => {});
    fetchInvoices();
  }, []);

  async function fetchInvoices() {
    setIsLoading(true);
    setError(null);
    try {
      const query = buildQuery({ location_id: filterLocation || undefined, status: filterStatus || undefined });
      const data = await api.get<Invoice[]>(`/invoices${query}`);
      setInvoices(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load invoices.");
    } finally {
      setIsLoading(false);
    }
  }

  function updateLine(index: number, patch: Partial<NewInvoiceItem>) {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  function addLine() {
    setLines((prev) => [...prev, { ...emptyLine }]);
  }

  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  function handleProductPick(index: number, productId: number) {
    const product = products.find((p) => p.id === productId);
    updateLine(index, {
      product_id: productId,
      unit_price: product ? product.price : 0,
    });
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!invoiceLocation) {
      setFormError("Select a location.");
      return;
    }
    if (lines.some((l) => !l.product_id || l.quantity <= 0)) {
      setFormError("Every line needs a product and a quantity greater than 0.");
      return;
    }

    setIsSaving(true);
    try {
      await api.post("/invoices", {
        invoice_no: invoiceNo,
        location_id: invoiceLocation,
        items: lines,
      });
      setInvoiceNo("");
      setInvoiceLocation("");
      setLines([{ ...emptyLine }]);
      setShowAddForm(false);
      fetchInvoices();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Could not create invoice.");
    } finally {
      setIsSaving(false);
    }
  }

  const lineTotal = (l: NewInvoiceItem) => l.quantity * l.unit_price;
  const grandTotal = lines.reduce((sum, l) => sum + lineTotal(l), 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-neutral-900">Invoices</h1>
        <button
          onClick={() => setShowAddForm((v) => !v)}
          className="bg-[#1E3A5F] text-white text-sm font-medium px-4 py-2 hover:bg-[#16304d] transition-colors"
        >
          {showAddForm ? "Cancel" : "New Invoice"}
        </button>
      </div>

      {showAddForm && (
        <form onSubmit={handleCreate} className="border border-neutral-300 bg-white p-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
            <label className="block">
              <span className="block text-xs text-neutral-500 mb-1">Invoice No.</span>
              <input
                required
                value={invoiceNo}
                onChange={(e) => setInvoiceNo(e.target.value)}
                className="input"
                placeholder="INV-0002"
              />
            </label>
            <label className="block">
              <span className="block text-xs text-neutral-500 mb-1">Receiving Location</span>
              <select
                required
                value={invoiceLocation}
                onChange={(e) => setInvoiceLocation(e.target.value ? Number(e.target.value) : "")}
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
          </div>

          <div className="border border-neutral-200">
            <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-neutral-50 text-xs text-neutral-500 font-medium">
              <div className="col-span-5">Product</div>
              <div className="col-span-2">Qty</div>
              <div className="col-span-2">Unit price</div>
              <div className="col-span-2 text-right">Line total</div>
              <div className="col-span-1"></div>
            </div>
            {lines.map((line, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 px-3 py-2 border-t border-neutral-200 items-center">
                <select
                  className="input col-span-5"
                  value={line.product_id || ""}
                  onChange={(e) => handleProductPick(i, Number(e.target.value))}
                >
                  <option value="">Select product…</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} {p.storage_size ? `(${p.storage_size})` : ""}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={1}
                  className="input col-span-2"
                  value={line.quantity}
                  onChange={(e) => updateLine(i, { quantity: Number(e.target.value) })}
                />
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  className="input col-span-2"
                  value={line.unit_price}
                  onChange={(e) => updateLine(i, { unit_price: Number(e.target.value) })}
                />
                <div className="col-span-2 text-right text-sm">{lineTotal(line).toLocaleString()}</div>
                <div className="col-span-1 text-right">
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
            ))}
          </div>

          <div className="flex items-center justify-between mt-3">
            <button
              type="button"
              onClick={addLine}
              className="text-sm text-[#1E3A5F] hover:underline"
            >
              + Add line
            </button>
            <div className="text-sm font-medium">
              Total: {grandTotal.toLocaleString()}
            </div>
          </div>

          <div className="flex items-center gap-3 mt-4">
            <button
              type="submit"
              disabled={isSaving}
              className="bg-[#1E3A5F] text-white text-sm font-medium px-4 py-2 hover:bg-[#16304d] disabled:opacity-50 transition-colors"
            >
              {isSaving ? "Saving…" : "Create invoice"}
            </button>
            {formError && <p className="text-sm text-red-700">{formError}</p>}
          </div>
        </form>
      )}

      <div className="border border-neutral-300 bg-white p-4 mb-4 flex flex-wrap gap-3 items-end">
        <label className="block">
          <span className="block text-xs text-neutral-500 mb-1">Location</span>
          <select
            value={filterLocation}
            onChange={(e) => setFilterLocation(e.target.value ? Number(e.target.value) : "")}
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
          <span className="block text-xs text-neutral-500 mb-1">Status</span>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="input"
          >
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="receiving">Receiving</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </label>
        <button
          onClick={fetchInvoices}
          className="bg-neutral-900 text-white text-sm font-medium px-4 py-2 hover:bg-neutral-700 transition-colors"
        >
          Filter
        </button>
      </div>

      {error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 px-3 py-2 mb-4">
          {error}
        </p>
      )}

      <div className="border border-neutral-300 bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-300 bg-neutral-50 text-left text-neutral-500">
              <th className="px-3 py-2 font-medium">Invoice No.</th>
              <th className="px-3 py-2 font-medium">Location</th>
              <th className="px-3 py-2 font-medium">Date</th>
              <th className="px-3 py-2 font-medium">Items</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-neutral-400">
                  Loading…
                </td>
              </tr>
            ) : invoices.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-neutral-400">
                  No invoices found.
                </td>
              </tr>
            ) : (
              invoices.map((inv) => (
                <tr key={inv.id} className="border-b border-neutral-200 last:border-0 hover:bg-neutral-50">
                  <td className="px-3 py-2">
                    <Link href={`/invoices/${inv.id}`} className="text-[#1E3A5F] hover:underline font-mono text-xs">
                      {inv.invoice_no}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-neutral-600">{inv.location_name}</td>
                  <td className="px-3 py-2 text-neutral-500">{inv.invoice_date}</td>
                  <td className="px-3 py-2 text-neutral-500">{inv.items.length}</td>
                  <td className="px-3 py-2">
                    <span className={STATUS_STYLES[inv.status] ?? ""}>{inv.status}</span>
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