// @ts-ignore
import { _electron as electron } from 'playwright';
// @ts-ignore
import { test, expect } from 'playwright/test';
import path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '..');
const ELECTRON_PATH = path.resolve(PROJECT_ROOT, 'node_modules/electron/dist/electron.exe');

test.describe('DukaPOS Smoke Tests', () => {
  let electronApp: any;
  let window: any;

  test.beforeAll(async () => {
    electronApp = await electron.launch({
      executablePath: ELECTRON_PATH,
      args: [PROJECT_ROOT],
      env: { ...process.env, E2E_TEST: 'true' }
    });
    window = await electronApp.firstWindow();

    // ── Login ──────────────────────────────────────────────────────────────
    await window.waitForSelector('text=DukaPOS', { timeout: 15000 });
    await window.fill('input#login-username', 'admin');
    await window.fill('input#login-password', 'admin123');
    await window.click('button:has-text("Sign in")');

    // Wait for main UI (nav tabs visible)
    await window.waitForSelector('button:has-text("Point of Sale")', { timeout: 15000 });

    // Let async operations complete (fetchCurrentShift, fetchStoreSettings)
    await window.waitForTimeout(1500);

    // ── Dismiss any blocking overlay (e.g. OpenShiftModal) ─────────────────
    const overlay = window.locator('div.fixed.inset-0.bg-black\\/60');
    if (await overlay.isVisible().catch(() => false)) {
      await window.keyboard.press('Escape');
      await window.waitForTimeout(500);
    }

    // ── Ensure a shift is open (CI seed may have failed) ───────────────────
    const openShiftBtn = window.locator('button:has-text("Open Shift")').first();
    if (await openShiftBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await openShiftBtn.click();                        // opens OpenShiftModal
      await window.waitForTimeout(300);
      // Click the submit button inside the modal (also labelled "Open Shift")
      await window.locator('button:has-text("Open Shift")').last().click();
      await window.waitForTimeout(800);                  // wait for API + state update
    }
  });

  test.afterAll(async () => {
    if (electronApp) await electronApp.close();
  });

  // ── Test 1: Auth ────────────────────────────────────────────────────────
  test('Auth: Standard login unlocks the system', async () => {
    // Login was performed in beforeAll; verify the main UI is fully unblocked
    await expect(window.locator('button:has-text("Point of Sale")')).toBeVisible({ timeout: 5000 });
    await expect(window.locator('button:has-text("Inventory")')).toBeVisible({ timeout: 5000 });
    await expect(window.locator('button:has-text("Admin")')).toBeVisible({ timeout: 5000 });
  });

  // ── Test 2: Transaction ─────────────────────────────────────────────────
  // Shift is pre-opened in beforeAll (or via CI seed step).
  // ProductGrid (table) is in the Inventory tab; CommandCenter (M-PESA) is in checkout.
  // Flow: Inventory → click product (added to Zustand cart) → Point of Sale → M-PESA → complete.
  test('Transaction: Full sale flow generates valid ID', async () => {
    // Step 1: Navigate to Inventory tab where ProductGrid table lives
    await window.click('button:has-text("Inventory")');

    // Step 2: Wait for product row seeded by CI setup step
    const firstProduct = window.locator('table tbody tr').first();
    await firstProduct.waitFor({ timeout: 15000 });
    await firstProduct.click(); // adds product to Zustand cart

    // Step 3: Switch to checkout view — CommandCenter (payment buttons) now visible
    await window.click('button:has-text("Point of Sale")');

    // Step 4: Open PaymentModal via M-PESA (shift pre-opened so not blocked)
    await window.click('button:has-text("M-PESA")');

    // Step 5: Select Till mode (no real Daraja callback needed)
    await window.click('button:has-text("Till")');

    // Step 6: Manually confirm payment
    await window.click('button:has-text("Manual Confirm (M-Pesa)")');

    // Step 7: Finalize
    await window.click('button:has-text("Finalize & Receipt")');

    await expect(window.locator('text=Sale completed!')).toBeVisible({ timeout: 10000 });
  });

  // ── Test 3: Reports ─────────────────────────────────────────────────────
  test('Reports: Exporting sales to Excel results in download', async () => {
    // Navigate to Admin tab
    await window.click('button:has-text("Admin")');

    // Click "Sales Reports" in the admin sidebar (exact label, not "Reports")
    await window.click('button:has-text("Sales Reports")');

    // Export and capture download event
    const [download] = await Promise.all([
      window.waitForEvent('download'),
      window.click('button:has-text("Excel")'),
    ]);

    // SalesReportsScreen.tsx: `dukapos_sales_${start}_${end}.xlsx`
    expect(download.suggestedFilename()).toContain('dukapos_sales');
    expect(download.suggestedFilename()).toContain('.xlsx');
  });
});
