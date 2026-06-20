import type { DevDocPage } from "../types"

const page: DevDocPage = {
  slug: "authentication",
  title: "Authentication",
  navLabel: "Authentication",
  group: "Platform guide",
  description: "API keys and request authentication.",
  sections: [
    {
      title: "API keys",
      blocks: [
        {
          kind: "text",
          text: [
            "Create an API key under Settings → API keys. The full secret is shown exactly once at creation — store it somewhere safe. Send it on every request in the X-API-Key header.",
          ],
          bullets: [
            "Keys are long-lived random secrets prefixed flk_; only a hash is stored server-side.",
            "You can hold multiple named keys (e.g. one per integration) and revoke them individually at any time; revoked keys stop working immediately.",
            "Authentication failures always return the same generic 401, whether the key is missing, malformed, revoked, or unknown.",
            "Default signal endpoints and custom Signal Test endpoints both require a key.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `curl -H "X-API-Key: flk_..." \\
  "https://your-financelab-host/api/v1/signals"`,
        },
      ],
    },
    {
      title: "Rate limits",
      blocks: [
        {
          kind: "text",
          text: [
            "Each key is limited to roughly 60 requests per minute (sliding window, best-effort). Requests above the limit return 429. Wait a few seconds and retry.",
          ],
        },
      ],
    },
  ],
}

export default page
