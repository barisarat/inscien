"use client"

import DirectoryDetailPage, { Section } from "../DirectoryDetailPage"

type Conference = {
  title: string
  acronym: string
  rank?: "A*" | "A" | "B" | "C"
  deadline?: string
  confMonth?: string
}

type ConferenceTopic = {
  title: string
  conferences: Conference[]
}

const conferenceTopics: ConferenceTopic[] = [
  {
    title: "Core ML, Statistics, and AI venues",
    conferences: [
      {
        title: "Advances in Neural Information Processing Systems (was NIPS)",
        acronym: "NeurIPS",
        rank: "A*",
        deadline: "2026-05-04",
        confMonth: "December",
      },
      {
        title: "International Conference on Machine Learning",
        acronym: "ICML",
        rank: "A*",
        deadline: "2026-01-28",
        confMonth: "July",
      },
      {
        title: "International Conference on Artificial Intelligence and Statistics",
        acronym: "AISTATS",
        rank: "A",
        deadline: "2025-10-25",
        confMonth: "May",
      },
      {
        title: "Conference in Uncertainty in Artificial Intelligence",
        acronym: "UAI",
        rank: "A",
        deadline: "2026-02-26",
        confMonth: "August",
      },
      {
        title: "National Conference of the American Association for Artificial Intelligence",
        acronym: "AAAI",
        rank: "A*",
        deadline: "2025-08-01",
        confMonth: "January",
      },
      {
        title: "International Joint Conference on Artificial Intelligence",
        acronym: "IJCAI",
        rank: "A*",
        deadline: "2026-01-19",
        confMonth: "August",
      },
      {
        title: "European Conference on Artificial Intelligence",
        acronym: "ECAI",
        rank: "A",
        deadline: "2026-01-12",
        confMonth: "August",
      },
      {
        title: "International Conference on Learning Representations",
        acronym: "ICLR",
        rank: "A*",
        deadline: "2025-09-24",
        confMonth: "April",
      },
      {
        title: "Conference on Learning Theory",
        acronym: "COLT",
        rank: "A*",
        deadline: "2026-02-04",
        confMonth: "June",
      },
      {
        title: "International Joint Conference on Neural Networks",
        acronym: "IJCNN",
      },
      {
        title: "International Conference on Artificial Neural Networks",
        acronym: "ICANN",
      },
      {
        title: "International Symposium on Neural Networks",
        acronym: "ISNN",
      },
      {
        title: "International Conference on Agents and Artificial Intelligence",
        acronym: "ICAART",
      },
      {
        title: "International Conference on Tools with Artificial Intelligence",
        acronym: "ICTAI",
        rank: "B",
        deadline: "2026-06-30",
        confMonth: "November",
      },
    ],
  },
  {
    title: "NLP and Language ML venues",
    conferences: [
      {
        title: "Association for Computational Linguistics",
        acronym: "ACL",
      },
      {
        title: "Empirical Methods in Natural Language Processing",
        acronym: "EMNLP",
      },
      {
        title: "European Chapter of the Association for Computational Linguistics",
        acronym: "EACL",
      },
      {
        title: "Conference on Computational Linguistics",
        acronym: "COLING",
      },
    ],
  },
  {
    title: "Information Retrieval, Recommender, and Web ML venues",
    conferences: [
      {
        title: "ACM International Conference on Research and Development in Information Retrieval",
        acronym: "SIGIR",
        rank: "A*",
        deadline: "2025-01-22",
        confMonth: "July",
      },
      {
        title: "ACM International Conference on Information and Knowledge Management",
        acronym: "CIKM",
        rank: "A",
        deadline: "2026-05-18",
        confMonth: "November",
      },
      {
        title: "European Conference on Information Retrieval",
        acronym: "ECIR",
        rank: "A",
        deadline: "2025-09-25",
        confMonth: "March",
      },
      {
        title: "Text REtrieval Conference",
        acronym: "TREC",
      },
      {
        title: "ACM Series on Recommendation Systems",
        acronym: "ACM RecSys",
      },
      {
        title: "International World Wide Web Conference",
        acronym: "WWW",
        rank: "A*",
        deadline: "2025-10-07",
        confMonth: "June",
      },
      {
        title: "International Conference on Web and Social Media",
        acronym: "ICWSM",
        rank: "A",
        deadline: "2025-09-15",
        confMonth: "May",
      },
      {
        title: "ACM International Conference on Web Search and Data Mining",
        acronym: "WSDM",
        rank: "A",
        deadline: "2025-08-14",
        confMonth: "February",
      },
    ],
  },
  {
    title: "Multi-agent and Autonomous Agents venues",
    conferences: [
      {
        title: "Autonomous Agents and Multiagent Systems",
        acronym: "AAMAS",
      },
      {
        title: "Principle and Practice of Multiagent Systems Conference",
        acronym: "PRIMA",
      },
      {
        title: "European Conference on Multi-Agent Systems",
        acronym: "EUMAS",
      },
      {
        title: "IEEE/WIC/ACM International Conference on Intelligent Agent Technology",
        acronym: "IAT",
      },
      {
        title: "ACM Conference on Economics and Computation",
        acronym: "EC",
        rank: "A*",
        deadline: "2026-02-02",
        confMonth: "July",
      },
    ],
  },
  {
    title: "Computer Vision venues, ML-heavy",
    conferences: [
      {
        title: "Computer Vision and Pattern Recognition",
        acronym: "CVPR",
      },
      {
        title: "International Conference on Computer Vision",
        acronym: "ICCV",
      },
      {
        title: "European Conference on Computer Vision",
        acronym: "ECCV",
      },
      {
        title: "British Machine Vision Conference",
        acronym: "BMVC",
      },
      {
        title: "Asian Conference on Computer Vision",
        acronym: "ACCV",
      },
      {
        title: "International Conference on Pattern Recognition",
        acronym: "ICPR",
        rank: "B",
        deadline: "2026-01-10",
        confMonth: "August",
      },
    ],
  },
  {
    title: "Robotics and Embodied AI venues, ML-adjacent",
    conferences: [
      {
        title: "Robotics: Science and Systems",
        acronym: "RSS",
      },
      {
        title: "IEEE International Conference on Robotics and Automation",
        acronym: "ICRA",
      },
      {
        title: "IEEE/RSJ International Conference on Intelligent Robots and Systems",
        acronym: "IROS",
      },
      {
        title: "IEEE/RAS International Conference on Humanoid Robots",
        acronym: "Humanoids",
      },
      {
        title: "IEEE International Conference on Development and Learning and on Epigenetic Robotics",
        acronym: "ICDL-EpiRob",
      },
      {
        title: "IEEE International Symposium on Robot and Human Interactive Communication",
        acronym: "ROMAN",
      },
      {
        title: "IEEE International Workshop on Advanced Robotics and its Social Impacts",
        acronym: "ARSO",
      },
      {
        title: "IEEE International Conference on Robotics and Biomimetics",
        acronym: "Robio",
      },
    ],
  },
  {
    title: "Data Mining and ML-adjacent Systems venues",
    conferences: [
      {
        title: "IEEE International Conference on Data Mining",
        acronym: "ICDM",
        rank: "A*",
        deadline: "2026-06-06",
        confMonth: "November",
      },
      {
        title: "ACM International Conference on Knowledge Discovery and Data Mining",
        acronym: "KDD",
        rank: "A*",
        deadline: "2026-02-08",
        confMonth: "August",
      },
      {
        title: "SIAM International Conference on Data Mining",
        acronym: "SDM",
        rank: "A",
        deadline: "2026-04-10",
        confMonth: "November",
      },
      {
        title: "European Conference on Machine Learning",
        acronym: "ECML PKDD",
        rank: "A",
        deadline: "2026-03-05",
        confMonth: "September",
      },
      {
        title: "IEEE International Conference on Data Science and Advanced Analytics",
        acronym: "DSAA",
        rank: "B",
        deadline: "2026-05-01",
        confMonth: "October",
      },
      {
        title: "Intelligent Data Analysis",
        acronym: "IDA",
        rank: "B",
        deadline: "2025-10-21",
        confMonth: "April",
      },
      {
        title: "International Conference on Data Engineering",
        acronym: "ICDE",
        rank: "A*",
        deadline: "2025-10-27",
        confMonth: "May",
      },
      {
        title: "Very Large Data Bases",
        acronym: "VLDB",
      },
      {
        title: "ACM SIGMOD International Conference on Management of Data",
        acronym: "SIGMOD",
      },
      {
        title: "ACM SIGMOD Symposium on Principles of Database Systems",
        acronym: "PODS",
      },
      {
        title: "International Conference on Database Theory",
        acronym: "ICDT",
      },
    ],
  },
  {
    title: "Signal Processing, Audio, and Applied ML venues",
    conferences: [
      {
        title: "European Signal Processing Conference",
        acronym: "EUSIPCO",
      },
    ],
  },
  {
    title: "Finance, Economics, and Applied AI venues",
    conferences: [
      {
        title: "Advances in Financial Technologies",
        acronym: "AFT",
        rank: "B",
        deadline: "2026-05-20",
        confMonth: "October",
      },
      {
        title: "IEEE Symposium on Computational Intelligence for Financial Engineering",
        acronym: "IEEE CIFEr",
        rank: "C",
        deadline: "2026-05-15",
        confMonth: "September",
      },
      {
        title: "International Conference on AI in Finance",
        acronym: "IC-AIF",
      },
    ],
  },
]

function conferenceDetails(conference: Conference) {
  const details = [
    conference.rank ? conference.rank : null,
    conference.deadline ? `Deadline ${conference.deadline}` : null,
    conference.confMonth ? conference.confMonth : null,
  ].filter(Boolean)

  return details.length > 0 ? ` (${details.join(", ")})` : ""
}

export default function ConferencesPage() {
  return (
    <DirectoryDetailPage title="2026 Conferences">
      {conferenceTopics.map((topic) => (
        <Section key={topic.title} title={topic.title}>
          <ul>
            {topic.conferences.map((conference) => (
              <li key={`${topic.title}-${conference.acronym}`}>
                <b>{conference.acronym}</b>: {conference.title}
                {conferenceDetails(conference)}.
              </li>
            ))}
          </ul>
        </Section>
      ))}
    </DirectoryDetailPage>
  )
}