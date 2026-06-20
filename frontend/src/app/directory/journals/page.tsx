"use client"

import DirectoryDetailPage, { Section } from "../DirectoryDetailPage"

type Journal = {
  title: string
  publisher?: string
  href: string
}

const journals: Journal[] = [
  {
    title: "IEEE Transactions on Neural Networks and Learning Systems",
    publisher: "IEEE",
    href: "https://ieeexplore.ieee.org/xpl/aboutJournal.jsp?punumber=5962385",
  },
  {
    title: "IEEE Transactions on Knowledge and Data Engineering",
    publisher: "IEEE",
    href: "https://ieeexplore.ieee.org/xpl/RecentIssue.jsp?punumber=69",
  },
  {
    title: "Data Mining and Knowledge Discovery",
    publisher: "Springer",
    href: "https://www.springer.com/journal/10618",
  },
  {
    title: "Expert Systems with Applications",
    publisher: "Elsevier",
    href: "https://www.journals.elsevier.com/expert-systems-with-applications",
  },
  {
    title: "Neurocomputing",
    publisher: "Elsevier",
    href: "https://www.journals.elsevier.com/neurocomputing",
  },
  {
    title: "Applied Soft Computing",
    publisher: "Elsevier",
    href: "https://www.journals.elsevier.com/applied-soft-computing",
  },
  {
    title: "Information Sciences",
    publisher: "Elsevier",
    href: "https://www.journals.elsevier.com/information-sciences",
  },
  {
    title: "Remote Sensing",
    publisher: "MDPI",
    href: "https://www.mdpi.com/journal/remotesensing",
  },
  {
    title: "ISPRS Journal of Photogrammetry and Remote Sensing",
    publisher: "Elsevier",
    href: "https://www.journals.elsevier.com/isprs-journal-of-photogrammetry-and-remote-sensing",
  },
  {
    title: "IEEE Transactions on Cybernetics",
    publisher: "IEEE",
    href: "https://ieeexplore.ieee.org/xpl/aboutJournal.jsp?punumber=6221036",
  },
  {
    title: "IEEE Access",
    publisher: "IEEE",
    href: "https://ieeexplore.ieee.org/xpl/aboutJournal.jsp?punumber=6287639",
  },
  {
    title: "Knowledge-Based Systems",
    publisher: "Elsevier",
    href: "https://www.journals.elsevier.com/knowledge-based-systems",
  },
  {
    title: "Future Generation Computer Systems",
    publisher: "Elsevier",
    href: "https://www.journals.elsevier.com/future-generation-computer-systems",
  },
  {
    title: "Neural Computing & Applications",
    publisher: "Springer",
    href: "https://www.springer.com/journal/521",
  },
  {
    title: "Applied Intelligence",
    publisher: "Springer",
    href: "https://www.springer.com/journal/10489",
  },
  {
    title: "Pattern Recognition Letters",
    publisher: "Elsevier",
    href: "https://www.journals.elsevier.com/pattern-recognition-letters",
  },
  {
    title: "Quantitative Finance",
    publisher: "Taylor & Francis",
    href: "https://www.tandfonline.com/toc/rquf20/current",
  },
  {
    title: "Journal of Forecasting",
    publisher: "Wiley",
    href: "https://onlinelibrary.wiley.com/journal/1099131x",
  },
  {
    title: "Journal of Computational Science",
    publisher: "Elsevier",
    href: "https://www.journals.elsevier.com/journal-of-computational-science",
  },
  {
    title: "Complex & Intelligent Systems",
    publisher: "Springer",
    href: "https://www.springer.com/journal/40747",
  },
  {
    title: "Journal of Machine Learning Research",
    href: "https://www.jmlr.org/",
  },
  {
    title: "Machine Learning",
    publisher: "Springer",
    href: "https://link.springer.com/journal/10994",
  },
  {
    title: "Neural Computation",
    publisher: "MIT Press",
    href: "https://direct.mit.edu/neco",
  },
  {
    title: "Neural Networks",
    href: "https://www.sciencedirect.com/journal/neural-networks",
  },
  {
    title: "IEEE Transactions on Pattern Analysis and Machine Intelligence",
    publisher: "IEEE",
    href: "https://ieeexplore.ieee.org/xpl/RecentIssue.jsp?punumber=34",
  },
  {
    title: "ACM Transactions on Knowledge Discovery from Data",
    href: "https://dl.acm.org/journal/tkdd",
  },
  {
    title: "IEEE Transactions on Signal Processing",
    publisher: "IEEE",
    href: "https://ieeexplore.ieee.org/xpl/RecentIssue.jsp?punumber=78",
  },
  {
    title: "Signal Processing",
    href: "https://www.sciencedirect.com/journal/signal-processing",
  },
  {
    title: "Journal of Natural Language Processing",
    href: "https://www.jstage.jst.go.jp/browse/jnlp",
  },
  {
    title: "Applied Soft Computing",
    href: "https://dl.acm.org/journal/apsc",
  },
  {
    title: "Financial Innovation",
    href: "https://link.springer.com/journal/40854",
  },
]

function journalDetails(journal: Journal) {
  return journal.publisher ? ` (${journal.publisher})` : ""
}

export default function JournalsPage() {
  return (
    <DirectoryDetailPage title="Journals">
      <Section title="Machine Learning and Related Journals">
        <ul>
          {journals.map((journal) => (
            <li key={`${journal.title}-${journal.href}`}>
              <b>{journal.title}</b>
              {journalDetails(journal)}:{" "}
              <a href={journal.href} target="_blank" rel="noopener noreferrer">
                Official site
              </a>
              .
            </li>
          ))}
        </ul>
      </Section>
    </DirectoryDetailPage>
  )
}