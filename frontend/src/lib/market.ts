// Asset-class helpers for the trading pages. Mirrors the backend universe in
// backend/services/market/registry.py: crypto pairs trade 24/7, ETFs follow
// US market hours.

import { usMarketStatus } from "./time"

export const CRYPTO_TICKERS = new Set(["BTCUSD", "ETHUSD", "SOLUSD", "XRPUSD", "DOGEUSD"])

export function isCrypto(ticker: string): boolean {
  return CRYPTO_TICKERS.has(ticker.toUpperCase())
}

/** Per-asset market status: crypto is always trading; ETFs use the US session. */
export function marketStatusFor(ticker: string, now: Date): { open: boolean; label: string } {
  if (isCrypto(ticker)) return { open: true, label: "24/7" }
  return usMarketStatus(now)
}
