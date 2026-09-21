"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { Location, StockSummaryRow } from "@/lib/types";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown } from "lucide-react";
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

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Default to last month, since the current month is never closed yet.
function getDefaultYearMonth() {
  const now = new Date();
  const year = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const month = now.getMonth() === 0 ? 12 : now.getMonth(); // getMonth() is 0-indexed, so this is "last month" as 1-12
  return { year, month };
}

// Years selectable in the dropdown: this year and the previous 3.
function getYearOptions() {
  const currentYear = new Date().getFullYear();
  return [currentYear, currentYear - 1, currentYear - 2, currentYear - 3];
}

function sumBy(rows: StockSummaryRow[], key: keyof StockSummaryRow) {
  return rows.reduce((total, row) => total + (row[key] as number), 0);
}

const QTY_KEYS: (keyof StockSummaryRow)[] = [
  "begin_qty",
  "receive_00_qty",
  "receive_01_qty",
  "receive_55_qty",
  "issue_01_qty",
  "issue_55_qty",
  "issue_99_qty",
  "close_qty",
];

// When multiple locations are selected, collapse the per-location rows for
// each product into a single row whose quantities are the sum across those
// locations, rather than showing one row per product-location pair.
function combineAcrossLocations(rows: StockSummaryRow[]): StockSummaryRow[] {
  const combined = new Map<
    StockSummaryRow["product_id"],
    StockSummaryRow & { _locationCount: number }
  >();

  for (const row of rows) {
    const existing = combined.get(row.product_id);
    if (!existing) {
      combined.set(row.product_id, { ...row, _locationCount: 1 });
      continue;
    }
    for (const key of QTY_KEYS) {
      (existing[key] as number) += row[key] as number;
    }
    existing._locationCount += 1;
  }

  return Array.from(combined.values()).map(({ _locationCount, ...row }) => ({
    ...row,
    location_id: 0,
    location_name: `Selected locations`,
  }));
}

