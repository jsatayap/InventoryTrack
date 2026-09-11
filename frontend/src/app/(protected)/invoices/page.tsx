"use client";

import { useEffect, useState, FormEvent } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";
import { Invoice, Location, Product, NewInvoiceItem } from "@/lib/types";
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
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationPrevious,
  PaginationNext,
} from "@/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown } from "lucide-react";

const STATUS_STYLES: Record<string, string> = {
  pending: "text-neutral-500",
  receiving: "text-amber-700",
  completed: "text-green-700",
  cancelled: "text-red-700",
};

const STATUS_OPTIONS = ["pending", "receiving", "completed", "cancelled"];

const emptyLine: NewInvoiceItem = { product_id: "", quantity: 1, unit_price: 0 };

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedLocationIds, setSelectedLocationIds] = useState<number[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);

  const [showAddForm, setShowAddForm] = useState(false);
  const [invoiceNo, setInvoiceNo] = useState("");
  const [invoiceLocation, setInvoiceLocation] = useState<number | "">("");
  const [lines, setLines] = useState<NewInvoiceItem[]>([{ ...emptyLine }]);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    api.get<Location[]>("/locations").then(setLocations).catch(() => {});
    api.get<Product[]>("/products").then(setProducts).catch(() => {});
    fetchInvoices();
  }, []);

  async function fetchInvoices() {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.get<Invoice[]>("/invoices");
      setInvoices(data);
      setCurrentPage(1);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load invoices.");
    } finally {
      setIsLoading(false);
    }
  }

  function toggleLocationFilter(id: number) {
    setSelectedLocationIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
    setCurrentPage(1);
  }

  function toggleStatusFilter(status: string) {
    setSelectedStatuses((prev) =>
      prev.includes(status) ? prev.filter((x) => x !== status) : [...prev, status]
    );
    setCurrentPage(1);
  }

  function clearFilters() {
    setSelectedLocationIds([]);
    setSelectedStatuses([]);
    setCurrentPage(1);
  }

  function resetAddForm() {
    setInvoiceNo("");
    setInvoiceLocation("");
    setLines([{ ...emptyLine }]);
    setFormError(null);
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

  function handleProductPick(index: number, productId: string) {
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
      resetAddForm();
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

  const selectedLocationNames = locations
    .filter((l) => selectedLocationIds.includes(l.id))
    .map((l) => l.name);

  const filteredInvoices = invoices.filter((inv) => {
    const locationMatch =
      selectedLocationNames.length === 0 || selectedLocationNames.includes(inv.location_name);
    const statusMatch = selectedStatuses.length === 0 || selectedStatuses.includes(inv.status);
    return locationMatch && statusMatch;
  });

  const totalPages = Math.max(1, Math.ceil(filteredInvoices.length / pageSize));
  const pageStart = (currentPage - 1) * pageSize;
  const pagedInvoices = filteredInvoices.slice(pageStart, pageStart + pageSize);

  function handlePageSizeChange(value: string) {
    setPageSize(Number(value));
    setCurrentPage(1);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-neutral-900">Invoices</h1>
        <Dialog
          open={showAddForm}
          onOpenChange={(open) => {
            setShowAddForm(open);
            if (!open) resetAddForm();
          }}
        >
          <DialogTrigger
            render={
              <Button className="bg-[#1E3A5F] text-white hover:bg-[#16304d]">
                New Invoice
              </Button>
            }
          />
          <DialogContent className="sm:max-w-3xl max-h-[85vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>New Invoice</DialogTitle>
            </DialogHeader>

            <form onSubmit={handleCreate} className="overflow-y-auto pr-1 -mr-1">
              <FieldGroup>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Field>
                    <FieldLabel htmlFor="invoice-no">Invoice No.</FieldLabel>
                    <Input
                      id="invoice-no"
                      required
                      value={invoiceNo}
                      onChange={(e) => setInvoiceNo(e.target.value)}
                      placeholder="INV-0002"
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="invoice-location">Receiving Location</FieldLabel>
                    <select
                      id="invoice-location"
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
                  </Field>
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
                        onChange={(e) => handleProductPick(i, e.target.value)}
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
                        min={1}
                        className="col-span-2"
                        value={line.quantity}
                        onChange={(e) => updateLine(i, { quantity: Number(e.target.value) })}
                      />
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        className="col-span-2"
                        value={line.unit_price}
                        onChange={(e) => updateLine(i, { unit_price: Number(e.target.value) })}
                      />
                      <div className="col-span-2 text-right text-sm">{lineTotal(line).toLocaleString()}</div>
                      <div className="col-span-1 text-right">
                        {lines.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:text-red-700"
                            onClick={() => removeLine(i)}
                          >
                            Remove
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between">
                  <Button type="button" variant="ghost" onClick={addLine}>
                    + Add line
                  </Button>
                  <div className="text-sm font-medium">
                    Total: {grandTotal.toLocaleString()}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Button type="submit" disabled={isSaving}>
                    {isSaving ? "Saving…" : "Create invoice"}
                  </Button>
                  {formError && <p className="text-sm text-red-700">{formError}</p>}
                </div>
              </FieldGroup>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="border border-neutral-300 bg-white p-4 mb-4 flex flex-wrap gap-3 items-center">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="outline" className="justify-between min-w-[160px]">
                <span>
                  Location
                  {selectedLocationIds.length > 0 ? ` (${selectedLocationIds.length})` : ""}
                </span>
                <ChevronDown className="size-4 opacity-50" />
              </Button>
            }
          />
          <DropdownMenuContent align="start">
            {locations.map((loc) => (
              <DropdownMenuCheckboxItem
                key={loc.id}
                checked={selectedLocationIds.includes(loc.id)}
                onCheckedChange={() => toggleLocationFilter(loc.id)}
                onSelect={(e) => e.preventDefault()}
              >
                {loc.name}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="outline" className="justify-between min-w-[160px]">
                <span>
                  Status
                  {selectedStatuses.length > 0 ? ` (${selectedStatuses.length})` : ""}
                </span>
                <ChevronDown className="size-4 opacity-50" />
              </Button>
            }
          />
          <DropdownMenuContent align="start">
            {STATUS_OPTIONS.map((status) => (
              <DropdownMenuCheckboxItem
                key={status}
                checked={selectedStatuses.includes(status)}
                onCheckedChange={() => toggleStatusFilter(status)}
                onSelect={(e) => e.preventDefault()}
                className="capitalize"
              >
                {status}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {(selectedLocationIds.length > 0 || selectedStatuses.length > 0) && (
          <Button variant="ghost" onClick={clearFilters}>
            Clear filters
          </Button>
        )}
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
            ) : pagedInvoices.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-neutral-400">
                  No invoices found.
                </td>
              </tr>
            ) : (
              pagedInvoices.map((inv) => (
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

      <div className="flex items-center justify-between mt-4">
        <Field orientation="horizontal" className="items-center gap-2 w-auto">
          <FieldLabel htmlFor="page-size" className="font-normal text-neutral-500">
            Rows per page
          </FieldLabel>
          <Select value={String(pageSize)} onValueChange={handlePageSizeChange}>
            <SelectTrigger id="page-size" className="w-[80px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="5">5</SelectItem>
              <SelectItem value="10">10</SelectItem>
              <SelectItem value="20">20</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        <div className="flex items-center gap-4">
          <p className="text-sm text-neutral-500">
            Page {currentPage} of {totalPages}
          </p>
          <Pagination className="mx-0 w-auto">
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    setCurrentPage((p) => Math.max(1, p - 1));
                  }}
                  aria-disabled={currentPage === 1}
                  className={currentPage === 1 ? "pointer-events-none opacity-50" : undefined}
                />
              </PaginationItem>
              <PaginationItem>
                <PaginationNext
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    setCurrentPage((p) => Math.min(totalPages, p + 1));
                  }}
                  aria-disabled={currentPage === totalPages}
                  className={
                    currentPage === totalPages ? "pointer-events-none opacity-50" : undefined
                  }
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      </div>
    </div>
  );
}