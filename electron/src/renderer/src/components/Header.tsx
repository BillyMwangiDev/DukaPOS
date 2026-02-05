import logo from "@/assets/poslogo.png";
import { useRef } from "react";
import { Search, Wifi, Printer, User, Moon, Sun } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

interface LoggedInUser {
  id: number;
  username: string;
  role: string;
}

interface HeaderProps {
  onSearch: (query: string) => void;
  isOnline: boolean;
  isPrinterConnected: boolean;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  returnMode?: boolean;
  searchInputRef?: React.RefObject<HTMLInputElement | null>;
  /** Shop name from database (Settings > Store). Updates when saved in Admin. */
  shopName?: string;
  /** Logged-in user; show name and Logout. */
  currentUser?: LoggedInUser | null;
  onLogout?: () => void;
  onBarcodeSearch?: (barcode: string) => void;
}

export function Header({
  onSearch,
  isOnline,
  isPrinterConnected,
  darkMode,
  onToggleDarkMode,
  returnMode,
  searchInputRef,
  shopName,
  currentUser,
  onLogout,
  onBarcodeSearch,
}: HeaderProps) {
  const defaultRef = useRef<HTMLInputElement>(null);
  const inputRef = searchInputRef ?? defaultRef;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      const value = (e.target as HTMLInputElement).value.trim();
      if (value) onSearch(value);
    }
  };

  const handleBarcodeKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      const value = (e.target as HTMLInputElement).value.trim();
      if (value && onBarcodeSearch) {
        onBarcodeSearch(value);
        (e.target as HTMLInputElement).value = "";
      }
    }
  };

  return (
    <header
      className={cn(
        "h-16 border-b bg-card px-6 flex items-center justify-between gap-4 shrink-0",
        returnMode && "dark:bg-return-bg/80 dark:border-return-border border-red-800"
      )}
    >
      {/* Logo - Custom User Provided Logo */}
      <div className="flex items-center gap-2">
        <div className="w-10 h-10 rounded-lg overflow-hidden shadow-sm">
          <img src={logo} alt="DukaPOS Logo" className="w-full h-full object-cover" />
        </div>
        <span className="font-bold text-xl truncate max-w-[200px]" title={shopName || "DukaPOS"}>
          {shopName?.trim() || "DukaPOS"}
        </span>
      </div>

      {/* Search Bar & Manual Input - center */}
      <div className="flex-1 max-w-2xl flex items-center gap-2">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            placeholder="Search product... [F2]"
            className="pl-10 h-10 bg-input-background border-border"
            onKeyDown={handleKeyDown}
          />
        </div>
        <div className="w-48 relative">
          <Input
            placeholder="Manual Barcode..."
            className="h-10 bg-input-background border-primary/20 focus:border-primary font-mono text-sm"
            onKeyDown={handleBarcodeKeyDown}
          />
        </div>
      </div>

      {/* Status & actions - right */}
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium",
            isOnline
              ? "bg-[#43B02A] dark:bg-primary text-white dark:text-primary-foreground"
              : "bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400"
          )}
        >
          <Wifi className={cn("size-4", isOnline ? "text-white dark:text-primary-foreground" : "text-red-600 dark:text-red-400")} />
          <span className="text-sm">
            {isOnline ? "Online" : "Offline"}
          </span>
        </div>
        <div
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-md",
            isPrinterConnected ? "bg-blue-50 dark:bg-slate-700" : "bg-gray-100 dark:bg-slate-700"
          )}
        >
          <Printer
            className={cn("size-4", isPrinterConnected ? "text-blue-600 dark:text-blue-400" : "text-muted-foreground")}
          />
        </div>
        <Button variant="ghost" size="icon" onClick={onToggleDarkMode} className="rounded-md">
          {darkMode ? <Sun className="size-5" /> : <Moon className="size-5" />}
        </Button>
        {currentUser && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground truncate max-w-[120px]" title={currentUser.username}>
              {currentUser.username}
            </span>
            {onLogout && (
              <Button variant="ghost" size="sm" onClick={onLogout} className="text-muted-foreground">
                Logout
              </Button>
            )}
          </div>
        )}
        {!currentUser && (
          <Button variant="ghost" size="icon" className="rounded-md">
            <User className="size-5" />
          </Button>
        )}
      </div>
    </header>
  );
}
