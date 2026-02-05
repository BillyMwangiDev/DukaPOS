import { useState, useEffect, useCallback, useRef } from "react";
import { Loader2, Search, Smartphone, Store } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { apiUrl } from "@/lib/api";
import { formatKsh } from "@/lib/format";
import { toast } from "sonner";
import { useWebSocket, EventType } from "@/hooks/useWebSocket";

interface Customer {
  id: number;
  name: string | null;
  phone: string | null;
  current_balance: number;
  debt_limit: number;
}

interface PaymentModalProps {
  open: boolean;
  onClose: () => void;
  totalGross: number;
  onCompleteSale: (method: string, details?: Record<string, unknown>) => void;
  defaultTab?: "cash" | "mpesa" | "credit";
  /** When STK Push is sent successfully; parent should create pending transaction. */
  onStkSent?: (checkoutRequestId: string) => void;
  /** When user clicks "Check Status"; parent calls verify endpoint. Returns true if payment completed. */
  onVerifyStatus?: (checkoutRequestId: string) => Promise<boolean>;
  /** Pre-fill Amount Tendered from main numpad (cash tab). */
  initialCashTendered?: string;
  /** M-Pesa Buy Goods till number (from store settings). */
  mpesaTillNumber?: string;
  /** M-Pesa Paybill number (from store settings). */
  mpesaPaybillNumber?: string;
}

