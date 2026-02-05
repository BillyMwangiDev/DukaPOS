import { Trash2, Plus, Minus, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CartItem } from "@/hooks/useCart";
import { getLinePriceGross } from "@/hooks/useCart";
import { formatKsh } from "@/lib/format";
import { cn } from "@/lib/cn";

interface CartSectionProps {
  items: CartItem[];
  lastScannedId?: string;
  onUpdateQuantity: (id: string, quantity: number) => void;
  onRemoveItem: (id: string) => void;
  onClearCart?: () => void;
  onUpdatePrice?: (id: string, price: number) => void;
  returnMode?: boolean;
}

export function CartSection({
  items,
  lastScannedId,
  onUpdateQuantity,
  onRemoveItem,
  onClearCart,
  onUpdatePrice,
  returnMode = false,
}: CartSectionProps) {
  if (items.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-8 empty-state" data-empty-state>
        <div className="w-32 h-32 rounded-full bg-muted flex items-center justify-center mb-4">
          <Package className="size-16 text-muted-foreground" />
        </div>
        <h3 className="text-xl mb-2">Ready to Scan</h3>
        <p className="text-muted-foreground">
          Scan a barcode or search for a product to begin
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex-1 flex flex-col overflow-hidden",
        returnMode && "dark:ring-2 dark:ring-rose-500/50 dark:rounded-lg dark:bg-return-bg/20 dark:border-return-border/30 ring-2 ring-rose-500/50 rounded-lg bg-rose-950/5"
      )}
    >
      {/* Table Header - Figma layout */}
      <div
        className={cn(
          "grid grid-cols-[60px_1fr_140px_120px_120px_60px] gap-4 px-4 py-3 border-b text-sm font-medium items-center",
          returnMode ? "bg-rose-950/10 border-rose-800" : "bg-muted/50"
        )}
      >
        <div>#</div>
        <div>Item Name</div>
        <div>Qty</div>
        <div className="text-right">Price</div>
        <div className="text-right">Total</div>
        <div className="flex justify-end">
          {onClearCart && (
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-rose-600 hover:text-white hover:bg-rose-600"
              title="Discard Sale"
              onClick={onClearCart}
            >
              <Trash2 className="size-4" />
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {items.map((item, index) => {
          const isLastScanned = item.id === lastScannedId;
          const unitPrice = getLinePriceGross(item);
          const lineTotal = unitPrice * item.quantity;
          const isReturn = item.quantity < 0;
          return (
            <div
              key={item.id}
              className={cn(
                "grid grid-cols-[60px_1fr_140px_120px_120px_60px] gap-4 px-4 py-4 border-b transition-all",
                index % 2 === 0 ? "bg-card" : "bg-muted/20",
                returnMode && "dark:border-return-border/40 border-rose-800/50",
                isLastScanned && "ring-2 ring-[#43B02A] ring-inset",
                isReturn && "text-rose-600"
              )}
            >
              <div className="flex items-center text-muted-foreground">
                {index + 1}
              </div>
              <div className="flex flex-col justify-center">
                <div className="font-medium">{item.name}</div>
                <div className="text-xs text-muted-foreground">{item.barcode}</div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="icon"
                  variant="outline"
                  className="size-8 rounded-md"
                  onClick={() =>
                    onUpdateQuantity(
                      item.id,
                      item.quantity - (item.quantity > 0 ? 1 : -1)
                    )
                  }
                >
                  <Minus className="size-3" />
                </Button>
                <Input
                  type="number"
                  value={item.quantity}
                  onChange={(e) =>
                    onUpdateQuantity(item.id, parseInt(e.target.value, 10) || 0)
                  }
                  className="w-14 h-8 text-center font-mono"
                  min={-999}
                />
                <Button
                  size="icon"
                  variant="outline"
                  className="size-8 rounded-md"
                  onClick={() =>
                    onUpdateQuantity(
                      item.id,
                      item.quantity + (item.quantity >= 0 ? 1 : -1)
                    )
                  }
                >
                  <Plus className="size-3" />
                </Button>
              </div>
              <div className="flex items-center justify-end font-mono gap-1 group/price">
                <span className="flex-1 text-right">{formatKsh(unitPrice)}</span>
                {onUpdatePrice && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6 opacity-0 group-hover/price:opacity-100 transition-opacity"
                    onClick={() => {
                      const newPrice = prompt("Enter new price:", unitPrice.toString());
                      if (newPrice !== null) {
                        const parsed = parseFloat(newPrice);
                        if (!isNaN(parsed) && parsed >= 0) {
                          onUpdatePrice(item.id, parsed);
                        }
                      }
                    }}
                  >
                    <Plus className="size-3 text-primary rotate-45" />
                  </Button>
                )}
              </div>
              <div className="flex items-center justify-end font-mono font-medium">
                {formatKsh(lineTotal)}
              </div>
              <div className="flex items-center">
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8 rounded-md hover:bg-[#E11D48]/10 hover:text-[#E11D48] text-muted-foreground"
                  onClick={() => onRemoveItem(item.id)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
