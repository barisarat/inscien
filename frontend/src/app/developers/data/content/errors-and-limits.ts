import type { DevDocPage } from "../types"

const page: DevDocPage = {
  slug: "errors-and-limits",
  title: "Errors and limits",
  navLabel: "Errors & limits",
  group: "API reference",
  description: "Error responses, the privacy model, and rate limiting.",
  sections: [
    {
      title: "Error reference",
      blocks: [
        {
          kind: "table",
          headers: ["Status", "Meaning"],
          rows: [
            ["401", "Missing, invalid, or revoked API key (one generic message for all cases)"],
            ["404", "Unknown signal key, no matching news data, unknown public id, unpublished Signal Test, or a Signal Test owned by another account"],
            ["400", "Invalid range, frequency, sentiment type, or limit outside 1–5000"],
            ["429", "Per-key rate limit exceeded"],
            ["503", "Market or news data temporarily unavailable"],
          ],
        },
      ],
    },
    {
      title: "Privacy by design",
      blocks: [
        {
          kind: "text",
          text: [
            "Custom Signal Test errors are deliberately uninformative to outsiders. A public id that doesn't exist, one that belongs to another account, and one whose test is unpublished all return the same 404 body. Likewise, 401 uses one generic message whether the key is missing, malformed, revoked, or unknown.",
            "Errors are JSON with a detail field, e.g. {\"detail\": \"Signal not found\"}.",
          ],
        },
      ],
    },
    {
      title: "Rate limiting",
      blocks: [
        {
          kind: "text",
          text: [
            "Each key is allowed roughly 60 requests per minute over a sliding window (best-effort). On 429, back off for a few seconds and retry. Default signals and custom Signal Test series only change when new source data or bars arrive.",
          ],
        },
      ],
    },
  ],
}

export default page
