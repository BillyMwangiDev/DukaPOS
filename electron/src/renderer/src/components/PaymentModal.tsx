import { useState, useEffect, useCallback, useRef } from "react";
import { Loader2, Search, Smartphone, Store, CreditCard } from "lucide-react";
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
  const [activeTab, setActiveTab] = useState<"cash" | "mobile" | "credit">(defaultTab === "mpesa" ? "mobile" : defaultTab);
  const [payments, setPayments] = useState<{ method: string; amount: number; details?: any }[]>([]);
  const [currentAmount, setCurrentAmount] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [mpesaMode, setMpesaMode] = useState<"stk" | "buygoods" | "bank">("stk");
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
          method: "MOBILE",
          amount: data.amount || remainingBalance,
          details: { subtype: "M-Pesa", code: data.mpesa_receipt, source: "stk" }
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
            method: "MOBILE",
            amount: data.amount,
            details: { subtype: "M-Pesa", code: data.trans_id, phone: data.phone, name: data.customer_name, source: "c2b" }
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
      setActiveTab(defaultTab === "mpesa" ? "mobile" : defaultTab);
      if (!prevOpenRef.current && defaultTab === "cash")
        setCurrentAmount(initialCashTendered ?? "");
      prevOpenRef.current = true;
    } else {
      prevOpenRef.current = false;
    }
  }, [open, defaultTab, initialCashTendered]);

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
    setPayments(prev => [...prev, { method: "CASH", amount: actualPayment, details: { tendered: amount } }]);
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
      if (res.status === 503) {
        setIsProcessing(false);
        toast.error("Payment Configuration Required", {
          description: "M-Pesa API credentials are not configured.",
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
      toast.info("Checking status...");
    }
  };

  const handleFinalizeSale = () => {
    if (!isFullyPaid) return;
    withCompleteDebounce(() => {
      // Send the full payment breakdown to onCompleteSale
      onCompleteSale("COMPLETED", { payments });
      try {
        fetch(apiUrl("hardware/kick-drawer"), { method: "POST" });
      } catch (_) { }
      resetAndClose();
    });
  };

  // Start waiting for Buy Goods payment
  const startBuyGoodsWait = (subtype: string = "M-Pesa") => {
    setWaitingForBuyGoods(true);
    toast.info(`Waiting for ${subtype} payment...`, {
      description: `Customer should pay ${formatKsh(remainingBalance)}`,
    });
  };

  const handleManualMobilePayment = (subtype: string) => {
    setPayments(prev => [...prev, {
      method: "MOBILE",
      amount: remainingBalance,
      details: { subtype, source: "manual" }
    }]);
    toast.success(`Registered ${subtype} payment`);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && resetAndClose()}>
      <DialogContent className="sm:max-w-md glass animate-in shadow-2xl border-white/10 no-scrollbar">
        <DialogHeader>
          <DialogTitle>Complete Payment</DialogTitle>
          <DialogDescription className="flex justify-between items-center text-foreground font-bold text-lg mt-2">
            <span>Total: {formatKsh(totalGross)}</span>
            <span className={remainingBalance > 0 ? "text-primary" : "text-emerald-500 font-black"}>
              Balance: {formatKsh(remainingBalance)}
            </span>
          </DialogDescription>
        </DialogHeader>

        {/* Payment Summary List */}
        {payments.length > 0 && (
          <div className="space-y-2 mb-4">
            <p className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">Added Payments</p>
            {payments.map((p, i) => (
              <div key={i} className="flex justify-between items-center p-2 rounded-lg bg-muted/50 text-sm border border-border">
                <div className="flex items-center gap-2 uppercase font-black tracking-tight text-[10px]">
                  <span className={cn(
                    "px-2 py-0.5 rounded text-white",
                    p.method === 'CASH' ? "bg-blue-600" :
                      p.method === 'MOBILE' ? "bg-emerald-600" :
                        "bg-amber-600"
                  )}>
                    {p.details?.subtype || p.method}
                  </span>
                  <span className="text-muted-foreground opacity-70">{p.details?.code || ""}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold">{formatKsh(p.amount)}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-6 h-auto p-0 hover:text-destructive"
                    onClick={() => setPayments(prev => prev.filter((_, idx) => idx !== i))}
                  >
                    ×
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
          <TabsList className="grid w-full grid-cols-3 h-11">
            <TabsTrigger value="cash">Cash</TabsTrigger>
            <TabsTrigger value="mobile">Mobile</TabsTrigger>
            <TabsTrigger value="credit">Credit</TabsTrigger>
          </TabsList>

          <TabsContent value="cash">
            <div className="space-y-4 pt-4">
              <div>
                <Label className="text-xs font-bold uppercase text-muted-foreground">Amount Tendered</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={currentAmount}
                  onChange={(e) => setCurrentAmount(e.target.value)}
                  className="mt-1 h-12 text-lg font-mono bg-muted/30"
                  placeholder={remainingBalance.toFixed(2)}
                  autoFocus
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" className="font-mono" size="sm" onClick={() => setCurrentAmount(remainingBalance.toFixed(2))}>
                  Exact: {formatKsh(remainingBalance)}
                </Button>
                {[50, 100, 200, 500, 1000].map(val => (
                  <Button key={val} variant="outline" className="font-mono" size="sm" onClick={() => setCurrentAmount(val.toString())}>
                    {val}
                  </Button>
                ))}
              </div>

              {parseFloat(currentAmount || "0") > remainingBalance && (
                <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3">
                  <p className="text-[10px] font-bold uppercase text-emerald-600">Change Due</p>
                  <p className="text-2xl font-mono font-black text-emerald-600">{formatKsh(parseFloat(currentAmount) - remainingBalance)}</p>
                </div>
              )}

              <Button
                className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                size="lg"
                onClick={handleAddCashPayment}
                disabled={!currentAmount || parseFloat(currentAmount) <= 0}
              >
                Add Cash Payment
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="mobile">
            <div className="space-y-4 pt-4">
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant={mpesaMode === "stk" ? "default" : "outline"}
                  size="sm"
                  className={cn("flex-1 gap-2 min-w-[100px]", mpesaMode === "stk" && "bg-emerald-600 hover:bg-emerald-700")}
                  onClick={() => setMpesaMode("stk")}
                >
                  <Smartphone className="size-4" />
                  M-Pesa STK
                </Button>
                <Button
                  type="button"
                  variant={mpesaMode === "buygoods" ? "default" : "outline"}
                  size="sm"
                  className={cn("flex-1 gap-2 min-w-[100px]", mpesaMode === "buygoods" && "bg-emerald-600 hover:bg-emerald-700")}
                  onClick={() => setMpesaMode("buygoods")}
                >
                  <Store className="size-4" />
                  Till
                </Button>
                <Button
                  type="button"
                  variant={mpesaMode === "bank" ? "default" : "outline"}
                  size="sm"
                  className={cn("flex-1 gap-2 min-w-[100px]", mpesaMode === "bank" && "bg-emerald-600 hover:bg-emerald-700")}
                  onClick={() => setMpesaMode("bank")}
                >
                  <CreditCard className="size-4" />
                  Bank/Card
                </Button>
              </div>

              {mpesaMode === "stk" && (
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground uppercase font-bold tracking-widest px-1">
                  <div className={cn("size-2 rounded-full", isConnected ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-amber-500 animate-pulse")} />
                  {isConnected ? "Ready for Automatic Confirm" : "Connecting..."}
                </div>
              )}

              {mpesaMode === "stk" && !checkoutRequestId && (
                <>
                  <div>
                    <Label className="text-xs font-bold uppercase text-muted-foreground">Customer Phone</Label>
                    <Input
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, "").slice(0, 12))}
                      className="mt-1 h-12 text-lg bg-muted/30"
                      placeholder="07XXXXXXXX"
                    />
                  </div>
                  <Button
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                    size="lg"
                    onClick={handleMpesaPayment}
                    disabled={phoneNumber.length < 10 || isProcessing || remainingBalance <= 0}
                  >
                    {isProcessing ? <Loader2 className="animate-spin" /> : `Send STK (${formatKsh(remainingBalance)})`}
                  </Button>
                </>
              )}

              {mpesaMode === "stk" && checkoutRequestId && (
                <div className="flex flex-col items-center gap-4 py-4 bg-muted/30 rounded-lg border border-border">
                  <Loader2 className="h-10 w-10 animate-spin text-emerald-600" />
                  <div className="text-center text-sm px-4">
                    <p className="font-bold">Waiting for PIN entry</p>
                    <p className="text-xs text-muted-foreground">A prompt has been sent to {phoneNumber}</p>
                  </div>
                  <div className="flex gap-2 w-full px-4">
                    <Button variant="outline" size="sm" className="flex-1" onClick={handleCheckStatus}>Verify Status</Button>
                    <Button variant="ghost" size="sm" className="flex-1" onClick={() => setCheckoutRequestId(null)}>Cancel</Button>
                  </div>
                </div>
              )}

              {mpesaMode === "buygoods" && (
                <div className="rounded-lg border bg-emerald-500/5 p-4 text-center space-y-3">
                  <div>
                    <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mb-1">Pay to Till / Paybill</p>
                    <p className="text-3xl font-black font-mono tracking-tighter text-emerald-700 dark:text-emerald-400">
                      {mpesaTillNumber || "STATION TILL"}
                    </p>
                  </div>
                  <div className="pt-3 border-t text-sm font-medium text-muted-foreground italic">
                    Expecting: <span className="text-foreground font-black">{formatKsh(remainingBalance)}</span>
                  </div>
                  {!waitingForBuyGoods ? (
                    <Button
                      className="w-full bg-emerald-600 text-white"
                      onClick={() => startBuyGoodsWait("M-Pesa")}
                      disabled={remainingBalance <= 0}
                    >
                      Start Listening for Match
                    </Button>
                  ) : (
                    <div className="flex items-center justify-center gap-2 text-[10px] uppercase font-bold text-emerald-600 animate-pulse">
                      <Loader2 className="size-3 animate-spin" /> Auto-Confirm Active
                    </div>
                  )}
                  <div className="pt-2">
                    <Button variant="ghost" size="sm" className="text-[10px] uppercase" onClick={() => handleManualMobilePayment("M-Pesa")}>
                      Manual Confirm (M-Pesa)
                    </Button>
                  </div>
                </div>
              )}

              {mpesaMode === "bank" && (
                <div className="space-y-3">
                  <div className="rounded-lg border bg-muted/30 p-4 text-center">
                    <p className="text-xs font-bold uppercase text-muted-foreground">Bank Transfer / Card PDQ</p>
                    <p className="text-sm mt-2 text-muted-foreground">Select provider to register manual payment</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {["Bank Transfer", "Equity", "KCB", "Absa", "Visa/Card"].map(bank => (
                      <Button key={bank} variant="outline" size="sm" onClick={() => handleManualMobilePayment(bank)}>
                        {bank}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="credit">
            <div className="space-y-4 pt-4">
              <div>
                <Label className="text-xs font-bold uppercase text-muted-foreground">Search Customer Account</Label>
                <div className="relative mt-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <Input
                    value={creditSearch}
                    onChange={(e) => setCreditSearch(e.target.value)}
                    placeholder="Search by name or phone..."
                    className="pl-10 bg-muted/30"
                  />
                </div>
                {creditCustomers.length > 0 && !selectedCustomer && (
                  <ul className="mt-2 max-h-40 overflow-auto rounded-lg border bg-card shadow-lg z-10 divide-y divide-border">
                    {creditCustomers.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          className="flex w-full flex-col px-3 py-2 text-left hover:bg-muted transition-colors"
                          onClick={() => { setSelectedCustomer(c); setCreditSearch(""); setCreditCustomers([]); }}
                        >
                          <span className="font-bold text-sm">{c.name || "Unnamed Customer"}</span>
                          <div className="flex justify-between text-[10px] text-muted-foreground">
                            <span>{c.phone || "No Phone"}</span>
                            <span>Bal: {formatKsh(c.current_balance)}</span>
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {selectedCustomer && (
                  <div className="mt-3 p-3 border rounded-lg bg-amber-500/5 border-amber-500/20 flex justify-between items-center">
                    <div>
                      <p className="font-black text-sm text-amber-600 uppercase">{selectedCustomer.name}</p>
                      <p className="text-[10px] text-muted-foreground font-medium">AVAILABLE LIMIT: {formatKsh(selectedCustomer.debt_limit - selectedCustomer.current_balance)}</p>
                    </div>
                    <Button variant="ghost" size="sm" className="h-7 text-[10px] uppercase font-black" onClick={() => setSelectedCustomer(null)}>Change</Button>
                  </div>
                )}
              </div>
              <Button
                className="w-full bg-amber-600 hover:bg-amber-700 text-white"
                size="lg"
                onClick={() => {
                  if (selectedCustomer) {
                    setPayments(prev => [...prev, { method: "CREDIT", amount: remainingBalance, details: { customer_id: selectedCustomer.id, customer_name: selectedCustomer.name } }]);
                    setSelectedCustomer(null);
                  }
                }}
                disabled={!selectedCustomer || remainingBalance <= 0 || !creditWithinLimit}
              >
                {selectedCustomer && !creditWithinLimit ? "Limit Exceeded" : `Charge to Account (${formatKsh(remainingBalance)})`}
              </Button>
            </div>
          </TabsContent>
        </Tabs>

        {/* Final Completion Action */}
        <div className="mt-6 pt-6 border-t border-border">
          <Button
            className={cn(
              "w-full h-16 text-2xl font-black uppercase tracking-tighter shadow-xl transition-all",
              isFullyPaid ? "bg-emerald-600 hover:bg-emerald-700 scale-[1.02] text-white" : "bg-muted text-muted-foreground opacity-50 cursor-not-allowed"
            )}
            onClick={handleFinalizeSale}
            disabled={!isFullyPaid}
          >
            {isFullyPaid ? "Finalize & Receipt" : `Requires ${formatKsh(remainingBalance)}`}
          </Button>
          {isFullyPaid && (
            <p className="text-center text-[10px] font-bold text-muted-foreground mt-2 uppercase tracking-widest animate-pulse">Ready to complete</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
