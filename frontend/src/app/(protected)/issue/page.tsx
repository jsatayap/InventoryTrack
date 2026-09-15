"use client";

import { useEffect, useState, FormEvent, Fragment } from "react";
import { api, ApiError } from "@/lib/api";
import { Location, Product, Issue, NewIssueItem } from "@/lib/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldLabel, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
import { Badge } from "@/components/ui/badge";
import { X, ChevronDown} from "lucide-react";

const TRADE_CODES = [
  { code: "01", label: "Transfer" },
  { code: "55", label: "Adjust / Stock tracking" },
  { code: "99", label: "Wasted" },
];

function Required() {
  return <span className="text-red-600">*</span>;
}

interface SerialLineDraft {
  product_id: string;
  serials: string[];
  serialInput: string;
}

interface QuantityLineDraft {
  product_id: string;
  quantity: number;
}

const emptySerialLine: SerialLineDraft = { product_id: "", serials: [], serialInput: "" };
const emptyQuantityLine: QuantityLineDraft = { product_id: "", quantity: 1 };

export default function IssuePage() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [isLoadingIssues, setIsLoadingIssues] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [selectedLocationIds, setSelectedLocationIds] = useState<number[]>([]);

  // form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [issueNo, setIssueNo] = useState("");
  const [locationId, setLocationId] = useState<number | "">("");
  const [toLocationId, setToLocationId] = useState<number | "">("");
  const [tradeCode, setTradeCode] = useState("01");
  const [remark, setRemark] = useState("");
  const [serialLines, setSerialLines] = useState<SerialLineDraft[]>([{ ...emptySerialLine }]);
  const [quantityLines, setQuantityLines] = useState<QuantityLineDraft[]>([{ ...emptyQuantityLine }]);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const isTransfer = tradeCode === "01";
  const serializedProducts = products.filter((p) => p.is_serialized);
  const nonSerializedProducts = products.filter((p) => !p.is_serialized);

  useEffect(() => {
    api.get<Location[]>("/locations").then(setLocations).catch(() => {});
    api.get<Product[]>("/products").then(setProducts).catch(() => {});
    fetchIssues();
  }, []);

  async function fetchIssues() {
    setIsLoadingIssues(true);
    setListError(null);
    try {
      const data = await api.get<Issue[]>("/issues");
      setIssues(data);
    } catch (err) {
      setListError(err instanceof ApiError ? err.message : "Could not load issue history.");
    } finally {
      setIsLoadingIssues(false);
    }
  }

  function toggleLocationFilter(id: number) {
    setSelectedLocationIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function clearLocationFilter() {
    setSelectedLocationIds([]);
  }

  const filteredIssues =
    selectedLocationIds.length === 0
      ? issues
      : issues.filter((iss) => selectedLocationIds.includes(iss.location_id));

  function productById(id: string) {
    return products.find((p) => p.id === id);
  }

  function resetForm() {
    setIssueNo("");
    setLocationId("");
    setToLocationId("");
    setTradeCode("01");
    setRemark("");
    setSerialLines([{ ...emptySerialLine }]);
    setQuantityLines([{ ...emptyQuantityLine }]);
    setFormError(null);
  }

  function updateSerialLine(index: number, patch: Partial<SerialLineDraft>) {
    setSerialLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  function addSerialLine() {
    setSerialLines((prev) => [...prev, { ...emptySerialLine }]);
  }

  function removeSerialLine(index: number) {
    setSerialLines((prev) => prev.filter((_, i) => i !== index));
  }

  function stageSerial(e: FormEvent, index: number) {
    e.preventDefault();
    const line = serialLines[index];
    const serial = line.serialInput.trim();
    if (!serial) return;
    if (line.serials.some((s) => s.toLowerCase() === serial.toLowerCase())) {
      setFormError(`"${serial}" is already added to this line.`);
      return;
    }
    updateSerialLine(index, { serials: [...line.serials, serial], serialInput: "" });
    setFormError(null);
  }

  function removeStagedSerial(lineIndex: number, serialIndex: number) {
    const line = serialLines[lineIndex];
    updateSerialLine(lineIndex, {
      serials: line.serials.filter((_, i) => i !== serialIndex),
    });
  }

  function updateQuantityLine(index: number, patch: Partial<QuantityLineDraft>) {
    setQuantityLines((prev) => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  function addQuantityLine() {
    setQuantityLines((prev) => [...prev, { ...emptyQuantityLine }]);
  }

  function removeQuantityLine(index: number) {
    setQuantityLines((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!locationId) {
      setFormError("Select a location.");
      return;
    }
    if (isTransfer && !toLocationId) {
      setFormError("Select a destination location for the transfer.");
      return;
    }
    if (isTransfer && toLocationId === locationId) {
      setFormError("Destination must be different from the source location.");
      return;
    }

    const items: NewIssueItem[] = [];

    for (const line of serialLines) {
      if (!line.product_id) continue;
      const product = productById(line.product_id);
      if (line.serials.length === 0) {
        setFormError(`Add at least one serial number for ${product?.name ?? "the selected product"}.`);
        return;
      }
      for (const serial of line.serials) {
        items.push({ product_id: line.product_id, serial_number: serial });
      }
    }

    for (const line of quantityLines) {
      if (!line.product_id) continue;
      const product = productById(line.product_id);
      if (line.quantity <= 0) {
        setFormError(`Enter a quantity greater than 0 for ${product?.name ?? "the selected product"}.`);
        return;
      }
      items.push({ product_id: line.product_id, quantity: line.quantity });
    }

    if (items.length === 0) {
      setFormError("Add at least one item.");
      return;
    }

    setIsSaving(true);
    try {
      await api.post("/issues", {
        issue_no: issueNo,
        location_id: locationId,
        to_location_id: isTransfer ? toLocationId : undefined,
        reason_type: "trade_description",
        trade_code: tradeCode,
        remark: remark || undefined,
        items,
      });
      resetForm();
      setShowAddForm(false);
      fetchIssues();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Could not create issue.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-neutral-900">Issue</h1>
        <Dialog
          open={showAddForm}
          onOpenChange={(open) => {
            setShowAddForm(open);
            if (!open) resetForm();
          }}
        >
          <DialogTrigger
            render={
              <Button className="bg-[#1E3A5F] text-white hover:bg-[#16304d]">
                New Issue
              </Button>
            }
          />
          <DialogContent className="sm:max-w-3xl max-h-[85vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>New Issue</DialogTitle>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="overflow-y-auto pr-1 -mr-1">
              <FieldGroup>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <Field>
                    <FieldLabel htmlFor="issue-no">
                      Issue No. <Required />
                    </FieldLabel>
                    <Input
                      id="issue-no"
                      required
                      value={issueNo}
                      onChange={(e) => setIssueNo(e.target.value)}
                      placeholder="ISS-0001"
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="issue-location">
                      Location <Required />
                    </FieldLabel>
                    <select
                      id="issue-location"
                      required
                      value={locationId}
                      onChange={(e) => setLocationId(e.target.value ? Number(e.target.value) : "")}
                      className="input"
                    >
                      <option value="">Select…</option>
                      {locations.map((loc) => (
                        <option key={loc.id} value={loc.id}>
                          {loc.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="issue-remark">Remark</FieldLabel>
                    <Input id="issue-remark" value={remark} onChange={(e) => setRemark(e.target.value)} />
                  </Field>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Field>
                    <FieldLabel htmlFor="issue-reason">
                      Reason <Required />
                    </FieldLabel>
                    <Select value={tradeCode} onValueChange={setTradeCode}>
                      <SelectTrigger id="issue-reason">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TRADE_CODES.map((t) => (
                          <SelectItem key={t.code} value={t.code}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="issue-to-location">
                      Transfer to location {isTransfer && <Required />}
                    </FieldLabel>
                    <select
                      id="issue-to-location"
                      required={isTransfer}
                      disabled={!isTransfer}
                      value={toLocationId}
                      onChange={(e) => setToLocationId(e.target.value ? Number(e.target.value) : "")}
                      className="input disabled:bg-neutral-100 disabled:text-neutral-400"
                    >
                      <option value="">Select destination…</option>
                      {locations
                        .filter((loc) => loc.id !== locationId)
                        .map((loc) => (
                          <option key={loc.id} value={loc.id}>
                            {loc.name}
                          </option>
                        ))}
                    </select>
                  </Field>
                </div>

                <div>
                  <p className="text-xs text-neutral-500 font-medium mb-2">
                    Serialized items
                  </p>
                  <div className="border border-neutral-200">
                    <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-neutral-50 text-xs text-neutral-500 font-medium">
                      <div className="col-span-4">Product</div>
                      <div className="col-span-6">Serial numbers</div>
                      <div className="col-span-1 text-center">Qty</div>
                      <div className="col-span-1"></div>
                    </div>
                    {serialLines.map((line, i) => (
                      <div key={i} className="grid grid-cols-12 gap-2 px-3 py-3 border-t border-neutral-200">
                        <select
                          className="input col-span-4 self-start"
                          value={line.product_id}
                          onChange={(e) => updateSerialLine(i, { product_id: e.target.value })}
                        >
                          <option value="">Select product…</option>
                          {serializedProducts.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} {p.storage_size != null ? `(${p.storage_size} GB)` : ""}
                            </option>
                          ))}
                        </select>

                        <div className="col-span-6">
                          <div className="flex gap-2">
                            <Input
                              placeholder="Scan or type serial / IMEI, then press Enter"
                              value={line.serialInput}
                              disabled={!line.product_id}
                              onChange={(e) => updateSerialLine(i, { serialInput: e.target.value })}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") stageSerial(e as unknown as FormEvent, i);
                              }}
                            />
                            <Button
                              type="button"
                              variant="secondary"
                              disabled={!line.product_id}
                              onClick={(e) => stageSerial(e, i)}
                            >
                              Add
                            </Button>
                          </div>
                          {line.serials.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-2">
                              {line.serials.map((serial, si) => (
                                <Badge
                                  key={`${serial}-${si}`}
                                  variant="secondary"
                                  className="gap-1 pr-1 font-mono text-xs"
                                >
                                  {serial}
                                  <button
                                    type="button"
                                    onClick={() => removeStagedSerial(i, si)}
                                    aria-label={`Remove ${serial}`}
                                    className="rounded-sm hover:bg-neutral-300/60 p-0.5"
                                  >
                                    <X className="size-3" />
                                  </button>
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="col-span-1 text-center font-medium self-start pt-2">
                          {line.serials.length}
                        </div>

                        <div className="col-span-1 text-right self-start">
                          {serialLines.length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="text-red-600 hover:text-red-700"
                              onClick={() => removeSerialLine(i)}
                              aria-label="Remove line"
                            >
                              <X className="size-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  <Button type="button" variant="ghost" onClick={addSerialLine} className="mt-2">
                    + Add product
                  </Button>
                </div>

                <div>
                  <p className="text-xs text-neutral-500 font-medium mb-2">
                    Quantity items
                  </p>
                  <div className="border border-neutral-200">
                    <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-neutral-50 text-xs text-neutral-500 font-medium">
                      <div className="col-span-8">Product</div>
                      <div className="col-span-2">Quantity</div>
                      <div className="col-span-2"></div>
                    </div>
                    {quantityLines.map((line, i) => (
                      <div
                        key={i}
                        className="grid grid-cols-12 gap-2 px-3 py-2 border-t border-neutral-200 items-center"
                      >
                        <select
                          className="input col-span-8"
                          value={line.product_id}
                          onChange={(e) => updateQuantityLine(i, { product_id: e.target.value })}
                        >
                          <option value="">Select product…</option>
                          {nonSerializedProducts.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} {p.storage_size != null ? `(${p.storage_size} GB)` : ""}
                            </option>
                          ))}
                        </select>
                        <Input
                          type="number"
                          min={1}
                          className="col-span-2"
                          value={line.quantity}
                          disabled={!line.product_id}
                          onChange={(e) => updateQuantityLine(i, { quantity: Number(e.target.value) })}
                        />
                        <div className="col-span-2 text-right">
                          {quantityLines.length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="text-red-600 hover:text-red-700"
                              onClick={() => removeQuantityLine(i)}
                            >
                              Remove
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  <Button type="button" variant="ghost" onClick={addQuantityLine} className="mt-2">
                    + Add product
                  </Button>
                </div>

                <div className="flex items-center gap-3">
                  <Button type="submit" disabled={isSaving}>
                    {isSaving ? "Submitting…" : "Submit issue"}
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setShowAddForm(false)}>
                    Cancel
                  </Button>
                  {formError && <p className="text-sm text-red-700">{formError}</p>}
                </div>
              </FieldGroup>
            </form>
          </DialogContent>
        </Dialog>
      </div>

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

        {selectedLocationIds.length > 0 && (
          <Button variant="ghost" onClick={clearLocationFilter}>
            Clear filters
          </Button>
        )}
      </div>

      {listError && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 px-3 py-2 mb-4">{listError}</p>
      )}

      <div className="border border-neutral-300 bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-300 bg-neutral-50 text-left text-neutral-500">
              <th className="px-3 py-2 font-medium">Issue No.</th>
              <th className="px-3 py-2 font-medium">Location</th>
              <th className="px-3 py-2 font-medium">Reason</th>
              <th className="px-3 py-2 font-medium">Date</th>
              <th className="px-3 py-2 font-medium">Items</th>
            </tr>
          </thead>
          <tbody>
            {isLoadingIssues ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-neutral-400">
                  Loading…
                </td>
              </tr>
            ) : filteredIssues.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-neutral-400">
                  {selectedLocationIds.length > 0
                    ? "No issues match the selected locations."
                    : "No issues yet."}
                </td>
              </tr>
            ) : (
              filteredIssues.map((iss) => {
                const label = TRADE_CODES.find((t) => t.code === iss.trade_code)?.label ?? iss.trade_code;
                const isExpanded = expandedId === iss.id;
                return (
                  <Fragment key={iss.id}>
                    <tr
                      onClick={() => setExpandedId(isExpanded ? null : iss.id)}
                      className="border-b border-neutral-200 last:border-0 hover:bg-neutral-50 cursor-pointer"
                    >
                      <td className="px-3 py-2 font-mono text-xs">{iss.issue_no}</td>
                      <td className="px-3 py-2 text-neutral-600">{iss.location_name}</td>
                      <td className="px-3 py-2 text-neutral-500">
                        {label}
                        {iss.to_location_name && (
                          <span className="text-neutral-400"> → {iss.to_location_name}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-neutral-500">{iss.issue_date}</td>
                      <td className="px-3 py-2 text-neutral-500">{iss.items.length}</td>
                    </tr>
                    {isExpanded && (
                      <tr className="border-b border-neutral-200 bg-neutral-50">
                        <td colSpan={5} className="px-3 py-3">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-neutral-500">
                                <th className="text-left font-medium py-1">Product</th>
                                <th className="text-left font-medium py-1">Serial</th>
                                <th className="text-right font-medium py-1">Qty</th>
                              </tr>
                            </thead>
                            <tbody>
                              {iss.items.map((item) => (
                                <tr key={item.id}>
                                  <td className="py-1">{item.product_name}</td>
                                  <td className="py-1 font-mono">{item.serial_number ?? "—"}</td>
                                  <td className="py-1 text-right">{item.quantity}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {iss.remark && (
                            <p className="text-xs text-neutral-500 mt-2">Remark: {iss.remark}</p>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}