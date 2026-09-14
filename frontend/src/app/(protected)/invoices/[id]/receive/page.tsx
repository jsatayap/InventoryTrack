"use client";

import { useEffect, useState, FormEvent, KeyboardEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { Invoice, Product, ReceiveResult } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";

interface LineState {
  serialInput: string;
  pendingSerials: string[];
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
            { serialInput: "", pendingSerials: [], qtyInput: 1, error: null, isSubmitting: false },
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

  function remainingCapacity(productId: string): number {
    const item = invoice?.items.find((i) => i.product_id === productId);
    if (!item) return 0;
    const staged = lineState[productId]?.pendingSerials.length ?? 0;
    return item.quantity - item.received_qty - staged;
  }

  function stageSerial(e: FormEvent, productId: string) {
    e.preventDefault();
    const state = lineState[productId];
    const serial = state?.serialInput.trim();
    if (!serial) return;

    if (state.pendingSerials.some((s) => s.toLowerCase() === serial.toLowerCase())) {
      patchLine(productId, { error: `"${serial}" is already staged.`, serialInput: "" });
      return;
    }
    if (remainingCapacity(productId) <= 0) {
      patchLine(productId, { error: "All items for this line are already staged or received." });
      return;
    }

    patchLine(productId, {
      pendingSerials: [...state.pendingSerials, serial],
      serialInput: "",
      error: null,
    });
  }

  function removeStagedSerial(productId: string, index: number) {
    const state = lineState[productId];
    patchLine(productId, {
      pendingSerials: state.pendingSerials.filter((_, i) => i !== index),
    });
  }

  function handleSerialKeyDown(e: KeyboardEvent<HTMLInputElement>, productId: string) {
    // Comma also stages a serial, in case a scanner is configured to emit one instead of Enter.
    if (e.key === ",") {
      e.preventDefault();
      stageSerial(e as unknown as FormEvent, productId);
    }
  }

  async function handleAddStagedSerials(productId: string) {
    const state = lineState[productId];
    const serials = state?.pendingSerials ?? [];
    if (serials.length === 0) return;

    patchLine(productId, { isSubmitting: true, error: null });

    for (const serial of serials) {
      try {
        const result = await api.post<ReceiveResult>(`/receive/${invoiceId}/scan-serial`, {
          product_id: productId,
          serial_number: serial,
        });
        applyResult(productId, result);
        // Remove this serial from the pending list now that it's confirmed saved.
        setLineState((prev) => ({
          ...prev,
          [productId]: {
            ...prev[productId],
            pendingSerials: prev[productId].pendingSerials.filter((s) => s !== serial),
          },
        }));
      } catch (err) {
        patchLine(productId, {
          isSubmitting: false,
          error:
            err instanceof ApiError
              ? `"${serial}": ${err.message}`
              : `Could not receive serial "${serial}".`,
        });
        return; // stop on first failure; remaining serials stay staged for retry
      }
    }

    patchLine(productId, { isSubmitting: false });
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
          const stagedCount = state?.pendingSerials.length ?? 0;

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
                <div>
                  <form
                    onSubmit={(e) => stageSerial(e, item.product_id)}
                    className="flex gap-2 mb-2"
                  >
                    <Input
                      autoFocus
                      placeholder="Scan or type serial / IMEI, then press Enter"
                      value={state?.serialInput ?? ""}
                      onChange={(e) => patchLine(item.product_id, { serialInput: e.target.value })}
                      onKeyDown={(e) => handleSerialKeyDown(e, item.product_id)}
                      disabled={state?.isSubmitting}
                      className="flex-1"
                    />
                    <Button
                      type="submit"
                      variant="secondary"
                      disabled={state?.isSubmitting}
                    >
                      Stage
                    </Button>
                  </form>

                  {stagedCount > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {state.pendingSerials.map((serial, i) => (
                        <Badge key={`${serial}-${i}`} variant="secondary" className="gap-1 pr-1 font-mono text-xs">
                          {serial}
                          <button
                            type="button"
                            onClick={() => removeStagedSerial(item.product_id, i)}
                            disabled={state.isSubmitting}
                            aria-label={`Remove ${serial}`}
                            className="rounded-sm hover:bg-neutral-300/60 p-0.5"
                          >
                            <X className="size-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center gap-3">
                    <Button
                      type="button"
                      onClick={() => handleAddStagedSerials(item.product_id)}
                      disabled={stagedCount === 0 || state?.isSubmitting}
                    >
                      {state?.isSubmitting
                        ? "Adding…"
                        : `Add ${stagedCount > 0 ? stagedCount : ""} serial${stagedCount === 1 ? "" : "s"}`.trim()}
                    </Button>
                    <span className="text-xs text-neutral-500">
                      {remaining - stagedCount} remaining
                    </span>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2 items-center">
                  <Input
                    type="number"
                    min={1}
                    max={remaining}
                    value={state?.qtyInput ?? 1}
                    onChange={(e) => patchLine(item.product_id, { qtyInput: Number(e.target.value) })}
                    disabled={state?.isSubmitting}
                    className="w-28"
                  />
                  <span className="text-xs text-neutral-500">of {remaining} remaining</span>
                  <Button
                    onClick={() => handleAddQuantity(item.product_id)}
                    disabled={state?.isSubmitting}
                  >
                    Add
                  </Button>
                </div>
              )}

              {state?.error && <p className="text-sm text-red-700 mt-2">{state.error}</p>}
            </div>
          );
        })}
      </div>

      {isCompleted && (
        <Button
          onClick={() => router.push(`/invoices/${invoice.id}`)}
          variant="secondary"
          className="mt-6"
        >
          Done — back to invoice
        </Button>
      )}
    </div>
  );
}