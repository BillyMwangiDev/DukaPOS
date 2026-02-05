import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Download,
  Calendar,
  Search,
  User,
  DollarSign,
  Banknote,
  Smartphone,
  CreditCard,
  Receipt,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Package,
  TrendingUp,
} from "lucide-react";
import { apiUrl } from "@/lib/api";
import { formatKsh } from "@/lib/format";
import { toast } from "sonner";

// Types
interface Cashier {
  id: number;
  username: string;
  role: string;
}

interface CashierSaleItem {
  timestamp: string;
  date: string;
  time: string;
  receipt_number: string;
  item_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  payment_method: string;
  transaction_id: number;
}

interface ShiftSummary {
  shift_id: number;
  opened_at: string;
  closed_at: string | null;
  opening_float: number;
  expected_cash: number;
  total_cash_sales: number;
  total_mpesa_sales: number;
  total_credit_sales: number;
  transaction_count: number;
}

interface CashierPerformanceSummary {
  cashier_id: number;
  cashier_name: string;
  total_sales: number;
  total_cash: number;
  total_mpesa: number;
  total_credit: number;
  total_items_sold: number;
  transaction_count: number;
  average_transaction: number;
}

interface CashierPerformanceResponse {
  cashier_id: number;
  cashier_name: string;
  period: string;
  start_date: string;
  end_date: string;
  summary: CashierPerformanceSummary;
  shifts: ShiftSummary[];
  items: CashierSaleItem[];
}

function getDefaultDates(): { start: string; end: string } {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 7);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

