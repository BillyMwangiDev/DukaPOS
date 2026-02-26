import { cn } from "@/lib/cn";
import {
  Home,
  BarChart3,
  Package,
  Users,
  CreditCard,
  Settings,
  ChevronLeft,
  Wifi,
  WifiOff,
  Receipt,
  UserCheck,
  Terminal,
  Truck,
  Tags,
} from "lucide-react";
import { Button } from "@/components/ui/button";

interface AdminSidebarProps {
  currentSection: string;
  onSectionChange: (section: string) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  shopName: string;
  isOnline: boolean;
  /** Cashiers see only Dashboard, Sales, Inventory, Customers (all read-only). */
  userRole?: "admin" | "cashier" | "developer";
}

const allMenuItems = [
  { id: "dashboard", label: "Dashboard", icon: Home },
  { id: "sales", label: "Sales Reports", icon: BarChart3 },
  { id: "detailed-sales", label: "Itemized Sales", icon: Receipt },
  { id: "receipts-history", label: "Receipt History", icon: Receipt },
  { id: "cashier-audit", label: "Cashier Audit", icon: UserCheck },

  { id: "inventory", label: "Inventory / Stock", icon: Package },
  { id: "suppliers", label: "Suppliers & POs", icon: Truck },
  { id: "users", label: "Users & Staff", icon: Users },
  { id: "customers", label: "Customers (Credit)", icon: CreditCard },
  { id: "discounts", label: "Discounts & Promos", icon: Tags },
  { id: "settings", label: "Settings & Backups", icon: Settings },
  { id: "developer", label: "Developer Tools", icon: Terminal },
];



export function AdminSidebar({
  currentSection,
  onSectionChange,
  isCollapsed,
  onToggleCollapse,
  shopName,
  isOnline,
}: AdminSidebarProps) {
  const menuItems = allMenuItems;
  return (
    <aside
      className={cn(
        "h-full glass border-r flex flex-col transition-all duration-300 z-20",
        isCollapsed ? "w-16" : "w-64"
      )}
    >
      <div className="p-4 border-b border-slate-200 dark:border-slate-700">
        {!isCollapsed && (
          <div className="mb-3">
            <h2 className="font-semibold text-lg text-slate-800 dark:text-foreground">{shopName}</h2>
            <div className="flex items-center gap-2 mt-1">
              {isOnline ? (
                <>
                  <Wifi className="size-3 text-emerald-400" />
                  <span className="text-xs text-emerald-400 font-medium">
                    ONLINE (Syncing)
                  </span>
                </>
              ) : (
                <>
                  <WifiOff className="size-3 text-rose-400" />
                  <span className="text-xs text-rose-400 font-medium">OFFLINE</span>
                </>
              )}
            </div>
          </div>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggleCollapse}
          className="w-full justify-center text-slate-600 dark:text-muted-foreground dark:hover:text-foreground dark:hover:bg-accent hover:text-slate-900 hover:bg-slate-100"
        >
          <ChevronLeft
            className={cn("size-4 transition-transform", isCollapsed && "rotate-180")}
          />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <nav className="p-2 space-y-1">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentSection === item.id;
            return (
              <Button
                key={item.id}
                variant="ghost"
                title={isCollapsed ? item.label : undefined}
                className={cn(
                  "w-full justify-start",
                  isCollapsed && "justify-center px-2",
                  isActive
                    ? "bg-[#43B02A] dark:bg-primary hover:bg-[#3a9824] dark:hover:opacity-90 text-white dark:text-primary-foreground"
                    : "text-slate-700 dark:text-muted-foreground hover:bg-slate-100 dark:hover:bg-accent hover:text-slate-900 dark:hover:text-foreground"
                )}
                onClick={() => onSectionChange(item.id)}
              >
                <Icon className={cn("size-5", !isCollapsed && "mr-3")} />
                {!isCollapsed && <span>{item.label}</span>}
              </Button>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
