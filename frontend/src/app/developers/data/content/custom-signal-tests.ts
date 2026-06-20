import type { DevDocPage } from "../types"

const page: DevDocPage = {
  slug: "custom-signal-tests",
  title: "Custom signal tests",
  navLabel: "Custom signal tests",
  group: "API reference",
  description: "Published saved Signal Tests and their machine-readable outputs.",
  sections: [
    {
      title: "Publish a test",
      blocks: [
        {
          kind: "text",
          bullets: [
            "Build and validate a signal in chat.",
            "Save it as a Signal Test.",
            "Use the API toggle on the Signal Tests page to publish it.",
            "The first publish assigns a stable public id prefixed st_.",
          ],
        },
      ],
    },
    {
      title: "Endpoints",
      blocks: [
        {
          kind: "table",
          headers: ["Endpoint", "Returns"],
          rows: [
            ["/api/v1/signal-tests", "Published custom Signal Tests for the API key owner"],
            ["/api/v1/signal-tests/{public_id}", "One Signal Test's metadata and endpoint paths"],
            ["/api/v1/signal-tests/{public_id}/signals", "Underlying derived signal series"],
            ["/api/v1/signal-tests/{public_id}/trade-signals", "Optional long/flat trade-rule output"],
          ],
        },
        {
          kind: "text",
          text: [
            "A Signal Test is a trading rule (threshold / zscore / rising) on a saved news signal, traded on one asset. The trade-signals endpoint returns its long/flat 0/1 series; the signals endpoint returns the underlying news-index value.",
          ],
        },
      ],
    },
    {
      title: "Read outputs",
      blocks: [
        {
          kind: "code",
          language: "bash",
          code: `curl -H "X-API-Key: flk_..." \\
  "https://your-financelab-host/api/v1/signal-tests"

curl -H "X-API-Key: flk_..." \\
  "https://your-financelab-host/api/v1/signal-tests/st_.../signals?range=1y"

curl -H "X-API-Key: flk_..." \\
  "https://your-financelab-host/api/v1/signal-tests/st_.../trade-signals?limit=1"`,
        },
        {
          kind: "text",
          bullets: [
            "signals returns indicator values or derived signal features.",
            "trade-signals returns 1 for long and 0 for flat at each bar.",
            "range and limit use the same rules as published custom tests in the app.",
          ],
        },
      ],
    },
  ],
}

export default page
