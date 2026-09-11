"use client";

import { useEffect, useState, FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { Invoice, Product, ReceiveResult } from "@/lib/types";

interface LineState {
  serialInput: string;
  qtyInput: number;
  error: string | null;
  isSubmitting: boolean;
}

export default function ReceivePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const invoiceId = params.id;

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [productsById, setProductsById] = useState<Record<string, Product>>({});
  const [lineState, setLineState] = useState<Record<string, LineState>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceId]);

  async function loadAll() {
    setIsLoading(true);
    setLoadError(null);
    try {
      const [inv, products] = await Promise.all([
        api.get<Invoice>(`/invoices/${invoiceId}`),
        api.get<Product[]>("/products"),
      ]);
      setInvoice(inv);
      setProductsById(Object.fromEntries(products.map((p) => [p.id, p])));
      setLineState(
        Object.fromEntries(
          inv.items.map((item) => [
            item.product_id,
            { serialInput: "", qtyInput: 1, error: null, isSubmitting: false },
          ])
        )
      );
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Could not load invoice.");
    } finally {
      setIsLoading(false);
    }
  }

  function patchLine(productId: string, patch: Partial<LineState>) {
    setLineState((prev) => ({ ...prev, [productId]: { ...prev[productId], ...patch } }));
  }

  function applyResult(productId: string, result: ReceiveResult) {
    setInvoice((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        status: result.invoice_status as Invoice["status"],
        items: prev.items.map((item) =>
          item.product_id === productId ? { ...item, received_qty: result.item_received_qty } : item
        ),
      };
    });
  }

  async function handleScanSerial(e: FormEvent, productId: string) {
    e.preventDefault();
    const serial = lineState[productId]?.serialInput.trim();
    if (!serial) return;

    patchLine(productId, { isSubmitting: true, error: null });
    try {
      const result = await api.post<ReceiveResult>(`/receive/${invoiceId}/scan-serial`, {
        product_id: productId,
        serial_number: serial,
      });
      applyResult(productId, result);
      patchLine(productId, { serialInput: "", isSubmitting: false });
    } catch (err) {
      patchLine(productId, {
        isSubmitting: false,
        error: err instanceof ApiError ? err.message : "Could not receive this serial.",
      });
    }
  }

  async function handleAddQuantity(productId: string) {
    const qty = lineState[productId]?.qtyInput ?? 0;
    if (qty <= 0) return;

    patchLine(productId, { isSubmitting: true, error: null });
    try {
      const result = await api.post<ReceiveResult>(`/receive/${invoiceId}/add-quantity`, {
        product_id: productId,
        quantity: qty,
      });
      applyResult(productId, result);
      patchLine(productId, { isSubmitting: false, qtyInput: 1 });
    } catch (err) {
      patchLine(productId, {
        isSubmitting: false,
        error: err instanceof ApiError ? err.message : "Could not receive this quantity.",
      });
    }
  }

  if (isLoading) {
    return <p className="text-sm text-neutral-400">Loading…</p>;
  }

  if (loadError || !invoice) {
    return (
      <p className="text-sm text-red-700 bg-red-50 border border-red-200 px-3 py-2">
        {loadError ?? "Invoice not found."}
      </p>
    );
  }

  const isCompleted = invoice.status === "completed";

  return (
    <div>
      <Link href={`/invoices/${invoice.id}`} className="text-sm text-[#1E3A5F] hover:underline">
        ← Back to invoice
      </Link>

      <div className="flex items-center justify-between mt-4 mb-6">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900">
            Receive — <span className="font-mono">{invoice.invoice_no}</span>
          </h1>
          <p className="text-sm text-neutral-500 mt-1">{invoice.location_name}</p>
        </div>
        {isCompleted && (
          <span className="text-sm font-medium text-green-700 bg-green-50 border border-green-200 px-3 py-1.5">
            Fully received
          </span>
        )}
      </div>

      <div className="space-y-4">
        {invoice.items.map((item) => {
          const product = productsById[item.product_id];
          const state = lineState[item.product_id];
          const remaining = item.quantity - item.received_qty;
          const done = remaining <= 0;

          return (
            <div key={item.id} className="border border-neutral-300 bg-white p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="font-medium text-neutral-900">{item.product_name}</p>
                  <p className="text-xs text-neutral-500">
                    {product?.is_serialized ? "Control serial" : "Non-control (quantity)"} ·{" "}
                    {item.received_qty} / {item.quantity} received
                  </p>
                </div>
                <div className="w-40 h-2 bg-neutral-200">
                  <div
                    className={`h-2 ${done ? "bg-green-600" : "bg-[#1E3A5F]"}`}
                    style={{ width: `${Math.min(100, (item.received_qty / item.quantity) * 100)}%` }}
                  />
                </div>
              </div>

              {done ? (
                <p className="text-sm text-green-700">Line complete.</p>
              ) : product?.is_serialized ? (
                <form onSubmit={(e) => handleScanSerial(e, item.product_id)} className="flex gap-2">
                  <input
                    autoFocus
                    placeholder="Scan or type serial / IMEI"
                    value={state?.serialInput ?? ""}
                    onChange={(e) => patchLine(item.product_id, { serialInput: e.target.value })}
                    disabled={state?.isSubmitting}
                    className="input flex-1"
                  />
                  <button
                    type="submit"
                    disabled={state?.isSubmitting}
                    className="bg-[#1E3A5F] text-white text-sm font-medium px-4 py-2 hover:bg-[#16304d] disabled:opacity-50 transition-colors"
                  >
                    Add
                  </button>
                </form>
              ) : (
                <div className="flex gap-2 items-center">
                  <input
                    type="number"
                    min={1}
                    max={remaining}
                    value={state?.qtyInput ?? 1}
                    onChange={(e) => patchLine(item.product_id, { qtyInput: Number(e.target.value) })}
                    disabled={state?.isSubmitting}
                    className="input w-28"
                  />
                  <span className="text-xs text-neutral-500">of {remaining} remaining</span>
                  <button
                    onClick={() => handleAddQuantity(item.product_id)}
                    disabled={state?.isSubmitting}
                    className="bg-[#1E3A5F] text-white text-sm font-medium px-4 py-2 hover:bg-[#16304d] disabled:opacity-50 transition-colors"
                  >
                    Add
                  </button>
                </div>
              )}

              {state?.error && <p className="text-sm text-red-700 mt-2">{state.error}</p>}
            </div>
          );
        })}
      </div>

      {isCompleted && (
        <button
          onClick={() => router.push(`/invoices/${invoice.id}`)}
          className="mt-6 bg-neutral-900 text-white text-sm font-medium px-4 py-2 hover:bg-neutral-700 transition-colors"
        >
          Done — back to invoice
        </button>
      )}
    </div>
  );
}