export function PaymentModal({
  open,
  onClose,
  totalGross,
  onCompleteSale,
  defaultTab = "cash",
  onStkSent,
  onVerifyStatus,
  initialCashTendered,
  mpesaTillNumber = "",
  mpesaPaybillNumber: _mpesaPaybillNumber = "",
}: PaymentModalProps) {
  const [activeTab, setActiveTab] = useState<"cash" | "mpesa" | "credit">(defaultTab);
  const [payments, setPayments] = useState<{ method: string; amount: number; details?: any }[]>([]);
  const [currentAmount, setCurrentAmount] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [mpesaMode, setMpesaMode] = useState<"stk" | "buygoods">("stk");
  const [isProcessing, setIsProcessing] = useState(false);
  const [checkoutRequestId, setCheckoutRequestId] = useState<string | null>(null);
  const [waitingForBuyGoods, setWaitingForBuyGoods] = useState(false);
  const [creditSearch, setCreditSearch] = useState("");
  const [creditCustomers, setCreditCustomers] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [_creditSearching, setCreditSearching] = useState(false);

  // WebSocket for real-time M-Pesa payment notifications
  const { subscribe, isConnected } = useWebSocket();

  const prevOpenRef = useRef(false);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /** 200ms debounce for Complete Sale buttons to prevent double-processing on resistive touchscreens */
  const lastCompleteTapRef = useRef(0);
  const COMPLETE_DEBOUNCE_MS = 200;
  const withCompleteDebounce = useCallback(
    (fn: () => void) => {
      const now = Date.now();
      if (now - lastCompleteTapRef.current < COMPLETE_DEBOUNCE_MS) return;
      lastCompleteTapRef.current = now;
      fn();
    },
    []
  );

  // Calculated balance
  const paidAmount = payments.reduce((acc, p) => acc + p.amount, 0);
  const remainingBalance = Math.max(0, totalGross - paidAmount);
  const isFullyPaid = remainingBalance <= 0.01;

  // Subscribe to M-Pesa payment events via WebSocket
  useEffect(() => {
    if (!open) return;

    // Listen for STK Push callback
    const unsubStk = subscribe(EventType.MPESA_STK_CALLBACK, (event) => {
      const data = event.data as { status: string; checkout_request_id?: string; mpesa_receipt?: string; amount?: number };
      if (data.status === "success" && checkoutRequestId && data.checkout_request_id === checkoutRequestId) {
        setPayments(prev => [...prev, {
          method: "mpesa",
          amount: data.amount || remainingBalance,
          details: { code: data.mpesa_receipt, source: "stk" }
        }]);
        setCheckoutRequestId(null);
        setIsProcessing(false);
        toast.success("M-Pesa payment received!", { description: `Receipt: ${data.mpesa_receipt}` });
      }
    });

    // Listen for C2B (Buy Goods) - Auto-confirm if amount matches remaining balance
    const unsubC2b = subscribe(EventType.MPESA_PAYMENT_RECEIVED, (event) => {
      const data = event.data as { trans_id: string; amount: number; phone?: string; customer_name?: string };
      // USER REQUEST: Match by amount automatically
      if (Math.abs(data.amount - remainingBalance) < 1 || (data.amount > 0 && data.amount <= totalGross)) {
        // Only auto-add if we haven't already added this code
        if (!payments.some(p => p.details?.code === data.trans_id)) {
          setPayments(prev => [...prev, {
            method: "mpesa",
            amount: data.amount,
            details: { code: data.trans_id, phone: data.phone, name: data.customer_name, source: "c2b" }
          }]);
          setWaitingForBuyGoods(false);
          toast.success("M-Pesa payment confirmed!", {
            description: `${data.customer_name || data.phone || "Customer"} paid ${formatKsh(data.amount)}. Code: ${data.trans_id}`,
          });
        }
      }
    });

    const unsubFail = subscribe(EventType.MPESA_PAYMENT_FAILED, (event) => {
      const data = event.data as { checkout_request_id?: string };
      if (checkoutRequestId && data.checkout_request_id === checkoutRequestId) {
        setIsProcessing(false);
        toast.error("M-Pesa payment failed");
      }
    });

    return () => { unsubStk(); unsubC2b(); unsubFail(); };
  }, [open, subscribe, checkoutRequestId, remainingBalance, totalGross, payments]);

  useEffect(() => {
    if (open) {
      setActiveTab(defaultTab);
      if (!prevOpenRef.current && defaultTab === "cash")
        setCurrentAmount(initialCashTendered ?? "");
      prevOpenRef.current = true;
    } else {
      prevOpenRef.current = false;
    }
  }, [open, defaultTab, initialCashTendered]);

  // Auto-poll STK Push status fallback
  useEffect(() => {
    if (!checkoutRequestId || mpesaMode !== "stk" || !onVerifyStatus) return;
    const POLL_MS = 5000;
    const poll = async () => {
      const completed = await onVerifyStatus(checkoutRequestId);
      if (completed) {
        // WebSocket will usually catch this first, but if not:
        toast.info("STK Query successful");
      }
    };
    pollIntervalRef.current = setInterval(poll, POLL_MS);
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    };
  }, [checkoutRequestId, mpesaMode, onVerifyStatus]);

  const searchCustomers = useCallback(async (q: string) => {
    if (!q.trim()) {
      setCreditCustomers([]);
      return;
    }
    setCreditSearching(true);
    try {
      const res = await fetch(apiUrl(`customers?q=${encodeURIComponent(q.trim())}`));
      if (!res.ok) throw new Error("Search failed");
      const list = (await res.json()) as Customer[];
      setCreditCustomers(list);
    } catch {
      setCreditCustomers([]);
    } finally {
      setCreditSearching(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => searchCustomers(creditSearch), 300);
    return () => clearTimeout(t);
  }, [creditSearch, searchCustomers]);


  const handleAddCashPayment = () => {
    const amount = parseFloat(currentAmount);
    if (isNaN(amount) || amount <= 0) return;
    // If cash > remaining, we count the excess as change
    const actualPayment = Math.min(amount, remainingBalance);
    setPayments(prev => [...prev, { method: "cash", amount: actualPayment, details: { tendered: amount } }]);
    setCurrentAmount("");
    toast.success(`Added ${formatKsh(actualPayment)} cash payment`);
  };

  const handleMpesaPayment = async () => {
    if (phoneNumber.length < 10) return;
    setIsProcessing(true);
    try {
      const res = await fetch(apiUrl("mpesa/stk-push"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phoneNumber, amount: remainingBalance }), // Request remaining balance
      });
      // ... same error handling ...
      if (res.status === 503) {
        setIsProcessing(false);
        toast.error("Payment Configuration Required", {
          description: "M-Pesa API credentials are not configured. Contact your administrator to set up CONSUMER_KEY and CONSUMER_SECRET.",
          duration: 8000,
        });
        return;
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setIsProcessing(false);
        toast.error("STK Push failed", { description: (err as any).detail });
        return;
      }
      const stkData = (await res.json()) as { CheckoutRequestID?: string };
      if (stkData.CheckoutRequestID) {
        setCheckoutRequestId(stkData.CheckoutRequestID);
        onStkSent?.(stkData.CheckoutRequestID);
      }
      setIsProcessing(false);
    } catch (e) {
      setIsProcessing(false);
      toast.error("STK Push failed");
    }
  };

  const resetAndClose = () => {
    setPayments([]);
    setCurrentAmount("");
    setPhoneNumber("");
    setCheckoutRequestId(null);
    setIsProcessing(false);
    setWaitingForBuyGoods(false);
    setCreditSearch("");
    setCreditCustomers([]);
    setSelectedCustomer(null);
    onClose();
  };

  const newBalanceAfterCredit = selectedCustomer
    ? selectedCustomer.current_balance + remainingBalance
    : 0;
  const creditWithinLimit =
    selectedCustomer != null &&
    selectedCustomer.debt_limit >= newBalanceAfterCredit;

  const handleCheckStatus = async () => {
    const id = checkoutRequestId?.trim();
    if (!id) return;
    const completed = await onVerifyStatus?.(id);
    if (completed) {
      // paymentList will be updated via websocket or we can trigger a re-fetch
      toast.info("Checking status...");
    }
  };

  const handleFinalizeSale = () => {
    if (!isFullyPaid) return;
    withCompleteDebounce(() => {
      // Determine primary method for legacy reporting if needed, or send full list
      const primaryMethod = payments.length > 1 ? "split" : payments[0]?.method || "cash";
      onCompleteSale(primaryMethod, { payments });
      try {
        fetch(apiUrl("hardware/kick-drawer"), { method: "POST" });
      } catch (_) { }
      resetAndClose();
    });
  };

  // Start waiting for Buy Goods payment
  const startBuyGoodsWait = () => {
    setWaitingForBuyGoods(true);
    toast.info("Waiting for M-Pesa payment...", {
      description: `Customer should pay ${formatKsh(remainingBalance)} to Till ${mpesaTillNumber}`,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && resetAndClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Complete Payment</DialogTitle>
          <DialogDescription className="flex justify-between items-center text-foreground font-bold text-lg mt-2">
            <span>Total: {formatKsh(totalGross)}</span>
            <span className={remainingBalance > 0 ? "text-primary" : "text-[#43B02A]"}>
              Balance: {formatKsh(remainingBalance)}
            </span>
          </DialogDescription>
        </DialogHeader>

        {/* Payment Summary List */}
        {payments.length > 0 && (
          <div className="space-y-2 mb-4">
            <p className="text-xs font-semibold uppercase text-muted-foreground">Added Payments</p>
            {payments.map((p, i) => (
              <div key={i} className="flex justify-between items-center p-2 rounded bg-muted/50 text-sm">
                <div className="flex items-center gap-2 uppercase font-black tracking-tight text-[10px]">
                  <span className={cn(
                    "px-1.5 py-0.5 rounded",
                    p.method === 'cash' ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" :
                      p.method === 'mpesa' ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
                        "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                  )}>
                    {p.method}
                  </span>
                  <span>{p.details?.code || ""}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono">{formatKsh(p.amount)}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6 h-auto p-0"
                    onClick={() => setPayments(prev => prev.filter((_, idx) => idx !== i))}
                  >
                    ×
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "cash" | "mpesa" | "credit")}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="cash">Cash</TabsTrigger>
            <TabsTrigger value="mpesa">M-Pesa</TabsTrigger>
            <TabsTrigger value="credit">Credit</TabsTrigger>
          </TabsList>

          <TabsContent value="cash">
            <div className="space-y-4 pt-4">
              <div>
                <Label>Amount Tendered</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={currentAmount}
                  onChange={(e) => setCurrentAmount(e.target.value)}
                  className="mt-1 h-12 text-lg font-mono"
                  placeholder={remainingBalance.toFixed(2)}
                  autoFocus
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => setCurrentAmount(remainingBalance.toFixed(2))}>
                  Exact: {formatKsh(remainingBalance)}
                </Button>
                {[50, 100, 200, 500, 1000].map(val => (
                  <Button key={val} variant="outline" size="sm" onClick={() => setCurrentAmount(val.toString())}>
                    {formatKsh(val)}
                  </Button>
                ))}
              </div>

              {parseFloat(currentAmount || "0") > remainingBalance && (
                <div className="rounded-md bg-muted p-3">
                  <p className="text-sm font-medium">Change Due</p>
                  <p className="text-xl font-mono">{formatKsh(parseFloat(currentAmount) - remainingBalance)}</p>
                </div>
              )}

              <Button
                className="w-full"
                size="lg"
                onClick={handleAddCashPayment}
                disabled={!currentAmount || parseFloat(currentAmount) <= 0}
              >
                Add Cash Payment
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="mpesa">
            <div className="space-y-4 pt-4">
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={mpesaMode === "stk" ? "default" : "outline"}
                  size="sm"
                  className={cn("flex-1 gap-2", mpesaMode === "stk" && "bg-[#43B02A] hover:bg-[#3a9824]")}
                  onClick={() => setMpesaMode("stk")}
                >
                  <Smartphone className="size-4" />
                  STK Push
                </Button>
                <Button
                  type="button"
                  variant={mpesaMode === "buygoods" ? "default" : "outline"}
                  size="sm"
                  className={cn("flex-1 gap-2", mpesaMode === "buygoods" && "bg-[#43B02A] hover:bg-[#3a9824]")}
                  onClick={() => setMpesaMode("buygoods")}
                >
                  <Store className="size-4" />
                  Buy Goods / Till
                </Button>
              </div>

              <div className="flex items-center gap-2 text-[10px] text-muted-foreground uppercase font-bold tracking-widest">
                <div className={cn("size-2 rounded-full", isConnected ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-amber-500 animate-pulse")} />
                {isConnected ? "Auto-Confirm Active" : "Connecting..."}
              </div>

              {mpesaMode === "stk" && !checkoutRequestId && (
                <>
                  <div>
                    <Label>Customer Phone</Label>
                    <Input
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, "").slice(0, 12))}
                      className="mt-1 h-12 text-lg"
                      placeholder="07XXXXXXXX"
                    />
                  </div>
                  <Button
                    className="w-full bg-[#43B02A] hover:bg-[#3a9824]"
                    size="lg"
                    onClick={handleMpesaPayment}
                    disabled={phoneNumber.length < 10 || isProcessing || remainingBalance <= 0}
                  >
                    {isProcessing ? <Loader2 className="animate-spin" /> : `Request ${formatKsh(remainingBalance)}`}
                  </Button>
                </>
              )}

              {mpesaMode === "stk" && checkoutRequestId && (
                <div className="flex flex-col items-center gap-4 py-4 bg-muted/30 rounded-lg">
                  <Loader2 className="h-10 w-10 animate-spin text-[#43B02A]" />
                  <div className="text-center text-sm px-4">
                    <p className="font-bold">Check Phone</p>
                    <p className="text-xs text-muted-foreground">Waiting for PIN traversal...</p>
                  </div>
                  <div className="flex gap-2 w-full px-4">
                    <Button variant="outline" size="sm" className="flex-1" onClick={handleCheckStatus}>Check</Button>
                    <Button variant="ghost" size="sm" className="flex-1" onClick={() => setCheckoutRequestId(null)}>Cancel</Button>
                  </div>
                </div>
              )}

              {mpesaMode === "buygoods" && (
                <div className="rounded-lg border bg-[#43B02A]/5 p-4 text-center">
                  <p className="text-xs font-bold text-[#43B02A] uppercase mb-1">Pay To Till</p>
                  <p className="text-3xl font-black font-mono tracking-tighter">{mpesaTillNumber || "---"}</p>
                  <div className="mt-3 pt-3 border-t text-sm font-medium">
                    Expecting: {formatKsh(remainingBalance)}
                  </div>
                  {!waitingForBuyGoods ? (
                    <Button
                      className="mt-4 w-full bg-[#43B02A]"
                      onClick={startBuyGoodsWait}
                      disabled={remainingBalance <= 0}
                    >
                      Start Auto-Listen
                    </Button>
                  ) : (
                    <div className="mt-4 flex items-center justify-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="size-3 animate-spin" /> Listening for amount match...
                    </div>
                  )}
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="credit">
            <div className="space-y-4 pt-4">
              <div>
                <Label>Search Debtor</Label>
                <div className="relative mt-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <Input
                    value={creditSearch}
                    onChange={(e) => setCreditSearch(e.target.value)}
                    placeholder="Name or phone..."
                    className="pl-10"
                  />
                </div>
                {creditCustomers.length > 0 && !selectedCustomer && (
                  <ul className="mt-2 max-h-32 overflow-auto rounded border bg-card shadow-sm">
                    {creditCustomers.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          className="flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-muted"
                          onClick={() => { setSelectedCustomer(c); setCreditSearch(""); setCreditCustomers([]); }}
                        >
                          <span>{c.name || c.phone}</span>
                          <span className="text-xs font-mono text-muted-foreground">{formatKsh(c.current_balance)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {selectedCustomer && (
                  <div className="mt-2 p-3 border rounded bg-[#FBBF24]/5 flex justify-between items-center">
                    <div>
                      <p className="font-bold text-sm">{selectedCustomer.name}</p>
                      <p className="text-[10px] text-muted-foreground tracking-tight">LIMIT: {formatKsh(selectedCustomer.debt_limit)}</p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setSelectedCustomer(null)}>Change</Button>
                  </div>
                )}
              </div>
              <Button
                className="w-full"
                onClick={() => {
                  if (selectedCustomer) {
                    setPayments(prev => [...prev, { method: "credit", amount: remainingBalance, details: { customer_id: selectedCustomer.id } }]);
                    setSelectedCustomer(null);
                  }
                }}
                disabled={!selectedCustomer || remainingBalance <= 0 || !creditWithinLimit}
              >
                {selectedCustomer && !creditWithinLimit ? "Credit Limit Exceeded" : "Add to Credit"}
              </Button>
            </div>
          </TabsContent>
        </Tabs>

        {/* Final Completion Action */}
        <div className="mt-6 pt-6 border-t">
          <Button
            className={cn(
              "w-full h-14 text-xl font-black uppercase tracking-tighter shadow-lg shadow-primary/20",
              isFullyPaid ? "bg-[#43B02A] hover:bg-[#3a9824]" : "bg-muted text-muted-foreground"
            )}
            onClick={handleFinalizeSale}
            disabled={!isFullyPaid}
          >
            {isFullyPaid ? "Complete Sale" : `Pay ${formatKsh(remainingBalance)} More`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
