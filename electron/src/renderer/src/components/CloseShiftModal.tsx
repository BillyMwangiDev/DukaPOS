import { useState, useEffect } from "react";
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

export function CloseShiftModal({ open, shiftId, onClose, onClosed }: CloseShiftModalProps) {
  const [closingActual, setClosingActual] = useState("");
  const [zReport, setZReport] = useState<ZReport | null>(null);
  const [isLoadingReport, setIsLoadingReport] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
    }
  }, [open, shiftId]);

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
            Z-Report: Expected vs Actual cash. Enter actual cash in drawer to close.
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
              <div>
                <Label>Actual cash in drawer (KSh)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={closingActual}
                  onChange={(e) => setClosingActual(e.target.value)}
                  className="mt-1 h-12 text-lg font-mono"
                  autoFocus
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
