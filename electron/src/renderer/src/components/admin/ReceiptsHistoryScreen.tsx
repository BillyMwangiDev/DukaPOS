import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Printer, Calendar, Search } from "lucide-react";
import { apiUrl } from "@/lib/api";
import { formatKsh } from "@/lib/format";
import { toast } from "sonner";
import { cn } from "@/lib/cn";

interface SaleItem {
  id: number;
  name: string;
  quantity: number;
  price: number;
  total: number;
}

interface Receipt {
  id: number;
  receipt_id: string;
  business_name?: string;
  payment_type: string;
  payment_subtype?: string;
  reference_code?: string;
  bank_name?: string;
  bank_sender_name?: string;
  bank_confirmed?: boolean;
  total_amount: number;
  is_return: boolean;
  timestamp?: string;
  items: SaleItem[];
}


function defaultStartEnd(): { start: string; end: string } {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 30);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

export function ReceiptsHistoryScreen() {
  const [startDate, setStartDate] = useState(() => defaultStartEnd().start);
  const [endDate, setEndDate] = useState(() => defaultStartEnd().end);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(false);
  const [printing, setPrinting] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const fetchReceipts = useCallback(async (start: string, end: string) => {
    setLoading(true);
    try {
      const res = await fetch(
        apiUrl(`transactions?start_date=${encodeURIComponent(start)}&end_date=${encodeURIComponent(end)}&limit=100`)
      );
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        console.error("Fetch error details:", errorData);
        throw new Error(`Failed to load receipts: ${res.status} ${res.statusText}`);
      }
      const data = await res.json();
      setReceipts(data);
    } catch (err: any) {
      console.error("Receipt History Error:", err);
      toast.error(err.message || "Failed to load receipts");
      setReceipts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReceipts(startDate, endDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleApplyRange = () => {
    if (startDate && endDate) fetchReceipts(startDate, endDate);
    else toast.error("Select start and end date");
  };

  const handleReprint = async (id: number) => {
    setPrinting(id);
    try {
      const res = await fetch(apiUrl(`transactions/${id}/print`), { method: "POST" });
      if (!res.ok) throw new Error("Print failed");
      toast.success("Reprinting...");
    } catch {
      toast.error("Failed to reprint");
    } finally {
      setPrinting(null);
    }
  };

  const [viewingReceipt, setViewingReceipt] = useState<Receipt | null>(null);

  const handleView = (receipt: Receipt) => {
    setViewingReceipt(receipt);
  };

  const filteredReceipts = receipts.filter((r) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.trim().toLowerCase();
    return (
      r.receipt_id.toLowerCase().includes(q) ||
      String(r.total_amount).includes(q) ||
      (r.payment_type || "").toLowerCase().includes(q) ||
      (r.reference_code || "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="p-6 space-y-6 animate-in">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Transaction History</h1>
          <p className="text-muted-foreground mt-1">
            View and reprint past receipts
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
            <Label htmlFor="start-date" className="text-sm">From</Label>
            <Input
              id="start-date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-40"
            />
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="end-date" className="text-sm">To</Label>
            <Input
              id="end-date"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-40"
            />
          </div>
          <Button variant="outline" size="sm" onClick={handleApplyRange} disabled={loading}>
            <Calendar className="mr-2 size-4" />
            Apply
          </Button>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Search receipt ID, amount..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 w-52"
            />
          </div>
        </div>
      </div>

      <Card className="glass shadow-xl border-white/5">
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-2 animate-pulse">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-12 bg-muted rounded" />
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Receipt ID</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredReceipts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground h-32">
                      {searchQuery ? "No receipts match your search." : "No receipts found for this period."}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredReceipts.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-mono font-medium">
                        <button
                          className="hover:underline text-primary"
                          onClick={() => handleView(r)}
                        >
                          {r.receipt_id}
                        </button>
                      </TableCell>
                      <TableCell>
                        <span className={cn(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                          r.is_return ? "bg-rose-500/10 text-rose-600" : "bg-emerald-500/10 text-emerald-600"
                        )}>
                          {r.is_return ? "Return" : "Sale"}
                        </span>
                      </TableCell>
                      <TableCell>{r.payment_type}</TableCell>
                      <TableCell className="text-right font-mono font-bold">
                        {formatKsh(r.total_amount)}
                      </TableCell>
                      <TableCell className="text-right flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleView(r)}
                        >
                          View
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleReprint(r.id)}
                          disabled={printing === r.id}
                        >
                          <Printer className={cn("size-4 mr-2", printing === r.id && "animate-pulse")} />
                          {printing === r.id ? "Printing..." : "Reprint"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Receipt Details Modal */}
      {viewingReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-in fade-in">
          <div className="bg-background rounded-lg shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b flex justify-between items-center">
              <div>
                <h3 className="font-bold text-lg">{viewingReceipt.business_name || "DukaPOS"}</h3>
                <p className="text-sm font-medium">Receipt #{viewingReceipt.receipt_id}</p>
                <p className="text-xs text-muted-foreground">{viewingReceipt.timestamp?.replace("T", " ") || "Date unknown"}</p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setViewingReceipt(null)}>
                &times;
              </Button>
            </div>

            {/* Payment Summary Header */}
            <div className="px-4 py-2 bg-muted/30 border-b text-xs flex justify-between items-center">
              <span className="font-medium">
                Payment: {viewingReceipt.payment_type}
                {viewingReceipt.payment_subtype && ` (${viewingReceipt.payment_subtype})`}
              </span>
              {viewingReceipt.reference_code && (
                <span className="font-mono text-muted-foreground uppercase text-[10px]">
                  Ref: {viewingReceipt.reference_code}
                </span>
              )}
            </div>

            {viewingReceipt.payment_type === "BANK" && viewingReceipt.bank_name && (
              <div className="px-4 py-2 bg-purple-500/5 border-b text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-purple-600 dark:text-purple-400 font-bold uppercase tracking-wider text-[10px]">Bank Details</span>
                  {viewingReceipt.bank_confirmed && (
                    <span className="text-emerald-600 text-[10px] font-bold">Confirmed</span>
                  )}
                </div>
                <div className="mt-1 grid grid-cols-2 gap-2">
                  <div>
                    <p className="text-muted-foreground text-[10px] uppercase">Bank</p>
                    <p className="font-medium">{viewingReceipt.bank_name}</p>
                  </div>
                  {viewingReceipt.bank_sender_name && (
                    <div>
                      <p className="text-muted-foreground text-[10px] uppercase">Sender</p>
                      <p className="font-medium">{viewingReceipt.bank_sender_name}</p>
                    </div>
                  )}
                </div>
              </div>
            )}


            <div className="p-4 overflow-y-auto flex-1 space-y-4">
              {viewingReceipt.items.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  No items found for this receipt.
                </div>
              ) : (
                <div className="space-y-1">
                  {viewingReceipt.items.map((item, idx) => (
                    <div key={idx} className="flex justify-between text-sm py-1 border-b border-dashed border-muted last:border-0">
                      <div>
                        <span className="font-medium">{item.name}</span>
                        <div className="text-xs text-muted-foreground">
                          {item.quantity} x {formatKsh(item.price)}
                        </div>
                      </div>
                      <span className="font-mono font-medium">{formatKsh(item.total || (item.quantity * item.price))}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-4 border-t bg-muted/20">
              <div className="flex justify-between items-center mb-4">
                <span className="font-bold">Total</span>
                <span className="font-mono font-black text-lg">{formatKsh(viewingReceipt.total_amount)}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={() => setViewingReceipt(null)}>
                  Close
                </Button>
                <Button
                  onClick={() => handleReprint(viewingReceipt.id)}
                  disabled={printing === viewingReceipt.id}
                >
                  <Printer className="mr-2 size-4" />
                  Reprint
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
