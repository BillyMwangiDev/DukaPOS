import { useState, useEffect } from "react";
import { AdminSidebar } from "./AdminSidebar";
import { DashboardScreen, type LowStockProduct } from "./DashboardScreen";
import { InventoryManagerScreen } from "./InventoryManagerScreen";
import { StaffManagementScreen } from "./UserManagementScreen";
import { CustomerManagementScreen } from "./CustomerManagementScreen";
import { SalesReportsScreen } from "./SalesReportsScreen";
import { DetailedReportsScreen } from "./DetailedReportsScreen";
import { ReceiptsHistoryScreen } from "./ReceiptsHistoryScreen";
import { CashierAuditScreen } from "./CashierAuditScreen";
import { DeveloperConsole } from "./DeveloperConsole";
import { SuppliersScreen } from "./SuppliersScreen";
import { DiscountsScreen } from "./DiscountsScreen";
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

interface LowStockFromApi {
  id: number;
  name: string;
  stock_quantity: number;
  min_stock_alert: number;
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

  // Cashiers must not access users, settings, discounts
  useEffect(() => {
    if (isCashier && ["users", "settings", "discounts", "suppliers", "developer"].includes(currentSection)) {
      setCurrentSection("dashboard");
    }
  }, [isCashier, currentSection]);

  const [dailyStats, setDailyStats] = useState({
    totalCash: 0,
    totalMpesa: 0,
    totalBank: 0,
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
            totalMpesa: Number(data.total_mobile) || 0,
            totalBank: Number(data.total_bank) || 0,
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
    async function fetchLowStock() {
      try {
        const res = await fetch(apiUrl("reports/low-stock"));
        if (!res.ok) return;
        const list = await res.json();
        const arr = Array.isArray(list) ? list : [];
        setLowStockProducts(
          arr.map((p: LowStockFromApi) => ({
            id: p.id,
            name: p.name,
            stock: p.stock_quantity,
            threshold: p.min_stock_alert,
          }))
        );
      } catch {
        setLowStockProducts([]);
      }
    }
    fetchLowStock();
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

      <div className="flex-1 overflow-y-auto pl-6 pr-4 custom-scrollbar">
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
        {currentSection === "receipts-history" && (
          <ErrorBoundary>
            <ReceiptsHistoryScreen />
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
        {!isCashier && currentSection === "suppliers" && (
          <ErrorBoundary>
            <SuppliersScreen />
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
        {!isCashier && currentSection === "discounts" && (
          <ErrorBoundary>
            <DiscountsScreen />
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
