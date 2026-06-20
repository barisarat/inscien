import type { UtilityDef } from "@/app/docs/data/types"

const entry: UtilityDef = {
  id: "programming-paradigms",
  kind: "codenote",
  name: "Declarative and Imperative Language",
  desc: "Two ways of expressing computation: describing what result is wanted or describing the steps to produce it.",
  intro:
    "Declarative and imperative styles appear in programming languages, query languages, UI frameworks, data pipelines, and infrastructure tools. The distinction is practical because it affects how code is read, optimized, and maintained.",
  sections: [
    {
      title: "Overview",
      blocks: [
        {
          kind: "table",
          headers: ["Term", "Focus", "Typical question"],
          rows: [
            ["Declarative", "The desired result", "What should be true?"],
            ["Imperative", "The exact steps", "How should the machine do it?"],
          ],
        },
      ],
    },
    {
      title: "Imperative language",
      blocks: [
        {
          kind: "text",
          text: [
            "Imperative code describes the steps required to produce a result. It often uses explicit control flow, mutation, loops, and assignments.",
            "This style is natural when the exact order of operations matters.",
          ],
        },
        {
          kind: "code",
          language: "python",
          code: `numbers = [1, 2, 3, 4]
result = []

for number in numbers:
    if number > 2:
        result.append(number)

print(result)`,
        },
      ],
    },
    {
      title: "Declarative language",
      blocks: [
        {
          kind: "text",
          text: [
            "Declarative code describes the result more directly. The runtime, database engine, framework, or tool decides the execution details.",
            "SQL is a common example. A query describes the data wanted, while the database decides the execution plan.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `SELECT name
FROM users
WHERE score > 2`,
        },
      ],
    },
    {
      title: "Same idea in programming",
      blocks: [
        {
          kind: "text",
          text: [
            "Even inside a general purpose programming language, code can be written in a more declarative style.",
          ],
        },
        {
          kind: "code",
          language: "python",
          code: `numbers = [1, 2, 3, 4]
result = [number for number in numbers if number > 2]

print(result)`,
        },
      ],
    },
    {
      title: "Common examples",
      blocks: [
        {
          kind: "table",
          headers: ["Area", "More declarative", "More imperative"],
          rows: [
            ["Database", "SQL query", "Manual row scanning"],
            ["Frontend", "React component state to UI", "Manual DOM mutation"],
            ["Infrastructure", "Docker Compose service definition", "Manual process startup commands"],
            ["Data processing", "Pandas expression", "Manual loops over rows"],
          ],
        },
      ],
    },
    {
      title: "Common confusion",
      blocks: [
        {
          kind: "text",
          bullets: [
            "Declarative does not mean no execution happens. It means execution details are delegated.",
            "Imperative does not mean bad. It is useful when detailed control is required.",
            "Many systems mix both styles.",
            "SQL is declarative, but database engines still execute detailed physical steps internally.",
          ],
        },
      ],
    },
  ],
}

export default entry