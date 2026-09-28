"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend,
} from "recharts";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuGroup,
  DropdownMenuCheckboxItem, DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import {
  Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem,
} from "@/components/ui/command";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
} from "@/components/ui/select";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChevronDown, Check, ChevronLeft, ChevronRight } from "lucide-react";

interface MonthlyTrend {
  month: string;
  received: number;
  issued: number;
}
interface LocationOption { id: number; name: string; }
interface ProductOption { id: string; name: string; sku: string; }

interface TradeCodeColumn {
  id: number;
  trade_type: string; // "RCV" | "ISS"
  code: number;
  column_name: string; // key into MonthlySummaryRow.quantities, e.g. "iss_01"
  description: string | null;
  is_active: boolean;
}

interface MonthlySummaryRow {
  id: number | null; // null while the month is still open (computed live)
  month: string; // "YYYY-MM-DD"
  product_id: string;
  location_id: number | null; // null when several locations are combined into one row
  sku: string | null;
  product_name: string | null;
  location_name: string | null;
  opening_balance: number;
  received_qty: number; // all RCV codes
  total_issued_qty: number; // all ISS codes
  net_change_qty: number;
  closing_balance: number;
  is_closed: boolean; // false = current month, still changing
  quantities: Record<string, number>; // per trade code, keyed by column_name
}

interface MonthlySummaryResponse {
  columns: TradeCodeColumn[]; // header order for `quantities`
  total: number; // rows matching the filters, before paging
  rows: MonthlySummaryRow[];
}

const SUMMARY_LIMIT_OPTIONS = [15, 30, 45, 60];

// "YYYY-MM" from the LOCAL date. toISOString() is UTC, which puts the first
// hours of a new month (e.g. Bangkok, UTC+7) into the previous month.
const toMonthInput = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

const codeLabel = (c: TradeCodeColumn) => `${c.trade_type} ${String(c.code).padStart(2, "0")}`;

