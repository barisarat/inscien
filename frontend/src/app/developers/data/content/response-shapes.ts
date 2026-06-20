import type { DevDocPage } from "../types"

const page: DevDocPage = {
  slug: "response-shapes",
  title: "Response shapes",
  navLabel: "Response shapes",
  group: "API reference",
  description: "Representative JSON shapes for default signals and custom Signal Tests.",
  sections: [
    {
      title: "Default catalog",
      blocks: [
        {
          kind: "code",
          language: "json",
          code: `{
  "signals": [
    {
      "key": "energy",
      "label": "Energy",
      "description": "Oil, gas, and power news tone.",
      "defaultTicker": "SPY",
      "themes": ["ECON_OILPRICE", "ENV_OIL"],
      "sentimentTypes": ["counts", "nsi", "polarity", "tone"],
      "frequencies": ["5min", "15min", "60min", "1day"],
      "endpoints": {
        "series": "/api/v1/signals/energy/series",
        "coverage": "/api/v1/signals/energy/coverage"
      }
    }
  ]
}`,
        },
      ],
    },
    {
      title: "Default series",
      blocks: [
        {
          kind: "code",
          language: "json",
          code: `{
  "signal": {"key": "energy", "label": "Energy"},
  "range": "1y",
  "frequency": "1day",
  "sentimentType": "tone",
  "smoothing": 7,
  "windowHours": null,
  "count": 251,
  "series": [
    {
      "date": "2026-06-09",
      "value": 0.1842,
      "valueSmoothed": 0.1021,
      "articleCount": 42,
      "meanTone": 0.1842,
      "nsi": 0.0714,
      "polarity": 0.2138
    }
  ],
  "latest": {"date": "2026-06-09", "value": 0.1842},
  "meta": {"sentimentType": "tone", "totalArticles": 8200},
  "note": ""
}`,
        },
      ],
    },
    {
      title: "Coverage",
      blocks: [
        {
          kind: "code",
          language: "json",
          code: `{
  "signal": {"key": "rates", "label": "Rates & Policy"},
  "range": "6m",
  "themes": ["ECON_INTEREST_RATES", "ECON_CENTRALBANK"],
  "totalArticles": 3412,
  "daysCovered": 178,
  "avgArticlesPerDay": 19.2,
  "latestArticleAt": "2026-06-09T14:45:00+00:00",
  "caveats": [
    "Coverage reflects FinanceLab's stored GDELT subset and the signal's theme filters."
  ],
  "note": ""
}`,
        },
      ],
    },
    {
      title: "Custom Signal Test",
      blocks: [
        {
          kind: "code",
          language: "json",
          code: `{
  "publicId": "st_kJ8s2nQ4xWv1pLm9",
  "name": "energy threshold @ -1.5 on QQQ",
  "ticker": "QQQ",
  "rule": "threshold",
  "threshold": -1.5,
  "scope": "energy",
  "signalType": "news_scope",
  "sentimentType": "tone",
  "frequency": "1day",
  "publishedAt": "2026-06-01T14:03:22+00:00",
  "endpoints": {
    "tradeSignals": "/api/v1/signal-tests/st_kJ8s2nQ4xWv1pLm9/trade-signals",
    "signals": "/api/v1/signal-tests/st_kJ8s2nQ4xWv1pLm9/signals"
  },
  "supportedRanges": ["1m", "3m", "6m", "1y", "2y", "5y"]
}`,
        },
      ],
    },
    {
      title: "Custom outputs",
      blocks: [
        {
          kind: "code",
          language: "json",
          code: `{
  "signalTest": {"publicId": "st_kJ8s2nQ4xWv1pLm9", "frequency": "1day"},
  "range": "1y",
  "count": 251,
  "warmupBars": 8,
  "indicators": ["index"],
  "series": [
    {"ts": "2026-06-09", "values": {"index": -1.82}}
  ],
  "latest": {"ts": "2026-06-09", "values": {"index": -1.82}},
  "note": ""
}`,
        },
        {
          kind: "code",
          language: "json",
          code: `{
  "signalTest": {"publicId": "st_kJ8s2nQ4xWv1pLm9", "frequency": "1day"},
  "range": "1y",
  "count": 251,
  "warmupBars": 8,
  "series": [
    {"ts": "2026-06-09", "signal": 1}
  ],
  "latest": {"ts": "2026-06-09", "signal": 1},
  "note": ""
}`,
        },
      ],
    },
  ],
}

export default page
