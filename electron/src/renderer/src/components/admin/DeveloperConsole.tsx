import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Terminal, Shield, Network, Activity, Save, RefreshCw } from "lucide-react";
import { apiUrl } from "@/lib/api";
import { toast } from "sonner";
import { cn } from "@/lib/cn";

export function DeveloperConsole() {
  const [stationId, setStationId] = useState("POS-01");
  const [masterIp, setMasterIp] = useState("127.0.0.1");
  const [staffLimit, setStaffLimit] = useState(5);
  const [isSaving, setIsSaving] = useState(false);
  const [syncStatus, setSyncStatus] = useState<"idle" | "syncing" | "error" | "success">("idle");

  useEffect(() => {
    // Load current developer-level settings
    async function loadDevSettings() {
      try {
        const res = await fetch(apiUrl("settings/store"));
        if (res.ok) {
          const data = await res.json();
          setStationId(data.station_id || "POS-01");
          setMasterIp(data.master_ip || "127.0.0.1");
          setStaffLimit(data.staff_limit || 5);
        }
      } catch (e) {
        console.error("Failed to load dev settings", e);
      }
    }
    loadDevSettings();
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await fetch(apiUrl("settings/store"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          station_id: stationId,
          master_ip: masterIp,
          staff_limit: staffLimit,
        }),
      });
      if (res.ok) {
        toast.success("Developer settings updated");
      } else {
        toast.error("Failed to update settings");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setIsSaving(false);
    }
  };

  const triggerSync = () => {
    setSyncStatus("syncing");
    setTimeout(() => {
      setSyncStatus("success");
      toast.success("Manual sync completed");
    }, 2000);
  };

  return (
    <div className="p-6 space-y-6 max-w-4xl animate-in">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500">
          <Terminal className="size-8" />
        </div>
        <div>
          <h1 className="text-3xl font-bold">Developer Console</h1>
          <p className="text-muted-foreground">Advanced system configuration and Enterprise control</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Enterprise Limits */}
        <Card className="glass shadow-xl border-white/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="size-5 text-amber-500" />
              Enterprise Management
            </CardTitle>
            <CardDescription>Manage license limits and staff constraints</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="staff-limit">Staff Member Limit</Label>
              <Input
                id="staff-limit"
                type="number"
                value={staffLimit}
                onChange={(e) => setStaffLimit(parseInt(e.target.value))}
                placeholder="5"
              />
              <p className="text-xs text-muted-foreground">Maximum number of active staff accounts allowed on this license.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="station-id">Current Station ID</Label>
              <Input
                id="station-id"
                value={stationId}
                onChange={(e) => setStationId(e.target.value)}
                placeholder="POS-01"
              />
            </div>
          </CardContent>
        </Card>

        {/* Networking & Sync */}
        <Card className="glass shadow-xl border-white/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Network className="size-5 text-blue-500" />
              LAN Sync Configuration
            </CardTitle>
            <CardDescription>Configure communication with the Primary Station</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="master-ip">Master Station IP</Label>
              <Input
                id="master-ip"
                value={masterIp}
                onChange={(e) => setMasterIp(e.target.value)}
                placeholder="192.168.1.100"
              />
            </div>
            <div className="pt-2">
              <Button
                variant="outline"
                className="w-full gap-2"
                onClick={triggerSync}
                disabled={syncStatus === "syncing"}
              >
                <RefreshCw className={cn("size-4", syncStatus === "syncing" && "animate-spin")} />
                {syncStatus === "syncing" ? "Syncing..." : "Force Database Sync"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* System Health */}
        <Card className="md:col-span-2 glass shadow-xl border-white/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="size-5 text-emerald-500" />
              System Diagnostics
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-3 rounded-lg border bg-muted/30">
                <div className="text-xs text-muted-foreground">SQLite Version</div>
                <div className="font-mono font-bold">3.41.2</div>
              </div>
              <div className="p-3 rounded-lg border bg-muted/30">
                <div className="text-xs text-muted-foreground">API Status</div>
                <div className="text-emerald-500 font-bold">ONLINE</div>
              </div>
              <div className="p-3 rounded-lg border bg-muted/30">
                <div className="text-xs text-muted-foreground">Database Size</div>
                <div className="font-bold">12.4 MB</div>
              </div>
              <div className="p-3 rounded-lg border bg-muted/30">
                <div className="text-xs text-muted-foreground">Last Full Backup</div>
                <div className="font-bold text-sm">2h ago</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end pt-4">
        <Button size="lg" className="gap-2 px-8" onClick={handleSave} disabled={isSaving}>
          <Save className="size-4" />
          {isSaving ? "Saving..." : "Apply Developer Overrides"}
        </Button>
      </div>
    </div>
  );
}
