import { useState, useEffect } from "react";
import { AdminSidebar } from "./AdminSidebar";
import { DashboardScreen, type LowStockProduct } from "./DashboardScreen";
import { InventoryManagerScreen } from "./InventoryManagerScreen";
import { TaxEtimsScreen } from "./TaxEtimsScreen";
import { StaffManagementScreen } from "./UserManagementScreen";
import { CustomerManagementScreen } from "./CustomerManagementScreen";
import { SalesReportsScreen } from "./SalesReportsScreen";
import { DetailedReportsScreen } from "./DetailedReportsScreen";
import { CashierAuditScreen } from "./CashierAuditScreen";
import { DeveloperConsole } from "./DeveloperConsole";
import { apiUrl } from "@/lib/api";
import { SettingsView } from "@/components/SettingsView";
import { ErrorBoundary } from "@/components/ErrorBoundary";

interface AdminDashboardProps {
  /** Cashiers get read-only access to Dashboard, Sales, Inventory, Customers only. */
  userRole?: "admin" | "cashier" | "developer";
  isOnline: boolean;
  shopName?: string;
  onGenerateZReport: () => void;
  onManualBackup: () => void;
  onShopSettingsSaved?: () => void;
  darkMode?: boolean;
  onToggleDarkMode?: () => void;
}

interface ProductFromApi {
  id: number;
  name: string;
  barcode: string;
  stock_quantity: number;
  min_stock_alert?: number;
}

export function AdminDashboard({
  userRole = "admin",
  isOnline,
  shopName = "DukaPOS",
  onGenerateZReport,
  onManualBackup,
  onShopSettingsSaved,
  darkMode,
  onToggleDarkMode,
}: AdminDashboardProps) {
  const isCashier = userRole === "cashier";
  const [currentSection, setCurrentSection] = useState("dashboard");
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  // Cashiers must not access users, tax, settings
  useEffect(() => {
    if (isCashier && ["users", "tax", "settings"].includes(currentSection)) {
      setCurrentSection("dashboard");
    }
  }, [isCashier, currentSection]);

  const [dailyStats, setDailyStats] = useState({
    totalCash: 0,
    totalMpesa: 0,
    netProfit: 0,
    vatCollected: 0,
    activeTills: 1,
  });
  const [lowStockProducts, setLowStockProducts] = useState<LowStockProduct[]>([]);

  useEffect(() => {
    async function fetchSummary() {
      try {
        const res = await fetch(apiUrl("dashboard/summary"));
        if (!res.ok) return;
        const data = await res.json();
        if (data && typeof data === "object") {
          setDailyStats({
            totalCash: Number(data.total_cash) || 0,
            totalMpesa: Number(data.total_mpesa) || 0,
            netProfit: Number(data.net_profit) || 0,
            vatCollected: Number(data.vat_collected) || 0,
            activeTills: 1,
          });
        }
      } catch {
        /* keep defaults */
      }
    }
    fetchSummary();
  }, [currentSection]);

  useEffect(() => {
    async function fetchProducts() {
      try {
        const res = await fetch(apiUrl("products"));
        if (!res.ok) return;
        const list = await res.json();
        const arr = Array.isArray(list) ? list : [];
        const low = arr
          .filter((p: ProductFromApi) => p && p.stock_quantity > 0 && p.stock_quantity <= (p.min_stock_alert ?? 10))
          .map((p: ProductFromApi) => ({
            id: p.id,
            name: p.name,
            category: undefined,
            stock: p.stock_quantity,
          }));
        setLowStockProducts(low);
      } catch {
        setLowStockProducts([]);
      }
    }
    fetchProducts();
  }, []);

  return (
    <div className="flex h-full bg-background overflow-hidden animate-in">
      <AdminSidebar
        currentSection={currentSection}
        onSectionChange={setCurrentSection}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        shopName={shopName}
        isOnline={isOnline}
        userRole={userRole}
      />

      <div className="flex-1 overflow-y-auto pl-6 pr-4 no-scrollbar">
        {currentSection === "dashboard" && (
          <ErrorBoundary>
            <DashboardScreen
              stats={dailyStats}
              lowStockProducts={lowStockProducts}
              onGenerateZReport={onGenerateZReport}
              onManualBackup={onManualBackup}
              readOnly={isCashier}
            />
          </ErrorBoundary>
        )}
        {currentSection === "sales" && (
          <ErrorBoundary>
            <SalesReportsScreen />
          </ErrorBoundary>
        )}
        {currentSection === "detailed-sales" && (
          <ErrorBoundary>
            <DetailedReportsScreen />
          </ErrorBoundary>
        )}
        {!isCashier && currentSection === "cashier-audit" && (
          <ErrorBoundary>
            <CashierAuditScreen />
          </ErrorBoundary>
        )}
        {currentSection === "inventory" && (
          <ErrorBoundary>
            <InventoryManagerScreen readOnly={isCashier} />
          </ErrorBoundary>
        )}
        {!isCashier && currentSection === "users" && (
          <ErrorBoundary>
            <StaffManagementScreen />
          </ErrorBoundary>
        )}
        {currentSection === "customers" && (
          <ErrorBoundary>
            <CustomerManagementScreen readOnly={isCashier} />
          </ErrorBoundary>
        )}
        {!isCashier && currentSection === "tax" && (
          <ErrorBoundary>
            <TaxEtimsScreen />
          </ErrorBoundary>
        )}
        {!isCashier && currentSection === "settings" && (
          <div className="p-0 overflow-y-auto">
            <ErrorBoundary>
              <SettingsView
                darkMode={darkMode}
                onToggleDarkMode={onToggleDarkMode}
                onShopSettingsSaved={onShopSettingsSaved}
              />
            </ErrorBoundary>
          </div>
        )}
        {currentSection === "developer" && (userRole === "developer" || userRole === "admin") && (
          <ErrorBoundary>
            <DeveloperConsole />
          </ErrorBoundary>
        )}
      </div>
    </div>
  );
}
