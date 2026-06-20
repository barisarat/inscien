import type { DevDocPage } from "../types"

const page: DevDocPage = {
  slug: "default-signals",
  title: "Default signals",
  navLabel: "Default signals",
  group: "API reference",
  description: "Built-in FinanceLab signal catalog, series, and coverage endpoints.",
  sections: [
    {
      title: "Catalog",
      blocks: [
        {
          kind: "text",
          text: [
            "Default signals are FinanceLab-maintained news indexes that can be consumed without first building a custom test in chat. Use the exact signal key in API paths.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `curl -H "X-API-Key: flk_..." \\
  "https://your-financelab-host/api/v1/signals"`,
        },
        {
          kind: "table",
          headers: ["Endpoint", "Returns"],
          rows: [
            ["/api/v1/signals", "Default signal catalog"],
            ["/api/v1/signals/{signal_key}/series", "Signal index series"],
            ["/api/v1/signals/{signal_key}/coverage", "Article coverage and freshness"],
          ],
        },
        {
          kind: "table",
          headers: ["Signal key", "Label", "Suggested asset", "Description"],
          rows: [
            ["energy", "Energy", "SPY", "Oil, gas, and power news tone"],
            ["real_estate", "Real Estate", "VTI", "Housing and property market news tone"],
            ["semiconductors", "Semiconductors", "QQQ", "Chips, tech supply chain, and trade news tone"],
            ["banks", "Banks & Credit", "SPY", "Banking, credit, and solvency news tone"],
            ["tech", "Technology", "QQQ", "Broad technology and innovation news tone"],
            ["crypto", "Crypto", "QQQ", "Cryptocurrency news tone"],
            ["rates", "Rates & Policy", "TLT", "Interest-rate and central-bank policy news tone"],
            ["commodities", "Commodities", "GLD", "Commodity and resource news tone"],
            ["housing", "Housing & Mortgages", "VTI", "Housing prices and mortgage-rate news tone"],
            ["inflation", "Inflation / Macro", "SPY", "Inflation and macro-policy news tone"],
          ],
        },
      ],
    },
    {
      title: "Series",
      blocks: [
        {
          kind: "text",
          bullets: [
            "Daily series use the smoothed daily news index.",
            "Intraday series use a trailing news window sampled at the requested bar frequency.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `curl -H "X-API-Key: flk_..." \\
  "https://your-financelab-host/api/v1/signals/energy/series?range=1y&sentiment_type=tone&smoothing=7"`,
        },
        {
          kind: "text",
          bullets: [
            "range: 1d, 5d, 1m, 3m, 6m, 1y, 2y, 5y, or relative windows such as 10d and 6m.",
            "frequency: 1day, 60min, 15min, or 5min.",
            "sentiment_type: tone, nsi, counts, or polarity.",
            "smoothing: daily smoothing window. Ignored for intraday.",
            "window_hours: trailing intraday news window. Minimum is 24 hours.",
            "limit: most recent points to return, 1 to 5000.",
          ],
        },
      ],
    },
    {
      title: "Coverage",
      blocks: [
        {
          kind: "text",
          text: [
            "Coverage shows freshness, article counts, and methodology filters for the requested window. The themes field is exposed for transparency so users can inspect the news filters behind a default signal.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `curl -H "X-API-Key: flk_..." \\
  "https://your-financelab-host/api/v1/signals/rates/coverage?range=6m"`,
        },
      ],
    },
  ],
}

export default page
