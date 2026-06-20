import type { DevDocPage } from "../types"

const page: DevDocPage = {
  slug: "getting-started",
  title: "Getting started",
  navLabel: "Getting started",
  group: "Platform guide",
  description: "What FinanceLab is and how to make your first API call.",
  sections: [
    {
      title: "Default vs custom",
      blocks: [
        {
          kind: "text",
          text: [
            "FinanceLab has two API layers: default signals and custom Signal Tests.",
            "Use default signals when you want standardized FinanceLab indexes directly in your agent, notebook, or model.",
            "Use custom Signal Tests when you built something in chat and want to publish that exact saved test.",
          ],
        },
      ],
    },
    {
      title: "The workflow",
      blocks: [
        {
          kind: "text",
          bullets: [
            "Call /api/v1/signals to discover FinanceLab-maintained default indexes.",
            "Call /api/v1/signals/{signal_key}/series to consume a default index series.",
            "Use chat when you want to explore data, validate an idea, and save a custom Signal Test.",
            "Publish a Signal Test when you want the API to expose that saved test's derived signals or trade-rule output.",
            "Create API keys in Settings. Every /api/v1 endpoint requires the X-API-Key header.",
          ],
        },
      ],
    },
    {
      title: "What the API gives you",
      blocks: [
        {
          kind: "text",
          text: [
            "Default signal endpoints return catalog entries, index series, and coverage metadata. Custom Signal Test endpoints return saved test metadata, derived signal series, and optional trade-rule output.",
          ],
        },
      ],
    },
    {
      title: "Quick start",
      blocks: [
        {
          kind: "text",
          bullets: [
            "Create an API key under Settings > API keys. The full secret (flk_...) is shown exactly once. Copy it.",
            "List the default signal catalog:",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `curl -H "X-API-Key: flk_..." \\
  "https://your-financelab-host/api/v1/signals"`,
        },
        {
          kind: "text",
          text: [
            "From there, request a default signal series or list published custom Signal Tests.",
          ],
        },
      ],
    },
  ],
}

export default page
