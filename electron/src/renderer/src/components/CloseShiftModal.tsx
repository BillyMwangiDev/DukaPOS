import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { apiUrl } from "@/lib/api";
import { toast } from "sonner";
import { Calculator } from "lucide-react";

interface ZReport {
  shift_id: number;
  opening_float: number;
  closing_expected: number;
  closing_actual: number;
  total_cash_sales: number;
  total_mpesa_sales: number;
  total_credit_sales: number;
  transaction_count: number;
}

interface CloseShiftModalProps {
  open: boolean;
  shiftId: number;
  onClose: () => void;
  onClosed: () => void;
}

const DENOMINATIONS = [
  { value: 1000, label: "KSh 1000" },
  { value: 500,  label: "KSh 500" },
  { value: 200,  label: "KSh 200" },
  { value: 100,  label: "KSh 100" },
  { value: 50,   label: "KSh 50" },
  { value: 20,   label: "KSh 20" },
  { value: 10,   label: "KSh 10" },
  { value: 5,    label: "KSh 5" },
  { value: 1,    label: "KSh 1" },
];

function makeDenomCounts() {
  return Object.fromEntries(DENOMINATIONS.map((d) => [d.value, 0]));
}

export function CloseShiftModal({ open, shiftId, onClose, onClosed }: CloseShiftModalProps) {
  const [closingActual, setClosingActual] = useState("");
  const [zReport, setZReport] = useState<ZReport | null>(null);
  const [isLoadingReport, setIsLoadingReport] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDenomCount, setShowDenomCount] = useState(false);
  const [denomCounts, setDenomCounts] = useState<Record<number, number>>(makeDenomCounts());

  const denomTotal = DENOMINATIONS.reduce(
    (sum, d) => sum + d.value * (denomCounts[d.value] || 0),
    0
  );

  useEffect(() => {
    if (open && shiftId) {
      setIsLoadingReport(true);
      fetch(apiUrl(`shifts/${shiftId}/z-report`))
        .then((res) => (res.ok ? res.json() : Promise.reject(res)))
        .then((data: ZReport) => {
          setZReport(data);
          setClosingActual(data.closing_expected.toFixed(2));
        })
        .catch(() => toast.error("Failed to load Z-Report"))
        .finally(() => setIsLoadingReport(false));
    } else {
      setZReport(null);
      setClosingActual("");
      setShowDenomCount(false);
      setDenomCounts(makeDenomCounts());
    }
  }, [open, shiftId]);

  const applyDenomTotal = useCallback(() => {
    setClosingActual(denomTotal.toFixed(2));
    setShowDenomCount(false);
  }, [denomTotal]);

  const handleCloseShift = async () => {
    const actual = parseFloat(closingActual);
    if (Number.isNaN(actual) || actual < 0) {
      toast.error("Enter a valid closing cash amount (≥ 0)");
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await fetch(apiUrl(`shifts/${shiftId}/close`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ closing_actual: actual }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error("Close shift failed", {
          description: (err as { detail?: string }).detail || res.statusText,
        });
        return;
      }
      const result = (await res.json()) as ZReport & { closed_at: string };
      toast.success("Shift closed", {
        description: `Expected: KSh ${result.closing_expected.toFixed(2)}, Actual: KSh ${result.closing_actual.toFixed(2)}`,
      });
      onClosed();
      onClose();
    } catch (e) {
      toast.error("Close shift failed", { description: String(e) });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Close Shift</DialogTitle>
          <DialogDescription>
            Z-Report: Expected vs Actual cash. Count denominations or enter amount directly.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-4">
          {isLoadingReport && <p className="text-sm text-muted-foreground">Loading Z-Report…</p>}
          {zReport && !isLoadingReport && (
            <>
              <div className="rounded-md border bg-muted/50 p-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Opening float</span>
                  <span className="font-mono">KSh {zReport.opening_float.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Cash sales</span>
                  <span className="font-mono">KSh {zReport.total_cash_sales.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-medium">
                  <span>Expected in drawer</span>
                  <span className="font-mono">KSh {zReport.closing_expected.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>M-Pesa sales</span>
                  <span className="font-mono">KSh {zReport.total_mpesa_sales.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Credit sales</span>
                  <span className="font-mono">KSh {zReport.total_credit_sales.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Transactions</span>
                  <span>{zReport.transaction_count}</span>
                </div>
              </div>

              {/* Denomination count toggle */}
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => setShowDenomCount((v) => !v)}
              >
                <Calculator className="mr-2 size-4" />
                {showDenomCount ? "Hide denomination count" : "Count by denomination"}
              </Button>

              {showDenomCount && (
                <div className="rounded-md border p-3 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                    Count Cash in Drawer
                  </p>
                  <div className="grid grid-cols-3 gap-x-3 gap-y-2">
                    {DENOMINATIONS.map((d) => (
                      <div key={d.value} className="flex flex-col gap-0.5">
                        <Label className="text-xs text-muted-foreground">{d.label}</Label>
                        <Input
                          type="number"
                          min={0}
                          step={1}
                          value={denomCounts[d.value] || ""}
                          placeholder="0"
                          onChange={(e) =>
                            setDenomCounts((prev) => ({
                              ...prev,
                              [d.value]: Math.max(0, parseInt(e.target.value, 10) || 0),
                            }))
                          }
                          className="h-8 text-sm font-mono bg-muted/50"
                        />
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between pt-1 border-t mt-2">
                    <span className="text-sm font-medium">
                      Counted total: <span className="font-mono text-emerald-600">KSh {denomTotal.toFixed(2)}</span>
                    </span>
                    <Button size="sm" onClick={applyDenomTotal} disabled={denomTotal === 0}>
                      Use this amount
                    </Button>
                  </div>
                </div>
              )}

              <div>
                <Label>Actual cash in drawer (KSh)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={closingActual}
                  onChange={(e) => setClosingActual(e.target.value)}
                  className="mt-1 h-12 text-lg font-mono"
                  autoFocus={!showDenomCount}
                />
              </div>
              <Button
                className="w-full"
                size="lg"
                onClick={handleCloseShift}
                disabled={isSubmitting}
              >
                {isSubmitting ? "Closing…" : "Close Shift"}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
