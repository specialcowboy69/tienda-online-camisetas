const zeroDecimalCurrencies = new Set(["bif", "clp", "djf", "gnf", "jpy", "kmf", "krw", "mga", "pyg", "rwf", "ugx", "vnd", "vuv", "xaf", "xof", "xpf"]);

export function toMinorUnits(amount: string | number, currency: string): number {
  const parsed = typeof amount === "number" ? amount : Number(amount);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid amount: ${amount}`);
  }

  const multiplier = zeroDecimalCurrencies.has(currency.toLowerCase()) ? 1 : 100;
  return Math.round(parsed * multiplier);
}

export function fromMinorUnits(amount: number, currency: string): string {
  const divisor = zeroDecimalCurrencies.has(currency.toLowerCase()) ? 1 : 100;
  return (amount / divisor).toFixed(divisor === 1 ? 0 : 2);
}

export function assertSameCurrency(currencies: string[]): string {
  const unique = [...new Set(currencies.map((currency) => currency.toLowerCase()))];
  if (unique.length !== 1) {
    throw new Error("Cart contains multiple currencies, which is not supported for one checkout.");
  }
  return unique[0];
}
