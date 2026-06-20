import ListingPage from "@/components/listings/ListingPage"
import { getServerCourseGroups } from "@/lib/server/courses"

export const revalidate = 3600

export const metadata = {
  title: "Courses | FinanceLab",
  description: "Watch open-course lectures in a clean, distraction free viewer.",
}

export default async function CoursesPage() {
  const groups = await getServerCourseGroups()

  return (
    <ListingPage
      title="Courses"
      desc="Watch open-course lectures in a clean, distraction free viewer."
      sidebarTitle="Courses"
      groups={groups}
      searchPlaceholder="Filter courses"
    />
  )
}
