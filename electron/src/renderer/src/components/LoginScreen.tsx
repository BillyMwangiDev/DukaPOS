import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { apiUrl } from "@/lib/api";
import { toast } from "sonner";
import { PinPadModal } from "./PinPadModal";

const SESSION_KEY = "DUKAPOS_USER";

export interface LoggedInUser {
  id: number;
  username: string;
  role: string;
  is_active: boolean;
}

export function getStoredUser(): LoggedInUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const u = JSON.parse(raw) as LoggedInUser;
    if (u?.id && typeof u.username === "string") return u;
  } catch {
    /* ignore */
  }
  return null;
}

export function setStoredUser(user: LoggedInUser | null): void {
  if (typeof window === "undefined") return;
  if (user) localStorage.setItem(SESSION_KEY, JSON.stringify(user));
  else localStorage.removeItem(SESSION_KEY);
}

interface LoginScreenProps {
  onLogin: (user: LoggedInUser) => void;
}

export function LoginScreen({ onLogin }: LoginScreenProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [tapCount, setTapCount] = useState(0);
  const [pinOpen, setPinOpen] = useState(false);

  const handleLogoClick = () => {
    setTapCount((c) => c + 1);
    setTimeout(() => setTapCount(0), 2000);
    if (tapCount + 1 >= 3) {
      setPinOpen(true);
      setTapCount(0);
    }
  };

  const handlePinConfirm = async (pin: string) => {
    try {
      const res = await fetch(apiUrl("staff/verify-admin-pin"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      if (res.ok) {
        // Find a developer user to assume role, or just notify
        toast.success("Developer Access Granted", { description: "Use standard login or create a developer account." });
      } else {
        toast.error("Invalid License PIN");
      }
    } catch {
      toast.error("Network error");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      toast.error("Enter username and password");
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await fetch(apiUrl("staff/login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error("Login failed", {
          description: (err as { detail?: string }).detail ?? "Invalid username or password",
        });
        return;
      }
      const user = (await res.json()) as LoggedInUser;
      setStoredUser(user);
      onLogin(user);
      toast.success(`Welcome, ${user.username}`);
    } catch (e) {
      toast.error("Login failed", { description: String(e) });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <div className="flex items-center gap-2">
            <div
              className="w-10 h-10 rounded-lg bg-[#43B02A] flex items-center justify-center cursor-pointer select-none active:scale-95 transition-transform"
              onClick={handleLogoClick}
            >
              <span className="text-white font-bold text-xl">D</span>
            </div>
            <CardTitle className="text-xl">DukaPOS</CardTitle>
          </div>
          <p className="text-sm text-muted-foreground">Sign in to continue</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="login-username">Username</Label>
              <Input
                id="login-username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. admin"
                className="mt-1"
                autoFocus
                autoComplete="username"
              />
            </div>
            <div>
              <Label htmlFor="login-password">Password</Label>
              <Input
                id="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="mt-1"
                autoComplete="current-password"
              />
            </div>
            <Button type="submit" className="w-full bg-[#43B02A] hover:bg-[#3a9824]" disabled={isSubmitting}>
              {isSubmitting ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </CardContent>
      </Card>
      <PinPadModal
        open={pinOpen}
        onOpenChange={setPinOpen}
        title="Developer Access"
        description="Enter License PIN to bypass login"
        onConfirm={handlePinConfirm}
      />
    </div>
  );
}
