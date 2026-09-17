"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { Select, SelectTrigger, SelectContent, SelectItem } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { ThresholdDialog, ThresholdInitial } from "@/components/alerts/threshold-dialog";

interface Location {
  id: number;
  name: string;
}

interface StockThreshold {
  id: number;
  product_id: string;
  sku: string | null;
  product_name: string | null;
  location_id: number;
  location_name: string | null;
  reorder_point: number;
}

export function ThresholdsTable({ locations }: { locations: Location[] }) {
  const [thresholds, setThresholds] = useState<StockThreshold[]>([]);
  const [loading, setLoading] = useState(true);
  const [locationFilter, setLocationFilter] = useState<string>("all"); // "all" keeps
  // the Select controlled from the first render -- never fall back to
  // undefined here (see the earlier Base UI controlled/uncontrolled warning).
  const [refreshKey, setRefreshKey] = useState(0);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ThresholdInitial | null>(null);

  useEffect(() => {
    setLoading(true);
    const qs = locationFilter !== "all" ? `?location_id=${locationFilter}` : "";
    api.get<StockThreshold[]>(`/alerts/thresholds${qs}`).then((data) => {
      setThresholds(data);
      setLoading(false);
    });
  }, [locationFilter, refreshKey]);

  const openEdit = (t: StockThreshold) => {
    setEditing({
      id: t.id,
      product_id: t.product_id,
      product_label: `${t.sku ?? ""} — ${t.product_name ?? ""}`,
      location_id: t.location_id,
      reorder_point: t.reorder_point,
    });
    setDialogOpen(true);
  };

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const handleDelete = async (id: number) => {
    await api.delete(`/alerts/thresholds/${id}`);
    setRefreshKey((k) => k + 1);
  };

  return (
    <div className="space-y-4">
      <div className="border border-neutral-300 bg-white p-4 flex items-center justify-between gap-3">
        <Select value={locationFilter} onValueChange={setLocationFilter}>
          <SelectTrigger className="w-[220px]" />
          <SelectContent>
            <SelectItem value="all">All locations</SelectItem>
            {locations.map((loc) => (
              <SelectItem key={loc.id} value={String(loc.id)}>
                {loc.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={openCreate}>New Threshold</Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>SKU</TableHead>
            <TableHead>Product</TableHead>
            <TableHead>Location</TableHead>
            <TableHead className="text-right">Reorder Point</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-neutral-500">
                Loading...
              </TableCell>
            </TableRow>
          ) : thresholds.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-neutral-500">
                No thresholds configured yet.
              </TableCell>
            </TableRow>
          ) : (
            thresholds.map((t) => (
              <TableRow key={t.id}>
                <TableCell>{t.sku}</TableCell>
                <TableCell>{t.product_name}</TableCell>
                <TableCell>{t.location_name}</TableCell>
                <TableCell className="text-right">{t.reorder_point.toLocaleString()}</TableCell>
                <TableCell className="flex justify-end gap-1">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(t)}>
                    Edit
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger
                      render={
                        <Button variant="ghost" size="sm" className="text-red-600">
                          Delete
                        </Button>
                      }
                    />
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remove this threshold?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Alerts for {t.product_name} at {t.location_name} will stop
                          firing until a new threshold is set.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDelete(t.id)}>
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <ThresholdDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initial={editing}
        onSaved={() => {
          setDialogOpen(false);
          setRefreshKey((k) => k + 1);
        }}
      />
    </div>
  );
}