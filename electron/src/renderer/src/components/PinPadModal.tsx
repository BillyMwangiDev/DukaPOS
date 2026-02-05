import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Delete } from "lucide-react";
import { cn } from "@/lib/cn";

export interface PinPadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  onConfirm: (pin: string) => void;
  onCancel?: () => void;
  /** Max length (default 6). */
  maxLength?: number;
  /** Show as dots (default true). */
  maskInput?: boolean;
}

const NUMPAD_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "C"];

export function PinPadModal({
  open,
  onOpenChange,
  title = "Enter PIN",
  description = "Enter 4–6 digit PIN",
  onConfirm,
  onCancel,
  maxLength = 6,
  maskInput = true,
}: PinPadModalProps) {
  const [pin, setPin] = useState("");

  const handleKey = (key: string) => {
    if (key === "C") {
      setPin("");
      return;
    }
    if (key === "" || pin.length >= maxLength) return;
    setPin((p) => p + key);
  };

  const handleSubmit = () => {
    if (pin.length >= 4 && pin.length <= maxLength) {
      onConfirm(pin);
      setPin("");
      onOpenChange(false);
    }
  };

  const handleClose = (next: boolean) => {
    if (!next) {
      setPin("");
      onCancel?.();
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div
            className={cn(
              "h-12 rounded-md border bg-input-background px-4 flex items-center justify-end font-mono text-xl tracking-widest",
              pin.length >= 4 ? "border-primary" : "border-border"
            )}
          >
            {maskInput ? "•".repeat(pin.length) : pin}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {NUMPAD_KEYS.map((key) =>
              key === "" ? (
                <div key="empty" />
              ) : (
                <Button
                  key={key}
                  variant="outline"
                  className="h-12 text-lg font-medium"
                  onClick={() => handleKey(key)}
                >
                  {key === "C" ? <Delete className="size-5" /> : key}
                </Button>
              )
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => handleClose(false)}>
              Cancel
            </Button>
            <Button
              className="flex-1"
              onClick={handleSubmit}
              disabled={pin.length < 4 || pin.length > maxLength}
            >
              Confirm
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
