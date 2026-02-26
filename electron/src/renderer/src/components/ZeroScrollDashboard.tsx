import React, { useState, useEffect } from "react";
import { CartSection } from "./CartSection";
import { CommandCenter } from "./CommandCenter";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tag, X, Loader2 } from "lucide-react";
import { apiUrl } from "@/lib/api";
import { formatKsh } from "@/lib/format";
import { toast } from "sonner";

interface DiscountOption {
  id: number;
  name: string;
  discount_type: "percent" | "fixed";
  value: number;
  scope: string;
}

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
  vatRate?: number;
  /** Current discount amount applied to this cart; managed by App.tsx */
  discountAmount?: number;
  /** Called when discount changes so App.tsx can pass it to checkout */
  onDiscountChange?: (amount: number) => void;
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
  vatRate,
  discountAmount = 0,
  onDiscountChange,
}) => {
  const [discountOpen, setDiscountOpen] = useState(false);
  const [savedDiscounts, setSavedDiscounts] = useState<DiscountOption[]>([]);
  const [customType, setCustomType] = useState<"percent" | "fixed">("percent");
  const [customValue, setCustomValue] = useState("");
  const [promoCode, setPromoCode] = useState("");
  const [promoLoading, setPromoLoading] = useState(false);

  useEffect(() => {
    if (!discountOpen) return;
    fetch(apiUrl("discounts?active_only=true"))
      .then((r) => r.json())
      .then((d) => setSavedDiscounts(Array.isArray(d) ? d : []))
      .catch(() => setSavedDiscounts([]));
  }, [discountOpen]);

  function applyDiscount(amount: number) {
    onDiscountChange?.(Math.max(0, Math.min(amount, totalGross)));
    setDiscountOpen(false);
    setCustomValue("");
  }

  function applySaved(d: DiscountOption) {
    const amount = d.discount_type === "percent"
      ? (totalGross * d.value) / 100
      : d.value;
    applyDiscount(amount);
  }

  function applyCustom() {
    const v = parseFloat(customValue);
    if (isNaN(v) || v <= 0) return;
    const amount = customType === "percent" ? (totalGross * v) / 100 : v;
    applyDiscount(amount);
  }

  async function applyPromoCode() {
    const code = promoCode.trim();
    if (!code) return;
    setPromoLoading(true);
    try {
      const res = await fetch(apiUrl("discounts/validate-code"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error((err as { detail?: string }).detail || "Invalid promo code");
        return;
      }
      const discount = (await res.json()) as DiscountOption;
      applySaved(discount);
      toast.success(`Promo "${discount.name}" applied!`);
      setPromoCode("");
    } catch {
      toast.error("Failed to validate promo code");
    } finally {
      setPromoLoading(false);
    }
  }

  const effectiveTotal = Math.max(0, totalGross - discountAmount);

  return (
    <div className="flex flex-1 overflow-hidden bg-muted/5 animate-in">
      {/* Left Column: Current Transaction (The Cart) */}
      <div className="flex-1 flex flex-col overflow-hidden pos-gradient-border">
        <div className="h-12 border-b bg-card/50 flex items-center px-6 justify-between shrink-0">
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
        <div className="h-12 border-b bg-muted/10 flex items-center px-4 justify-between shrink-0">
          <h3 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/80">
            Checkout Summary
          </h3>
          {/* Discount button / active indicator */}
          {items.length > 0 && (
            discountAmount > 0 ? (
              <div className="flex items-center gap-1">
                <span className="text-xs text-emerald-500 font-semibold">
                  -{formatKsh(discountAmount)}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6 text-muted-foreground"
                  onClick={() => onDiscountChange?.(0)}
                  title="Remove discount"
                >
                  <X className="size-3" />
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => setDiscountOpen(true)}
              >
                <Tag className="size-3" />
                Discount
              </Button>
            )
          )}
        </div>
        <div className="flex-1 overflow-y-auto no-scrollbar">
          <CommandCenter
            subtotalGross={subtotalGross}
            totalNet={totalNet}
            totalTax={totalTax}
            totalGross={effectiveTotal}
            discountAmount={discountAmount}
            onCashPayment={onCashPayment}
            onMpesaPayment={onMpesaPayment}
            onCreditPayment={onCreditPayment}
            onHoldOrder={onHoldOrder}
            onOpenHeldOrders={onOpenHeldOrders}
            returnMode={returnMode}
            onToggleReturnMode={onToggleReturnMode}
            isPaymentDisabled={items.length === 0 || (effectiveTotal <= 0 && !returnMode)}
            vatRate={vatRate}
          />
        </div>
      </div>

      {/* Discount dialog */}
      <Dialog open={discountOpen} onOpenChange={setDiscountOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Tag className="size-4" />
              Apply Discount
            </DialogTitle>
          </DialogHeader>

          {/* Promo code */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Promo Code</Label>
            <div className="flex gap-2">
              <Input
                placeholder="Enter code…"
                value={promoCode}
                onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === "Enter" && applyPromoCode()}
                className="flex-1 font-mono uppercase"
              />
              <Button size="sm" onClick={applyPromoCode} disabled={!promoCode.trim() || promoLoading}>
                {promoLoading ? <Loader2 className="size-4 animate-spin" /> : "Apply"}
              </Button>
            </div>
          </div>

          <div className="relative my-1">
            <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
            <div className="relative flex justify-center">
              <span className="bg-background px-2 text-xs text-muted-foreground">or choose a discount</span>
            </div>
          </div>

          {/* Saved discounts */}
          {savedDiscounts.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Saved Discounts</Label>
              <div className="grid grid-cols-2 gap-2">
                {savedDiscounts.map((d) => (
                  <Button
                    key={d.id}
                    variant="outline"
                    size="sm"
                    className="justify-between"
                    onClick={() => applySaved(d)}
                  >
                    <span className="truncate">{d.name}</span>
                    <span className="text-muted-foreground text-xs ml-1">
                      {d.discount_type === "percent" ? `${d.value}%` : formatKsh(d.value)}
                    </span>
                  </Button>
                ))}
              </div>
              <div className="relative my-3">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center">
                  <span className="bg-background px-2 text-xs text-muted-foreground">or enter custom</span>
                </div>
              </div>
            </div>
          )}

          {/* Custom discount */}
          <div className="space-y-3">
            <div className="flex gap-2">
              <Button
                variant={customType === "percent" ? "default" : "outline"}
                size="sm"
                className="flex-1"
                onClick={() => setCustomType("percent")}
              >
                %
              </Button>
              <Button
                variant={customType === "fixed" ? "default" : "outline"}
                size="sm"
                className="flex-1"
                onClick={() => setCustomType("fixed")}
              >
                KSh
              </Button>
            </div>
            <Input
              type="number"
              min={0}
              max={customType === "percent" ? 100 : totalGross}
              placeholder={customType === "percent" ? "e.g. 10 for 10%" : "e.g. 500"}
              value={customValue}
              onChange={(e) => setCustomValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applyCustom()}
            />
            {customValue && !isNaN(parseFloat(customValue)) && (
              <p className="text-xs text-muted-foreground">
                Discount: {formatKsh(
                  customType === "percent"
                    ? (totalGross * parseFloat(customValue)) / 100
                    : parseFloat(customValue)
                )} off {formatKsh(totalGross)}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDiscountOpen(false)}>Cancel</Button>
            <Button onClick={applyCustom} disabled={!customValue || isNaN(parseFloat(customValue))}>
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
