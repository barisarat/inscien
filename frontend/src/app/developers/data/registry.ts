import gettingStarted from "./content/getting-started"
import authentication from "./content/authentication"
import defaultSignals from "./content/default-signals"
import customSignalTests from "./content/custom-signal-tests"
import responseShapes from "./content/response-shapes"
import liveTests from "./content/live-tests"
import examples from "./content/examples"
import errorsAndLimits from "./content/errors-and-limits"
import type { DevDocGroup, DevDocPage } from "./types"

export const devDocPages: DevDocPage[] = [
  gettingStarted,
  authentication,
  defaultSignals,
  customSignalTests,
  responseShapes,
  examples,
  errorsAndLimits,
  liveTests,
]

export const DEV_DOCS_GROUP_ORDER: DevDocGroup[] = ["Platform guide", "API reference"]

export function getDevDocPage(slug: string): DevDocPage | undefined {
  return devDocPages.find((page) => page.slug === slug)
}

export function getDevDocsNavGroups() {
  return DEV_DOCS_GROUP_ORDER.map((group) => ({
    group,
    items: devDocPages
      .filter((page) => page.group === group)
      .map((page) => ({ slug: page.slug, label: page.navLabel })),
  })).filter((entry) => entry.items.length > 0)
}
