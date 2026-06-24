// Shared background-job poll loop used by the Narrate flow, the Map's citations fetch, and
// the navigator's auto-index. Each caller keeps its own cancellation token; this just removes
// the duplicated "poll until done/error, with progress + cancellation" loop.

export interface JobStatus {
  status: "queued" | "running" | "done" | "error"
  stage?: string
  detail?: string
  progress?: number
  error?: string
}

export interface PollOptions<T extends JobStatus> {
  onProgress?: (s: T) => void
  onDone: (s: T) => void | Promise<void>
  onError?: (s: T) => void
  // Return true to stop the loop (e.g. the caller's run-generation token changed). Checked
  // before and after each poll, so a cancelled run never writes state for a stale run.
  isCancelled?: () => boolean
  intervalMs?: number
}

export async function pollJob<T extends JobStatus>(
  jobId: string,
  get: (id: string) => Promise<T>,
  opts: PollOptions<T>,
): Promise<void> {
  const interval = opts.intervalMs ?? 1500
  try {
    for (;;) {
      if (opts.isCancelled?.()) return
      const s = await get(jobId)
      if (opts.isCancelled?.()) return
      opts.onProgress?.(s)
      if (s.status === "done") {
        await opts.onDone(s)
        return
      }
      if (s.status === "error") {
        opts.onError?.(s)
        return
      }
      await new Promise((r) => setTimeout(r, interval))
    }
  } catch (e) {
    if (opts.isCancelled?.()) return
    // Surface a thrown error the same way as a job-status error (s.error carries the message).
    opts.onError?.({ status: "error", error: String(e) } as T)
  }
}
