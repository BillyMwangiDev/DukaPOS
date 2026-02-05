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
import { Download, Calendar } from "lucide-react";
import { apiUrl } from "@/lib/api";
import { formatKsh } from "@/lib/format";
import { toast } from "sonner";

interface DailyRow {
  date: string;
  revenue: number;
  profit: number;
  transaction_count: number;
}

interface PaymentBreakdown {
  cash: number;
  mpesa: number;
  credit: number;
}

interface SalesReport {
  by_day: DailyRow[];
  by_payment_method: PaymentBreakdown;
}

const PAYMENT_COLORS = ["#2563eb", "#16a34a", "#f59e0b"]; // blue, green, amber

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
  const [exporting, setExporting] = useState(false);

  const fetchReport = useCallback(async (start: string, end: string) => {
    setLoading(true);
    try {
      const res = await fetch(
        apiUrl(`reports/sales?start_date=${encodeURIComponent(start)}&end_date=${encodeURIComponent(end)}`)
      );
      if (!res.ok) throw new Error("Failed to load report");
      const data = await res.json();
      const safe: SalesReport = {
        by_day: Array.isArray(data?.by_day) ? data.by_day : [],
        by_payment_method: data?.by_payment_method && typeof data.by_payment_method === "object"
          ? {
              cash: Number(data.by_payment_method.cash) || 0,
              mpesa: Number(data.by_payment_method.mpesa) || 0,
              credit: Number(data.by_payment_method.credit) || 0,
            }
          : { cash: 0, mpesa: 0, credit: 0 },
      };
      setReport(safe);
    } catch {
      toast.error("Failed to load sales report");
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReport(startDate, endDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleApplyRange = () => {
    if (startDate && endDate) fetchReport(startDate, endDate);
    else toast.error("Select start and end date");
  };

  const handleExportCsv = async () => {
    const start = startDate || defaultStartEnd().start;
    const end = endDate || defaultStartEnd().end;
    setExporting(true);
    try {
      const res = await fetch(
        apiUrl(`reports/export?start_date=${encodeURIComponent(start)}&end_date=${encodeURIComponent(end)}`)
      );
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `dukapos_sales_${start}_${end}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("CSV downloaded");
    } catch {
      toast.error("Export failed");
    } finally {
      setExporting(false);
    }
  };

  const pieData = report
    ? [
        { name: "Cash", value: report.by_payment_method.cash, color: PAYMENT_COLORS[0] },
        { name: "M-Pesa", value: report.by_payment_method.mpesa, color: PAYMENT_COLORS[1] },
        { name: "Credit", value: report.by_payment_method.credit, color: PAYMENT_COLORS[2] },
      ].filter((d) => d.value > 0)
    : [];

  return (
    <div className="p-6 space-y-6">
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
          <Button size="sm" onClick={handleExportCsv} disabled={exporting || loading}>
            <Download className="mr-2 size-4" />
            {exporting ? "Exporting…" : "Export CSV"}
          </Button>
        </div>
      </div>

      {loading && (
        <p className="text-sm text-muted-foreground">Loading report…</p>
      )}

      {!loading && report && (
        <>
          <Card>
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

          <Card>
            <CardHeader>
              <CardTitle>Payment Method Split</CardTitle>
              <p className="text-sm text-muted-foreground">
                Cash vs M-Pesa vs Credit for the selected range
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
        </>
      )}
    </div>
  );
}
