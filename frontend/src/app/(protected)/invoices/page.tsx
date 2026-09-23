"use client";

import { useEffect, useState, FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { Invoice, Issue, Location, Product, NewInvoiceItem, TRANSFER_STATUS, TRADE_CODE } from "@/lib/types";
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

// Same palette as STATUS_STYLES above, keyed by transfer_status_label instead.
const TRANSFER_STATUS_STYLES: Record<string, string> = {
  in_transit: "text-amber-700",
  received: "text-green-700",
};

const emptyLine: NewInvoiceItem = { product_id: "", quantity: 1, unit_price: 0 };

export default function InvoicesPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"invoices" | "transfers">("invoices");

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [transfers, setTransfers] = useState<Issue[]>([]);
  const [isLoadingTransfers, setIsLoadingTransfers] = useState(true);
  const [transfersError, setTransfersError] = useState<string | null>(null);

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
    fetchTransfers();
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

  async function fetchTransfers() {
    setIsLoadingTransfers(true);
    setTransfersError(null);
    try {
      const data = await api.get<Issue[]>("/issues");
      setTransfers(data.filter((iss) => iss.trade_code === TRADE_CODE.TRANSFER));
    } catch (err) {
      setTransfersError(err instanceof ApiError ? err.message : "Could not load incoming transfers.");
    } finally {
      setIsLoadingTransfers(false);
    }
  }

  async function handleReceiveTransfer(issueId: number) {
    setTransfersError(null);
    try {
      const invoice = await api.post<Invoice>(`/issues/${issueId}/receiving-invoice`, {});
      router.push(`/invoices/${invoice.id}`);
    } catch (err) {
      setTransfersError(err instanceof ApiError ? err.message : "Could not open receiving invoice.");
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
      selectedLocationNames.length === 0 || selectedLocationNames.includes(inv.location_name ?? "");
    const statusMatch = selectedStatuses.length === 0 || selectedStatuses.includes(inv.status_label ?? "");
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
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold text-neutral-900">Invoices</h1>

        <div className="flex items-center gap-2">
          <Button
            variant={activeTab === "invoices" ? "default" : "outline"}
            onClick={() => setActiveTab("invoices")}
          >
            Invoices
          </Button>
          <Button
            variant={activeTab === "transfers" ? "default" : "outline"}
            onClick={() => setActiveTab("transfers")}
          >
            Incoming Transfers
          </Button>

          {activeTab === "invoices" && (
            <Dialog open={showAddForm} onOpenChange={setShowAddForm}>
              <DialogTrigger
                render={<Button onClick={() => setShowAddForm(true)}>New Invoice</Button>}
              />
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>New Invoice</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleCreate}>
                  <FieldGroup>
                    <Field>
                      <FieldLabel htmlFor="invoice-no">Invoice No.</FieldLabel>
                      <Input
                        id="invoice-no"
                        value={invoiceNo}
                        onChange={(e) => setInvoiceNo(e.target.value)}
                        required
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="invoice-location">Location</FieldLabel>
                      <Select
                        value={invoiceLocation ? String(invoiceLocation) : ""}
                        onValueChange={(v) => setInvoiceLocation(Number(v))}
                      >
                        <SelectTrigger id="invoice-location">
                          <SelectValue placeholder="Select a location" />
                        </SelectTrigger>
                        <SelectContent>
                          {locations.map((loc) => (
                            <SelectItem key={loc.id} value={String(loc.id)}>
                              {loc.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>

                    {lines.map((line, i) => (
                      <div key={i} className="flex items-end gap-2">
                        <Field className="flex-1">
                          <FieldLabel>Product</FieldLabel>
                          <Select
                            value={line.product_id}
                            onValueChange={(v) => handleProductPick(i, v)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select a product" />
                            </SelectTrigger>
                            <SelectContent>
                              {products.map((p) => (
                                <SelectItem key={p.id} value={p.id}>
                                  {p.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </Field>
                        <Field className="w-24">
                          <FieldLabel>Qty</FieldLabel>
                          <Input
                            type="number"
                            min={1}
                            value={line.quantity}
                            onChange={(e) => updateLine(i, { quantity: Number(e.target.value) })}
                          />
                        </Field>
                        <Field className="w-28">
                          <FieldLabel>Unit Price</FieldLabel>
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            value={line.unit_price}
                            onChange={(e) => updateLine(i, { unit_price: Number(e.target.value) })}
                          />
                        </Field>
                        <Button
                          type="button"
                          variant="ghost"
                          onClick={() => removeLine(i)}
                          disabled={lines.length === 1}
                        >
                          Remove
                        </Button>
                      </div>
                    ))}

                    <Button type="button" variant="outline" onClick={addLine}>
                      Add Line
                    </Button>

                    <p className="text-sm text-neutral-600">
                      Total: {grandTotal.toFixed(2)}
                    </p>

                    {formError && (
                      <p className="text-sm text-red-700">{formError}</p>
                    )}

                    <Button type="submit" disabled={isSaving}>
                      {isSaving ? "Saving…" : "Create Invoice"}
                    </Button>
                  </FieldGroup>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {activeTab === "invoices" && (
      <>
      <div className="flex items-center gap-2 mb-4">
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
                    <span className={STATUS_STYLES[inv.status_label ?? ""] ?? ""}>
                      {inv.status_label ?? inv.status}
                    </span>
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
      </>
      )}

      {activeTab === "transfers" && (
        <div className="border border-neutral-300 bg-white overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-300 bg-neutral-50 text-left text-neutral-500">
                <th className="px-3 py-2 font-medium">Issue No.</th>
                <th className="px-3 py-2 font-medium">From</th>
                <th className="px-3 py-2 font-medium">To</th>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Items</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {transfersError ? (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-red-700">
                    {transfersError}
                  </td>
                </tr>
              ) : isLoadingTransfers ? (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-neutral-400">
                    Loading…
                  </td>
                </tr>
              ) : transfers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-neutral-400">
                    No transfers yet.
                  </td>
                </tr>
              ) : (
                transfers.map((t) => {
                  const isInTransit = t.transfer_status === TRANSFER_STATUS.IN_TRANSIT;
                  return (
                    <tr key={t.id} className="border-b border-neutral-200 last:border-0 hover:bg-neutral-50">
                      <td className="px-3 py-2 font-mono text-xs">{t.issue_no}</td>
                      <td className="px-3 py-2 text-neutral-600">{t.location_name}</td>
                      <td className="px-3 py-2 text-neutral-600">{t.to_location_name}</td>
                      <td className="px-3 py-2 text-neutral-500">{t.issue_date}</td>
                      <td className="px-3 py-2 text-neutral-500">{t.items.length}</td>
                      <td className="px-3 py-2">
                        <span
                          className={
                            (t.transfer_status_label && TRANSFER_STATUS_STYLES[t.transfer_status_label]) ?? ""
                          }
                        >
                          {t.transfer_status_label ?? "—"}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        {isInTransit && (
                          <button
                            onClick={() => handleReceiveTransfer(t.id)}
                            className="text-[#1E3A5F] hover:underline text-xs font-medium"
                          >
                            Receive
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}