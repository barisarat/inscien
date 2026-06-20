import type { UtilityDef } from "@/app/docs/data/types"

const entry: UtilityDef = {
  id: "bag-of-words",
  kind: "codenote",
  name: "Bag of Words",
  desc: "A text representation that keeps word counts while ignoring most word order.",
  intro:
    "Bag of words is one of the simplest text representation methods. It is easier to understand when the word bag is read as multiset, not as an everyday physical bag.",
  sections: [
    {
      title: "Overview",
      blocks: [
        {
          kind: "text",
          text: [
            "Bag of words represents a document by counting which words appear and how often they appear.",
            "It usually ignores grammar, sentence structure, and word order. The result is a vector of counts over a vocabulary.",
          ],
        },
      ],
    },
    {
      title: "Simple example",
      blocks: [
        {
          kind: "text",
          text: [
            "Take two short documents. First build a vocabulary from the unique words. Then count how often each vocabulary word appears in each document.",
          ],
        },
        {
          kind: "code",
          language: "python",
          code: `documents = [
    "cat sat cat",
    "dog sat",
]

vocabulary = ["cat", "dog", "sat"]

vectors = [
    [2, 0, 1],
    [0, 1, 1],
]

print(vocabulary)
print(vectors)`,
        },
      ],
    },
    {
      title: "What is kept and what is lost",
      blocks: [
        {
          kind: "table",
          headers: ["Part", "Kept or lost", "Reason"],
          rows: [
            ["Word identity", "Kept", "The vocabulary stores which words are known"],
            ["Word count", "Kept", "The vector stores how often each word appears"],
            ["Word order", "Mostly lost", "The vector does not preserve original positions"],
            ["Grammar", "Mostly lost", "The representation is count based"],
            ["Document length signal", "Partly kept", "Longer documents can have larger counts"],
          ],
        },
      ],
    },
    {
      title: "Why bag means repeated entries",
      blocks: [
        {
          kind: "text",
          text: [
            "In this context, bag means that repeated items matter. If cat appears twice, the count for cat is 2.",
            "This is different from a set. A set would only tell us that cat exists in the document, not that it appears twice.",
          ],
        },
        {
          kind: "code",
          language: "python",
          code: `from collections import Counter

document = "cat sat cat"
tokens = document.split()

word_set = set(tokens)
word_bag = Counter(tokens)

print(word_set)
print(word_bag)`,
        },
      ],
    },
    {
      title: "Common confusion",
      blocks: [
        {
          kind: "text",
          bullets: [
            "Bag of words is not a language model.",
            "Bag of words does not understand word meaning by itself.",
            "Bag of words is not the same as embeddings.",
            "Bag of words can still be useful as a baseline for classification, search, and simple text analysis.",
          ],
        },
      ],
    },
    {
      title: "Related terms",
      blocks: [
        {
          kind: "text",
          bullets: [
            "Token",
            "Vocabulary",
            "Corpus",
            "Document",
            "Term frequency",
            "Sparse vector",
            "TF-IDF",
          ],
        },
      ],
    },
  ],
}

export default entry