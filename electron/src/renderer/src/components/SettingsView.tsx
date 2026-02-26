import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  getApiBaseUrl,
  getEtimsEnabled,
  setEtimsEnabled,
  apiUrl,
  getConnectionMode,
  setConnectionMode,
} from "@/lib/api";
import { toast } from "sonner";
import {
  Settings,
  Server,
  FileCheck,
  Save,
  Database,
  Check,
  Download,
  Clock,
  FileText,
  Info,
  Key,
  Eye,
  EyeOff,
  Zap,
  RotateCcw,
  Printer,
} from "lucide-react";
import { cn } from "@/lib/cn";

const TOGGLE_CLASS =
  "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

interface SettingsViewProps {
  darkMode?: boolean;
  onToggleDarkMode?: () => void;
  /** Called after shop settings (e.g. shop name) are saved so header/admin can refetch. */
  onShopSettingsSaved?: () => void;
}

export function SettingsView({ darkMode = false, onToggleDarkMode, onShopSettingsSaved }: SettingsViewProps) {
  const [connectionMode, setConnectionModeState] = useState<"host" | "client">(getConnectionMode());
  const [apiBaseUrl, setApiBaseUrl] = useState(getApiBaseUrl());
  const [etimsEnabled, setEtimsEnabledState] = useState(getEtimsEnabled());
  const [saved, setSaved] = useState(false);
  const [autoPrint, setAutoPrint] = useState(true);
  const [soundEffects, setSoundEffects] = useState(true);
  const [lowStockAlerts, setLowStockAlerts] = useState(true);
  const [autoBackup, setAutoBackup] = useState(true);
  const [shopName, setShopName] = useState("DukaPOS");
  const [stationId, setStationId] = useState("POS-01");
  const [kraPin, setKraPin] = useState("");
  const [mpesaTill, setMpesaTill] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [backupLoading, setBackupLoading] = useState(false);
  const [backupHistory, setBackupHistory] = useState<{ filename: string; size_bytes: number; created_at: string }[]>([]);
  const [restoringBackup, setRestoringBackup] = useState<string | null>(null);

  // Receipt customization
  const [receiptHeader, setReceiptHeader] = useState("");
  const [receiptFooter, setReceiptFooter] = useState("Thank you for shopping with us!");
  const [vatRate, setVatRate] = useState(16.0);

  // Tax & eTIMS export state
  const [taxStartDate, setTaxStartDate] = useState("");
  const [taxEndDate, setTaxEndDate] = useState("");
  const [taxExporting, setTaxExporting] = useState(false);
  const [etimsSubmitting, setEtimsSubmitting] = useState(false);

  // M-Pesa API configuration state
  const [mpesaEnv, setMpesaEnv] = useState("sandbox");
  const [consumerKey, setConsumerKey] = useState("");
  const [consumerSecret, setConsumerSecret] = useState("");
  const [darajaPasskey, setDarajaPasskey] = useState("");
  const [darajaShortcode, setDarajaShortcode] = useState("174379");
  const [showApiKeys, setShowApiKeys] = useState(false);
  const [apiKeysLoading, setApiKeysLoading] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);

  const fetchBackups = useCallback(async () => {
    try {
      const res = await fetch(apiUrl("system/backups"));
      if (!res.ok) return;
      const data = (await res.json()) as { backups: { filename: string; size_bytes: number; created_at: string }[] };
      setBackupHistory(data.backups ?? []);
    } catch {
      setBackupHistory([]);
    }
  }, []);

  useEffect(() => {
    fetchBackups();
  }, [fetchBackups]);

  useEffect(() => {
    setConnectionModeState(getConnectionMode());
    setApiBaseUrl(getApiBaseUrl());
    setEtimsEnabledState(getEtimsEnabled());
  }, []);

  useEffect(() => {
    async function loadStore() {
      try {
        const res = await fetch(apiUrl("settings/store"));
        if (!res.ok) return;
        const data = await res.json();
        if (data && typeof data === "object") {
          setShopName(typeof data.shop_name === "string" ? data.shop_name : "DukaPOS");
          setStationId(typeof data.station_id === "string" ? data.station_id : "POS-01");
          setKraPin(typeof data.kra_pin === "string" ? data.kra_pin : "");
          setMpesaTill(typeof data.mpesa_till_number === "string" ? data.mpesa_till_number : "");
          setContactPhone(typeof data.contact_phone === "string" ? data.contact_phone : "");
          setReceiptHeader(typeof data.receipt_header === "string" ? data.receipt_header : "");
          setReceiptFooter(typeof data.receipt_footer === "string" ? data.receipt_footer : "Thank you for shopping with us!");
          setVatRate(typeof data.vat_rate === "number" ? data.vat_rate : 16.0);
        }
      } catch {
        /* keep defaults */
      }
    }
    loadStore();
  }, []);

  const handleSaveApi = () => {
    setConnectionMode(connectionMode);
    if (connectionMode === "client") {
      const trimmed = apiBaseUrl.trim() || "http://localhost:8000";
      try {
        const u = new URL(trimmed);
        if (u.protocol !== "http:" && u.protocol !== "https:") {
          toast.error("Invalid URL", { description: "Use http or https only" });
          return;
        }
        localStorage.setItem("API_BASE_URL", trimmed);
        setApiBaseUrl(trimmed);
      } catch {
        toast.error("Invalid URL", { description: "Enter a valid API base URL" });
        return;
      }
    }
    setEtimsEnabled(etimsEnabled);
    setSaved(true);
    toast.success("Settings saved", { description: "Connection mode and eTIMS preference updated." });
    setTimeout(() => setSaved(false), 2000);
  };

  const handleSaveShop = async () => {
    try {
      const res = await fetch(apiUrl("settings/store"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shop_name: shopName || "DukaPOS",
          station_id: stationId || "POS-01",
          kra_pin: kraPin,
          mpesa_till_number: mpesaTill,
          contact_phone: contactPhone,
          auto_print_receipt: autoPrint,
          low_stock_warning_enabled: lowStockAlerts,
          sound_enabled: soundEffects,
          auto_backup_enabled: autoBackup,
          receipt_header: receiptHeader,
          receipt_footer: receiptFooter,
          vat_rate: vatRate,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success("Settings saved", { description: "Shop info and general settings updated." });
      onShopSettingsSaved?.();
    } catch (e) {
      toast.error("Save failed", { description: String(e) });
    }
  };


  const handleManualBackup = async () => {
    setBackupLoading(true);
    try {
      const res = await fetch(apiUrl("system/backup"), { method: "POST" });
      const data = (await res.json()) as { ok: boolean; path?: string; error?: string };
      if (data.ok) {
        toast.success("Backup created", { description: data.path ?? "Saved to backups folder." });
        fetchBackups();
      } else {
        toast.error("Backup failed", { description: data.error ?? "Unknown error" });
      }
    } catch (e) {
      toast.error("Backup failed", { description: String(e) });
    } finally {
      setBackupLoading(false);
    }
  };

  const handleRestoreBackup = async (filename: string) => {
    const confirmed = window.confirm(
      `Restore from "${filename}"?\n\nThis will OVERWRITE the current database and restart the application. All unsaved data will be lost. Continue?`
    );
    if (!confirmed) return;
    setRestoringBackup(filename);
    try {
      const res = await fetch(apiUrl("system/restore"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && (data as { ok?: boolean }).ok) {
        toast.success("Database restored", { description: "Reloading application..." });
        setTimeout(() => window.location.reload(), 1500);
      } else {
        toast.error("Restore failed", { description: (data as { error?: string }).error ?? res.statusText });
      }
    } catch (e) {
      toast.error("Restore failed", { description: String(e) });
    } finally {
      setRestoringBackup(null);
    }
  };

  const formatBackupSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatBackupDate = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString(undefined, { dateStyle: "short" }) + " " + d.toLocaleTimeString(undefined, { timeStyle: "short" });
    } catch {
      return iso;
    }
  };

  const handleTaxExport = async () => {
    setTaxExporting(true);
    try {
      const params = new URLSearchParams();
      if (taxStartDate) params.set("start_date", taxStartDate);
      if (taxEndDate) params.set("end_date", taxEndDate);
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
      setTaxExporting(false);
    }
  };

  const fetchApiKeys = useCallback(async () => {
    try {
      const res = await fetch(apiUrl("settings/api-keys"));
      if (!res.ok) return;
      const data = await res.json();
      if (data && typeof data === "object") {
        const baseUrl = data.daraja_base_url || "https://sandbox.safaricom.co.ke";
        setMpesaEnv(baseUrl.includes("sandbox") ? "sandbox" : "production");
        setConsumerKey(data.consumer_key_masked || "");
        setConsumerSecret(data.consumer_secret_masked || "");
        setDarajaPasskey(data.daraja_passkey_masked || "");
        setDarajaShortcode(data.daraja_shortcode || "174379");
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    fetchApiKeys();
  }, [fetchApiKeys]);

  const handleSaveApiKeys = async () => {
    setApiKeysLoading(true);
    try {
      const baseUrl = mpesaEnv === "sandbox"
        ? "https://sandbox.safaricom.co.ke"
        : "https://api.safaricom.co.ke";

      const res = await fetch(apiUrl("settings/api-keys"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          daraja_base_url: baseUrl,
          consumer_key: consumerKey.includes("*") ? null : consumerKey,
          consumer_secret: consumerSecret.includes("*") ? null : consumerSecret,
          daraja_passkey: darajaPasskey.includes("*") ? null : darajaPasskey,
          daraja_shortcode: darajaShortcode,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success("API keys saved", { description: "M-Pesa configuration updated successfully." });
      fetchApiKeys();
    } catch (e) {
      toast.error("Save failed", { description: String(e) });
    } finally {
      setApiKeysLoading(false);
    }
  };

  const handleTestConnection = async () => {
    setTestingConnection(true);
    try {
      const res = await fetch(apiUrl("settings/api-keys/test"), { method: "POST" });
      const data = await res.json();
      if (res.ok && data.ok) {
        toast.success("Connection successful", { description: data.message });
      } else {
        toast.error("Connection failed", { description: data.message || res.statusText });
      }
    } catch (e) {
      toast.error("Test failed", { description: String(e) });
    } finally {
      setTestingConnection(false);
    }
  };

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">Settings & Backups</h1>
        <p className="text-muted-foreground mt-1">
          Configure system settings and manage data backups
        </p>
      </div>

      {/* General Settings */}
      <Card className="glass shadow-lg border-white/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="size-5" />
            General Settings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <p className="font-medium">Dark Mode</p>
              <p className="text-sm text-muted-foreground">
                Enable dark mode for better visibility in low light.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={darkMode}
              onClick={onToggleDarkMode}
              className={cn(TOGGLE_CLASS, darkMode ? "bg-primary" : "bg-muted")}
            >
              <span
                className={cn(
                  "pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform",
                  darkMode ? "translate-x-5" : "translate-x-1"
                )}
              />
            </button>
          </div>
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <p className="font-medium">Auto-Print Receipts</p>
              <p className="text-sm text-muted-foreground">
                Automatically print receipt after each sale.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={autoPrint}
              onClick={() => setAutoPrint(!autoPrint)}
              className={cn(TOGGLE_CLASS, autoPrint ? "bg-accent dark:bg-accent" : "bg-muted")}
            >
              <span
                className={cn(
                  "pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform",
                  autoPrint ? "translate-x-5" : "translate-x-1"
                )}
              />
            </button>
          </div>
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <p className="font-medium">Sound Effects</p>
              <p className="text-sm text-muted-foreground">
                Play sounds for scan, errors, and success.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={soundEffects}
              onClick={() => setSoundEffects(!soundEffects)}
              className={cn(TOGGLE_CLASS, soundEffects ? "bg-accent dark:bg-accent" : "bg-muted")}
            >
              <span
                className={cn(
                  "pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform",
                  soundEffects ? "translate-x-5" : "translate-x-1"
                )}
              />
            </button>
          </div>
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <p className="font-medium">Low Stock Alerts</p>
              <p className="text-sm text-muted-foreground">
                Get notified when items are running low.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={lowStockAlerts}
              onClick={() => setLowStockAlerts(!lowStockAlerts)}
              className={cn(TOGGLE_CLASS, lowStockAlerts ? "bg-accent dark:bg-accent" : "bg-muted")}
            >
              <span
                className={cn(
                  "pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform",
                  lowStockAlerts ? "translate-x-5" : "translate-x-1"
                )}
              />
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Shop Information */}
      <Card className="glass shadow-lg border-white/5">
        <CardHeader>
          <CardTitle>Shop Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Shop Name</Label>
              <Input
                value={shopName}
                onChange={(e) => setShopName(e.target.value)}
                className="mt-1 bg-muted/50"
              />
            </div>
            <div>
              <Label>Station ID (e.g. POS-01)</Label>
              <Input
                value={stationId}
                onChange={(e) => setStationId(e.target.value)}
                className="mt-1 bg-muted/50 font-mono"
                placeholder="POS-01"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>KRA PIN</Label>
              <Input
                value={kraPin}
                onChange={(e) => setKraPin(e.target.value)}
                className="mt-1 bg-muted/50 font-mono"
              />
            </div>
            <div>
              <Label>Contact Phone</Label>
              <Input
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                className="mt-1 bg-muted/50"
              />
            </div>
          </div>
          <div>
            <Label>M-Pesa Till Number</Label>
            <Input
              value={mpesaTill}
              onChange={(e) => setMpesaTill(e.target.value)}
              className="mt-1 bg-muted/50 font-mono w-full md:w-1/2"
            />
          </div>
          <Button
            className="bg-[#43B02A] dark:bg-primary hover:bg-[#3a9824] dark:hover:opacity-90 text-white dark:text-primary-foreground"
            onClick={handleSaveShop}
          >
            <Save className="mr-2 size-4" />
            Save Changes
          </Button>
        </CardContent>
      </Card>

      {/* Receipt Customization */}
      <Card className="glass shadow-lg border-white/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Printer className="size-5" />
            Receipt Customization
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Customize what appears on printed receipts
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Receipt Header</Label>
            <p className="text-xs text-muted-foreground mb-1">Shown above the item list on every receipt (e.g. your address, tagline)</p>
            <textarea
              value={receiptHeader}
              onChange={(e) => setReceiptHeader(e.target.value)}
              rows={3}
              placeholder="e.g. 123 Moi Avenue, Nairobi | Tel: 0712 345 678"
              className="mt-1 w-full rounded-md border border-input bg-muted/50 px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
            />
          </div>
          <div>
            <Label>Receipt Footer</Label>
            <p className="text-xs text-muted-foreground mb-1">Shown below items on every receipt (e.g. thank you message, return policy)</p>
            <textarea
              value={receiptFooter}
              onChange={(e) => setReceiptFooter(e.target.value)}
              rows={3}
              placeholder="Thank you for shopping with us!"
              className="mt-1 w-full rounded-md border border-input bg-muted/50 px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
            />
          </div>
          <div className="w-48">
            <Label>VAT Rate (%)</Label>
            <Input
              type="number"
              min={0}
              max={100}
              step={0.1}
              value={vatRate}
              onChange={(e) => setVatRate(Number(e.target.value))}
              className="mt-1 bg-muted/50 font-mono"
            />
          </div>
          <Button
            className="bg-[#43B02A] dark:bg-primary hover:bg-[#3a9824] dark:hover:opacity-90 text-white dark:text-primary-foreground"
            onClick={handleSaveShop}
          >
            <Save className="mr-2 size-4" />
            Save Receipt Settings
          </Button>
        </CardContent>
      </Card>

      {/* Tax & eTIMS Export */}
      <Card className="glass shadow-lg border-white/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="size-5" />
            Tax & eTIMS Export
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Export tax records for Kenya Revenue Authority compliance
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
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

          <div className="flex flex-wrap items-end gap-4">
            <div>
              <Label>Start Date</Label>
              <Input
                type="date"
                value={taxStartDate}
                onChange={(e) => setTaxStartDate(e.target.value)}
                className="mt-1 w-40 bg-muted/50"
              />
            </div>
            <div>
              <Label>End Date</Label>
              <Input
                type="date"
                value={taxEndDate}
                onChange={(e) => setTaxEndDate(e.target.value)}
                className="mt-1 w-40 bg-muted/50"
              />
            </div>
            <Button
              className="bg-[#43B02A] dark:bg-primary hover:bg-[#3a9824] dark:hover:opacity-90 text-white dark:text-primary-foreground"
              disabled={taxExporting}
              onClick={handleTaxExport}
            >
              <Download className="mr-2 size-4" />
              {taxExporting ? "Exporting..." : "Export KRA eTIMS CSV"}
            </Button>
          </div>

          <div className="rounded-lg border p-4 bg-muted/20">
            <h4 className="font-medium mb-2">KRA eTIMS Submission Guidelines</h4>
            <div className="text-sm text-muted-foreground space-y-1">
              <p>1. Download the CSV file for your desired date range.</p>
              <p>2. Log in to the KRA eTIMS portal at <a href="https://etims.kra.go.ke" target="_blank" rel="noopener noreferrer" className="text-[#43B02A] underline">etims.kra.go.ke</a>.</p>
              <p>3. Navigate to &quot;Bulk Upload&quot; section.</p>
              <p>4. Upload the CSV file and submit for processing.</p>
              <p>5. Wait for KRA confirmation email (usually within 24 hours).</p>
            </div>
          </div>

          {/* Live eTIMS submission — only shown when enabled in connection settings */}
          {etimsEnabled && (
            <div className="rounded-lg border border-blue-200 dark:border-blue-800 p-4 bg-blue-50/50 dark:bg-blue-950/20 space-y-3">
              <div className="flex items-center gap-2">
                <Zap className="size-4 text-blue-600 dark:text-blue-400" />
                <h4 className="font-medium text-blue-800 dark:text-blue-200">Live eTIMS Submission</h4>
              </div>
              <p className="text-xs text-blue-700 dark:text-blue-300">
                Direct API submission requires <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">ENABLE_ETIMS=true</code> in backend <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">.env</code> file.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="border-blue-400 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900"
                disabled={etimsSubmitting || !taxStartDate || !taxEndDate}
                onClick={async () => {
                  if (!taxStartDate || !taxEndDate) {
                    toast.error("Select date range above first");
                    return;
                  }
                  setEtimsSubmitting(true);
                  try {
                    const params = new URLSearchParams({ start_date: taxStartDate, end_date: taxEndDate });
                    const res = await fetch(apiUrl(`tax/submit-to-etims?${params.toString()}`), { method: "POST" });
                    const data = await res.json().catch(() => ({}));
                    if (res.ok) {
                      toast.success("eTIMS submission successful");
                    } else {
                      toast.error("eTIMS submission failed", { description: (data as { detail?: string }).detail ?? res.statusText });
                    }
                  } catch (e) {
                    toast.error("eTIMS submission error", { description: String(e) });
                  } finally {
                    setEtimsSubmitting(false);
                  }
                }}
              >
                <Zap className="mr-2 size-4" />
                {etimsSubmitting ? "Submitting..." : "Submit to KRA"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* M-Pesa API Configuration */}
      <Card className="glass shadow-lg border-white/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="size-5" />
            M-Pesa API Configuration
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Configure Daraja API credentials for M-Pesa payments
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Environment Selector */}
          <div>
            <Label>Environment</Label>
            <div className="flex gap-4 mt-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="mpesa-env"
                  checked={mpesaEnv === "sandbox"}
                  onChange={() => setMpesaEnv("sandbox")}
                  className="rounded-full"
                />
                <span className="text-sm">Sandbox (Testing)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="mpesa-env"
                  checked={mpesaEnv === "production"}
                  onChange={() => setMpesaEnv("production")}
                  className="rounded-full"
                />
                <span className="text-sm">Production (Live)</span>
              </label>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {mpesaEnv === "sandbox"
                ? "Using sandbox.safaricom.co.ke for testing"
                : "Using api.safaricom.co.ke for live transactions"}
            </p>
          </div>

          {/* API Credentials */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Consumer Key</Label>
              <div className="relative">
                <Input
                  type={showApiKeys ? "text" : "password"}
                  value={consumerKey}
                  onChange={(e) => setConsumerKey(e.target.value)}
                  className="mt-1 bg-muted/50 font-mono pr-10"
                  placeholder="Enter consumer key"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKeys(!showApiKeys)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 mt-0.5 text-muted-foreground hover:text-foreground"
                >
                  {showApiKeys ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>

            <div>
              <Label>Consumer Secret</Label>
              <Input
                type={showApiKeys ? "text" : "password"}
                value={consumerSecret}
                onChange={(e) => setConsumerSecret(e.target.value)}
                className="mt-1 bg-muted/50 font-mono"
                placeholder="Enter consumer secret"
              />
            </div>

            <div>
              <Label>Passkey</Label>
              <Input
                type={showApiKeys ? "text" : "password"}
                value={darajaPasskey}
                onChange={(e) => setDarajaPasskey(e.target.value)}
                className="mt-1 bg-muted/50 font-mono"
                placeholder="Enter passkey"
              />
            </div>

            <div>
              <Label>Business Shortcode</Label>
              <Input
                type="text"
                value={darajaShortcode}
                onChange={(e) => setDarajaShortcode(e.target.value)}
                className="mt-1 bg-muted/50 font-mono"
                placeholder="174379"
              />
            </div>
          </div>

          {/* Info Banner */}
          <div className="rounded-lg border bg-blue-50/50 dark:bg-blue-950/20 dark:border-blue-800 p-4">
            <div className="flex gap-3">
              <Info className="size-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
              <div className="text-sm text-blue-700 dark:text-blue-300">
                <p className="font-medium mb-1">Secure Credential Storage</p>
                <p>Your API credentials are stored in the .env file and masked when displayed. Only update fields you want to change.</p>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleTestConnection}
              disabled={testingConnection}
            >
              <Zap className="mr-2 size-4" />
              {testingConnection ? "Testing..." : "Test Connection"}
            </Button>
            <Button
              className="bg-[#43B02A] dark:bg-primary hover:bg-[#3a9824] dark:hover:opacity-90 text-white dark:text-primary-foreground"
              onClick={handleSaveApiKeys}
              disabled={apiKeysLoading}
            >
              <Save className="mr-2 size-4" />
              {apiKeysLoading ? "Saving..." : "Save API Keys"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Automatic Backups */}
      <Card className="glass shadow-lg border-white/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="size-5" />
            Automatic Backups
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Daily backups at 8:00 AM
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <p className="font-medium">Enable Automatic Backups</p>
              <p className="text-sm text-muted-foreground">
                Daily backups at 8:00 AM
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={autoBackup}
              onClick={() => setAutoBackup(!autoBackup)}
              className={cn(TOGGLE_CLASS, autoBackup ? "bg-accent dark:bg-accent" : "bg-muted")}
            >
              <span
                className={cn(
                  "pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform",
                  autoBackup ? "translate-x-5" : "translate-x-1"
                )}
              />
            </button>
          </div>
          {autoBackup && (
            <div className="rounded-lg border bg-muted/30 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-emerald-600">
                <Check className="size-4" />
                Backup Status: Active
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {backupHistory.length > 0
                  ? `Last backup: ${formatBackupDate(backupHistory[0].created_at)} (${formatBackupSize(backupHistory[0].size_bytes)})`
                  : "No backups yet. Create one below."}
              </p>
            </div>
          )}
          <Button variant="outline" className="w-full sm:w-auto" disabled={backupLoading} onClick={handleManualBackup}>
            <Download className="mr-2 size-4" />
            {backupLoading ? "Creating..." : "Create Manual Backup Now"}
          </Button>
        </CardContent>
      </Card>

      {/* Backup History */}
      <Card className="glass shadow-lg border-white/5">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Database className="size-5" />
                Backup History
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Recent database backups
              </p>
            </div>
            <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium">
              {backupHistory.length} Backups
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {backupHistory.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    No backups yet. Create one with the button above.
                  </TableCell>
                </TableRow>
              ) : (
                backupHistory.map((row) => (
                  <TableRow key={row.filename}>
                    <TableCell className="font-mono">
                      <span className="flex items-center gap-1.5">
                        <Clock className="size-3.5 text-muted-foreground" />
                        {formatBackupDate(row.created_at)}
                      </span>
                    </TableCell>
                    <TableCell>{formatBackupSize(row.size_bytes)}</TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600">
                        <Check className="size-3" />
                        Completed
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <a
                          href={apiUrl("system/backups/download/" + encodeURIComponent(row.filename))}
                          download={row.filename}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center size-8 rounded-md hover:bg-accent"
                          title="Download backup"
                        >
                          <Download className="size-4" />
                        </a>
                        <button
                          type="button"
                          title="Restore from this backup"
                          disabled={restoringBackup !== null}
                          onClick={() => handleRestoreBackup(row.filename)}
                          className="inline-flex items-center justify-center size-8 rounded-md hover:bg-accent text-amber-600 dark:text-amber-400 disabled:opacity-50"
                        >
                          {restoringBackup === row.filename ? (
                            <span className="size-4 animate-spin border-2 border-current border-t-transparent rounded-full" />
                          ) : (
                            <RotateCcw className="size-4" />
                          )}
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* System Information */}
      <Card className="glass shadow-lg border-white/5">
        <CardHeader>
          <CardTitle>System Information</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-1">
          <p>Version: v1.0.0</p>
          <p>Database Size: 45 MB</p>
        </CardContent>
      </Card>

      {/* API & Multi-Terminal (Host / Client mode) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Server className="h-5 w-5" />
            Connection Mode & Multi-Terminal
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="block mb-2">Connection Mode</Label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="connection-mode"
                  checked={connectionMode === "host"}
                  onChange={() => setConnectionModeState("host")}
                  className="rounded-full"
                />
                <span>Host (this PC)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="connection-mode"
                  checked={connectionMode === "client"}
                  onChange={() => setConnectionModeState("client")}
                  className="rounded-full"
                />
                <span>Client (another PC)</span>
              </label>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Host: this computer runs the backend. Client: connect to a Host PC on the LAN.
            </p>
          </div>
          {connectionMode === "client" && (
            <div>
              <Label htmlFor="api-base-url">Host PC address (API Base URL)</Label>
              <Input
                id="api-base-url"
                type="url"
                value={apiBaseUrl}
                onChange={(e) => setApiBaseUrl(e.target.value)}
                placeholder="http://192.168.88.10:8000"
                className="mt-2 font-mono"
              />
              <p className="mt-1 text-sm text-muted-foreground">
                Enter the Master/Host PC IP and port, e.g. <code className="rounded bg-muted px-1">http://192.168.88.10:8000</code>.
              </p>
            </div>
          )}
          <Button variant="outline" onClick={handleSaveApi}>
            {saved ? "Saved" : "Save connection & eTIMS"}
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileCheck className="h-5 w-5" />
            KRA eTIMS Integration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <p className="font-medium">Enable KRA eTIMS Integration</p>
              <p className="text-sm text-muted-foreground">
                When disabled: use local Invoice_ID only. When enabled: prepare transaction payload for future POST to local VSCU service.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={etimsEnabled}
              onClick={() => setEtimsEnabledState(!etimsEnabled)}
              className={cn(TOGGLE_CLASS, etimsEnabled ? "bg-primary" : "bg-input")}
            >
              <span
                className={cn(
                  "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-background shadow ring-0 transition-transform",
                  etimsEnabled ? "translate-x-5" : "translate-x-1"
                )}
              />
            </button>
          </div>
        </CardContent>
      </Card>
      <Button onClick={handleSaveApi} className="gap-2" disabled={saved}>
        <Save className="h-4 w-4" />
        {saved ? "Saved" : "Save API settings"}
      </Button>
    </div>
  );
}
