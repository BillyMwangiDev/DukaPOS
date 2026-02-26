import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { Download, Calendar, TrendingUp, TrendingDown, Clock } from "lucide-react";
import { apiUrl } from "@/lib/api";
import { formatKsh } from "@/lib/format";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface TopProduct {
  product_id: number;
  name: string;
  total_quantity: number;
  total_revenue: number;
}

interface SlowMover {
  product_id: number;
  name: string;
  total_sold: number;
  stock_quantity: number;
}

interface HourlyEntry {
  hour: number;
  avg_revenue: number;
  tx_count: number;
}

interface DailyRow {
  date: string;
  revenue: number;
  profit: number;
  transaction_count: number;
}

interface PaymentBreakdown {
  cash: number;
  mobile: number;
  bank: number;
  credit: number;
}

interface SalesReport {
  by_day: DailyRow[];
  by_payment_method: PaymentBreakdown;
}

const PAYMENT_COLORS = ["#2563eb", "#10b981", "#8b5cf6", "#f59e0b"]; // blue (cash), emerald (mobile), violet (bank), amber (credit)

function defaultStartEnd(): { start: string; end: string } {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 30);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

export function SalesReportsScreen() {
  const [startDate, setStartDate] = useState(() => defaultStartEnd().start);
  const [endDate, setEndDate] = useState(() => defaultStartEnd().end);
  const [report, setReport] = useState<SalesReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [slowMovers, setSlowMovers] = useState<SlowMover[]>([]);
  const [hourlyData, setHourlyData] = useState<HourlyEntry[]>([]);

  const fetchReport = useCallback(async (start: string, end: string) => {
    setLoading(true);
    setLoadError(false);
    try {
      const [salesRes, topRes, heatmapRes, slowRes] = await Promise.all([
        fetch(apiUrl(`reports/sales?start_date=${encodeURIComponent(start)}&end_date=${encodeURIComponent(end)}`)),
        fetch(apiUrl(`reports/top-products?start_date=${encodeURIComponent(start)}&end_date=${encodeURIComponent(end)}&limit=10`)),
        fetch(apiUrl(`reports/hourly-heatmap?start_date=${encodeURIComponent(start)}&end_date=${encodeURIComponent(end)}`)),
        fetch(apiUrl(`reports/slow-movers?days=30&limit=20`)),
      ]);
      if (!salesRes.ok) throw new Error("Failed to load report");
      const data = await salesRes.json();
      const safe: SalesReport = {
        by_day: Array.isArray(data?.by_day) ? data.by_day : [],
        by_payment_method: data?.by_payment_method && typeof data.by_payment_method === "object"
          ? {
            cash: Number(data.by_payment_method.cash) || 0,
            mobile: Number(data.by_payment_method.mobile) || 0,
            bank: Number(data.by_payment_method.bank) || 0,
            credit: Number(data.by_payment_method.credit) || 0,
          }
          : { cash: 0, mobile: 0, bank: 0, credit: 0 },
      };
      setReport(safe);
      if (topRes.ok) setTopProducts((await topRes.json()) as TopProduct[]);
      if (heatmapRes.ok) setHourlyData((await heatmapRes.json()) as HourlyEntry[]);
      if (slowRes.ok) setSlowMovers((await slowRes.json()) as SlowMover[]);
    } catch {
      toast.error("Failed to load sales report");
      setReport(null);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReport(startDate, endDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleApplyRange = () => {
    if (!startDate || !endDate) {
      toast.error("Select start and end date");
      return;
    }
    if (endDate < startDate) {
      toast.error("Invalid date range", { description: "End date must be on or after start date." });
      return;
    }
    fetchReport(startDate, endDate);
  };

  const handleExport = async (format: "csv" | "excel") => {
    const start = startDate || defaultStartEnd().start;
    const end = endDate || defaultStartEnd().end;
    setExporting(true);
    try {
      const endpoint = format === "excel" ? "reports/export/excel" : "reports/export";
      const res = await fetch(
        apiUrl(`${endpoint}?start_date=${encodeURIComponent(start)}&end_date=${encodeURIComponent(end)}`)
      );
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `dukapos_sales_${start}_${end}.${format === "excel" ? "xlsx" : "csv"}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`${format.toUpperCase()} downloaded`);
    } catch {
      toast.error("Export failed");
    } finally {
      setExporting(false);
    }
  };

  const pieData = report
    ? [
      { name: "Cash", value: report.by_payment_method.cash, color: PAYMENT_COLORS[0] },
      { name: "Mobile", value: report.by_payment_method.mobile, color: PAYMENT_COLORS[1] },
      { name: "Bank", value: report.by_payment_method.bank, color: PAYMENT_COLORS[2] },
      { name: "Credit", value: report.by_payment_method.credit, color: PAYMENT_COLORS[3] },
    ].filter((d) => d.value > 0)
    : [];

  return (
    <div className="p-6 space-y-6 animate-in">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Sales Reports</h1>
          <p className="text-muted-foreground mt-1">
            Revenue, profit, and payment method breakdown
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
            <Label htmlFor="start-date" className="text-sm whitespace-nowrap">
              From
            </Label>
            <Input
              id="start-date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-40"
            />
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="end-date" className="text-sm whitespace-nowrap">
              To
            </Label>
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
          <div className="flex gap-1">
            <Button size="sm" variant="outline" onClick={() => handleExport("csv")} disabled={exporting || loading}>
              <Download className="mr-2 size-4" />
              CSV
            </Button>
            <Button size="sm" onClick={() => handleExport("excel")} disabled={exporting || loading}>
              <Download className="mr-2 size-4" />
              {exporting ? "..." : "Excel"}
            </Button>
          </div>
        </div>
      </div>


      {loading && (
        <div className="space-y-4 animate-pulse">
          <div className="h-80 bg-muted rounded-xl" />
          <div className="h-80 bg-muted rounded-xl" />
        </div>
      )}

      {!loading && loadError && (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
          <p>Failed to load report.</p>
          <Button variant="outline" size="sm" onClick={() => fetchReport(startDate, endDate)}>
            Retry
          </Button>
        </div>
      )}

      {!loading && !loadError && report && (
        <>
          <Card className="glass shadow-xl border-white/5">
            <CardHeader>
              <CardTitle>Revenue by Date</CardTitle>
              <p className="text-sm text-muted-foreground">
                Daily revenue (Ksh) for the selected range
              </p>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                {report.by_day.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No data for this range.</p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={report.by_day} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                      <Tooltip
                        formatter={(value: number) => [formatKsh(value), "Revenue"]}
                        labelFormatter={(label) => `Date: ${label}`}
                      />
                      <Bar dataKey="revenue" fill="#16a34a" radius={[4, 4, 0, 0]} name="Revenue" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="glass shadow-xl border-white/5">
            <CardHeader>
              <CardTitle>Payment Method Split</CardTitle>
              <p className="text-sm text-muted-foreground">
                Cash vs Mobile vs Bank vs Credit for the selected range
              </p>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                {pieData.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No payment data for this range.</p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={2}
                        dataKey="value"
                        nameKey="name"
                        label={({ name, value }) => `${name}: ${formatKsh(value)}`}
                      >
                        {pieData.map((entry) => (
                          <Cell key={entry.name} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number) => formatKsh(value)} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Top Products */}
          <Card className="glass shadow-xl border-white/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="size-5 text-emerald-500" />
                Top Products
              </CardTitle>
              <p className="text-sm text-muted-foreground">Best-selling products by quantity and revenue</p>
            </CardHeader>
            <CardContent>
              {topProducts.length === 0 ? (
                <p className="text-sm text-muted-foreground">No product sales data for this range.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead className="text-right">Qty Sold</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topProducts.map((p, i) => (
                      <TableRow key={p.product_id}>
                        <TableCell className="text-muted-foreground font-mono text-sm">{i + 1}</TableCell>
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell className="text-right font-mono">{p.total_quantity}</TableCell>
                        <TableCell className="text-right font-mono">{formatKsh(p.total_revenue)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Hourly Heatmap */}
          <Card className="glass shadow-xl border-white/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="size-5 text-blue-500" />
                Hourly Sales Heatmap
              </CardTitle>
              <p className="text-sm text-muted-foreground">Average revenue by hour of day across the selected range</p>
            </CardHeader>
            <CardContent>
              {hourlyData.length === 0 ? (
                <p className="text-sm text-muted-foreground">No hourly data for this range.</p>
              ) : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={hourlyData} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="hour" tickFormatter={(h) => `${h}:00`} tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                      <Tooltip
                        formatter={(value: number) => [formatKsh(value), "Avg Revenue"]}
                        labelFormatter={(h) => `Hour: ${h}:00`}
                      />
                      <Bar dataKey="avg_revenue" fill="#3b82f6" radius={[3, 3, 0, 0]} name="Avg Revenue" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Slow Movers */}
          <Card className="glass shadow-xl border-white/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingDown className="size-5 text-amber-500" />
                Slow Movers
              </CardTitle>
              <p className="text-sm text-muted-foreground">Products with low or no sales in the last 30 days</p>
            </CardHeader>
            <CardContent>
              {slowMovers.length === 0 ? (
                <p className="text-sm text-muted-foreground">No slow-moving products detected.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead className="text-right">Sold (30d)</TableHead>
                      <TableHead className="text-right">In Stock</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {slowMovers.map((p) => (
                      <TableRow key={p.product_id}>
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell className="text-right font-mono text-amber-600">{p.total_sold}</TableCell>
                        <TableCell className="text-right font-mono">{p.stock_quantity}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
