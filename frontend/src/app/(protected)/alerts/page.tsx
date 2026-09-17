"use client";

// Adjust the import paths below to match your project's actual aliases if
// they differ (this assumes the same @/lib/api, @/components/ui/* setup
// used on the Products/Invoices pages).

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { ThresholdDialog } from "@/components/alerts/threshold-dialog";
import { ThresholdsTable } from "@/components/alerts/thresholds-table";
import { PaginationBar } from "@/components/alerts/pagination-bar";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

interface Location {
  id: number;
  name: string;
}

interface LowStockAlert {
  product_id: string;
  sku: string;
  name: string;
  series: string | null;
  is_serialized: boolean;
  location_id: number;
  location_name: string;
  quantity: number;
  reorder_point: number;
  shortage: number;
}

const DEFAULT_PAGE_SIZE = 15;

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<LowStockAlert[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedLocationIds, setSelectedLocationIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAlert, setEditingAlert] = useState<LowStockAlert | null>(null);

  useEffect(() => {
    api.get<Location[]>("/locations").then(setLocations);
  }, []);

  // The backend route only accepts a single location_id. With more than one
  // selected we fan out one request per location and merge client-side
  // rather than changing the API contract.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const fetchAlerts = async () => {
      const ids = selectedLocationIds;
      const results =
        ids.length === 0
          ? await api.get<LowStockAlert[]>("/alerts/low-stock")
          : ids.length === 1
          ? await api.get<LowStockAlert[]>(`/alerts/low-stock?location_id=${ids[0]}`)
          : (
              await Promise.all(
                ids.map((id) => api.get<LowStockAlert[]>(`/alerts/low-stock?location_id=${id}`))
              )
            ).flat();

      if (!cancelled) {
        setAlerts(results);
        setLoading(false);
      }
    };

    fetchAlerts();
    return () => {
      cancelled = true;
    };
  }, [selectedLocationIds, refreshKey]);

  useEffect(() => {
    setPage(1);
  }, [selectedLocationIds, pageSize]);

  const clearFilters = () => setSelectedLocationIds([]);

  const paged = useMemo(
    () => alerts.slice((page - 1) * pageSize, page * pageSize),
    [alerts, page, pageSize]
  );

  const openEdit = (alert: LowStockAlert) => {
    setEditingAlert(alert);
    setDialogOpen(true);
  };

  const openCreate = () => {
    setEditingAlert(null);
    setDialogOpen(true);
  };

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-semibold">Alerts</h1>

      <Tabs defaultValue="alerts">
        <TabsList>
          <TabsTrigger value="alerts">Low Stock Alerts</TabsTrigger>
          <TabsTrigger value="manage">Manage Thresholds</TabsTrigger>
        </TabsList>

        <TabsContent value="alerts" className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={openCreate}>New Threshold</Button>
      </div>

      <div className="border border-neutral-300 bg-white p-4 flex items-center gap-3">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="outline">
                Location{selectedLocationIds.length ? ` (${selectedLocationIds.length})` : ""}
              </Button>
            }
          />
          <DropdownMenuContent>
            {locations.map((loc) => (
              <DropdownMenuCheckboxItem
                key={loc.id}
                checked={selectedLocationIds.includes(loc.id)}
                onCheckedChange={(checked) => {
                  setSelectedLocationIds((prev) =>
                    checked ? [...prev, loc.id] : prev.filter((id) => id !== loc.id)
                  );
                }}
              >
                {loc.name}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Button variant="ghost" onClick={clearFilters}>
          Clear filters
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>SKU</TableHead>
            <TableHead>Product</TableHead>
            <TableHead>Location</TableHead>
            <TableHead className="text-right">Quantity</TableHead>
            <TableHead className="text-right">Reorder Point</TableHead>
            <TableHead className="text-right">Shortage</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-neutral-500">
                Loading...
              </TableCell>
            </TableRow>
          ) : paged.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-neutral-500">
                No low-stock items.
              </TableCell>
            </TableRow>
          ) : (
            paged.map((a) => (
              <TableRow key={`${a.product_id}-${a.location_id}`}>
                <TableCell>{a.sku}</TableCell>
                <TableCell>
                  {a.name}
                  {a.series ? <span className="text-neutral-500"> · {a.series}</span> : null}
                  {!a.is_serialized && (
                    <Badge variant="secondary" className="ml-2">
                      Accessory
                    </Badge>
                  )}
                </TableCell>
                <TableCell>{a.location_name}</TableCell>
                <TableCell className="text-right">{a.quantity.toLocaleString()}</TableCell>
                <TableCell className="text-right">{a.reorder_point.toLocaleString()}</TableCell>
                <TableCell className="text-right">
                  <Badge variant="destructive">{a.shortage.toLocaleString()}</Badge>
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="sm" onClick={() => openEdit(a)}>
                    Edit threshold
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <PaginationBar
        page={page}
        pageSize={pageSize}
        totalItems={alerts.length}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />

      <ThresholdDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initial={
          editingAlert
            ? {
                product_id: editingAlert.product_id,
                product_label: `${editingAlert.sku} — ${editingAlert.name}`,
                location_id: editingAlert.location_id,
                reorder_point: editingAlert.reorder_point,
              }
            : null
        }
        onSaved={() => {
          setDialogOpen(false);
          setRefreshKey((k) => k + 1);
        }}
      />
        </TabsContent>

        <TabsContent value="manage">
          <ThresholdsTable locations={locations} />
        </TabsContent>
      </Tabs>
    </div>
  );
}