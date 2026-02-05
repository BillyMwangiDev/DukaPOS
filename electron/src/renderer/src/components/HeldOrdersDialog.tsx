import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatKsh } from "@/lib/format";
import { apiUrl } from "@/lib/api";
import type { CartItem } from "@/hooks/useCart";

interface HeldOrderSummary {
  id: number;
  cashier_id: number;
  total_gross: number;
  created_at: string;
}

interface HeldOrdersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cashierId: number;
  onRestore: (items: CartItem[]) => void;
}

function parseHeldItemToCartItem(raw: Record<string, unknown>): CartItem | null {
  const productId = typeof raw.productId === "number" ? raw.productId : Number(raw.productId);
  if (!Number.isFinite(productId)) return null;
  const name = typeof raw.name === "string" ? raw.name : String(raw.name ?? "");
  const barcode = typeof raw.barcode === "string" ? raw.barcode : String(raw.barcode ?? "");
  const quantity = typeof raw.quantity === "number" ? raw.quantity : Number(raw.quantity) || 1;
  const priceGross = typeof raw.priceGross === "number" ? raw.priceGross : Number(raw.priceGross) || 0;
  const priceWholesale =
    raw.priceWholesale != null && typeof raw.priceWholesale === "number"
      ? raw.priceWholesale
      : undefined;
  const wholesaleThreshold =
    raw.wholesaleThreshold != null && typeof raw.wholesaleThreshold === "number"
      ? raw.wholesaleThreshold
      : undefined;
  return {
    id: `p-${productId}`,
    productId,
    name,
    barcode,
    priceGross,
    priceWholesale: priceWholesale ?? undefined,
    wholesaleThreshold: wholesaleThreshold ?? undefined,
    quantity,
  };
}

export function HeldOrdersDialog({
  open,
  onOpenChange,
  cashierId,
  onRestore,
}: HeldOrdersDialogProps) {
  const [list, setList] = useState<HeldOrderSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionId, setActionId] = useState<number | null>(null);

  const fetchList = async () => {
    try {
      const res = await fetch(apiUrl(`orders/held?cashier_id=${cashierId}`));
      if (!res.ok) return;
      const data = (await res.json()) as HeldOrderSummary[];
      setList(Array.isArray(data) ? data : []);
    } catch {
      setList([]);
    }
  };

  useEffect(() => {
    if (open && cashierId) {
      setLoading(true);
      fetchList().finally(() => setLoading(false));
    }
  }, [open, cashierId]);

  const handleRestore = async (orderId: number) => {
    setActionId(orderId);
    try {
      const res = await fetch(apiUrl(`orders/held/${orderId}?cashier_id=${cashierId}`));
      if (!res.ok) throw new Error("Failed to load order");
      const data = (await res.json()) as { items: Record<string, unknown>[] };
      const items: CartItem[] = [];
      for (const raw of data.items ?? []) {
        const item = parseHeldItemToCartItem(raw as Record<string, unknown>);
        if (item) items.push(item);
      }
      await fetch(apiUrl(`orders/held/${orderId}?cashier_id=${cashierId}`), { method: "DELETE" });
      onRestore(items);
      onOpenChange(false);
    } catch {
      setActionId(null);
    } finally {
      setActionId(null);
    }
  };

  const handleDiscard = async (orderId: number) => {
    setActionId(orderId);
    try {
      await fetch(apiUrl(`orders/held/${orderId}?cashier_id=${cashierId}`), { method: "DELETE" });
      await fetchList();
    } finally {
      setActionId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Held orders</DialogTitle>
          <DialogDescription>
            Restore a saved order to the cart or discard it.
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <p className="text-sm text-muted-foreground py-4">Loading…</p>
        ) : list.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">No held orders.</p>
        ) : (
          <ScrollArea className="max-h-[320px] pr-2">
            <ul className="space-y-2">
              {list.map((h) => (
                <li
                  key={h.id}
                  className="flex items-center justify-between gap-2 rounded-md border border-border p-3 bg-muted/30"
                >
                  <div>
                    <span className="font-medium">Order #{h.id}</span>
                    <span className="text-muted-foreground text-sm ml-2">
                      {formatKsh(h.total_gross)} · {new Date(h.created_at).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="default"
                      disabled={actionId !== null}
                      onClick={() => handleRestore(h.id)}
                    >
                      Restore
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={actionId !== null}
                      onClick={() => handleDiscard(h.id)}
                    >
                      Discard
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
