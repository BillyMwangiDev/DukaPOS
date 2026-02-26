import { useState, useEffect, useRef, useCallback } from "react";
import { LogOut, LayoutDashboard, ShoppingCart, Package, LogIn } from "lucide-react";
import { useCart, useCartTotals, getLinePriceGross } from "@/hooks/useCart";
import { apiUrl, getEtimsEnabled } from "@/lib/api";
import { formatKsh } from "@/lib/format";
import { playBeep, playSaleBeep } from "@/lib/sound";
import { Toaster, toast } from "sonner";

import { Button } from "@/components/ui/button";


import { PinPadModal } from "@/components/PinPadModal";
import { ZeroScrollDashboard } from "@/components/ZeroScrollDashboard";
import { Header } from "@/components/Header";
import { ProductGrid } from "@/components/ProductGrid";
import { PaymentModal } from "@/components/PaymentModal";
import { OpenShiftModal } from "@/components/OpenShiftModal";
import { AdminDashboard } from "@/components/admin/AdminDashboard";
import { LoginScreen, getStoredUser, setStoredUser, type LoggedInUser } from "@/components/LoginScreen";
import { CloseShiftModal } from "@/components/CloseShiftModal";
import { HeldOrdersDialog } from "@/components/HeldOrdersDialog";
import { ShiftLockScreen } from "@/components/ShiftLockScreen";
import { useIdleTimeout } from "@/hooks/useIdleTimeout";
import { useWebSocket, EventType, type InventoryUpdateEvent } from "@/hooks/useWebSocket";

type View = "checkout" | "inventory" | "admin";

interface Product {
  id: number;
  name: string;
  barcode: string;
  price_selling: number;
  price_buying: number;
  stock_quantity: number;
  min_stock_alert: number;
  wholesale_price?: number | null;
  wholesale_threshold?: number | null;
  item_discount_type?: "percent" | "fixed" | null;
  item_discount_value?: number | null;
  item_discount_expiry?: string | null;
}