export default function DashboardPage() {
  const { user } = useAuth();
  const [trend, setTrend] = useState<MonthlyTrend[]>([]);
  const [loading, setLoading] = useState(true);

  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [selectedLocationIds, setSelectedLocationIds] = useState<number[]>([]);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [productSearch, setProductSearch] = useState("");

  const [summaryRows, setSummaryRows] = useState<MonthlySummaryRow[]>([]);
  const [summaryColumns, setSummaryColumns] = useState<TradeCodeColumn[]>([]);
  const [summaryTotal, setSummaryTotal] = useState(0);
  const [summaryPageSize, setSummaryPageSize] = useState(15); // page size used by the last fetch
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryGenerated, setSummaryGenerated] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [summaryPage, setSummaryPage] = useState(0);
  const [summaryLimit, setSummaryLimit] = useState(15);
  const [monthFrom, setMonthFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - 5);
    return toMonthInput(d);
  });
  const [monthTo, setMonthTo] = useState(() => toMonthInput(new Date()));

  useEffect(() => {
    api.get("/locations").then(setLocations).catch(() => {});
    api.get("/products").then(setProducts).catch(() => {});
  }, []);

  const fetchTrend = useCallback((locIds: number[], prodIds: string[]) => {
    setLoading(true);
    const params = new URLSearchParams({ months: "6" });
    if (locIds.length) params.set("location_ids", locIds.join(","));
    if (prodIds.length) params.set("product_ids", prodIds.join(","));

    api.get(`/stock/dashboard/monthly-trend?${params.toString()}`)
      .then(setTrend)
      .finally(() => setLoading(false));
  }, []);

  const fetchSummary = useCallback(
    (
      locIds: number[],
      prodIds: string[],
      page: number,
      limit: number,
      from: string,
      to: string
    ) => {
      setSummaryLoading(true);
      setSummaryError(null);
      const params = new URLSearchParams({
        month_from: `${from}-01`,
        month_to: `${to}-01`,
        skip: String(page * limit),
        limit: String(limit),
      });
      if (locIds.length) params.set("location_ids", locIds.join(","));
      if (locIds.length > 1) params.set("combine_locations", "true"); // one row per month+product
      if (prodIds.length) params.set("product_ids", prodIds.join(","));

      api.get<MonthlySummaryResponse>(`/stock/monthly-summary?${params.toString()}`)
        .then((res) => {
          setSummaryRows(res.rows);
          setSummaryColumns(res.columns);
          setSummaryTotal(res.total);
          setSummaryPageSize(limit);
          setSummaryGenerated(true);
        })
        .catch(() => setSummaryError("Couldn't generate the monthly report. Try again."))
        .finally(() => setSummaryLoading(false));
    },
    []
  );

  useEffect(() => {
    fetchTrend(selectedLocationIds, selectedProductIds);
  }, [selectedLocationIds, selectedProductIds, fetchTrend]);

  useEffect(() => {
    setSummaryPage(0);
  }, [selectedLocationIds, selectedProductIds, monthFrom, monthTo, summaryLimit]);

  const handleGenerateSummary = useCallback(() => {
    setSummaryPage(0);
    fetchSummary(selectedLocationIds, selectedProductIds, 0, summaryLimit, monthFrom, monthTo);
  }, [selectedLocationIds, selectedProductIds, summaryLimit, monthFrom, monthTo, fetchSummary]);

  const goToSummaryPage = (page: number) => {
    const next = Math.max(0, page);
    setSummaryPage(next);
    fetchSummary(selectedLocationIds, selectedProductIds, next, summaryLimit, monthFrom, monthTo);
  };

  const toggleLocation = (id: number) =>
    setSelectedLocationIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  const toggleProduct = (id: string) =>
    setSelectedProductIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  const clearFilters = () => {
    setSelectedLocationIds([]);
    setSelectedProductIds([]);
  };

  const hasFilters = selectedLocationIds.length > 0 || selectedProductIds.length > 0;
  const filteredProductOptions = products.filter((p) =>
    `${p.name} ${p.sku}`.toLowerCase().includes(productSearch.toLowerCase())
  );

  const summaryPages = Math.max(1, Math.ceil(summaryTotal / summaryPageSize));
  const rcvColumns = summaryColumns.filter((c) => c.trade_type === "RCV");
  const issColumns = summaryColumns.filter((c) => c.trade_type === "ISS");
  // Month, Location, Product, Opening, RCV codes, Received, ISS codes, Issued, Net, Closing
  const summaryColSpan = 4 + rcvColumns.length + 1 + issColumns.length + 1 + 2;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
      {/* Header + filters in one compact row */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold text-neutral-900">
          Welcome, {user?.full_name || user?.username}
        </h1>

        <div className="flex flex-wrap items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="outline" size="sm" className="gap-1">
                  Location{selectedLocationIds.length > 0 && ` (${selectedLocationIds.length})`}
                  <ChevronDown className="h-4 w-4" />
                </Button>
              }
            >
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuGroup>
                <DropdownMenuLabel>Filter by location</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {locations.map((loc) => (
                  <DropdownMenuCheckboxItem
                    key={loc.id}
                    checked={selectedLocationIds.includes(loc.id)}
                    onCheckedChange={() => toggleLocation(loc.id)}
                  >
                    {loc.name}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          <Popover>
            <PopoverTrigger
              render={
                <Button variant="outline" size="sm" className="gap-1">
                  Product{selectedProductIds.length > 0 && ` (${selectedProductIds.length})`}
                  <ChevronDown className="h-4 w-4" />
                </Button>
              }>
            </PopoverTrigger>
            <PopoverContent className="w-72 p-0" align="end">
              <Command shouldFilter={false}>
                <CommandInput
                  placeholder="Search products..."
                  value={productSearch}
                  onValueChange={setProductSearch}
                />
                <CommandList>
                  <CommandEmpty>No products found.</CommandEmpty>
                  <CommandGroup>
                    {filteredProductOptions.map((p) => (
                      <CommandItem key={p.id} onSelect={() => toggleProduct(p.id)}>
                        <Check
                          className={`mr-2 h-4 w-4 ${
                            selectedProductIds.includes(p.id) ? "opacity-100" : "opacity-0"
                          }`}
                        />
                        {p.name} <span className="ml-1 text-neutral-400">{p.sku}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Clear filters
            </Button>
          )}
        </div>
      </div>

      {/* Main content — fills remaining viewport height, nothing here scrolls the page itself */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-5">
        {/* Trend chart + compact monthly table */}
        <Card className="flex min-h-0 flex-col lg:col-span-2">
          <CardHeader className="py-3">
            <CardTitle className="text-sm font-medium">
              Received vs Issued — Last 6 Months
            </CardTitle>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col gap-3 pb-3">
            {loading ? (
              <p className="text-sm text-neutral-500">Loading...</p>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={trend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="received" stroke="#16a34a" strokeWidth={2} name="Received" />
                  <Line type="monotone" dataKey="issued" stroke="#dc2626" strokeWidth={2} name="Issued" />
                </LineChart>
              </ResponsiveContainer>
            )}

            <ScrollArea className="min-h-0 flex-1 rounded-md border border-neutral-200">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Month</TableHead>
                    <TableHead className="text-right">Received</TableHead>
                    <TableHead className="text-right">Issued</TableHead>
                    <TableHead className="text-right">Net</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {trend.map((row) => (
                    <TableRow key={row.month}>
                      <TableCell>{row.month}</TableCell>
                      <TableCell className="text-right">{row.received.toLocaleString()}</TableCell>
                      <TableCell className="text-right">{row.issued.toLocaleString()}</TableCell>
                      <TableCell className="text-right">
                        {(row.received - row.issued).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                  {trend.length === 0 && !loading && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-neutral-500">
                        No data for the selected filters.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Monthly summary: closed months are the stored snapshot, the current month is computed live */}
        <Card className="flex min-h-0 flex-col lg:col-span-3">
          <CardHeader className="py-3">
            <CardTitle className="text-sm font-medium">Monthly Summary</CardTitle>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col gap-2 pb-4">
            <div className="flex flex-wrap items-center gap-2">
              <Input
                type="month"
                value={monthFrom}
                onChange={(e) => setMonthFrom(e.target.value)}
                className="w-32"
              />
              <span className="text-xs text-neutral-500">to</span>
              <Input
                type="month"
                value={monthTo}
                onChange={(e) => setMonthTo(e.target.value)}
                className="w-32"
              />

              <Select value={String(summaryLimit)} onValueChange={(v) => setSummaryLimit(Number(v))}>
                <SelectTrigger className="w-[90px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SUMMARY_LIMIT_OPTIONS.map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n} / page
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => goToSummaryPage(summaryPage - 1)}
                  disabled={!summaryGenerated || summaryPage === 0 || summaryLoading}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-xs text-neutral-500">
                  Page {summaryPage + 1}{summaryGenerated && ` of ${summaryPages}`}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => goToSummaryPage(summaryPage + 1)}
                  disabled={!summaryGenerated || summaryPage + 1 >= summaryPages || summaryLoading}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>

              <Button size="sm" className="ml-auto" onClick={handleGenerateSummary} disabled={summaryLoading}>
                {summaryLoading ? "Generating..." : "Generate Report"}
              </Button>
            </div>

            {summaryError && (
              <p className="text-sm text-red-600">{summaryError}</p>
            )}

            {summaryGenerated ? (
              <>
                <div className="min-h-0 flex-1 overflow-auto rounded-md border border-neutral-200">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Month</TableHead>
                        <TableHead>Location</TableHead>
                        <TableHead>Product</TableHead>
                        <TableHead className="text-right">Opening</TableHead>
                        {rcvColumns.map((c) => (
                          <TableHead key={c.column_name} className="text-right text-neutral-500" title={c.description ?? undefined}>
                            {codeLabel(c)}
                          </TableHead>
                        ))}
                        <TableHead className="text-right">Received</TableHead>
                        {issColumns.map((c) => (
                          <TableHead key={c.column_name} className="text-right text-neutral-500" title={c.description ?? undefined}>
                            {codeLabel(c)}
                          </TableHead>
                        ))}
                        <TableHead className="text-right">Issued</TableHead>
                        <TableHead className="text-right">Net Change</TableHead>
                        <TableHead className="text-right">Closing</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {summaryRows.map((row) => (
                        <TableRow key={`${row.month}-${row.product_id}-${row.location_id ?? "combined"}`}>
                          <TableCell className="whitespace-nowrap">
                            {row.month.slice(0, 7)}
                            {!row.is_closed && (
                              <span className="ml-1 rounded bg-amber-100 px-1 py-0.5 text-[10px] font-medium text-amber-800">
                                Open
                              </span>
                            )}
                          </TableCell>
                          <TableCell>{row.location_name}</TableCell>
                          <TableCell>
                            {row.product_name}
                            {row.sku && <span className="ml-1 text-neutral-400">{row.sku}</span>}
                          </TableCell>
                          <TableCell className="text-right">{row.opening_balance.toLocaleString()}</TableCell>
                          {rcvColumns.map((c) => (
                            <TableCell key={c.column_name} className="text-right text-neutral-500">
                              {(row.quantities[c.column_name] ?? 0).toLocaleString()}
                            </TableCell>
                          ))}
                          <TableCell className="text-right">{row.received_qty.toLocaleString()}</TableCell>
                          {issColumns.map((c) => (
                            <TableCell key={c.column_name} className="text-right text-neutral-500">
                              {(row.quantities[c.column_name] ?? 0).toLocaleString()}
                            </TableCell>
                          ))}
                          <TableCell className="text-right">{row.total_issued_qty.toLocaleString()}</TableCell>
                          <TableCell className="text-right">{row.net_change_qty.toLocaleString()}</TableCell>
                          <TableCell className="text-right">{row.closing_balance.toLocaleString()}</TableCell>
                        </TableRow>
                      ))}
                      {summaryRows.length === 0 && !summaryLoading && (
                        <TableRow>
                          <TableCell colSpan={summaryColSpan} className="text-center text-neutral-500">
                            No data for the selected filters.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
                {summaryRows.some((r) => !r.is_closed) && (
                  <p className="text-xs text-neutral-500">
                    Months marked "Open" are still in progress and can change until the month is closed.
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm text-neutral-500">
                Click "Generate Report" to build the monthly summary.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}