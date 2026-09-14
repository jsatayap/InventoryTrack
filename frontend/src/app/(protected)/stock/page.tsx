"use client";

import { useEffect, useState, FormEvent } from "react";
import { api, buildQuery, ApiError } from "@/lib/api";
import { Location, CurrentStockRow, Product } from "@/lib/types";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ChevronDown, ChevronsUpDown } from "lucide-react";
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

function formatDateTime(value?: string | null) {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return date.toLocaleString();
}

export default function CurrentStockPage() {
  const [rows, setRows] = useState<CurrentStockRow[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [productsById, setProductsById] = useState<Record<string, Product>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [series, setSeries] = useState("");

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [selectedLocationIds, setSelectedLocationIds] = useState<number[]>([]);
  const [minStorage, setMinStorage] = useState<number | "">("");
  const [maxStorage, setMaxStorage] = useState<number | "">("");
  const [color, setColor] = useState("");

  const [selectedRow, setSelectedRow] = useState<CurrentStockRow | null>(null);

  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    api.get<Location[]>("/locations").then(setLocations).catch(() => {});
    api
      .get<Product[]>("/products")
      .then((products) => setProductsById(Object.fromEntries(products.map((p) => [p.id, p]))))
      .catch(() => {});
    fetchStock();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchStock(overrides?: { name?: string; series?: string }) {
    setIsLoading(true);
    setError(null);
    try {
      const query = buildQuery({
        name: (overrides?.name ?? name) || undefined,
        series: (overrides?.series ?? series) || undefined,
      });
      const data = await api.get<CurrentStockRow[]>(`/stock/current${query}`);
      setRows(data);
      setCurrentPage(1);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load current stock.");
    } finally {
      setIsLoading(false);
    }
  }

  function handleSearch(e: FormEvent) {
    e.preventDefault();
    fetchStock();
  }

  function toggleLocation(id: number) {
    setSelectedLocationIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
    setCurrentPage(1);
  }

  function clearAllFilters() {
    setName("");
    setSeries("");
    setSelectedLocationIds([]);
    setMinStorage("");
    setMaxStorage("");
    setColor("");
    fetchStock({ name: "", series: "" });
  }

  const hasAnyFilters =
    name !== "" ||
    series !== "" ||
    selectedLocationIds.length > 0 ||
    minStorage !== "" ||
    maxStorage !== "" ||
    color !== "";

  const filteredRows = rows.filter((r) => {
    if (selectedLocationIds.length > 0 && !selectedLocationIds.includes(r.location_id)) return false;
    if (minStorage !== "" && (r.storage_size ?? 0) < minStorage) return false;
    if (maxStorage !== "" && (r.storage_size ?? 0) > maxStorage) return false;
    if (color.trim() && !(r.color ?? "").toLowerCase().includes(color.trim().toLowerCase())) return false;
    return true;
  });

  const totalQuantity = filteredRows.reduce((sum, r) => sum + r.quantity, 0);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const pageStart = (currentPage - 1) * pageSize;
  const pagedRows = filteredRows.slice(pageStart, pageStart + pageSize);

  function handlePageSizeChange(value: string) {
    setPageSize(Number(value));
    setCurrentPage(1);
  }

  const selectedProduct = selectedRow ? productsById[selectedRow.product_id] : null;

  return (
    <div>
      <h1 className="text-xl font-semibold text-neutral-900 mb-6">Current Stock</h1>

      <div className="border border-neutral-300 bg-white p-4 mb-4">
        <form
          onSubmit={handleSearch}
          className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end"
        >
          <Field>
            <FieldLabel htmlFor="stock-name">Name</FieldLabel>
            <Input id="stock-name" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="stock-series">Series</FieldLabel>
            <Input id="stock-series" value={series} onChange={(e) => setSeries(e.target.value)} />
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
          <div className="flex gap-2">
            <Button type="submit" variant="secondary">
              Search
            </Button>
            {hasAnyFilters && (
              <Button type="button" variant="ghost" onClick={clearAllFilters}>
                Clear filters
              </Button>
            )}
          </div>
        </form>

        <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced} className="mt-3">
          <CollapsibleTrigger
            render={
              <Button variant="ghost" size="sm" className="gap-1 -ml-2">
                Advanced filters
                {(minStorage !== "" || maxStorage !== "" || color !== "") && !showAdvanced
                  ? " (active)"
                  : ""}
                <ChevronsUpDown className="size-3.5 opacity-60" />
              </Button>
            }
          />
          <CollapsibleContent className="pt-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
              <Field>
                <FieldLabel htmlFor="stock-min-storage">Min storage (GB)</FieldLabel>
                <Input
                  id="stock-min-storage"
                  type="number"
                  min={0}
                  value={minStorage}
                  onChange={(e) => {
                    setMinStorage(e.target.value ? Number(e.target.value) : "");
                    setCurrentPage(1);
                  }}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="stock-max-storage">Max storage (GB)</FieldLabel>
                <Input
                  id="stock-max-storage"
                  type="number"
                  min={0}
                  value={maxStorage}
                  onChange={(e) => {
                    setMaxStorage(e.target.value ? Number(e.target.value) : "");
                    setCurrentPage(1);
                  }}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="stock-color">Color</FieldLabel>
                <Input
                  id="stock-color"
                  value={color}
                  onChange={(e) => {
                    setColor(e.target.value);
                    setCurrentPage(1);
                  }}
                />
              </Field>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>

      {error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 px-3 py-2 mb-4">{error}</p>
      )}

      <div className="border border-neutral-300 bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-300 bg-neutral-50 text-left text-neutral-500">
              <th className="px-3 py-2 font-medium">SKU</th>
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Series</th>
              <th className="px-3 py-2 font-medium">Storage</th>
              <th className="px-3 py-2 font-medium">Color</th>
              <th className="px-3 py-2 font-medium">Location</th>
              <th className="px-3 py-2 font-medium">Tracking</th>
              <th className="px-3 py-2 font-medium text-right">Qty</th>
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
                  No stock found.
                </td>
              </tr>
            ) : (
              pagedRows.map((r, i) => (
                <tr
                  key={`${r.product_id}-${r.location_id}-${i}`}
                  onClick={() => setSelectedRow(r)}
                  className="border-b border-neutral-200 last:border-0 hover:bg-neutral-50 cursor-pointer"
                >
                  <td className="px-3 py-2 font-mono text-xs">{r.sku}</td>
                  <td className="px-3 py-2 text-[#1E3A5F] hover:underline">{r.name}</td>
                  <td className="px-3 py-2 text-neutral-500">{r.series || "—"}</td>
                  <td className="px-3 py-2 text-neutral-500">{r.storage_size || "—"}</td>
                  <td className="px-3 py-2 text-neutral-500">{r.color || "—"}</td>
                  <td className="px-3 py-2 text-neutral-600">{r.location_name}</td>
                  <td className="px-3 py-2 text-neutral-500">
                    {r.is_serialized ? "Control serial" : "Non-control"}
                  </td>
                  <td className="px-3 py-2 text-right font-medium">{r.quantity}</td>
                </tr>
              ))
            )}
          </tbody>
          {filteredRows.length > 0 && (
            <tfoot>
              <tr className="border-t border-neutral-300 bg-neutral-50">
                <td colSpan={7} className="px-3 py-2 text-right text-xs text-neutral-500 font-medium">
                  Total units
                </td>
                <td className="px-3 py-2 text-right font-semibold">{totalQuantity}</td>
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

      <Dialog open={selectedRow !== null} onOpenChange={(open) => !open && setSelectedRow(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{selectedRow?.name}</DialogTitle>
          </DialogHeader>
          {selectedRow && (
            <dl className="text-sm divide-y divide-neutral-200">
              <div className="flex justify-between py-2">
                <dt className="text-neutral-500">SKU</dt>
                <dd className="font-mono text-xs">{selectedRow.sku}</dd>
              </div>
              <div className="flex justify-between py-2">
                <dt className="text-neutral-500">Location</dt>
                <dd>{selectedRow.location_name}</dd>
              </div>
              <div className="flex justify-between py-2">
                <dt className="text-neutral-500">Quantity</dt>
                <dd className="font-medium">{selectedRow.quantity}</dd>
              </div>
              <div className="flex justify-between py-2">
                <dt className="text-neutral-500">Created</dt>
                <dd>{formatDateTime(selectedProduct?.created_at)}</dd>
              </div>
              <div className="flex justify-between py-2">
                <dt className="text-neutral-500">Last updated</dt>
                <dd>{formatDateTime(selectedProduct?.updated_at)}</dd>
              </div>
            </dl>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}