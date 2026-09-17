"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectContent, SelectItem } from "@/components/ui/select";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandItem, CommandEmpty } from "@/components/ui/command";
// Swap this for whatever your existing required-field marker component is
// called (per the "red asterisk, not placeholder text" convention).
export function RequiredAsterisk() {
  return <span className="text-red-500 ml-0.5">*</span>;
}

interface Location {
  id: number;
  name: string;
}

interface ProductOption {
  id: string;
  sku: string;
  name: string;
}

export interface ThresholdInitial {
  id?: number; // present when editing from the full Manage Thresholds list;
  // absent when editing from the Low Stock Alerts list, since
  // LowStockAlertOut doesn't carry the threshold's own id.
  product_id: string;
  product_label: string;
  location_id: number;
  reorder_point: number;
}

export function ThresholdDialog({
  open,
  onOpenChange,
  initial,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: ThresholdInitial | null;
  onSaved: () => void;
}) {
  const [locations, setLocations] = useState<Location[]>([]);

  const [productOpen, setProductOpen] = useState(false);
  const [productQuery, setProductQuery] = useState("");
  const [productOptions, setProductOptions] = useState<ProductOption[]>([]);

  const [productId, setProductId] = useState<string | null>(null);
  const [productLabel, setProductLabel] = useState("");
  const [locationId, setLocationId] = useState<string>("");
  const [reorderPoint, setReorderPoint] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    api.get<Location[]>("/locations").then(setLocations);

    if (initial) {
      setProductId(initial.product_id);
      setProductLabel(initial.product_label);
      setLocationId(initial ? String(initial.location_id) : "");
      setReorderPoint(String(initial.reorder_point));
    } else {
      setProductId(null);
      setProductLabel("");
      setLocationId("");
      setReorderPoint("");
    }
    setProductQuery("");
  }, [open, initial]);

  useEffect(() => {
    if (!productQuery) {
      setProductOptions([]);
      return;
    }
    const handle = setTimeout(() => {
      api
        .get<ProductOption[]>(`/products?name=${encodeURIComponent(productQuery)}`)
        .then(setProductOptions);
    }, 250);
    return () => clearTimeout(handle);
  }, [productQuery]);

  const canSave = !!productId && locationId !== "" && reorderPoint.trim() !== "";

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      if (initial?.id) {
        // Editing a threshold that came from the full Manage Thresholds
        // list (has a real id) -- PATCH only touches reorder_point, which
        // matches StockThresholdUpdate on the backend and why product/
        // location stay disabled below.
        await api.patch(`/alerts/thresholds/${initial.id}`, {
          reorder_point: Number(reorderPoint),
        });
      } else {
        // New threshold, or editing one surfaced via the Low Stock Alerts
        // list (no id available there) -- upsert keyed on
        // (product_id, location_id).
        await api.post("/alerts/thresholds", {
          product_id: productId,
          location_id: Number(locationId),
          reorder_point: Number(reorderPoint),
        });
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit reorder point" : "New threshold"}</DialogTitle>
        </DialogHeader>

        <div className="overflow-y-auto flex-1">
          <FieldGroup>
            <Field>
              <FieldLabel>
                Product <RequiredAsterisk />
              </FieldLabel>
              <Popover open={productOpen} onOpenChange={setProductOpen}>
                <PopoverTrigger
                  render={
                    <Button
                      variant="outline"
                      className="justify-start w-full"
                      disabled={!!initial}
                    >
                      {productLabel || "Search product..."}
                    </Button>
                  }
                />
                <PopoverContent className="w-[320px] p-0">
                  <Command shouldFilter={false}>
                    <CommandInput
                      placeholder="Search by name or SKU..."
                      value={productQuery}
                      onValueChange={setProductQuery}
                    />
                    <CommandList>
                      <CommandEmpty>No products found.</CommandEmpty>
                      {productOptions.map((p) => (
                        <CommandItem
                          key={p.id}
                          onSelect={() => {
                            setProductId(p.id);
                            setProductLabel(`${p.sku} — ${p.name}`);
                            setProductOpen(false);
                          }}
                        >
                          {p.sku} — {p.name}
                        </CommandItem>
                      ))}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </Field>

            <Field>
              <FieldLabel>
                Location <RequiredAsterisk />
              </FieldLabel>
              <Select
                value={locationId}
                onValueChange={setLocationId}
                disabled={!!initial}
              >
                <SelectTrigger />
                <SelectContent>
                  {locations.map((loc) => (
                    <SelectItem key={loc.id} value={String(loc.id)}>
                      {loc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field>
              <FieldLabel>
                Reorder point <RequiredAsterisk />
              </FieldLabel>
              <Input
                type="number"
                min={0}
                value={reorderPoint}
                onChange={(e) => setReorderPoint(e.target.value)}
              />
            </Field>
          </FieldGroup>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!canSave || saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}