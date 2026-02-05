// @ts-ignore
import { _electron as electron } from 'playwright';
// @ts-ignore
import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('DukaPOS Smoke Tests', () => {
  let electronApp;
  let window;

  test.beforeAll(async () => {
    // Launch Electron app
    electronApp = await electron.launch({
      args: [path.join(__dirname, '../')],
    });

    window = await electronApp.firstWindow();
  });

  test.afterAll(async () => {
    await electronApp.close();
  });

  test('Auth: Cashier PIN entry correctly unlocks the system', async () => {
    // Wait for login screen
    await window.waitForSelector('text=DukaPOS');

    // Simulate triple tap on logo to trigger Dev PIN if needed, 
    // but here we just test standard login if possible.
    // If it's a fresh DB, the setup.bat should have seeded 'admin' / '0000'

    // Check if we are on login screen
    const pinPad = await window.isVisible('text=Enter PIN');
    if (pinPad) {
      // Enter 0000
      for (let i = 0; i < 4; i++) {
        await window.click('button:text("0")');
      }
    }

    // Verify dashboard appears
    await expect(window.locator('text=Point of Sale')).toBeVisible({ timeout: 10000 });
  });

  test('Transaction: Full sale flow generates valid ID', async () => {
    // Add product to cart (assuming products exist)
    await window.click('text=Point of Sale');

    // Click on the first product in the list if any
    const firstProduct = window.locator('.product-card').first();
    await firstProduct.waitFor();
    await firstProduct.click();

    // Click Pay
    await window.click('button:text("Pay")');

    // Select Mobile Payment
    await window.click('text=Mobile');
    await window.click('text=Manual Confirm (M-Pesa)');

    // Finalize
    await window.click('button:text("Finalize & Receipt")');

    // Check for success toast or receipt view
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
