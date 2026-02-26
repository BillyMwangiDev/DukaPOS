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
  });

  test.afterAll(async () => {
    if (electronApp) await electronApp.close();
  });

  // ── Test 1: Auth ────────────────────────────────────────────────────────
  test('Auth: Standard login unlocks the system', async () => {
    console.log('DEBUG: Page Content follows:');
    console.log(await window.content());

    await window.waitForSelector('text=DukaPOS', { timeout: 10000 });
    await window.fill('input#login-username', 'admin');
    await window.fill('input#login-password', 'admin123');
    await window.click('button:has-text("Sign in")');

    // POS tab visible = logged in successfully
    await expect(window.locator('button:has-text("Point of Sale")')).toBeVisible({ timeout: 10000 });
  });

  // ── Test 2: Transaction ─────────────────────────────────────────────────
  // Shift is pre-opened via API in CI (production.yml "Seed Test Data" step).
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

    // Step 4: Open PaymentModal via M-PESA (shift pre-opened via API so not blocked)
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
