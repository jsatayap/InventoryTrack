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

const SUMMARY_LIMIT_OPTIONS = [25, 50, 100, 200];

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
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryPage, setSummaryPage] = useState(0);
  const [summaryLimit, setSummaryLimit] = useState(50);
  const [monthFrom, setMonthFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - 5);
    return d.toISOString().slice(0, 7); // "YYYY-MM"
  });
  const [monthTo, setMonthTo] = useState(() => new Date().toISOString().slice(0, 7));

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
      const params = new URLSearchParams({
        month_from: `${from}-01`,
        month_to: `${to}-01`,
        skip: String(page * limit),
        limit: String(limit),
      });
      if (locIds.length) params.set("location_ids", locIds.join(","));
      if (prodIds.length) params.set("product_ids", prodIds.join(","));

      api.get(`/stock/monthly-summary?${params.toString()}`)
        .then(setSummaryRows)
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

  useEffect(() => {
    fetchSummary(selectedLocationIds, selectedProductIds, summaryPage, summaryLimit, monthFrom, monthTo);
  }, [selectedLocationIds, selectedProductIds, summaryPage, summaryLimit, monthFrom, monthTo, fetchSummary]);

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-neutral-900">
          Welcome, {user?.full_name || user?.username}
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Use the nav above to manage products, locations, and invoices.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 border border-neutral-300 bg-white p-4">
        <DropdownMenu>
          <DropdownMenuTrigger 
            render={
              <Button variant="outline" className="gap-1">
                Location{selectedLocationIds.length > 0 && ` (${selectedLocationIds.length})`}
                <ChevronDown className="h-4 w-4" />
              </Button>
            }
            >
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
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
              <Button variant="outline" className="gap-1">
                Product{selectedProductIds.length > 0 && ` (${selectedProductIds.length})`}
                <ChevronDown className="h-4 w-4" />
              </Button>
            }>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-0" align="start">
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
          <Button variant="ghost" onClick={clearFilters}>
            Clear filters
          </Button>
        )}
      </div>

      <div className="border border-neutral-300 bg-white p-4">
        <h2 className="mb-4 text-sm font-medium text-neutral-900">
          Received vs Issued — Last 6 Months
        </h2>
        {loading ? (
          <p className="text-sm text-neutral-500">Loading...</p>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="received" stroke="#16a34a" strokeWidth={2} name="Received" />
              <Line type="monotone" dataKey="issued" stroke="#dc2626" strokeWidth={2} name="Issued" />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="border border-neutral-300 bg-white p-4">
        <h2 className="mb-4 text-sm font-medium text-neutral-900">Monthly Report</h2>
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
      </div>

      <div className="border border-neutral-300 bg-white p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-medium text-neutral-900">
            Stock Balances by Product &amp; Location
          </h2>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1">
              <Input
                type="month"
                value={monthFrom}
                onChange={(e) => setMonthFrom(e.target.value)}
                className="w-36"
              />
              <span className="text-xs text-neutral-500">to</span>
              <Input
                type="month"
                value={monthTo}
                onChange={(e) => setMonthTo(e.target.value)}
                className="w-36"
              />
            </div>

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
                onClick={() => setSummaryPage((p) => Math.max(0, p - 1))}
                disabled={summaryPage === 0 || summaryLoading}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-xs text-neutral-500">Page {summaryPage + 1}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSummaryPage((p) => p + 1)}
                disabled={summaryRows.length < summaryLimit || summaryLoading}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
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
      </div>
    </div>
  );
}