export default function App() {
  const [currentUser, setCurrentUser] = useState<LoggedInUser | null>(() => getStoredUser());
  const [currentView, setCurrentView] = useState<View>("checkout");
  const [darkMode, setDarkMode] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "mpesa" | "credit">("cash");
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const [lastScannedId, setLastScannedId] = useState<string | null>(null);
  const [currentShift, setCurrentShift] = useState<{ id: number; opened_at: string; opening_float: number; cashier_id: number } | null>(null);
  const [isOpenShiftModalOpen, setIsOpenShiftModalOpen] = useState(false);
  const [isCloseShiftModalOpen, setIsCloseShiftModalOpen] = useState(false);
  const [isAdminPinModalOpen, setIsAdminPinModalOpen] = useState(false);
  const [pendingAdminAction, setPendingAdminAction] = useState<"close_shift" | "out_of_stock_add" | "price_override" | null>(null);
  const [pendingOutOfStockProduct, setPendingOutOfStockProduct] = useState<Product | null>(null);
  const [pendingPriceOverride, setPendingPriceOverride] = useState<{ id: string; price: number } | null>(null);
  const [isHeldOrdersOpen, setIsHeldOrdersOpen] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [storeSettings, setStoreSettings] = useState<{
    shop_name: string;
    station_id: string;
    kra_pin: string;
    contact_phone: string;
    mpesa_till_number: string;
    auto_print_receipt: boolean;
    low_stock_warning_enabled: boolean;
    sound_enabled: boolean;
  }>({
    shop_name: "DukaPOS",
    station_id: "POS-01",
    kra_pin: "",
    contact_phone: "",
    mpesa_till_number: "",
    auto_print_receipt: true,
    low_stock_warning_enabled: true,
    sound_enabled: true
  });
  const searchInputRef = useRef<HTMLInputElement>(null);
  const lastScannedBarcodeRef = useRef<string | null>(null);
  const lastScannedAtRef = useRef<number>(0);
  const SCAN_DEBOUNCE_MS = 500;

  const {
    items,
    returnMode,
    setReturnMode,
    setNextQuantityOverride,
    addItem,
    updateQuantity,
    removeItem,
    clearCart,
    replaceCart,
    updatePrice,
  } = useCart();
  const { subtotalGross, totalNet, totalTax, totalGross } = useCartTotals();

  // WebSocket: real-time backend events (M-Pesa, inventory, etc.)
  const [productRefetchKey, setProductRefetchKey] = useState(0);
  const { isConnected: isWsConnected, subscribe } = useWebSocket({
    autoConnect: !!currentUser,
  });

  // Multi-PC sync: refresh product grid when another terminal updates stock
  useEffect(() => {
    const unsub = subscribe(EventType.INVENTORY_UPDATED, (event) => {
      const d = event.data as InventoryUpdateEvent;
      toast.info(`Stock updated: ${d.product_name} → ${d.new_quantity} units`, { duration: 3000 });
      setProductRefetchKey((k) => k + 1);
    });
    return unsub;
  }, [subscribe]);

  // Idle lock: auto-lock terminal after 5 minutes of inactivity
  const { pause: pauseIdle, resume: resumeIdle } = useIdleTimeout({
    enabled: !!currentUser && !isLocked,
    onIdle: () => setIsLocked(true),
    onWarning: () => toast.warning("Session locking in 30 seconds due to inactivity"),
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
  }, [darkMode]);

  // Phase 4: Online/offline from window events; "Connection Lost" toast when going offline
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => {
      setIsOnline(false);
      toast.error("Connection Lost", {
        description: "You are offline. Some features may be unavailable.",
      });
    };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Auto-focus search on load and when switching to checkout (barcode scanner readiness)
  useEffect(() => {
    if (currentView !== "checkout") return;
    const t = setTimeout(() => searchInputRef.current?.focus(), 100);
    return () => clearTimeout(t);
  }, [currentView]);

  const cashierId = currentUser?.id ?? 1;

  const fetchCurrentShift = useCallback(async () => {
    if (!currentUser) return;
    try {
      const res = await fetch(apiUrl(`shifts/current?cashier_id=${currentUser.id}`));
      if (!res.ok) return;
      const data = (await res.json()) as { shift: { id: number; opened_at: string; opening_float: number; cashier_id: number } | null };
      setCurrentShift(data.shift ?? null);
    } catch {
      setCurrentShift(null);
    }
  }, [currentUser]);

  useEffect(() => {
    fetchCurrentShift();
  }, [fetchCurrentShift]);

  const fetchStoreSettings = useCallback(async () => {
    try {
      const res = await fetch(apiUrl("settings/store"));
      if (!res.ok) return;
      const data = await res.json();
      if (data && typeof data === "object") {
        setStoreSettings({
          shop_name: typeof data.shop_name === "string" ? data.shop_name : "DukaPOS",
          station_id: typeof data.station_id === "string" ? data.station_id : "POS-01",
          kra_pin: typeof data.kra_pin === "string" ? data.kra_pin : "",
          contact_phone: typeof data.contact_phone === "string" ? data.contact_phone : "",
          mpesa_till_number: typeof data.mpesa_till_number === "string" ? data.mpesa_till_number : "",
          auto_print_receipt: data.auto_print_receipt !== false,
          low_stock_warning_enabled: data.low_stock_warning_enabled !== false,
          sound_enabled: data.sound_enabled !== false,
        });
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    fetchStoreSettings();
  }, [fetchStoreSettings]);

  useEffect(() => {
    if (isPaymentModalOpen) fetchStoreSettings();
  }, [isPaymentModalOpen, fetchStoreSettings]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "F2") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      if (e.key === "F3") {
        e.preventDefault();
        setReturnMode(!returnMode);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [returnMode, setReturnMode]);

  const handleSearch = useCallback(
    async (query: string) => {
      if (!query.trim()) return;
      const trimmed = query.trim();
      const multMatch = trimmed.match(/^\*(\d+)$/);
      if (multMatch) {
        const n = parseInt(multMatch[1], 10);
        if (n >= 1 && n <= 999) {
          setNextQuantityOverride(n);
          toast.info(`Next scan will add ${n} units`);
        }
        return;
      }
      try {
        const res = await fetch(apiUrl(`products/barcode/${encodeURIComponent(trimmed)}`));
        if (!res.ok) {
          const listRes = await fetch(apiUrl(`products?q=${encodeURIComponent(trimmed)}`));
          if (!listRes.ok) throw new Error("Product not found");
          const list: Product[] = await listRes.json();
          const product = list[0];
          if (!product) throw new Error("Product not found");
          addProductToCart(product);
          searchInputRef.current && (searchInputRef.current.value = "");
          return;
        }
        const product: Product = await res.json();
        addProductToCart(product);
        searchInputRef.current && (searchInputRef.current.value = "");
      } catch (_) {
        toast.error("Product not found", { description: "Check barcode or try searching by name" });
      }
    },
    [addItem, setNextQuantityOverride]
  );

  const handleBarcodeSearch = useCallback(
    async (barcode: string) => {
      if (!barcode.trim()) return;
      try {
        const res = await fetch(apiUrl(`products/barcode/${encodeURIComponent(barcode.trim())}`));
        if (!res.ok) throw new Error("Product not found");
        const product: Product = await res.json();
        addProductToCart(product);
      } catch (_) {
        toast.error("Barcode not found", { description: "Try searching by name or check the barcode" });
      }
    },
    [addItem]
  );

  function addProductToCart(product: Product) {
    const now = Date.now();
    if (
      lastScannedBarcodeRef.current === product.barcode &&
      now - lastScannedAtRef.current < SCAN_DEBOUNCE_MS
    ) {
      toast.info("Duplicate scan ignored", { description: "500 ms debounce for bouncy scanner" });
      return;
    }
    lastScannedBarcodeRef.current = product.barcode;
    lastScannedAtRef.current = now;

    if (product.stock_quantity < 1) {
      setPendingOutOfStockProduct(product);
      setPendingAdminAction("out_of_stock_add");
      setIsAdminPinModalOpen(true);
      toast.info("Product out of stock", {
        description: "Enter admin PIN to add anyway (override).",
      });
      return;
    }
    addItem({
      id: `p-${product.id}`,
      productId: product.id,
      name: product.name,
      barcode: product.barcode,
      priceGross: product.price_selling,
      priceWholesale: product.wholesale_price ?? undefined,
      wholesaleThreshold: product.wholesale_threshold ?? undefined,
      itemDiscountType: product.item_discount_type ?? null,
      itemDiscountValue: product.item_discount_value ?? null,
      itemDiscountExpiry: product.item_discount_expiry ?? null,
    });
    setLastScannedId(`p-${product.id}`);
    setTimeout(() => setLastScannedId(null), 2000);
    toast.success("Item added to cart", { description: product.name });
    if (storeSettings.sound_enabled) playBeep();
    if (storeSettings.low_stock_warning_enabled && product.stock_quantity <= (product.min_stock_alert ?? 5)) {
      toast.warning("Low stock", {
        description: `${product.name}: only ${product.stock_quantity} left (alert at ${product.min_stock_alert ?? 5})`,
      });
    }
  }

  function commitOutOfStockAdd(product: Product) {
    addItem({
      id: `p-${product.id}`,
      productId: product.id,
      name: product.name,
      barcode: product.barcode,
      priceGross: product.price_selling,
      priceWholesale: product.wholesale_price ?? undefined,
      wholesaleThreshold: product.wholesale_threshold ?? undefined,
      itemDiscountType: product.item_discount_type ?? null,
      itemDiscountValue: product.item_discount_value ?? null,
      itemDiscountExpiry: product.item_discount_expiry ?? null,
    });
    setLastScannedId(`p-${product.id}`);
    setTimeout(() => setLastScannedId(null), 2000);
    if (storeSettings.sound_enabled) playBeep();
    toast.success("Item added (admin override)", { description: product.name });
  }

  const requireShiftForPayment = () => {
    if (!currentShift) {
      toast.error("Open a shift first", {
        description: "Open Shift from the top bar before accepting payments.",
      });
      return false;
    }
    return true;
  };

  const validateSale = () => {
    if (items.length === 0) {
      toast.error("Cart is empty", { description: "Add items before payment." });
      return false;
    }
    if (totalGross <= 0 && !returnMode) {
      toast.error("Invalid total", { description: "Total amount must be greater than zero." });
      return false;
    }
    return true;
  };

  const handleCashPayment = () => {
    if (!requireShiftForPayment()) return;
    if (!validateSale()) return;
    setPaymentMethod("cash");
    pauseIdle();
    setIsPaymentModalOpen(true);
  };
  const handleMpesaPayment = () => {
    if (!requireShiftForPayment()) return;
    if (!validateSale()) return;
    setPaymentMethod("mpesa");
    pauseIdle();
    setIsPaymentModalOpen(true);
  };
  const handleCreditPayment = () => {
    if (!requireShiftForPayment()) return;
    if (!validateSale()) return;
    setPaymentMethod("credit");
    pauseIdle();
    setIsPaymentModalOpen(true);
  };

  const handleHoldOrder = useCallback(async () => {
    if (items.length === 0) return;
    if (!currentUser) {
      toast.error("Not logged in", { description: "Log in to hold orders." });
      return;
    }
    try {
      const payload = {
        cashier_id: currentUser.id,
        items: items.map((i) => ({
          productId: i.productId,
          name: i.name,
          barcode: i.barcode,
          quantity: i.quantity,
          priceGross: getLinePriceGross(i),
          priceWholesale: i.priceWholesale ?? null,
          wholesaleThreshold: i.wholesaleThreshold ?? null,
        })),
        total_gross: totalGross,
      };
      const res = await fetch(apiUrl("orders/hold"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error("Hold failed", {
          description: (err as { detail?: string }).detail ?? res.statusText,
        });
        return;
      }
      clearCart();
      toast.success("Order held", { description: "Order saved for later. Open Held orders to restore." });
    } catch (e) {
      toast.error("Hold failed", { description: String(e) });
    }
  }, [items, totalGross, currentUser, clearCart]);

  const handleStkSent = useCallback(
    async (checkoutRequestId: string) => {
      try {
        const txRes = await fetch(apiUrl("transactions"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            staff_id: currentUser?.id ?? 1,
            shift_id: currentShift?.id ?? null,
            payment_type: "MOBILE",
            payment_subtype: "M-Pesa",
            checkout_request_id: checkoutRequestId,
            payment_status: "PENDING",
            origin_station: storeSettings.station_id || "POS-01",
            use_local_invoice: !getEtimsEnabled(),
            items: items.map((i) => ({
              product_id: i.productId,
              quantity: i.quantity,
              price_at_moment: getLinePriceGross(i),
            })),
            total_amount: totalGross,
            is_return: returnMode,
          }),
        });
        if (!txRes.ok) {
          toast.error("Transaction not saved", { description: "Please retry or contact support." });
        }
      } catch (e) {
        toast.error("Transaction failed", { description: String(e) });
      }
    },
    [items, totalGross, returnMode, currentShift?.id, currentUser?.id, storeSettings.station_id]
  );

  const handleMpesaVerifySuccess = useCallback(() => {
    try {
      fetch(apiUrl("print/receipt"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shop_name: storeSettings.shop_name || "DukaPOS",
          kra_pin: storeSettings.kra_pin,
          contact_phone: storeSettings.contact_phone,
          items: items.map((i) => ({
            name: i.name,
            quantity: i.quantity,
            price: getLinePriceGross(i),
          })),
          total_gross: totalGross,
          payment_method: "MPESA",
        }),
      }).catch(() => toast.warning("Receipt print failed"));
    } catch (_) { }
    if (storeSettings.sound_enabled) playSaleBeep();
    toast.success("Sale completed!", { description: "Payment received via M-PESA" });
    clearCart();
    setIsPaymentModalOpen(false);
  }, [items, totalGross, clearCart, storeSettings.sound_enabled]);

  const handleVerifyStatus = useCallback(
    async (checkoutId: string): Promise<boolean> => {
      try {
        const res = await fetch(apiUrl(`payments/verify/${encodeURIComponent(checkoutId)}`));
        const data = (await res.json().catch(() => ({}))) as {
          success?: boolean;
          result_desc?: string;
          mpesa_receipt_number?: string;
        };
        if (res.ok && data.success) {
          handleMpesaVerifySuccess();
          return true;
        }
        toast.info(
          data.result_desc || "Payment pending or failed. Try again after customer enters PIN."
        );
        return false;
      } catch (e) {
        toast.error("Check Status failed", { description: String(e) });
        return false;
      }
    },
    [handleMpesaVerifySuccess]
  );

  const handleCompleteSale = async (
    method: string,
    details?: Record<string, unknown>
  ) => {
    // Standardize logic: details.payments contains the list if multi-tender
    const paymentList = (details?.payments as any[]) || [];

    // Pick primary payment type
    let primaryType = "CASH";
    let primarySubtype: string | undefined = undefined;
    let referenceCode: string | undefined = undefined;
    let bankName: string | undefined = undefined;
    let bankSender: string | undefined = undefined;
    let bankConfirmed = false;

    if (paymentList.length > 1) {
      primaryType = "SPLIT";
    } else if (paymentList.length === 1) {
      primaryType = paymentList[0].method;
      primarySubtype = paymentList[0].details?.subtype;
      referenceCode = paymentList[0].details?.code;
      bankName = paymentList[0].details?.bank_name;
      bankSender = paymentList[0].details?.sender;
      bankConfirmed = paymentList[0].details?.confirmed || false;
    } else {

      // Fallback for legacy calls if any
      primaryType = method === "mpesa" ? "MOBILE" : method.toUpperCase();
    }

    let customerId = details?.customer_id as number | undefined;
    if (!customerId && paymentList.length > 0) {
      const creditPay = paymentList.find((p: any) => p.method === "CREDIT");
      if (creditPay) customerId = creditPay.details?.customer_id;
    }

    try {
      const txRes = await fetch(apiUrl("transactions"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          staff_id: currentUser?.id ?? 1,
          shift_id: currentShift?.id ?? null,
          customer_id: customerId ?? null,
          payment_type: primaryType,
          payment_subtype: primarySubtype ?? null,
          reference_code: referenceCode ?? null,
          payment_details_json: paymentList.length > 1 ? JSON.stringify(paymentList) : null,
          origin_station: storeSettings.station_id || "POS-01",
          use_local_invoice: !getEtimsEnabled(),
          bank_name: bankName ?? null,
          bank_sender_name: bankSender ?? null,
          bank_confirmed: bankConfirmed,
          bank_confirmation_timestamp: bankConfirmed ? new Date().toISOString() : null,
          items: items.map((i) => ({
            product_id: i.productId,
            quantity: i.quantity,
            price_at_moment: getLinePriceGross(i),
          })),
          total_amount: Math.max(0, totalGross - discountAmount),
          discount_amount: discountAmount,
          is_return: returnMode,
        }),
      });
      if (!txRes.ok) {
        const errText = await txRes.text();
        let detail = errText || txRes.statusText;
        try {
          const j = JSON.parse(errText) as { detail?: string };
          if (typeof j?.detail === "string") detail = j.detail;
        } catch {
          /* use errText as detail */
        }
        toast.error("Transaction not saved", { description: detail });
        return;
      }
    } catch (e) {
      toast.error("Transaction failed", { description: String(e) });
      return;
    }

    if (storeSettings.auto_print_receipt !== false) {
      try {
        await fetch(apiUrl("print/receipt"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            shop_name: storeSettings.shop_name || "DukaPOS",
            station_id: storeSettings.station_id || "POS-01",
            kra_pin: storeSettings.kra_pin,
            contact_phone: storeSettings.contact_phone,
            items: items.map((i) => ({
              name: i.name,
              quantity: i.quantity,
              price: getLinePriceGross(i),
            })),
            total_gross: totalGross,
            payment_method: primaryType,
            payment_subtype: primarySubtype,
            payments: paymentList, // Send full list to printer
          }),
        });

        // Kick drawer automatically for cash payments (or if split contains cash)
        const hasCash = paymentList.some(p => p.method === "CASH") || primaryType === "CASH";
        if (hasCash) {
          fetch(apiUrl("hardware/kick-drawer"), { method: "POST" }).catch(() => { });
        }
      } catch (_) {
        toast.warning("Receipt print failed", { description: "Sale was saved." });
      }
    }
    toast.success("Sale completed!", {
      description: `Receipt generated successfully`,
    });
    if (storeSettings.sound_enabled) playSaleBeep();
    clearCart();
    setDiscountAmount(0);
    setIsPaymentModalOpen(false);
  };

  const handleLogout = () => {
    setStoredUser(null);
    setCurrentUser(null);
    setCurrentShift(null);
  };

  if (!currentUser) {
    return (
      <>
        <LoginScreen onLogin={(user) => { setCurrentUser(user); setIsLocked(false); }} />
        <Toaster position="bottom-right" richColors />
      </>
    );
  }

  if (isLocked) {
    return (
      <>
        <ShiftLockScreen
          user={currentUser}
          onUnlock={() => { setIsLocked(false); resumeIdle(); }}
          onLogout={() => { setIsLocked(false); handleLogout(); }}
        />
        <Toaster position="bottom-right" richColors />
      </>
    );
  }

  return (
    <div className="pos-wrapper">
      <div className="pos-header">
        <Header
          onSearch={handleSearch}
          onBarcodeSearch={handleBarcodeSearch}
          isOnline={isOnline}
          isPrinterConnected={true}
          wsConnected={isWsConnected}
          darkMode={darkMode}
          onToggleDarkMode={() => setDarkMode(!darkMode)}
          returnMode={returnMode}
          searchInputRef={searchInputRef}
          shopName={storeSettings.shop_name}
          stationId={storeSettings.station_id}
          currentUser={currentUser}
          onLogout={handleLogout}
        />
      </div>

      <div className="flex items-center justify-between gap-2 border-b bg-card px-6 py-2 flex-shrink-0">
        <div className="flex items-center gap-0">
          <Button
            variant={currentView === "checkout" ? "default" : "ghost"}
            size="sm"
            className="rounded-none border-b-2 border-transparent data-[active=true]:border-[#43B02A]"
            data-active={currentView === "checkout"}
            onClick={() => setCurrentView("checkout")}
          >
            <ShoppingCart className="mr-2 size-4" />
            Point of Sale
          </Button>
          <Button
            variant={currentView === "inventory" ? "default" : "ghost"}
            size="sm"
            className="rounded-none border-b-2 border-transparent data-[active=true]:border-[#43B02A]"
            data-active={currentView === "inventory"}
            onClick={() => setCurrentView("inventory")}
          >
            <Package className="mr-2 size-4" />
            Inventory
          </Button>
          <Button
            variant={currentView === "admin" ? "default" : "ghost"}
            size="sm"
            className="rounded-none border-b-2 border-transparent data-[active=true]:border-[#43B02A]"
            data-active={currentView === "admin"}
            onClick={() => setCurrentView("admin")}
          >
            <LayoutDashboard className="mr-2 size-4" />
            Admin
          </Button>
        </div>
        <div className="flex items-center gap-2 text-sm">
          {currentShift ? (
            <>
              <span className="text-muted-foreground">
                Shift #{currentShift.id} · Float {formatKsh(currentShift.opening_float)}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setPendingAdminAction("close_shift");
                  setIsAdminPinModalOpen(true);
                }}
              >
                <LogOut className="mr-1 h-4 w-4" />
                Close Shift
              </Button>
            </>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => requestAnimationFrame(() => setIsOpenShiftModalOpen(true))}
            >
              <LogIn className="mr-1 h-4 w-4" />
              Open Shift
            </Button>
          )}
        </div>
      </div>
      <OpenShiftModal
        open={isOpenShiftModalOpen}
        onClose={() => setIsOpenShiftModalOpen(false)}
        onOpened={(shift) => {
          setCurrentShift(shift);
          setIsOpenShiftModalOpen(false);
        }}
        cashierId={cashierId}
      />
      <PinPadModal
        open={isAdminPinModalOpen}
        onOpenChange={(open) => {
          if (!open) {
            setPendingAdminAction(null);
            setPendingOutOfStockProduct(null);
            setPendingPriceOverride(null);
          }
          setIsAdminPinModalOpen(open);
        }}
        title={
          pendingAdminAction === "out_of_stock_add"
            ? "Out of stock – Admin override"
            : pendingAdminAction === "price_override"
              ? "Price Override – Admin PIN"
              : "Admin PIN required"
        }
        description={
          pendingAdminAction === "out_of_stock_add"
            ? "Enter admin PIN to add this item to the cart anyway."
            : pendingAdminAction === "price_override"
              ? "Enter admin PIN to authorize this price change."
              : "Enter admin PIN to close shift or generate Z-Report."
        }
        onConfirm={async (pin) => {
          try {
            const res = await fetch(apiUrl("users/verify-admin-pin"), {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ pin }),
            });
            if (!res.ok) {
              const err = await res.json().catch(() => ({}));
              toast.error((err as { detail?: string }).detail ?? "Invalid admin PIN");
              setPendingAdminAction(null);
              setPendingOutOfStockProduct(null);
              return;
            }
            if (pendingAdminAction === "close_shift") {
              setIsCloseShiftModalOpen(true);
              setPendingAdminAction(null);
              setIsAdminPinModalOpen(false);
            } else if (pendingAdminAction === "out_of_stock_add" && pendingOutOfStockProduct) {
              commitOutOfStockAdd(pendingOutOfStockProduct);
              setPendingOutOfStockProduct(null);
              setPendingAdminAction(null);
              setIsAdminPinModalOpen(false);
            } else if (pendingAdminAction === "price_override" && pendingPriceOverride) {
              updatePrice(pendingPriceOverride.id, pendingPriceOverride.price);
              // Log price override for audit trail (fire-and-forget)
              const productIdNum = pendingPriceOverride.id.startsWith("p-")
                ? parseInt(pendingPriceOverride.id.slice(2), 10)
                : null;
              fetch(apiUrl("transactions/price-override-log"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  cashier_id: currentUser?.id,
                  product_id: productIdNum,
                  new_price: pendingPriceOverride.price,
                  timestamp: new Date().toISOString(),
                }),
              }).catch(() => { });
              setPendingPriceOverride(null);
              setPendingAdminAction(null);
              setIsAdminPinModalOpen(false);
              toast.success("Price overridden");
            }
          } catch {
            toast.error("Could not verify PIN");
            setPendingAdminAction(null);
            setPendingOutOfStockProduct(null);
            setPendingPriceOverride(null);
          }
        }}
        onCancel={() => {
          setPendingAdminAction(null);
          setPendingOutOfStockProduct(null);
          setPendingPriceOverride(null);
        }}
      />
      <CloseShiftModal
        open={isCloseShiftModalOpen}
        shiftId={currentShift?.id ?? 0}
        onClose={() => setIsCloseShiftModalOpen(false)}
        onClosed={() => setCurrentShift(null)}
      />
      <main className="pos-body">
        {currentView === "checkout" ? (
          <ZeroScrollDashboard
            items={items}
            subtotalGross={subtotalGross}
            totalNet={totalNet}
            totalTax={totalTax}
            totalGross={totalGross}
            lastScannedId={lastScannedId ?? undefined}
            vatRate={16}
            onUpdateQuantity={updateQuantity}
            onRemoveItem={removeItem}
            onUpdatePrice={(id, price) => {
              setPendingPriceOverride({ id, price });
              setPendingAdminAction("price_override");
              setIsAdminPinModalOpen(true);
            }}
            onClearCart={() => {
              if (confirm("Discard this sale? Items will be cleared.")) {
                clearCart();
                toast.info("Sale discarded");
              }
            }}
            onCashPayment={handleCashPayment}
            onMpesaPayment={handleMpesaPayment}
            onCreditPayment={handleCreditPayment}
            onHoldOrder={handleHoldOrder}
            onOpenHeldOrders={() => setIsHeldOrdersOpen(true)}
            returnMode={returnMode}
            onToggleReturnMode={() => setReturnMode(!returnMode)}
            discountAmount={discountAmount}
            onDiscountChange={(amt) => setDiscountAmount(amt)}
          />
        ) : currentView === "inventory" ? (
          <div className="flex flex-1 flex-col overflow-hidden animate-in">
            <div className="h-12 border-b bg-card/50 flex items-center justify-between px-6 shrink-0">
              <h3 className="text-xs font-black uppercase tracking-widest text-ocean-blue">
                Inventory Browser
              </h3>
              <Button variant="ghost" size="sm" onClick={() => {
                setCurrentView("admin");
                // We need a potentially cleaner way to switch sections, 
                // but AdminDashboard resets to 'dashboard' on mount unless we control it.
                // For now, let's just guide them to Admin.
                // Or better: Pass an initialSection prop or persistent state?
                // AdminDashboard keeps its own state `currentSection`.
                // The user will have to click "Inventory" in Admin.
              }}>
                Manage & Import
              </Button>

            </div>
            <div className="flex-1 p-6 overflow-hidden">
              <ProductGrid onSelectProduct={addProductToCart} refetchKey={productRefetchKey} />
            </div>
          </div>
        ) : (
          <div className="flex flex-1 overflow-hidden">
            <AdminDashboard
              userRole={currentUser?.role as "admin" | "cashier" | "developer" | undefined}
              isOnline={isOnline}
              shopName={storeSettings.shop_name || "DukaPOS"}
              onShopSettingsSaved={fetchStoreSettings}
              onGenerateZReport={() => {
                if (currentShift) {
                  setPendingAdminAction("close_shift");
                  setIsAdminPinModalOpen(true);
                } else {
                  toast.error("Open a shift first", { description: "Open Shift from the top bar before generating Z-Report." });
                }
              }}
              onManualBackup={async () => {
                try {
                  const res = await fetch(apiUrl("system/backup"), { method: "POST" });
                  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; path?: string; error?: string };
                  if (data.ok) toast.success("Backup created", { description: data.path ?? "Saved to backups folder." });
                  else toast.error("Backup failed", { description: data.error ?? "Unknown error" });
                } catch (e) {
                  toast.error("Backup failed", { description: String(e) });
                }
              }}
              darkMode={darkMode}
              onToggleDarkMode={() => setDarkMode((d) => !d)}
            />
          </div>
        )}
      </main>

      <HeldOrdersDialog
        open={isHeldOrdersOpen}
        onOpenChange={setIsHeldOrdersOpen}
        cashierId={cashierId}
        onRestore={(restoredItems) => {
          replaceCart(restoredItems);
          toast.success("Order restored", { description: "Cart loaded from held order." });
        }}
      />

      <PaymentModal
        open={isPaymentModalOpen}
        onClose={() => { setIsPaymentModalOpen(false); resumeIdle(); }}
        totalGross={totalGross}
        onCompleteSale={handleCompleteSale}
        defaultTab={paymentMethod}
        onStkSent={handleStkSent}
        onVerifyStatus={handleVerifyStatus}
        initialCashTendered={undefined}
        mpesaTillNumber={storeSettings.mpesa_till_number}
      />

      <Toaster position="bottom-right" richColors />
    </div>
  );
}


