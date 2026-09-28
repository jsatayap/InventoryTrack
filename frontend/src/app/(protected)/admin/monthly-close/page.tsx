"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
import {
  Select, SelectTrigger, SelectContent, SelectItem, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";

// ---- Types (mirror schemas.PeriodStatusOut / TradeCodeOut / CloseMonthResult) ----

interface PeriodStatus {
  closed_months: string[]; // "YYYY-MM-DD", ascending
  next_month_to_close: string | null;
  can_close_next: boolean;
}

interface TradeCode {
  id: number;
  trade_type: string; // "RCV" | "ISS"
  code: number;
  column_name: string;
  description: string | null;
  sort_order?: number;
  is_active: boolean;
}

interface CloseMonthResult {
  month: string;
  rows_written: number;
}

const ADMIN_ROLE = "admin"; // must match _require_admin in stock.py

const monthLabel = (d: string) => d.slice(0, 7);
const codeLabel = (c: { trade_type: string; code: number }) =>
  `${c.trade_type} ${String(c.code).padStart(2, "0")}`;

// The API client's error shape isn't visible from here, so read the message defensively.
function errMessage(e: unknown, fallback: string): string {
  if (e instanceof Error && e.message) return e.message;
  if (typeof e === "object" && e !== null && "detail" in e) {
    const d = (e as { detail: unknown }).detail;
    if (typeof d === "string") return d;
  }
  return fallback;
}

const RequiredMark = () => <span className="ml-0.5 text-red-600">*</span>;

export default function MonthlyClosePage() {
  const { user, isLoading } = useAuth();

  const [period, setPeriod] = useState<PeriodStatus | null>(null);
  const [codes, setCodes] = useState<TradeCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // close month
  const [closeOpen, setCloseOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);
  const [closeResult, setCloseResult] = useState<CloseMonthResult | null>(null);

  // add trade code
  const [codeOpen, setCodeOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [newType, setNewType] = useState("ISS");
  const [newCode, setNewCode] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [addedColumn, setAddedColumn] = useState<string | null>(null);

  const isAdmin = user?.role === ADMIN_ROLE;

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [p, c] = await Promise.all([
        api.get<PeriodStatus>("/stock/periods"),
        api.get<TradeCode[]>("/stock/trade-codes"),
      ]);
      setPeriod(p);
      setCodes(c);
    } catch (e) {
      setLoadError(errMessage(e, "Couldn't load period and trade code data."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, load]);

  const handleClose = async () => {
    if (!period?.next_month_to_close) return;
    setClosing(true);
    setCloseError(null);
    try {
      const res = await api.post<CloseMonthResult>("/stock/monthly-summary/close", {
        month: period.next_month_to_close,
      });
      setCloseResult(res);
      setCloseOpen(false);
      await load();
    } catch (e) {
      // 400s carry the business-rule message from fn_close_month()
      setCloseError(errMessage(e, "Couldn't close the month."));
    } finally {
      setClosing(false);
    }
  };

  const openCodeDialog = () => {
    setNewType("ISS");
    setNewCode("");
    setNewDescription("");
    setCodeError(null);
    setCodeOpen(true);
  };

  const codeNumber = Number(newCode);
  // TradeCodeCreate: Field(ge=0, le=999)
  const codeValid =
    newCode.trim() !== "" && Number.isInteger(codeNumber) && codeNumber >= 0 && codeNumber <= 999;

  const handleAddCode = async () => {
    if (!codeValid) return;
    setSaving(true);
    setCodeError(null);
    try {
      const created = await api.post<TradeCode>("/stock/trade-codes", {
        trade_type: newType,
        code: codeNumber,
        description: newDescription.trim() || null,
      });
      setAddedColumn(created.column_name);
      setCodeOpen(false);
      await load();
    } catch (e) {
      setCodeError(errMessage(e, "Couldn't add the trade code."));
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) return <p className="text-sm text-neutral-500">Loading...</p>;

  if (!isAdmin) {
    return (
      <div className="rounded-md border border-neutral-300 bg-white p-4 text-sm text-neutral-600">
        Only administrators can close months or manage trade codes.
      </div>
    );
  }

  const closedDesc = period ? [...period.closed_months].reverse() : [];

  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-lg font-semibold text-neutral-900">Monthly close &amp; trade codes</h1>

      {loadError && <p className="text-sm text-red-600">{loadError}</p>}

      {/* ---------------- Close month ---------------- */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm font-medium">Close month</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 pb-4">
          {loading && !period ? (
            <p className="text-sm text-neutral-500">Loading...</p>
          ) : period?.next_month_to_close ? (
            <div className="flex flex-wrap items-center gap-3">
              <div>
                <p className="text-xs text-neutral-500">Next month to close</p>
                <p className="text-base font-semibold">{monthLabel(period.next_month_to_close)}</p>
              </div>
              <Button
                size="sm"
                className="ml-auto"
                disabled={!period.can_close_next || closing}
                onClick={() => {
                  setCloseError(null);
                  setCloseOpen(true);
                }}
              >
                Close {monthLabel(period.next_month_to_close)}
              </Button>
            </div>
          ) : (
            <p className="text-sm text-neutral-500">
              There are no transactions yet, so there is nothing to close.
            </p>
          )}

          {period?.next_month_to_close && !period.can_close_next && (
            <p className="text-xs text-neutral-500">
              This month isn&apos;t finished yet. It can be closed once the month has ended.
            </p>
          )}

          {closeResult && (
            <p className="text-sm text-green-700">
              Closed {monthLabel(closeResult.month)}: {closeResult.rows_written.toLocaleString()} summary rows
              written.
            </p>
          )}

          <div>
            <p className="mb-1 text-xs text-neutral-500">Closed months</p>
            {closedDesc.length ? (
              <div className="flex max-h-24 flex-wrap gap-1 overflow-auto">
                {closedDesc.map((m) => (
                  <Badge key={m} variant="secondary">
                    {monthLabel(m)}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-sm text-neutral-500">No months have been closed yet.</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ---------------- Trade codes ---------------- */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between py-3">
          <CardTitle className="text-sm font-medium">Trade codes</CardTitle>
          <Button size="sm" onClick={openCodeDialog}>
            Add trade code
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 pb-4">
          {addedColumn && (
            <p className="text-sm text-green-700">
              Trade code added. It now appears as the <code>{addedColumn}</code> column in the monthly
              summary.
            </p>
          )}
          <div className="overflow-auto rounded-md border border-neutral-200">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Column</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {codes.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="whitespace-nowrap">{codeLabel(c)}</TableCell>
                    <TableCell className="text-neutral-500">{c.column_name}</TableCell>
                    <TableCell>{c.description ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={c.is_active ? "secondary" : "outline"}>
                        {c.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {codes.length === 0 && !loading && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-neutral-500">
                      No trade codes yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* ---------------- Close confirmation ---------------- */}
      <AlertDialog open={closeOpen} onOpenChange={(o) => !closing && setCloseOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Close {period?.next_month_to_close ? monthLabel(period.next_month_to_close) : "month"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This can&apos;t be undone. Once closed, the month&apos;s summary rows are permanent and can never
              be changed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {closeError && <p className="text-sm text-red-600">{closeError}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={closing}>Cancel</AlertDialogCancel>
            <Button onClick={handleClose} disabled={closing}>
              {closing ? "Closing..." : "Close month"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ---------------- Add trade code ---------------- */}
      <Dialog open={codeOpen} onOpenChange={(o) => !saving && setCodeOpen(o)}>
        <DialogContent className="flex max-h-[85vh] flex-col">
          <DialogHeader>
            <DialogTitle>Add trade code</DialogTitle>
            <DialogDescription>
              Adds a new column to the monthly summary. Existing closed months show 0 for it.
            </DialogDescription>
          </DialogHeader>

          <div className="overflow-y-auto">
            <FieldGroup>
              <Field>
                <FieldLabel>
                  Type
                  <RequiredMark />
                </FieldLabel>
                <Select value={newType} onValueChange={(v) => v && setNewType(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="RCV">RCV (receive)</SelectItem>
                    <SelectItem value="ISS">ISS (issue)</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel>
                  Code
                  <RequiredMark />
                </FieldLabel>
                <Input
                  type="number"
                  min={0}
                  max={999}
                  step={1}
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel>Description</FieldLabel>
                <Input value={newDescription} onChange={(e) => setNewDescription(e.target.value)} />
              </Field>
            </FieldGroup>
            {codeError && <p className="mt-2 text-sm text-red-600">{codeError}</p>}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCodeOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleAddCode} disabled={!codeValid || saving}>
              {saving ? "Adding..." : "Add trade code"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}