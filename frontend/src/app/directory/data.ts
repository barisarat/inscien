export interface DirectoryEntry {
  id: string
  name: string
  desc: string
  category: string
}

export const CATEGORY_ORDER = ["Topics"] as const

export const directory: DirectoryEntry[] = [
  {
    id: "quantitative-finance",
    name: "Quantitative Finance",
    desc: "Options analytics, market intelligence, and AI research tools for quant workflows.",
    category: "Topics",
  },
  {
    id: "conferences",
    name: "2026 Conferences",
    desc: "ML / AI / data mining conference deadlines and dates.",
    category: "Topics",
  },
    {
    id: "journals",
    name: "Journals",
    desc: "ML / AI / data mining venues.",
    category: "Topics",
  },
    {
    id: "scholars",
    name: "Scholars",
    desc: "ML / AI researchers",
    category: "Topics",
  },
    {
    id: "dash-samples",
    name: "Dash Library Samples",
    desc: "Example apps and galleries built with Plotly Dash.",
    category: "Topics",
  },
      {
    id: "open-books",
    name: "Open Books",
    desc: "Books on DL/ML.",
    category: "Topics",
  },
  {
  id: "data-products",
  name: "Data Products",
  desc: "Leading data, analytics, and AI platform vendors.",
  category: "Topics",
    },
      {
  id: "developer-products",
  name: "Developer Products",
  desc: "Developer tools",
  category: "Topics",
    },
{
  id: "courses",
  name: "Courses",
  desc: "Free university lectures and course materials.",
  category: "Topics",
},
{
  id: "cpp-sources",
  name: "C++ Sources",
  desc: "Compilers, playgrounds, and references for C++.",
  category: "Topics",
},
{
  id: "reading-research",
  name: "Reading / Research",
  desc: "Theses, technical books, and academic publications.",
  category: "Topics",
},
{
  id: "phd",
  name: "PhD",
  desc: "Application guides, statements of purpose, and program resources.",
  category: "Topics",
},
]