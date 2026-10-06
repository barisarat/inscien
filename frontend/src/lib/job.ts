"use client"

// The one background job, shared by every component that starts it or shows it. Polls the
// server every 2s while a job runs and every 20s otherwise (a job may be started from another
// tab). One job at a time: starting a second answers 409 and the caller shows that message.
import { useSyncExternalStore } from "react"
import { toast } from "sonner"

import { cancelJob, fetchJob, startBuildJob, startNarrateJob, startRebuildJob, type HostJob } from "@/lib/api"

let job: HostJob | null = null
let timer: ReturnType<typeof setTimeout> | null = null
const listeners = new Set<() => void>()

function set(next: HostJob | null) {
  job = next
  for (const l of listeners) l()
}

async function poll() {
  if (timer) clearTimeout(timer)
  try {
    set((await fetchJob()).job)
  } catch {
    /* the server is down; try again later */
  }
  timer = setTimeout(poll, job?.status === "running" ? 2000 : 20000)
}

function subscribe(l: () => void) {
  listeners.add(l)
  if (listeners.size === 1) void poll()
  return () => {
    listeners.delete(l)
    if (listeners.size === 0 && timer) {
      clearTimeout(timer)
      timer = null
    }
  }
}

export function useJob(): HostJob | null {
  return useSyncExternalStore(subscribe, () => job, () => null)
}

async function start(run: () => Promise<{ job: HostJob }>) {
  try {
    set((await run()).job)
    void poll()
  } catch (e) {
    toast(e instanceof Error ? e.message : "Couldn't start the job")
  }
}

export const startBuild = (itemKey: string) => start(() => startBuildJob(itemKey))
export const startNarrate = (itemKey: string) => start(() => startNarrateJob(itemKey))
export const startRebuild = (slug: string) => start(() => startRebuildJob(slug))

export async function cancelCurrentJob() {
  try {
    set((await cancelJob()).job)
  } catch (e) {
    toast(e instanceof Error ? e.message : "Couldn't cancel the job")
  }
}

// A finished job is dismissed per browser, so the pane does not come back on every reload.
const DISMISSED_KEY = "inscien.jobDismissed"
export function useDismissedJobId(): string | null {
  return useSyncExternalStore(subscribe, dismissedJobId, () => null)
}
function dismissedJobId(): string | null {
  try {
    return window.localStorage.getItem(DISMISSED_KEY)
  } catch {
    return null
  }
}
export function dismissJob(id: string) {
  try {
    window.localStorage.setItem(DISMISSED_KEY, id)
  } catch {
    /* only costs the convenience */
  }
  for (const l of listeners) l()
}
