"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { Location, StockTrackingRow } from "@/lib/types";
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

const STATUS_STYLES: Record<string, string> = {
  in_stock: "text-green-700",
  issued: "text-amber-700",
  wasted: "text-red-700",
};

const STATUS_OPTIONS = ["in_stock", "issued", "wasted"];
const STATUS_LABELS: Record<string, string> = {
  in_stock: "In stock",
  issued: "Issued",
  wasted: "Wasted",
};

export default function StockTrackingPage() {
  const [rows, setRows] = useState<StockTrackingRow[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedLocationIds, setSelectedLocationIds] = useState<number[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [productName, setProductName] = useState("");

  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    api.get<Location[]>("/locations").then(setLocations).catch(() => {});
    fetchTracking();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchTracking() {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.get<StockTrackingRow[]>("/stock/tracking");
      setRows(data);
      setCurrentPage(1);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load stock tracking.");
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

  function toggleStatusFilter(s: string) {
    setSelectedStatuses((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
    );
    setCurrentPage(1);
  }

  function clearFilters() {
    setSelectedLocationIds([]);
    setSelectedStatuses([]);
    setProductName("");
    setCurrentPage(1);
  }

  const selectedLocationNames = locations
    .filter((l) => selectedLocationIds.includes(l.id))
    .map((l) => l.name);

  const filteredRows = rows.filter((r) => {
    const locationMatch =
      selectedLocationNames.length === 0 || selectedLocationNames.includes(r.location_name);
    const statusMatch = selectedStatuses.length === 0 || selectedStatuses.includes(r.status);
    const nameMatch =
      productName.trim() === "" ||
      r.product_name.toLowerCase().includes(productName.trim().toLowerCase());
    return locationMatch && statusMatch && nameMatch;
  });

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const pageStart = (currentPage - 1) * pageSize;
  const pagedRows = filteredRows.slice(pageStart, pageStart + pageSize);

  function handlePageSizeChange(value: string) {
    setPageSize(Number(value));
    setCurrentPage(1);
  }

  const hasFilters =
    selectedLocationIds.length > 0 || selectedStatuses.length > 0 || productName.trim() !== "";

  return (
    <div>
      <h1 className="text-xl font-semibold text-neutral-900 mb-6">Stock Tracking</h1>

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
            {STATUS_OPTIONS.map((s) => (
              <DropdownMenuCheckboxItem
                key={s}
                checked={selectedStatuses.includes(s)}
                onCheckedChange={() => toggleStatusFilter(s)}
                onSelect={(e) => e.preventDefault()}
              >
                {STATUS_LABELS[s]}
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
              <th className="px-3 py-2 font-medium">Location</th>
              <th className="px-3 py-2 font-medium">Product</th>
              <th className="px-3 py-2 font-medium">Series</th>
              <th className="px-3 py-2 font-medium">Storage</th>
              <th className="px-3 py-2 font-medium">Color</th>
              <th className="px-3 py-2 font-medium">RAM</th>
              <th className="px-3 py-2 font-medium">Serial / Qty</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-neutral-400">
                  Loading…
                </td>
              </tr>
            ) : pagedRows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-neutral-400">
                  No records found.
                </td>
              </tr>
            ) : (
              pagedRows.map((r, i) => (
                <tr key={i} className="border-b border-neutral-200 last:border-0">
                  <td className="px-3 py-2 text-neutral-600">{r.location_name}</td>
                  <td className="px-3 py-2">{r.product_name}</td>
                  <td className="px-3 py-2 text-neutral-500">{r.series || "—"}</td>
                  <td className="px-3 py-2 text-neutral-500">{r.storage_size || "—"}</td>
                  <td className="px-3 py-2 text-neutral-500">{r.color || "—"}</td>
                  <td className="px-3 py-2 text-neutral-500">{r.ram || "—"}</td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {r.control_serial ?? (r.non_control_amount !== null ? `Qty: ${r.non_control_amount}` : "—")}
                  </td>
                  <td className="px-3 py-2">
                    <span className={STATUS_STYLES[r.status] ?? ""}>{r.status}</span>
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