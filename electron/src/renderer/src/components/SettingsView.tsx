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
