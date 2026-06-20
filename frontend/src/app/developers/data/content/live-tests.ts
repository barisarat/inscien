import type { DevDocPage } from "../types"

const page: DevDocPage = {
  slug: "live-tests",
  title: "Live tests note",
  navLabel: "Live tests note",
  group: "API reference",
  description: "How live tests relate to the machine API.",
  sections: [
    {
      title: "Live state",
      blocks: [
        {
          kind: "text",
          text: [
            "Live tests are managed from the Signal Tests page. They forward-test a saved rule with virtual capital and update as new bars arrive.",
          ],
          bullets: [
            "Use the app to start, pause, resume, or stop a live test.",
            "Use the API to consume the published signal series and trade-rule outputs for repeatable downstream workflows.",
            "A dedicated live-test state endpoint is not part of this API version.",
          ],
        },
      ],
    },
    {
      title: "Cadence",
      blocks: [
        {
          kind: "text",
          bullets: [
            "Daily ETF live tests advance after the end-of-day close.",
            "5min, 15min, and 60min ETF live tests advance as new bars arrive during US market hours.",
            "Crypto live tests advance around the clock.",
          ],
        },
      ],
    },
  ],
}

export default page
