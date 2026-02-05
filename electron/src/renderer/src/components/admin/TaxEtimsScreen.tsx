import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Download, FileText, Info } from "lucide-react";
import { apiUrl } from "@/lib/api";
import { toast } from "sonner";

export function TaxEtimsScreen() {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (startDate) params.set("start_date", startDate);
      if (endDate) params.set("end_date", endDate);
      const url = apiUrl(`tax/etims-csv?${params.toString()}`);
      const res = await fetch(url);
      if (!res.ok) throw new Error(res.statusText);
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition");
      const filename = disposition?.match(/filename="?([^";]+)"?/)?.[1] ?? "KRA_etims_export.csv";
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);
      toast.success("CSV exported", { description: filename });
    } catch (e) {
      toast.error("Export failed", { description: String(e) });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Tax & eTIMS Readiness</h1>
        <p className="text-muted-foreground mt-1">
          Export tax records for Kenya Revenue Authority compliance
        </p>
      </div>

      <Card className="border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/20 dark:border-emerald-800">
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
              <Info className="size-5" />
            </div>
            <div>
              <h3 className="font-semibold text-emerald-800 dark:text-emerald-200">eTIMS Integration Ready</h3>
              <p className="text-sm text-emerald-700 dark:text-emerald-300 mt-1">
                Your sales data is automatically formatted for KRA eTIMS submission. Export the CSV file and upload it directly to the eTIMS portal.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="size-5" />
            eTIMS Export Tool
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Select a date range and export your tax records
          </p>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-4">
          <div>
            <Label>Start Date</Label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="mt-1 w-40"
            />
          </div>
          <div>
            <Label>End Date</Label>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="mt-1 w-40"
            />
          </div>
          <Button
            className="bg-[#43B02A] hover:bg-[#3a9824]"
            disabled={exporting}
            onClick={handleExport}
          >
            <Download className="mr-2 size-4" />
            Export KRA eTIMS CSV
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>KRA eTIMS Submission Guidelines</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>1. Download the CSV file for your desired date range.</p>
          <p>2. Log in to the KRA eTIMS portal at <a href="https://etims.kra.go.ke" target="_blank" rel="noopener noreferrer" className="text-[#43B02A] underline">etims.kra.go.ke</a>.</p>
          <p>3. Navigate to &quot;Bulk Upload&quot; section.</p>
          <p>4. Upload the CSV file and submit for processing.</p>
          <p>5. Wait for KRA confirmation email (usually within 24 hours).</p>
        </CardContent>
      </Card>
    </div>
  );
}
