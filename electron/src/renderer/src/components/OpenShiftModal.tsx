import { useState } from "react";
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

interface OpenShiftModalProps {
  open: boolean;
  onClose: () => void;
  onOpened: (shift: { id: number; opened_at: string; opening_float: number; cashier_id: number }) => void;
  cashierId: number;
}

export function OpenShiftModal({ open, onClose, onOpened, cashierId }: OpenShiftModalProps) {
  const [openingFloat, setOpeningFloat] = useState("0");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleOpen = async () => {
    const float = parseFloat(openingFloat);
    if (Number.isNaN(float) || float < 0) {
      toast.error("Enter a valid opening float (≥ 0)");
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await fetch(apiUrl("shifts/open"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cashier_id: cashierId, opening_float: float }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error("Open shift failed", {
          description: (err as { detail?: string }).detail || res.statusText,
        });
        return;
      }
      const shift = (await res.json()) as { id: number; opened_at: string; opening_float: number; cashier_id: number };
      onOpened(shift);
      setOpeningFloat("0");
      onClose();
      toast.success("Shift opened", { description: `Float: KSh ${float.toFixed(2)}` });
    } catch (e) {
      toast.error("Open shift failed", { description: String(e) });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Open Shift</DialogTitle>
          <DialogDescription>
            Enter opening float (cash in drawer at start of shift).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-4">
          <div>
            <Label>Opening Float (KSh)</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={openingFloat}
              onChange={(e) => setOpeningFloat(e.target.value)}
              className="mt-1 h-12 text-lg font-mono"
              autoFocus
            />
          </div>
          <Button className="w-full" size="lg" onClick={handleOpen} disabled={isSubmitting}>
            {isSubmitting ? "Opening…" : "Open Shift"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
