import { Banknote, Smartphone, CreditCard, Clock, RotateCcw, ListOrdered } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatKsh } from "@/lib/format";
import { cn } from "@/lib/cn";

interface CommandCenterProps {
  subtotalGross: number;
  totalNet: number;
  totalTax: number;
  totalGross: number;
  onCashPayment: () => void;
  onMpesaPayment: () => void;
  onCreditPayment: () => void;
  onHoldOrder: () => void;
  onOpenHeldOrders?: () => void;
  returnMode: boolean;
  onToggleReturnMode?: () => void;
}

export function CommandCenter({
  totalNet,
  totalTax,
  totalGross,
  onCashPayment,
  onMpesaPayment,
  onCreditPayment,
  onHoldOrder,
  onOpenHeldOrders,
  returnMode,
  onToggleReturnMode,
}: CommandCenterProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 h-full p-6",
        returnMode && "dark:bg-return-bg/30 dark:border-r border-return-border/50 bg-red-950/10"
      )}
    >
      {/* Customer Display - Running Total (Figma) */}
      <Card className="p-6 bg-gradient-to-br from-card to-muted/20">
        <div className="text-sm text-muted-foreground mb-2">Total Payable</div>
        <div className="text-6xl font-bold font-mono tracking-tight">
          {formatKsh(totalGross)}
        </div>
        <div className="mt-4 pt-4 border-t space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="font-mono">{formatKsh(totalNet)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">VAT (16%)</span>
            <span className="font-mono">{formatKsh(totalTax)}</span>
          </div>
        </div>
      </Card>

      {/* Payment Buttons - High Contrast */}
      <div className="space-y-2 mt-auto flex-shrink-0">
        <Button
          className="w-full h-14 text-xl btn-cash"
          onClick={onCashPayment}
        >
          <Banknote className="mr-3 size-6" />
          CASH
        </Button>
        <Button
          className="w-full h-14 text-xl btn-mpesa"
          onClick={onMpesaPayment}
        >
          <Smartphone className="mr-3 size-6" />
          M-PESA
        </Button>
        <Button
          className="w-full h-14 text-xl btn-credit"
          onClick={onCreditPayment}
        >
          <CreditCard className="mr-3 size-6" />
          CREDIT
        </Button>
        <Button
          variant="outline"
          className="w-full h-12 text-base border-orange-500 text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950"
          onClick={onHoldOrder}
        >
          <Clock className="mr-2 size-4" />
          HOLD ORDER
        </Button>
        {onOpenHeldOrders && (
          <Button
            variant="outline"
            className="w-full h-10 text-sm border-muted text-muted-foreground hover:bg-muted"
            onClick={onOpenHeldOrders}
          >
            <ListOrdered className="mr-2 size-4" />
            HELD ORDERS
          </Button>
        )}
        {onToggleReturnMode && (
          <Button
            variant={returnMode ? "destructive" : "outline"}
            size="sm"
            className={cn(
              "w-full mt-2 border-muted",
              returnMode
                ? "dark:bg-return-bg dark:border-return-border dark:text-rose-400 dark:hover:bg-return-border/80"
                : "text-muted-foreground"
            )}
            onClick={onToggleReturnMode}
            title="Return Mode (F3)"
          >
            <RotateCcw className="mr-2 size-4" />
            Return {returnMode ? "ON" : "OFF"}
          </Button>
        )}
      </div>
    </div>
  );
}
