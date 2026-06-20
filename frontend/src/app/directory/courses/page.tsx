"use client"
import DirectoryDetailPage, { Section } from "../DirectoryDetailPage"

const mitCourses: string[] = [
  "https://ocw.mit.edu/courses/18-404j-theory-of-computation-fall-2020/",
  "https://ocw.mit.edu/courses/res-6-012-introduction-to-probability-spring-2018/",
  "https://ocw.mit.edu/courses/6-034-artificial-intelligence-fall-2010/",
  "https://ocw.mit.edu/courses/3-021j-introduction-to-modeling-and-simulation-spring-2012/",
  "https://ocw.mit.edu/courses/15-053x-optimization-methods-in-business-analytics-summer-2021/",
  "https://ocw.mit.edu/courses/9-13-the-human-brain-spring-2019/",
  "https://ocw.mit.edu/courses/6-042j-mathematics-for-computer-science-fall-2010/",
  "https://ocw.mit.edu/courses/res-18-010-a-2020-vision-of-linear-algebra-spring-2020/",
  "https://ocw.mit.edu/courses/15-084j-nonlinear-programming-spring-2004/",
  "https://ocw.mit.edu/courses/18-065-matrix-methods-in-data-analysis-signal-processing-and-machine-learning-spring-2018/",
  "https://ocw.mit.edu/courses/18-085-computational-science-and-engineering-i-fall-2008/",
  "https://ocw.mit.edu/courses/18-06sc-linear-algebra-fall-2011/",
  "https://ocw.mit.edu/courses/6-0002-introduction-to-computational-thinking-and-data-science-fall-2016/",
  "https://ocw.mit.edu/courses/6-851-advanced-data-structures-spring-2012/",
  "https://ocw.mit.edu/courses/18-03-differential-equations-spring-2010/",
  "https://ocw.mit.edu/courses/esd-051j-engineering-innovation-and-design-fall-2012/",
  "https://ocw.mit.edu/courses/6-262-discrete-stochastic-processes-spring-2011/",
  "https://ocw.mit.edu/courses/14-310x-data-analysis-for-social-scientists-spring-2023/",
  "https://ocw.mit.edu/courses/18-s191-introduction-to-computational-thinking-fall-2022/",
  "https://web.mit.edu/18.06/www/",
  "https://ocw.mit.edu/courses/6-s980-machine-learning-for-inverse-graphics-fall-2022/",
  "https://ocw.mit.edu/courses/18-100a-real-analysis-fall-2020/",
  "https://ocw.mit.edu/courses/6-046j-introduction-to-algorithms-sma-5503-fall-2005/",
  "https://ocw.mit.edu/courses/18-102-introduction-to-functional-analysis-spring-2021/",
  "https://ocw.mit.edu/courses/18-s997-introduction-to-matlab-programming-fall-2011/",
  "https://ocw.mit.edu/courses/15-356-how-to-develop-breakthrough-products-and-services-spring-2004/",
  "https://ocw.mit.edu/courses/18-217-graph-theory-and-additive-combinatorics-fall-2019",
  "https://ocw.mit.edu/courses/18-02-multivariable-calculus-fall-2007/",
  "https://ocw.mit.edu/courses/18-650-statistics-for-applications-fall-2016/",
  "https://ocw.mit.edu/courses/15-401-finance-theory-i-fall-2008/",
  "https://ocw.mit.edu/courses/18-06-linear-algebra-spring-2010/",
  "https://ocw.mit.edu/courses/6-0001-introduction-to-computer-science-and-programming-in-python-fall-2016/",
  "https://ocw.mit.edu/courses/6-041-probabilistic-systems-analysis-and-applied-probability-fall-2010/",
  "https://ocw.mit.edu/courses/18-s096-topics-in-mathematics-with-applications-in-finance-fall-2013/resources/lecture-1-introduction-financial-terms-and-concepts/",
  "https://ocw.mit.edu/courses/res-18-005-highlights-of-calculus-spring-2010/",
  "https://ocw.mit.edu/courses/18-086-mathematical-methods-for-engineers-ii-spring-2006/",
  "https://ocw.mit.edu/courses/18-01-single-variable-calculus-fall-2006/",
  "https://ocw.mit.edu/courses/15-s21-nuts-and-bolts-of-business-plans-january-iap-2014/",
  "https://ocw.mit.edu/courses/18-06-linear-algebra-spring-2010/video_galleries/video-lectures/",
  "https://ocw.mit.edu/courses/res-6-012-introduction-to-probability-spring-2018/pages/part-i-the-fundamentals/",
]

export default function CoursesPage() {
  return (
    <DirectoryDetailPage title="Courses">
      <Section title="MIT">
        <ul>
          {mitCourses.map((href) => (
            <li key={href}>
              <a href={href} target="_blank" rel="noopener noreferrer">
                {href}
              </a>
            </li>
          ))}
        </ul>
      </Section>
    </DirectoryDetailPage>
  )
}