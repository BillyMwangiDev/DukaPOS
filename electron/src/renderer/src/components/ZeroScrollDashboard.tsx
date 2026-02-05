import React from "react";
import { CartSection } from "./CartSection";
import { CommandCenter } from "./CommandCenter";
import { cn } from "@/lib/cn";

interface ZeroScrollDashboardProps {
  items: any[];
  totalGross: number;
  totalNet: number;
  totalTax: number;
  subtotalGross: number;
  lastScannedId?: string;
  onUpdateQuantity: (id: string, quantity: number) => void;
  onRemoveItem: (id: string) => void;
  onUpdatePrice: (id: string, price: number) => void;
  onClearCart: () => void;
  onCashPayment: () => void;
  onMpesaPayment: () => void;
  onCreditPayment: () => void;
  onHoldOrder: () => void;
  onOpenHeldOrders: () => void;
  returnMode: boolean;
  onToggleReturnMode: () => void;
}

export const ZeroScrollDashboard: React.FC<ZeroScrollDashboardProps> = ({
  items,
  totalGross,
  totalNet,
  totalTax,
  subtotalGross,
  lastScannedId,
  onUpdateQuantity,
  onRemoveItem,
  onUpdatePrice,
  onClearCart,
  onCashPayment,
  onMpesaPayment,
  onCreditPayment,
  onHoldOrder,
  onOpenHeldOrders,
  returnMode,
  onToggleReturnMode,
}) => {
  return (
    <div className="flex flex-1 overflow-hidden bg-muted/5 animate-in">
      {/* Left Column: Current Transaction (The Cart) */}
      <div className="flex-1 flex flex-col overflow-hidden pos-gradient-border">
        <div className="h-12 border-b bg-card/50 backdrop-blur-md flex items-center px-6 justify-between shrink-0">
          <h3 className="text-xs font-black uppercase tracking-widest text-safaricom-green">
            Current Sale
          </h3>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold bg-safaricom-green/10 text-safaricom-green px-2 py-0.5 rounded-full uppercase tracking-tighter">
              {items.length} Items Scanner Ready
            </span>
          </div>
        </div>
        <div className="flex-1 overflow-hidden flex flex-col">
          <CartSection
            items={items}
            lastScannedId={lastScannedId}
            onUpdateQuantity={onUpdateQuantity}
            onRemoveItem={onRemoveItem}
            onUpdatePrice={onUpdatePrice}
            onClearCart={onClearCart}
            returnMode={returnMode}
          />
        </div>
      </div>

      {/* Right Sidebar: Command Center (Totals & Payments) */}
      <div className="w-[420px] flex-shrink-0 flex flex-col overflow-hidden glass z-10">
        <div className="h-12 border-b bg-muted/10 flex items-center px-4 shrink-0">
          <h3 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/80">
            Checkout Summary
          </h3>
        </div>
        <div className="flex-1 overflow-y-auto no-scrollbar">
          <CommandCenter
            subtotalGross={subtotalGross}
            totalNet={totalNet}
            totalTax={totalTax}
            totalGross={totalGross}
            onCashPayment={onCashPayment}
            onMpesaPayment={onMpesaPayment}
            onCreditPayment={onCreditPayment}
            onHoldOrder={onHoldOrder}
            onOpenHeldOrders={onOpenHeldOrders}
            returnMode={returnMode}
            onToggleReturnMode={onToggleReturnMode}
          />
        </div>
      </div>
    </div>
  );
};
