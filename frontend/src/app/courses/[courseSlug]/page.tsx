import { notFound } from "next/navigation"
import CourseViewer from "../components/CourseViewer"
import {
  getServerCourseDetail,
  getServerCourseLookupItems,
} from "@/lib/server/courses"

interface PageProps {
  params: Promise<{
    courseSlug: string
  }>
}

export const revalidate = 3600

export async function generateStaticParams() {
  const lookupItems = await getServerCourseLookupItems()

  return lookupItems.map((item) => ({
    courseSlug: item.href.replace("/courses/", ""),
  }))
}

export async function generateMetadata({ params }: PageProps) {
  const { courseSlug } = await params
  const course = await getServerCourseDetail(courseSlug)

  if (!course) {
    return {
      title: "Course not found | FinanceLab",
    }
  }

  return {
    title: `${course.name} | FinanceLab`,
    description: course.desc,
  }
}

export default async function CourseDetailPage({ params }: PageProps) {
  const { courseSlug } = await params

  const [course, lookupItems] = await Promise.all([
    getServerCourseDetail(courseSlug),
    getServerCourseLookupItems(),
  ])

  if (!course) {
    notFound()
  }

  return (
    <CourseViewer
      courseSlug={courseSlug}
      initialCourse={course}
      initialSidebarItems={lookupItems.map((item) => ({
        label: item.label,
        href: item.href,
      }))}
    />
  )
}