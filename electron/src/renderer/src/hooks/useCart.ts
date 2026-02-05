/**
 * Cart state with VAT-inclusive pricing (Kenyan retail).
 * Price in DB = Gross (VAT-inclusive).
 * Total = Item_Price * Quantity (per line).
 * Net = Total / 1.16, Tax = Total - Net.
 */
import { create } from "zustand";
import { grossToNet, grossToTax } from "@/lib/vat";

export interface CartItem {
  id: string;
  productId: number;
  name: string;
  barcode: string;
  /** Retail price per unit (VAT-inclusive / gross). */
  priceGross: number;
  /** Wholesale price per unit (VAT-inclusive); used when quantity >= wholesaleThreshold. */
  priceWholesale?: number | null;
  /** Min quantity to use wholesale price. */
  wholesaleThreshold?: number | null;
  quantity: number;
}

/** Effective gross price per unit for a line (wholesale if qty >= threshold). */
export function getLinePriceGross(item: CartItem): number {
  const qty = Math.abs(item.quantity);
  if (
    item.wholesaleThreshold != null &&
    item.priceWholesale != null &&
    qty >= item.wholesaleThreshold
  ) {
    return item.priceWholesale;
  }
  return item.priceGross;
}

interface CartState {
  items: CartItem[];
  /** Next scan adds with this quantity (set by *N). */
  nextQuantityOverride: number | null;
  /** Return mode: add items with negative qty. */
  returnMode: boolean;
  setReturnMode: (v: boolean) => void;
  setNextQuantityOverride: (n: number | null) => void;
  addItem: (item: Omit<CartItem, "quantity">, qty?: number) => void;
  updateQuantity: (id: string, qty: number) => void;
  updatePrice: (id: string, price: number) => void;
  removeItem: (id: string) => void;
  clearCart: () => void;
  /** Replace entire cart (e.g. restore held order). */
  replaceCart: (items: CartItem[]) => void;
  /** Totals (VAT-inclusive). */
  subtotalGross: number;
  totalNet: number;
  totalTax: number;
  totalGross: number;
}

export const useCart = create<CartState>((set, get) => ({
  items: [],
  nextQuantityOverride: null,
  returnMode: false,

  setReturnMode: (v) => set({ returnMode: v }),
  setNextQuantityOverride: (n) => set({ nextQuantityOverride: n }),

  addItem: (item, qty) => {
    const { items, returnMode, nextQuantityOverride } = get();
    const rawQty = qty ?? nextQuantityOverride ?? 1;
    const sign = returnMode ? -1 : 1;
    const quantity = sign * rawQty;
    set({ nextQuantityOverride: null });

    const existing = items.find((i) => i.productId === item.productId);
    if (existing) {
      set({
        items: items.map((i) =>
          i.productId === item.productId
            ? { ...i, quantity: i.quantity + quantity }
            : i
        ),
      });
    } else {
      set({
        items: [
          ...items,
          {
            ...item,
            quantity,
          },
        ],
      });
    }
  },

  updateQuantity: (id, qty) => {
    set({
      items: get().items.map((i) =>
        i.id === id ? { ...i, quantity: qty } : i
      ),
    });
  },

  updatePrice: (id, price) => {
    set({
      items: get().items.map((i) =>
        i.id === id ? { ...i, priceGross: price, priceWholesale: null, wholesaleThreshold: null } : i
      ),
    });
  },

  removeItem: (id) => {
    set({ items: get().items.filter((i) => i.id !== id) });
  },

  clearCart: () => set({ items: [] }),

  replaceCart: (items) => set({ items }),

  subtotalGross: 0,
  totalNet: 0,
  totalTax: 0,
  totalGross: 0,
}));

/** Selectors for totals (derived from items). VAT-inclusive: Total = price * qty, Net = Total/1.16, Tax = Total - Net. */
export function useCartTotals() {
  const items = useCart((s) => s.items);
  const lineTotalsGross = items.map((i) => getLinePriceGross(i) * i.quantity);
  const totalGross = lineTotalsGross.reduce((s, t) => s + t, 0);
  const totalNet = lineTotalsGross.reduce((s, t) => s + grossToNet(Math.abs(t)), 0);
  const totalTax = lineTotalsGross.reduce((s, t) => s + grossToTax(Math.abs(t)), 0);
  const subtotalGross = totalGross;
  return { subtotalGross, totalNet, totalTax, totalGross };
}
