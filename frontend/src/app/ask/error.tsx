"use client"

// Next.js App Router error boundary for the /ask subtree - the whole app, since `/`
// redirects here. Catches render errors in the workspace shell, the providers, and the Map /
// Narrate modes so an unexpected throw shows a calm recovery screen instead of a blank page.

import { useEffect } from "react"
import Link from "next/link"

import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button, buttonVariants } from "@/components/ui/button"

export default function AskError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("Unhandled error in /ask:", error)
  }, [error])

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>Something broke unexpectedly</CardTitle>
          <CardDescription>
            The workspace hit an error it couldn't recover from on its own. Your library and indexed
            papers are safe - try reloading the view.
          </CardDescription>
        </CardHeader>
        <CardFooter className="gap-2">
          <Button onClick={() => reset()}>Reload</Button>
          <Link href="/ask" className={buttonVariants({ variant: "outline" })}>
            Back to the Map
          </Link>
        </CardFooter>
      </Card>
    </main>
  )
}
