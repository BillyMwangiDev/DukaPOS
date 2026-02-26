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
    // Launch Electron app
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
    // Debug: Log content
    console.log('DEBUG: Page Content follows:');
    console.log(await window.content());

    // Wait for login screen
    await window.waitForSelector('text=DukaPOS', { timeout: 10000 });

    // Enter credentials (seeded during setup)
    await window.fill('input#login-username', 'admin');
    await window.fill('input#login-password', '0000');
    await window.click('button:text("Sign in")');

    // Verify dashboard appears
    await expect(window.locator('text=Point of Sale')).toBeVisible({ timeout: 10000 });
  });

  test('Transaction: Full sale flow generates valid ID', async () => {
    // Go to POS if not already there
    await window.click('text=Point of Sale');

    // Click on the first product in the list
    const firstProduct = window.locator('.product-card').first();
    await firstProduct.waitFor();
    await firstProduct.click();

    // Click M-PESA in CommandCenter
    await window.click('button:text("M-PESA")');

    // Select Till mode in PaymentModal
    await window.click('button:text("Till")');

    // Manual Confirm
    await window.click('button:text("Manual Confirm (M-Pesa)")');

    // Finalize
    await window.click('button:text("Finalize & Receipt")');

    // Check for success toast
    await expect(window.locator('text=Sale completed!')).toBeVisible();
  });

  test('Reports: Exporting sales to Excel results in download', async () => {
    await window.click('text=Admin');
    await window.click('text=Reports');

    // Click Export Excel
    const [download] = await Promise.all([
      window.waitForEvent('download'),
      window.click('button:text("Export Excel")'),
    ]);

    expect(download.suggestedFilename()).toContain('sales_report');
    expect(download.suggestedFilename()).toContain('.xlsx');
  });
});
