"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { api, buildQuery } from "@/lib/api";
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChevronDown, Check, ChevronLeft, ChevronRight } from "lucide-react";

interface MonthlyTrend {
  month: string;
  received: number;
  issued: number;
}
interface LocationOption { id: number; name: string; }
interface ProductOption { id: string; name: string; sku: string; }

interface MonthlySummaryRow {
  id: number;
  month: string; // "YYYY-MM-DD"
  product_id: string;
  location_id: number;
  sku: string | null;
  product_name: string | null;
  location_name: string | null;
  opening_balance: number;
  received_qty: number;
  total_issued_qty: number;
  net_change_qty: number;
  closing_balance: number;
}

interface QuarterlySummaryRow {
  id: number;
  quarter: string; // "YYYY-MM-DD"
  quarter_label: string | null; // "2026-Q1"
  product_id: string;
  location_id: number;
  sku: string | null;
  product_name: string | null;
  location_name: string | null;
  opening_balance: number;
  received_qty: number;
  total_issued_qty: number;
  net_change_qty: number;
  closing_balance: number;
  avg_unit_price: number | null;
}

const SUMMARY_LIMIT_OPTIONS = [15, 30, 45, 60];

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
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryGenerated, setSummaryGenerated] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [summaryPage, setSummaryPage] = useState(0);
  const [summaryLimit, setSummaryLimit] = useState(50);
  const [monthFrom, setMonthFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - 5);
    return d.toISOString().slice(0, 7); // "YYYY-MM"
  });
  const [monthTo, setMonthTo] = useState(() => new Date().toISOString().slice(0, 7));

  const [quarterlyRows, setQuarterlyRows] = useState<QuarterlySummaryRow[]>([]);
  const [quarterlyLoading, setQuarterlyLoading] = useState(false);
  const [quarterlyGenerated, setQuarterlyGenerated] = useState(false);
  const [quarterlyError, setQuarterlyError] = useState<string | null>(null);

  const currentYear = new Date().getFullYear();
  const YEAR_OPTIONS = Array.from({ length: 5 }, (_, i) => currentYear - i);
  const [quarterYear, setQuarterYear] = useState<string>(String(currentYear));
  const [quarterQuarter, setQuarterQuarter] = useState<string>("all"); // "all" | "1".."4"
  const [quarterLocationId, setQuarterLocationId] = useState<string>("all");
  const [quarterProductId, setQuarterProductId] = useState<string>("all");

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
      if (prodIds.length) params.set("product_ids", prodIds.join(","));

      api.get<MonthlySummaryRow[]>(`/stock/monthly-summary?${params.toString()}`)
        .then((rows) => {
          setSummaryRows(rows);
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

  const handleGenerateQuarterly = useCallback(async () => {
    setQuarterlyLoading(true);
    setQuarterlyError(null);
    try {
      const params = buildQuery({
        year: quarterYear !== "all" ? quarterYear : undefined,
        quarter: quarterQuarter !== "all" ? quarterQuarter : undefined,
        location_id: quarterLocationId !== "all" ? quarterLocationId : undefined,
        product_id: quarterProductId !== "all" ? quarterProductId : undefined,
      });

      await api.post(`/reports/quarterly-summary/refresh${params}`);
      const rows = await api.get<QuarterlySummaryRow[]>(`/reports/quarterly-summary${params}`);
      setQuarterlyRows(rows);
      setQuarterlyGenerated(true);
    } catch {
      setQuarterlyError("Couldn't generate the quarterly report. Try again.");
    } finally {
      setQuarterlyLoading(false);
    }
  }, [quarterYear, quarterQuarter, quarterLocationId, quarterProductId]);

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

  const quarterQuarterLabel =
    quarterQuarter === "all" ? "All quarters" : `Q${quarterQuarter}`;
  const quarterLocationLabel =
    quarterLocationId === "all"
      ? "All locations"
      : locations.find((l) => String(l.id) === quarterLocationId)?.name ?? "Location";
  const quarterProductLabel =
    quarterProductId === "all"
      ? "All products"
      : products.find((p) => p.id === quarterProductId)?.name ?? "Product";

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

        {/* Stock balances / quarterly summary, switched via tabs so they never stack */}
        <Card className="flex min-h-0 flex-col lg:col-span-3">
          <Tabs defaultValue="monthly" className="flex min-h-0 flex-1 flex-col">
            <CardHeader className="flex-row items-center justify-between gap-2 space-y-0 py-3">
              <TabsList>
                <TabsTrigger value="monthly">Monthly Summary</TabsTrigger>
                <TabsTrigger value="quarterly">Quarterly Summary</TabsTrigger>
              </TabsList>
            </CardHeader>

            <TabsContent value="monthly" className="flex min-h-0 flex-1 flex-col gap-2 px-6 pb-4">
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
                  <span className="text-xs text-neutral-500">Page {summaryPage + 1}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => goToSummaryPage(summaryPage + 1)}
                    disabled={!summaryGenerated || summaryRows.length < summaryLimit || summaryLoading}
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
                <ScrollArea className="min-h-0 flex-1 rounded-md border border-neutral-200">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Month</TableHead>
                        <TableHead>Location</TableHead>
                        <TableHead>Product</TableHead>
                        <TableHead className="text-right">Opening</TableHead>
                        <TableHead className="text-right">Received</TableHead>
                        <TableHead className="text-right">Issued</TableHead>
                        <TableHead className="text-right">Net Change</TableHead>
                        <TableHead className="text-right">Closing</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {summaryRows.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell>{row.month.slice(0, 7)}</TableCell>
                          <TableCell>{row.location_name}</TableCell>
                          <TableCell>
                            {row.product_name}
                            {row.sku && <span className="ml-1 text-neutral-400">{row.sku}</span>}
                          </TableCell>
                          <TableCell className="text-right">{row.opening_balance.toLocaleString()}</TableCell>
                          <TableCell className="text-right">{row.received_qty.toLocaleString()}</TableCell>
                          <TableCell className="text-right">{row.total_issued_qty.toLocaleString()}</TableCell>
                          <TableCell className="text-right">{row.net_change_qty.toLocaleString()}</TableCell>
                          <TableCell className="text-right">{row.closing_balance.toLocaleString()}</TableCell>
                        </TableRow>
                      ))}
                      {summaryRows.length === 0 && !summaryLoading && (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center text-neutral-500">
                            No data for the selected filters.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </ScrollArea>
              ) : (
                <p className="text-sm text-neutral-500">
                  Click "Generate Report" to build the monthly summary.
                </p>
              )}
            </TabsContent>

            <TabsContent value="quarterly" className="flex min-h-0 flex-1 flex-col gap-2 px-6 pb-4">
              <div className="flex flex-wrap items-center gap-2">
                <Select value={quarterYear} onValueChange={setQuarterYear}>
                  <SelectTrigger className="w-[100px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All years</SelectItem>
                    {YEAR_OPTIONS.map((y) => (
                      <SelectItem key={y} value={String(y)}>
                        {y}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={quarterQuarter} onValueChange={setQuarterQuarter}>
                  <SelectTrigger className="w-[110px]">
                    <SelectValue>{quarterQuarterLabel}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All quarters</SelectItem>
                    <SelectItem value="1">Q1</SelectItem>
                    <SelectItem value="2">Q2</SelectItem>
                    <SelectItem value="3">Q3</SelectItem>
                    <SelectItem value="4">Q4</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={quarterLocationId} onValueChange={setQuarterLocationId}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="Location">{quarterLocationLabel}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All locations</SelectItem>
                    {locations.map((loc) => (
                      <SelectItem key={loc.id} value={String(loc.id)}>
                        {loc.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={quarterProductId} onValueChange={setQuarterProductId}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder="Product">{quarterProductLabel}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All products</SelectItem>
                    {products.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Button size="sm" className="ml-auto" onClick={handleGenerateQuarterly} disabled={quarterlyLoading}>
                  {quarterlyLoading ? "Generating..." : "Generate Report"}
                </Button>
              </div>

              {quarterlyError && (
                <p className="text-sm text-red-600">{quarterlyError}</p>
              )}

              {quarterlyGenerated ? (
                <ScrollArea className="min-h-0 flex-1 rounded-md border border-neutral-200">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Quarter</TableHead>
                        <TableHead>Location</TableHead>
                        <TableHead>Product</TableHead>
                        <TableHead className="text-right">Opening</TableHead>
                        <TableHead className="text-right">Received</TableHead>
                        <TableHead className="text-right">Issued</TableHead>
                        <TableHead className="text-right">Net Change</TableHead>
                        <TableHead className="text-right">Closing</TableHead>
                        <TableHead className="text-right">Avg Price</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {quarterlyRows.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell>{row.quarter_label ?? row.quarter.slice(0, 7)}</TableCell>
                          <TableCell>{row.location_name}</TableCell>
                          <TableCell>
                            {row.product_name}
                            {row.sku && <span className="ml-1 text-neutral-400">{row.sku}</span>}
                          </TableCell>
                          <TableCell className="text-right">{row.opening_balance.toLocaleString()}</TableCell>
                          <TableCell className="text-right">{row.received_qty.toLocaleString()}</TableCell>
                          <TableCell className="text-right">{row.total_issued_qty.toLocaleString()}</TableCell>
                          <TableCell className="text-right">{row.net_change_qty.toLocaleString()}</TableCell>
                          <TableCell className="text-right">{row.closing_balance.toLocaleString()}</TableCell>
                          <TableCell className="text-right">
                            {row.avg_unit_price != null ? row.avg_unit_price.toLocaleString() : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                      {quarterlyRows.length === 0 && !quarterlyLoading && (
                        <TableRow>
                          <TableCell colSpan={9} className="text-center text-neutral-500">
                            No data for the selected filters.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </ScrollArea>
              ) : (
                <p className="text-sm text-neutral-500">
                  Click "Generate Report" to build the quarterly summary.
                </p>
              )}
            </TabsContent>
          </Tabs>
        </Card>
      </div>
    </div>
  );
}