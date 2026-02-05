/**
 * Kenyan VAT-inclusive math (16%).
 * Gross = sticker price (what customer pays).
 * Net = Gross / 1.16, Tax = Gross - Net.
 */
const VAT_RATE = 1.16;

export function grossToNet(gross: number): number {
  return gross / VAT_RATE;
}

export function grossToTax(gross: number): number {
  return gross - grossToNet(gross);
}

export function netToGross(net: number): number {
  return net * VAT_RATE;
}
