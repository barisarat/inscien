import CourseViewerClient from "./CourseViewerClient"
import type { CourseDetail } from "@/lib/api"

type SidebarItem = {
  label: string
  href: string
}

export default function CourseViewer({
  courseSlug,
  initialCourse,
  initialSidebarItems,
}: {
  courseSlug: string
  initialCourse: CourseDetail
  initialSidebarItems: SidebarItem[]
}) {
  return (
    <CourseViewerClient
      courseSlug={courseSlug}
      initialCourse={initialCourse}
      initialSidebarItems={initialSidebarItems}
    />
  )
}