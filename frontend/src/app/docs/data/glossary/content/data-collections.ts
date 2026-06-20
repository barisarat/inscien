import type { UtilityDef } from "@/app/docs/data/types"

const entry: UtilityDef = {
  id: "data-collections",
  kind: "codenote",
  name: "Set, List, Bag, Map, Dictionary, Tuple, and Sequence",
  desc: "Core collection terms that appear in programming, mathematics, data processing, and machine learning representations.",
  intro:
    "These collection terms look simple, but they affect how data is counted, ordered, grouped, indexed, and represented. Many machine learning ideas become easier when these basic representation terms are clear.",
  sections: [
    {
      title: "Overview",
      blocks: [
        {
          kind: "text",
          text: [
            "A collection is a way to hold multiple values. Different collection types answer different questions.",
            "The most important differences are whether order matters, whether duplicates are allowed, whether lookup uses a key, and whether the structure is fixed or variable.",
          ],
        },
        {
          kind: "table",
          headers: ["Term", "Order matters", "Duplicates allowed", "Main idea"],
          rows: [
            ["Set", "No", "No", "A collection of unique values"],
            ["List", "Yes", "Yes", "An ordered collection of values"],
            ["Bag", "No", "Yes", "A collection that counts repeated values"],
            ["Map", "Not usually the main point", "Keys are unique", "A key to value relationship"],
            ["Dictionary", "Not usually the main point", "Keys are unique", "A programming version of a map"],
            ["Tuple", "Yes", "Yes", "A fixed ordered group of values"],
            ["Sequence", "Yes", "Usually yes", "A general ordered series of values"],
          ],
        },
      ],
    },
    {
      title: "Set",
      blocks: [
        {
          kind: "text",
          text: [
            "A set is a collection of unique values. If the same value is inserted more than once, it still appears once.",
            "In mathematics and programming, a set is useful when membership matters more than position or count.",
          ],
        },
        {
          kind: "code",
          language: "python",
          code: `items = {"apple", "banana", "apple"}

print(items)`,
        },
        {
          kind: "text",
          text: [
            "The repeated apple value does not become a second separate item. This is the main reason a set is not a good representation when counts matter.",
          ],
        },
      ],
    },
    {
      title: "List",
      blocks: [
        {
          kind: "text",
          text: [
            "A list is an ordered collection. Values can repeat, and the position of each value matters.",
            "Lists are common in code because they preserve the order in which values are added.",
          ],
        },
        {
          kind: "code",
          language: "python",
          code: `items = ["apple", "banana", "apple"]

print(items[0])
print(items[2])`,
        },
      ],
    },
    {
      title: "Bag",
      blocks: [
        {
          kind: "text",
          text: [
            "A bag is also called a multiset. It is a collection where repeated values are allowed, but order is usually not important.",
            "A bag is useful when counts matter but position does not. This is why the term appears in bag of words.",
          ],
        },
        {
          kind: "code",
          language: "python",
          code: `from collections import Counter

items = ["apple", "banana", "apple"]
bag = Counter(items)

print(bag)`,
        },
      ],
    },
    {
      title: "Map and dictionary",
      blocks: [
        {
          kind: "text",
          text: [
            "A map stores relationships from keys to values. A dictionary is a common programming implementation of this idea.",
            "In Python, dictionary keys are unique. If the same key is assigned again, the value is replaced.",
          ],
        },
        {
          kind: "code",
          language: "python",
          code: `scores = {
    "alice": 10,
    "bob": 8,
}

scores["alice"] = 12

print(scores)`,
        },
      ],
    },
    {
      title: "Tuple and sequence",
      blocks: [
        {
          kind: "text",
          text: [
            "A tuple is an ordered group of values. It is often used when values belong together as one record or coordinate.",
            "A sequence is a broader term for ordered values. Text, tokens, arrays, lists, and time series can all be discussed as sequences depending on context.",
          ],
        },
        {
          kind: "code",
          language: "python",
          code: `point = (3, 5)
tokens = ["machine", "learning", "model"]

print(point)
print(tokens)`,
        },
      ],
    },
    {
      title: "Why this matters in ML",
      blocks: [
        {
          kind: "text",
          bullets: [
            "A set is useful for unique vocabulary items.",
            "A list is useful for ordered tokens.",
            "A bag is useful for word counts.",
            "A dictionary is useful for mappings such as token to id or feature to value.",
            "A sequence is important for text, time series, and language models.",
          ],
        },
      ],
    },
  ],
}

export default entry