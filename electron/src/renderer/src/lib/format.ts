/**
 * Format amount as Kenyan Shillings: Ksh 1,200.00
 * High-density product cards and tables use this for consistency.
 */
export function formatKsh(amount: number): string {
  const val = amount ?? 0;
  return `Ksh ${val.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
