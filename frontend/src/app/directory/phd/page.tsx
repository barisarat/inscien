"use client"
import DirectoryDetailPage, { Section } from "../DirectoryDetailPage"

const resources: { href: string; label: string }[] = [
  {
    href: "https://cs-sop.notion.site/CS-PhD-Statements-of-Purpose-df39955313834889b7ac5411c37b958d",
    label: "CS PhD Statements of Purpose",
  },
]

const applications: { href: string; label: string }[] = [
  { href: "https://www.academictransfer.com/en/jobs/354776/phd-positions-in-field-of-operations-research/", label: "AcademicTransfer — PhD in Operations Research" },
  { href: "https://www.chalmers.se/en/about-chalmers/work-with-us/vacancies/", label: "Chalmers University" },
  { href: "https://www.eur.nl/en/working-at-eur/vacancies/overview?f[0]=type%3A2955&page=0", label: "Erasmus University Rotterdam" },
  { href: "https://www.kth.se/en/studies/phd/become-a-phd-student/vacant-doctoral-positions-1.1411624", label: "KTH Royal Institute of Technology" },
  { href: "https://www.lunduniversity.lu.se/vacancies", label: "Lund University" },
  { href: "https://su.varbi.com/en/what:findjob/?showresult=1&categories=1&checklist=1&orglevel=1&ref=1&nologin=1&nocity=1&nocounty=1&nocountry=1&nolocalefield=1&nolocalegroup=1&hideColumns=town&norefsearch=1&searchtext=&searchtitle=&category=1654&subcompany=undefined", label: "Stockholm University" },
  { href: "https://efzu.fa.em2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_2001/jobs", label: "Oracle Careers Portal" },
  { href: "https://employment.ku.dk/phd/", label: "University of Copenhagen — PhD" },
]

export default function PhdPage() {
  return (
    <DirectoryDetailPage title="PhD">
      <Section title="Resources">
        <ul>
          {resources.map((s) => (
            <li key={s.href}>
              <a href={s.href} target="_blank" rel="noopener noreferrer">
                {s.href}
              </a>{" "}
              ({s.label})
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Apply">
        <ul>
          {applications.map((s) => (
            <li key={s.href}>
              <a href={s.href} target="_blank" rel="noopener noreferrer">
                {s.href}
              </a>{" "}
              ({s.label})
            </li>
          ))}
        </ul>
      </Section>
    </DirectoryDetailPage>
  )
}