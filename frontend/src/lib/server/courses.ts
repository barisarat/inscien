import "server-only"

import type {
  CourseDetail,
  CourseGroupsResponse,
} from "@/lib/api"
import type { ListingGroup } from "@/components/listings/ListingPage"

const API_BASE = process.env.NEXT_SERVER_API_URL

if (!API_BASE) {
  throw new Error("NEXT_SERVER_API_URL is required for server-side course API calls")
}

const isDevelopment = process.env.NODE_ENV === "development"

type ServerFetchOptions =
  | {
      cache: "no-store"
    }
  | {
      next: {
        revalidate: number
      }
    }

export type CourseLookupItem = {
  id: string
  label: string
  href: string
}

function getServerFetchOptions(): ServerFetchOptions {
  if (isDevelopment) {
    return {
      cache: "no-store",
    }
  }

  return {
    next: {
      revalidate: 3600,
    },
  }
}

async function getErrorMessage(res: Response) {
  const data: unknown = await res.json().catch(() => ({}))

  if (
    typeof data === "object" &&
    data !== null &&
    "detail" in data &&
    typeof data.detail === "string"
  ) {
    return data.detail
  }

  return `API error: ${res.status}`
}

export async function getServerCourseGroups(): Promise<ListingGroup[]> {
  const res = await fetch(`${API_BASE}/api/courses`, getServerFetchOptions())

  if (!res.ok) {
    throw new Error(await getErrorMessage(res))
  }

  const data: CourseGroupsResponse = await res.json()

  return data.courseGroups
}

export async function getServerCourseLookupItems(): Promise<CourseLookupItem[]> {
  const groups = await getServerCourseGroups()

  return groups.flatMap((group) => {
    return group.items.map((item) => ({
      id: item.id,
      label: item.name,
      href: item.href,
    }))
  })
}

export async function resolveServerCourseId(courseSlug: string) {
  const lookupItems = await getServerCourseLookupItems()
  const routeHref = `/courses/${courseSlug}`

  const matchedItem = lookupItems.find((item) => {
    return item.href === routeHref || item.id === courseSlug
  })

  return matchedItem?.id ?? null
}

export async function getServerCourseDetail(courseSlug: string): Promise<CourseDetail | null> {
  const courseId = await resolveServerCourseId(courseSlug)

  if (!courseId) {
    return null
  }

  const res = await fetch(`${API_BASE}/api/courses/${courseId}`, getServerFetchOptions())

  if (res.status === 404) {
    return null
  }

  if (!res.ok) {
    throw new Error(await getErrorMessage(res))
  }

  return res.json()
}