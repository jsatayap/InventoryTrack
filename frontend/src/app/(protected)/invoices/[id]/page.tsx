"use client";

import { useEffect, useState, FormEvent } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { Invoice, Location, Product } from "@/lib/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldLabel, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Pencil } from "lucide-react";

const STATUS_STYLES: Record<string, string> = {
  pending: "text-neutral-500",
  receiving: "text-amber-700",
  completed: "text-green-700",
  cancelled: "text-red-700",
};

const STATUS_OPTIONS = ["pending", "receiving", "completed", "cancelled"];

type EditItemRow = {
  id?: number;
  product_id: string;
  quantity: number;
  unit_price: number;
  received_qty: number;
};

const emptyEditRow: EditItemRow = { product_id: "", quantity: 1, unit_price: 0, received_qty: 0 };

export default function InvoiceDetailPage() {
  const params = useParams<{ id: string }>();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showEditForm, setShowEditForm] = useState(false);
  const [editInvoiceNo, setEditInvoiceNo] = useState("");
  const [editLocationId, setEditLocationId] = useState<number | "">("");
  const [editStatus, setEditStatus] = useState("");
  const [editItems, setEditItems] = useState<EditItemRow[]>([{ ...emptyEditRow }]);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    api.get<Location[]>("/locations").then(setLocations).catch(() => {});
    api.get<Product[]>("/products").then(setProducts).catch(() => {});
    fetchInvoice();
  }, [params.id]);

  function fetchInvoice() {
    setIsLoading(true);
    setError(null);
    return api
      .get<Invoice>(`/invoices/${params.id}`)
      .then(setInvoice)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load invoice."))
      .finally(() => setIsLoading(false));
  }

  function openEditDialog() {
    if (!invoice) return;
    setEditInvoiceNo(invoice.invoice_no);
    setEditLocationId(invoice.location_id ?? "");
    setEditStatus(invoice.status);
    setEditItems(
      invoice.items.map((item) => ({
        id: item.id,
        product_id: item.product_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        received_qty: item.received_qty,
      }))
    );
    setFormError(null);
    setShowEditForm(true);
  }

  function updateEditItem(index: number, patch: Partial<EditItemRow>) {
    setEditItems((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function handleEditProductPick(index: number, productId: string) {
    const product = products.find((p) => p.id === productId);
    updateEditItem(index, {
      product_id: productId,
      unit_price: product ? product.price : 0,
    });
  }

  function addEditItem() {
    setEditItems((prev) => [...prev, { ...emptyEditRow }]);
  }

  function removeEditItem(index: number) {
    setEditItems((prev) => prev.filter((_, i) => i !== index));
  }

  const editLineTotal = (row: EditItemRow) => row.quantity * row.unit_price;
  const editGrandTotal = editItems.reduce((sum, row) => sum + editLineTotal(row), 0);

  async function handleEditInvoice(e: FormEvent) {
    e.preventDefault();
    if (!invoice) return;
    setFormError(null);

    if (!editLocationId) {
      setFormError("Select a location.");
      return;
    }
    if (editItems.length === 0) {
      setFormError("Invoice must have at least one item.");
      return;
    }
    if (editItems.some((row) => !row.product_id || row.quantity <= 0)) {
      setFormError("Every line needs a product and a quantity greater than 0.");
      return;
    }
    const shortItem = editItems.find((row) => row.quantity < row.received_qty);
    if (shortItem) {
      setFormError(
        `Quantity can't be less than what's already received (${shortItem.received_qty}).`
      );
      return;
    }

    setIsSaving(true);
    try {
      await api.put(`/invoices/${invoice.id}`, {
        invoice_no: editInvoiceNo,
        location_id: editLocationId,
        status: editStatus,
        items: editItems.map((row) => ({
          id: row.id,
          product_id: row.product_id,
          quantity: row.quantity,
          unit_price: row.unit_price,
        })),
      });
      setShowEditForm(false);
      fetchInvoice();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Could not update invoice.");
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return <p className="text-sm text-neutral-400">Loading…</p>;
  }

  if (error || !invoice) {
    return (
      <p className="text-sm text-red-700 bg-red-50 border border-red-200 px-3 py-2">
        {error ?? "Invoice not found."}
      </p>
    );
  }

  const isOpen = invoice.status === "pending" || invoice.status === "receiving";

  return (
    <div>
      <Link href="/invoices" className="text-sm text-[#1E3A5F] hover:underline">
        ← Back to invoices
      </Link>

      <div className="flex items-start justify-between mt-4 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-neutral-900 font-mono">{invoice.invoice_no}</h1>
            <Dialog open={showEditForm} onOpenChange={setShowEditForm}>
              <DialogTrigger
                render={
                  <Button variant="ghost" size="icon" aria-label="Edit invoice" onClick={openEditDialog}>
                    <Pencil className="size-4" />
                  </Button>
                }
              />
              <DialogContent className="sm:max-w-3xl max-h-[85vh] flex flex-col">
                <DialogHeader>
                  <DialogTitle>Edit Invoice</DialogTitle>
                </DialogHeader>

                <form onSubmit={handleEditInvoice} className="overflow-y-auto pr-1 -mr-1">
                  <FieldGroup>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <Field>
                        <FieldLabel htmlFor="edit-invoice-no">Invoice No.</FieldLabel>
                        <Input
                          id="edit-invoice-no"
                          required
                          value={editInvoiceNo}
                          onChange={(e) => setEditInvoiceNo(e.target.value)}
                          placeholder="INV-0002"
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="edit-invoice-location">Receiving Location</FieldLabel>
                        <select
                          id="edit-invoice-location"
                          required
                          value={editLocationId}
                          onChange={(e) =>
                            setEditLocationId(e.target.value ? Number(e.target.value) : "")
                          }
                          className="input"
                        >
                          <option value="">Select…</option>
                          {locations.map((loc) => (
                            <option key={loc.id} value={loc.id}>
                              {loc.name}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="edit-invoice-status">Status</FieldLabel>
                        <Select value={editStatus} onValueChange={setEditStatus}>
                          <SelectTrigger id="edit-invoice-status">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {STATUS_OPTIONS.map((status) => (
                              <SelectItem key={status} value={status} className="capitalize">
                                {status}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                    </div>

                    <div className="border border-neutral-200">
                      <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-neutral-50 text-xs text-neutral-500 font-medium">
                        <div className="col-span-4">Product</div>
                        <div className="col-span-2">Qty</div>
                        <div className="col-span-2">Unit price</div>
                        <div className="col-span-2 text-right">Line total</div>
                        <div className="col-span-2"></div>
                      </div>
                      {editItems.map((row, i) => (
                        <div
                          key={row.id ?? `new-${i}`}
                          className="grid grid-cols-12 gap-2 px-3 py-2 border-t border-neutral-200 items-center"
                        >
                          <select
                            className="input col-span-4"
                            value={row.product_id || ""}
                            onChange={(e) => handleEditProductPick(i, e.target.value)}
                          >
                            <option value="">Select product…</option>
                            {products.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name} {p.storage_size != null ? `(${p.storage_size} GB)` : ""}
                              </option>
                            ))}
                          </select>
                          <Input
                            type="number"
                            min={row.received_qty || 1}
                            className="col-span-2"
                            value={row.quantity}
                            onChange={(e) => updateEditItem(i, { quantity: Number(e.target.value) })}
                          />
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            className="col-span-2"
                            value={row.unit_price}
                            onChange={(e) => updateEditItem(i, { unit_price: Number(e.target.value) })}
                          />
                          <div className="col-span-2 text-right text-sm">
                            {editLineTotal(row).toLocaleString()}
                          </div>
                          <div className="col-span-2 text-right">
                            {row.received_qty > 0 ? (
                              <span className="text-xs text-neutral-400">
                                {row.received_qty} received
                              </span>
                            ) : (
                              editItems.length > 1 && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="text-red-600 hover:text-red-700"
                                  onClick={() => removeEditItem(i)}
                                >
                                  Remove
                                </Button>
                              )
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="flex items-center justify-between">
                      <Button type="button" variant="ghost" onClick={addEditItem}>
                        + Add line
                      </Button>
                      <div className="text-sm font-medium">
                        Total: {editGrandTotal.toLocaleString()}
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <Button type="submit" disabled={isSaving}>
                        {isSaving ? "Saving…" : "Save changes"}
                      </Button>
                      <Button type="button" variant="ghost" onClick={() => setShowEditForm(false)}>
                        Cancel
                      </Button>
                      {formError && <p className="text-sm text-red-700">{formError}</p>}
                    </div>
                  </FieldGroup>
                </form>
              </DialogContent>
            </Dialog>
          </div>
          <p className="text-sm text-neutral-500 mt-1">
            {invoice.location_name} · {invoice.invoice_date}
          </p>
        </div>
        <div className="text-right">
          <span className={`text-sm font-medium ${STATUS_STYLES[invoice.status] ?? ""}`}>
            {invoice.status}
          </span>
          {isOpen && (
            <div className="mt-2">
              <Link
                href={`/invoices/${invoice.id}/receive`}
                className="bg-[#1E3A5F] text-white text-sm font-medium px-4 py-2 hover:bg-[#16304d] transition-colors inline-block"
              >
                Receive items
              </Link>
            </div>
          )}
        </div>
      </div>

      <div className="border border-neutral-300 bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-300 bg-neutral-50 text-left text-neutral-500">
              <th className="px-3 py-2 font-medium">Product</th>
              <th className="px-3 py-2 font-medium text-right">Unit price</th>
              <th className="px-3 py-2 font-medium text-right">Ordered</th>
              <th className="px-3 py-2 font-medium text-right">Received</th>
              <th className="px-3 py-2 font-medium">Progress</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((item) => {
              const pct = item.quantity > 0 ? Math.min(100, (item.received_qty / item.quantity) * 100) : 0;
              const done = item.received_qty >= item.quantity;
              return (
                <tr key={item.id} className="border-b border-neutral-200 last:border-0">
                  <td className="px-3 py-2">{item.product_name}</td>
                  <td className="px-3 py-2 text-right">{item.unit_price.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right">{item.quantity}</td>
                  <td className="px-3 py-2 text-right">{item.received_qty}</td>
                  <td className="px-3 py-2">
                    <div className="w-32 h-2 bg-neutral-200">
                      <div
                        className={`h-2 ${done ? "bg-green-600" : "bg-[#1E3A5F]"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}