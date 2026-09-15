"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { Location, StockTransactionRow } from "@/lib/types";
import { Field, FieldLabel } from "@/components/ui/field";
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

const TYPE_STYLES: Record<string, string> = {
  RCV: "text-green-700",
  ISS: "text-amber-700",
};

const TYPE_OPTIONS = ["RCV", "ISS"];
const TYPE_LABELS: Record<string, string> = {
  RCV: "Receive",
  ISS: "Issue",
};

function formatDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function StockTransactionsPage() {
  const [rows, setRows] = useState<StockTransactionRow[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedLocationIds, setSelectedLocationIds] = useState<number[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [productName, setProductName] = useState("");

  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    api.get<Location[]>("/locations").then(setLocations).catch(() => {});
    fetchTransactions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchTransactions() {
    setIsLoading(true);
    setError(null);
    try {
      // Backend already orders by created_at DESC, so the newest transaction is first.
      const data = await api.get<StockTransactionRow[]>("/stock/transactions");
      setRows(data);
      setCurrentPage(1);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load stock transactions.");
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

  function toggleTypeFilter(t: string) {
    setSelectedTypes((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]
    );
    setCurrentPage(1);
  }

  function clearFilters() {
    setSelectedLocationIds([]);
    setSelectedTypes([]);
    setProductName("");
    setCurrentPage(1);
  }

  const filteredRows = rows.filter((r) => {
    const locationMatch =
      selectedLocationIds.length === 0 || selectedLocationIds.includes(r.location_id);
    const typeMatch = selectedTypes.length === 0 || selectedTypes.includes(r.trade_type);
    const nameMatch =
      productName.trim() === "" ||
      (r.product_name ?? "").toLowerCase().includes(productName.trim().toLowerCase());
    return locationMatch && typeMatch && nameMatch;
  });

  // Rows already arrive sorted newest-first from the API; re-sort defensively in case
  // filters/pagination logic is ever reused against a differently-ordered source.
  const sortedRows = [...filteredRows].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const pageStart = (currentPage - 1) * pageSize;
  const pagedRows = sortedRows.slice(pageStart, pageStart + pageSize);

  function handlePageSizeChange(value: string) {
    setPageSize(Number(value));
    setCurrentPage(1);
  }

  const hasFilters =
    selectedLocationIds.length > 0 || selectedTypes.length > 0 || productName.trim() !== "";

  return (
    <div>
      <h1 className="text-xl font-semibold text-neutral-900 mb-6">Stock Transactions</h1>

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
                  Type
                  {selectedTypes.length > 0 ? ` (${selectedTypes.length})` : ""}
                </span>
                <ChevronDown className="size-4 opacity-50" />
              </Button>
            }
          />
          <DropdownMenuContent align="start">
            {TYPE_OPTIONS.map((t) => (
              <DropdownMenuCheckboxItem
                key={t}
                checked={selectedTypes.includes(t)}
                onCheckedChange={() => toggleTypeFilter(t)}
                onSelect={(e) => e.preventDefault()}
              >
                {TYPE_LABELS[t]}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Input
          placeholder="Search product name…"
          value={productName}
          onChange={(e) => {
            setProductName(e.target.value);
            setCurrentPage(1);
          }}
          className="w-[220px]"
        />

        {hasFilters && (
          <Button variant="ghost" onClick={clearFilters}>
            Clear filters
          </Button>
        )}
      </div>

      {error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 px-3 py-2 mb-4">{error}</p>
      )}

      <div className="border border-neutral-300 bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-300 bg-neutral-50 text-left text-neutral-500">
              <th className="px-3 py-2 font-medium">Date</th>
              <th className="px-3 py-2 font-medium">Type</th>
              <th className="px-3 py-2 font-medium">Product</th>
              <th className="px-3 py-2 font-medium">Location</th>
              <th className="px-3 py-2 font-medium">Serial / Qty</th>
              <th className="px-3 py-2 font-medium">Reference</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-neutral-400">
                  Loading…
                </td>
              </tr>
            ) : pagedRows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-neutral-400">
                  No transactions found.
                </td>
              </tr>
            ) : (
              pagedRows.map((r) => (
                <tr key={r.id} className="border-b border-neutral-200 last:border-0">
                  <td className="px-3 py-2 text-neutral-600 whitespace-nowrap">
                    {formatDateTime(r.created_at)}
                  </td>
                  <td className="px-3 py-2">
                    <span className={TYPE_STYLES[r.trade_type] ?? ""}>
                      {TYPE_LABELS[r.trade_type] ?? r.trade_type}
                    </span>
                  </td>
                  <td className="px-3 py-2">{r.product_name ?? "—"}</td>
                  <td className="px-3 py-2 text-neutral-600">{r.location_name ?? "—"}</td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {r.serial_number ?? `Qty: ${r.quantity}`}
                  </td>
                  <td className="px-3 py-2 text-neutral-500">{r.ref_doc_number ?? "—"}</td>
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