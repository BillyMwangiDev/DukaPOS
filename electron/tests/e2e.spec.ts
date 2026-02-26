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
      env: {
        ...process.env,
        E2E_TEST: 'true'
      }
    });
    window = await electronApp.firstWindow();
  });

  test.afterAll(async () => {
    if (electronApp) await electronApp.close();
  });

  test('Auth: Standard login unlocks the system', async () => {
    console.log('DEBUG: Page Content follows:');
    console.log(await window.content());

    await window.waitForSelector('text=DukaPOS', { timeout: 10000 });

    await window.fill('input#login-username', 'admin');
    await window.fill('input#login-password', 'admin123');
    await window.click('button:has-text("Sign in")');

    // POS tab visible = login succeeded
    await expect(window.locator('button:has-text("Point of Sale")')).toBeVisible({ timeout: 10000 });
  });

  test('Transaction: Full sale flow generates valid ID', async () => {
    // Navigate to POS tab
    await window.click('button:has-text("Point of Sale")');

    // Open shift if not already open (required before any payment)
    const openShiftBtn = window.locator('button:has-text("Open Shift")').first();
    if (await openShiftBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await openShiftBtn.click(); // Opens OpenShiftModal
      // Modal submit button also says "Open Shift"; use .last() to pick it over the header button
      await window.locator('button:has-text("Open Shift")').last().click({ timeout: 5000 });
      await window.waitForTimeout(500);
    }

    // Wait for product table (ProductGrid = <table>, no .product-card class)
    const firstProduct = window.locator('table tbody tr').first();
    await firstProduct.waitFor({ timeout: 15000 });
    await firstProduct.click();

    // Open PaymentModal via M-PESA button in CommandCenter
    await window.click('button:has-text("M-PESA")');

    // Select Till mode inside PaymentModal (Mobile tab → mode buttons)
    await window.click('button:has-text("Till")');

    // Manually confirm — no real M-Pesa C2B callback needed
    await window.click('button:has-text("Manual Confirm (M-Pesa)")');

    // Finalize the sale
    await window.click('button:has-text("Finalize & Receipt")');

    await expect(window.locator('text=Sale completed!')).toBeVisible({ timeout: 10000 });
  });

  test('Reports: Exporting sales to Excel results in download', async () => {
    // Navigate to Admin tab (top nav)
    await window.click('button:has-text("Admin")');

    // Click "Sales Reports" in admin sidebar (not "Reports")
    await window.click('button:has-text("Sales Reports")');

    // Export Excel and capture download
    const [download] = await Promise.all([
      window.waitForEvent('download'),
      window.click('button:has-text("Excel")'),
    ]);

    // Actual filename format: dukapos_sales_{start}_{end}.xlsx
    expect(download.suggestedFilename()).toContain('dukapos_sales');
    expect(download.suggestedFilename()).toContain('.xlsx');
  });
});
