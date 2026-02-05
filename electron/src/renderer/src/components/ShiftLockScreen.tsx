import { useState } from "react";
import { Lock, Delete, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { apiUrl } from "@/lib/api";
import { toast } from "sonner";
import type { LoggedInUser } from "./LoginScreen";

interface ShiftLockScreenProps {
  user: LoggedInUser;
  onUnlock: () => void;
  onLogout: () => void;
}

const NUMPAD_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "C"];

export function ShiftLockScreen({ user, onUnlock, onLogout }: ShiftLockScreenProps) {
  const [pin, setPin] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);

  const handleKey = (key: string) => {
    if (key === "C") {
      setPin("");
      return;
    }
    if (key === "" || pin.length >= 6) return;
    setPin((p) => p + key);
  };

  const handleSubmit = async () => {
    if (pin.length < 4) return;
    setIsVerifying(true);
    try {
      const res = await fetch(apiUrl("staff/verify-staff-pin"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staff_id: user.id, pin }),
      });

      if (res.ok) {
        onUnlock();
        toast.success("Welcome back");
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.detail || "Invalid PIN");
        setPin("");
      }
    } catch {
      toast.error("Connection error");
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-background/95 backdrop-blur-md flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm flex flex-col items-center gap-8 animate-in fade-in zoom-in duration-300">
        {/* Header Information */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-primary/10 mb-4 ring-8 ring-primary/5">
            <Lock className="size-10 text-primary animate-pulse" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Terminal Locked</h1>
          <p className="text-muted-foreground">
            Current Session: <span className="font-semibold text-foreground">{user.username}</span>
          </p>
          <p className="text-xs text-muted-foreground max-w-[240px] mx-auto">
            Please enter your PIN to resume. Admin or Developer PINs can also unlock this terminal.
          </p>
        </div>

        {/* PIN Display */}
        <div className="space-y-6 w-full">
          <div
            className={cn(
              "h-16 w-full rounded-2xl border-2 bg-muted/30 flex items-center justify-center font-mono text-3xl tracking-[1.5em] pl-[1.5em] shadow-inner transition-colors duration-200",
              pin.length >= 4 ? "border-primary/50 bg-primary/5" : "border-border"
            )}
          >
            {"•".repeat(pin.length)}
            <span className={cn("inline-block w-[3px] h-8 bg-primary/50 ml-1 animate-caret", pin.length >= 6 && "hidden")} />
          </div>

          {/* Keypad */}
          <div className="grid grid-cols-3 gap-4">
            {NUMPAD_KEYS.map((key, i) =>
              key === "" ? (
                <div key={`empty-${i}`} />
              ) : (
                <Button
                  key={key}
                  variant="ghost"
                  className={cn(
                    "h-20 text-2xl font-semibold rounded-2xl border border-transparent hover:border-border hover:bg-muted/50 transition-all active:scale-95 shadow-sm",
                    key === "C" && "text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/20"
                  )}
                  onClick={() => handleKey(key)}
                  disabled={isVerifying}
                >
                  {key === "C" ? <Delete className="size-8" /> : key}
                </Button>
              )
            )}
          </div>

          <div className="grid grid-cols-2 gap-4 pt-4">
            <Button
              variant="outline"
              size="lg"
              className="h-14 gap-2 text-muted-foreground border-dashed"
              onClick={onLogout}
              disabled={isVerifying}
            >
              <LogOut className="size-5" />
              Switch User
            </Button>
            <Button
              size="lg"
              className="h-14 font-bold text-lg"
              onClick={handleSubmit}
              disabled={pin.length < 4 || isVerifying}
            >
              {isVerifying ? "Verifying..." : "Unlock Now"}
            </Button>
          </div>
        </div>
      </div>

      {/* Bottom Branding */}
      <div className="fixed bottom-12 flex items-center gap-2 opacity-30 grayscale blur-[0.5px]">
        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
          <span className="text-white font-bold text-lg">D</span>
        </div>
        <span className="font-bold text-lg">DukaPOS Enterprise</span>
      </div>
    </div>
  );
}