export default function StockSummaryPage() {
  const defaults = getDefaultYearMonth();
  const [year, setYear] = useState(defaults.year);
  const [month, setMonth] = useState(defaults.month);

  const [rows, setRows] = useState<StockSummaryRow[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notClosed, setNotClosed] = useState(false);

  // Filters
  const [productName, setProductName] = useState("");
  const [selectedLocationIds, setSelectedLocationIds] = useState<number[]>([]);

  // Pagination
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    api.get<Location[]>("/locations").then(setLocations).catch(() => {});
    fetchSummary(defaults.year, defaults.month);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchSummary(y: number, m: number) {
    setIsLoading(true);
    setError(null);
    setNotClosed(false);
    try {
      const data = await api.get<StockSummaryRow[]>(`/stock-summary/${y}/${m}`);
      setRows(data);
      setCurrentPage(1);
    } catch (err) {
      if (err instanceof ApiError && err.message.toLowerCase().includes("has not been closed")) {
        setNotClosed(true);
        setRows([]);
      } else {
        setError(err instanceof ApiError ? err.message : "Could not load the stock summary.");
        setRows([]);
      }
    } finally {
      setIsLoading(false);
    }
  }

  function handleView() {
    fetchSummary(year, month);
  }

  function toggleLocation(id: number) {
    setSelectedLocationIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
    setCurrentPage(1);
  }

  function clearAllFilters() {
    setProductName("");
    setSelectedLocationIds([]);
    setCurrentPage(1);
  }

  const hasAnyFilters = productName !== "" || selectedLocationIds.length > 0;

  const filteredRows = rows.filter((r) => {
    if (selectedLocationIds.length > 0 && !selectedLocationIds.includes(r.location_id)) return false;
    if (
      productName.trim() &&
      !r.product_name.toLowerCase().includes(productName.trim().toLowerCase()) &&
      !r.sku.toLowerCase().includes(productName.trim().toLowerCase())
    )
      return false;
    return true;
  });

  const displayRows =
    selectedLocationIds.length > 1 ? combineAcrossLocations(filteredRows) : filteredRows;

  const totalPages = Math.max(1, Math.ceil(displayRows.length / pageSize));
  const pageStart = (currentPage - 1) * pageSize;
  const pagedRows = displayRows.slice(pageStart, pageStart + pageSize);

  function handlePageSizeChange(value: string) {
    setPageSize(Number(value));
    setCurrentPage(1);
  }

  return (
    <div>
      <h1 className="text-xl font-semibold text-neutral-900 mb-6">Month End Stock Summary</h1>

      <div className="border border-neutral-300 bg-white p-4 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <Field>
            <FieldLabel htmlFor="summary-month">Month</FieldLabel>
            <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
              <SelectTrigger id="summary-month" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTH_NAMES.map((name, i) => (
                  <SelectItem key={name} value={String(i + 1)}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="summary-year">Year</FieldLabel>
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger id="summary-year" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {getYearOptions().map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={handleView}>
              View
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end mt-3 pt-3 border-t border-neutral-200">
          <Field>
            <FieldLabel htmlFor="summary-product">Product / SKU</FieldLabel>
            <Input
              id="summary-product"
              placeholder="Search by name or SKU"
              value={productName}
              onChange={(e) => {
                setProductName(e.target.value);
                setCurrentPage(1);
              }}
            />
          </Field>
          <Field>
            <FieldLabel>Location</FieldLabel>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="outline" className="justify-between w-full">
                    <span>
                      {selectedLocationIds.length === 0
                        ? "All locations"
                        : `${selectedLocationIds.length} selected`}
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
                    onCheckedChange={() => toggleLocation(loc.id)}
                    onSelect={(e) => e.preventDefault()}
                  >
                    {loc.name}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </Field>
          {hasAnyFilters && (
            <Button type="button" variant="ghost" onClick={clearAllFilters}>
              Clear filters
            </Button>
          )}
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 px-3 py-2 mb-4">{error}</p>
      )}

      {notClosed && (
        <p className="text-sm text-neutral-600 bg-neutral-50 border border-neutral-200 px-3 py-2 mb-4">
          {MONTH_NAMES[month - 1]} {year} has not been closed yet. Month-end tables are frozen the
          first time someone logs in after that month ends.
        </p>
      )}

      {!notClosed && (
        <>
          <div className="border border-neutral-300 bg-white overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-300 bg-neutral-50 text-left text-neutral-500">
                  <th className="px-3 py-2 font-medium">SKU</th>
                  <th className="px-3 py-2 font-medium">Product</th>
                  <th className="px-3 py-2 font-medium">Location</th>
                  <th className="px-3 py-2 font-medium text-right">Begin</th>
                  <th className="px-3 py-2 font-medium text-right">Receive Purchase</th>
                  <th className="px-3 py-2 font-medium text-right">Receive Transfer</th>
                  <th className="px-3 py-2 font-medium text-right">Receive Adjust</th>
                  <th className="px-3 py-2 font-medium text-right">Issue Transfer</th>
                  <th className="px-3 py-2 font-medium text-right">Issue Adjust</th>
                  <th className="px-3 py-2 font-medium text-right">Issue Waste</th>
                  <th className="px-3 py-2 font-medium text-right">Close</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={11} className="px-3 py-6 text-center text-neutral-400">
                      Loading…
                    </td>
                  </tr>
                ) : pagedRows.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-3 py-6 text-center text-neutral-400">
                      No rows found.
                    </td>
                  </tr>
                ) : (
                  pagedRows.map((r) => (
                    <tr
                      key={`${r.product_id}-${r.location_id}`}
                      className="border-b border-neutral-200 last:border-0 hover:bg-neutral-50"
                    >
                      <td className="px-3 py-2 font-mono text-xs">{r.sku}</td>
                      <td className="px-3 py-2 text-neutral-900">
                        {r.product_name}
                        {r.series && <span className="text-neutral-500"> · {r.series}</span>}
                      </td>
                      <td className="px-3 py-2 text-neutral-600">{r.location_name}</td>
                      <td className="px-3 py-2 text-right">{r.begin_qty}</td>
                      <td className="px-3 py-2 text-right">{r.receive_00_qty}</td>
                      <td className="px-3 py-2 text-right">{r.receive_01_qty}</td>
                      <td className="px-3 py-2 text-right">{r.receive_55_qty}</td>
                      <td className="px-3 py-2 text-right">{r.issue_01_qty}</td>
                      <td className="px-3 py-2 text-right">{r.issue_55_qty}</td>
                      <td className="px-3 py-2 text-right">{r.issue_99_qty}</td>
                      <td className="px-3 py-2 text-right font-medium">{r.close_qty}</td>
                    </tr>
                  ))
                )}
              </tbody>
              {displayRows.length > 0 && (
                <tfoot>
                  <tr className="border-t border-neutral-300 bg-neutral-50">
                    <td colSpan={3} className="px-3 py-2 text-right text-xs text-neutral-500 font-medium">
                      Totals ({displayRows.length} rows)
                    </td>
                    <td className="px-3 py-2 text-right font-semibold">{sumBy(displayRows, "begin_qty")}</td>
                    <td className="px-3 py-2 text-right font-semibold">{sumBy(displayRows, "receive_00_qty")}</td>
                    <td className="px-3 py-2 text-right font-semibold">{sumBy(displayRows, "receive_01_qty")}</td>
                    <td className="px-3 py-2 text-right font-semibold">{sumBy(displayRows, "receive_55_qty")}</td>
                    <td className="px-3 py-2 text-right font-semibold">{sumBy(displayRows, "issue_01_qty")}</td>
                    <td className="px-3 py-2 text-right font-semibold">{sumBy(displayRows, "issue_55_qty")}</td>
                    <td className="px-3 py-2 text-right font-semibold">{sumBy(displayRows, "issue_99_qty")}</td>
                    <td className="px-3 py-2 text-right font-semibold">{sumBy(displayRows, "close_qty")}</td>
                  </tr>
                </tfoot>
              )}
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
    </div>
  );
}