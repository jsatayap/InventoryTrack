"use client";

import { useEffect, useState, FormEvent } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { Invoice, Location } from "@/lib/types";
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

export default function InvoiceDetailPage() {
  const params = useParams<{ id: string }>();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showEditForm, setShowEditForm] = useState(false);
  const [editInvoiceNo, setEditInvoiceNo] = useState("");
  const [editLocationId, setEditLocationId] = useState<number | "">("");
  const [editStatus, setEditStatus] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    api.get<Location[]>("/locations").then(setLocations).catch(() => {});
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
    setFormError(null);
    setShowEditForm(true);
  }

  async function handleEditInvoice(e: FormEvent) {
    e.preventDefault();
    if (!invoice) return;
    setFormError(null);

    if (!editLocationId) {
      setFormError("Select a location.");
      return;
    }

    setIsSaving(true);
    try {
      await api.put(`/invoices/${invoice.id}`, {
        invoice_no: editInvoiceNo,
        location_id: editLocationId,
        status: editStatus,
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
              <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col">
                <DialogHeader>
                  <DialogTitle>Edit Invoice</DialogTitle>
                </DialogHeader>

                <form onSubmit={handleEditInvoice} className="overflow-y-auto pr-1 -mr-1">
                  <FieldGroup>
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