export function CashierAuditScreen() {
  const [cashiers, setCashiers] = useState<Cashier[]>([]);
  const [selectedCashierId, setSelectedCashierId] = useState<string>("");
  const [startDate, setStartDate] = useState(getDefaultDates().start);
  const [endDate, setEndDate] = useState(getDefaultDates().end);
  const [report, setReport] = useState<CashierPerformanceResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Fetch cashiers list
  useEffect(() => {
    async function fetchCashiers() {
      try {
        const res = await fetch(apiUrl("reports/cashiers"));
        if (!res.ok) throw new Error("Failed to load cashiers");
        const data = await res.json();
        setCashiers(data);
        // Auto-select first cashier
        if (data.length > 0 && !selectedCashierId) {
          setSelectedCashierId(String(data[0].id));
        }
      } catch {
        toast.error("Failed to load cashiers list");
      }
    }
    fetchCashiers();
  }, []);

  // Fetch report when cashier or dates change
  const fetchReport = useCallback(async () => {
    if (!selectedCashierId) return;
    
    setLoading(true);
    try {
      const res = await fetch(
        apiUrl(
          `reports/cashier-performance?cashier_id=${selectedCashierId}&start_date=${startDate}&end_date=${endDate}`
        )
      );
      if (!res.ok) throw new Error("Failed to load report");
      const data: CashierPerformanceResponse = await res.json();
      setReport(data);
    } catch {
      toast.error("Failed to load cashier performance report");
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [selectedCashierId, startDate, endDate]);

  useEffect(() => {
    if (selectedCashierId) {
      fetchReport();
    }
  }, [selectedCashierId, fetchReport]);

  // Export CSV
  const handleExportCsv = async () => {
    if (!selectedCashierId) return;
    
    setExporting(true);
    try {
      const res = await fetch(
        apiUrl(
          `reports/cashier-performance/export?cashier_id=${selectedCashierId}&start_date=${startDate}&end_date=${endDate}`
        )
      );
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `cashier_${selectedCashierId}_${startDate}_${endDate}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success("Report exported successfully");
    } catch {
      toast.error("Failed to export report");
    } finally {
      setExporting(false);
    }
  };

  // Filter items by search
  const filteredItems = useMemo(() => {
    if (!report?.items) return [];
    if (!searchQuery.trim()) return report.items;
    
    const q = searchQuery.toLowerCase();
    return report.items.filter(
      (item) =>
        item.item_name.toLowerCase().includes(q) ||
        item.receipt_number.toLowerCase().includes(q) ||
        item.payment_method.toLowerCase().includes(q)
    );
  }, [report?.items, searchQuery]);

  // Payment badge component
  const PaymentBadge = ({ method }: { method: string }) => {
    const m = method.toUpperCase();
    if (m === "CASH") {
      return (
        <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 gap-1">
          <Banknote className="size-3" />
          Cash
        </Badge>
      );
    }
    if (m === "MPESA") {
      return (
        <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 gap-1">
          <Smartphone className="size-3" />
          M-Pesa
        </Badge>
      );
    }
    if (m === "CREDIT") {
      return (
        <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 gap-1">
          <CreditCard className="size-3" />
          Credit
        </Badge>
      );
    }
    return <Badge variant="outline">{method}</Badge>;
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <User className="size-8" />
            Cashier Accountability Audit
          </h1>
          <p className="text-muted-foreground mt-1">
            Track individual cashier sales and reconcile cash at shift end
          </p>
        </div>
        <Button
          onClick={handleExportCsv}
          disabled={exporting || !report}
          className="gap-2"
        >
          <Download className="size-4" />
          {exporting ? "Exporting..." : "Export CSV"}
        </Button>
      </div>

      {/* Controls */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-end gap-4">
            {/* Cashier Selector */}
            <div className="space-y-2 min-w-[200px]">
              <Label className="flex items-center gap-1">
                <User className="size-4" />
                Select Cashier
              </Label>
              <Select
                value={selectedCashierId}
                onValueChange={setSelectedCashierId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a cashier..." />
                </SelectTrigger>
                <SelectContent>
                  {cashiers.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.username} ({c.role})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Date Range */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                <Calendar className="size-4" />
                Start Date
              </Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-40"
              />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                <Calendar className="size-4" />
                End Date
              </Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-40"
              />
            </div>

            <Button onClick={fetchReport} disabled={loading || !selectedCashierId}>
              {loading ? "Loading..." : "Refresh"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      {report?.summary && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Sales</CardTitle>
              <DollarSign className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono">
                {formatKsh(report.summary.total_sales)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {report.summary.transaction_count} transactions
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-1">
                <Banknote className="size-4 text-blue-500" />
                Cash Collected
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono text-blue-600 dark:text-blue-400">
                {formatKsh(report.summary.total_cash)}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-1">
                <Smartphone className="size-4 text-emerald-500" />
                M-Pesa Collected
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
                {formatKsh(report.summary.total_mpesa)}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-1">
                <Package className="size-4 text-muted-foreground" />
                Items Sold
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono">
                {report.summary.total_items_sold}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-1">
                <TrendingUp className="size-4 text-muted-foreground" />
                Avg Transaction
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono">
                {formatKsh(report.summary.average_transaction)}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Shift Summary - Cash Reconciliation */}
      {report?.shifts && report.shifts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="size-5" />
              Shift Summaries - Cash Reconciliation
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Shift</TableHead>
                    <TableHead>Opened</TableHead>
                    <TableHead>Closed</TableHead>
                    <TableHead className="text-right">Opening Float</TableHead>
                    <TableHead className="text-right">Cash Sales</TableHead>
                    <TableHead className="text-right font-semibold">Expected Cash</TableHead>
                    <TableHead className="text-right">M-Pesa</TableHead>
                    <TableHead className="text-right">Transactions</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.shifts.map((shift) => (
                    <TableRow key={shift.shift_id}>
                      <TableCell className="font-mono">#{shift.shift_id}</TableCell>
                      <TableCell className="text-sm">
                        {shift.opened_at ? new Date(shift.opened_at).toLocaleString() : "—"}
                      </TableCell>
                      <TableCell className="text-sm">
                        {shift.closed_at ? new Date(shift.closed_at).toLocaleString() : "Open"}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatKsh(shift.opening_float)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-blue-600 dark:text-blue-400">
                        {formatKsh(shift.total_cash_sales)}
                      </TableCell>
                      <TableCell className="text-right font-mono font-semibold bg-muted/50">
                        {formatKsh(shift.expected_cash)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-emerald-600 dark:text-emerald-400">
                        {formatKsh(shift.total_mpesa_sales)}
                      </TableCell>
                      <TableCell className="text-right">{shift.transaction_count}</TableCell>
                      <TableCell>
                        {shift.closed_at ? (
                          <Badge variant="secondary" className="gap-1">
                            <CheckCircle2 className="size-3" />
                            Closed
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="gap-1 text-amber-600">
                            <AlertTriangle className="size-3" />
                            Open
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              <strong>Expected Cash</strong> = Opening Float + Cash Sales. Compare with actual cash in drawer to identify discrepancies.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Itemized Sales Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Receipt className="size-5" />
              Accountability View - Items Sold
            </CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder="Search items, receipts..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              Loading...
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Receipt className="size-12 mb-4 opacity-30" />
              <p>No items found for this cashier in the selected period</p>
            </div>
          ) : (
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Receipt #</TableHead>
                    <TableHead>Item Name</TableHead>
                    <TableHead className="text-center">Qty</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Payment</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredItems.map((item, idx) => (
                    <TableRow key={`${item.transaction_id}-${idx}`}>
                      <TableCell className="font-mono text-sm">
                        {item.date} {item.time}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {item.receipt_number}
                      </TableCell>
                      <TableCell className="font-medium">{item.item_name}</TableCell>
                      <TableCell className="text-center">{item.quantity}</TableCell>
                      <TableCell className="text-right font-mono font-medium">
                        {formatKsh(item.total_price)}
                      </TableCell>
                      <TableCell>
                        <PaymentBadge method={item.payment_method} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {filteredItems.length > 0 && (
            <div className="mt-4 text-sm text-muted-foreground text-right">
              Showing {filteredItems.length} of {report?.items?.length || 0} items
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
