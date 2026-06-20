import type { DevDocPage } from "../types"

const page: DevDocPage = {
  slug: "examples",
  title: "Examples",
  navLabel: "Examples",
  group: "API reference",
  description: "End-to-end curl and Python examples for signal consumption.",
  sections: [
    {
      title: "curl",
      blocks: [
        {
          kind: "text",
          text: ["List default signals:"],
        },
        {
          kind: "code",
          language: "bash",
          code: `curl -H "X-API-Key: flk_..." \\
  "https://your-financelab-host/api/v1/signals"`,
        },
        {
          kind: "text",
          text: ["A year of energy news tone:"],
        },
        {
          kind: "code",
          language: "bash",
          code: `curl -H "X-API-Key: flk_..." \\
  "https://your-financelab-host/api/v1/signals/energy/series?range=1y&sentiment_type=tone"`,
        },
        {
          kind: "text",
          text: ["The latest published custom Signal Test trade signal:"],
        },
        {
          kind: "code",
          language: "bash",
          code: `curl -H "X-API-Key: flk_..." \\
  "https://your-financelab-host/api/v1/signal-tests/st_.../trade-signals?limit=1"`,
        },
      ],
    },
    {
      title: "Python: default signal features",
      blocks: [
        {
          kind: "text",
          text: [
            "Default signal series can be loaded directly into a features DataFrame.",
          ],
        },
        {
          kind: "code",
          language: "python",
          code: `import pandas as pd
import requests

BASE = "https://your-financelab-host"
HEADERS = {"X-API-Key": "flk_..."}

data = requests.get(
    f"{BASE}/api/v1/signals/inflation/series",
    headers=HEADERS,
    params={"range": "1y", "sentiment_type": "tone", "smoothing": 7},
).json()

features = pd.DataFrame(data["series"]).set_index("date")

print(features[["value", "valueSmoothed", "articleCount"]].tail())`,
        },
      ],
    },
    {
      title: "Python: latest custom trade signal",
      blocks: [
        {
          kind: "text",
          text: [
            "For live positioning, request the trade signals with limit=1 and read the latest object.",
          ],
        },
        {
          kind: "code",
          language: "python",
          code: `import requests

BASE = "https://your-financelab-host"
HEADERS = {"X-API-Key": "flk_..."}

latest = requests.get(
    f"{BASE}/api/v1/signal-tests/st_.../trade-signals",
    headers=HEADERS,
    params={"limit": 1},
).json()["latest"]

print(latest)  # {"ts": "2026-06-09", "signal": 1}`,
        },
      ],
    },
  ],
}

export default page
