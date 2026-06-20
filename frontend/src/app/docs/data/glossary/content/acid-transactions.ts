import type { UtilityDef } from "@/app/docs/data/types"

const entry: UtilityDef = {
  id: "acid-transactions",
  kind: "codenote",
  name: "ACID",
  desc: "A transaction reliability model based on atomicity, consistency, isolation, and durability.",
  intro:
    "ACID describes guarantees expected from database transactions. It is important for systems where partial writes, invalid state, concurrent changes, or lost data would create serious correctness problems.",
  sections: [
    {
      title: "Overview",
      blocks: [
        {
          kind: "table",
          headers: ["Letter", "Term", "Meaning"],
          rows: [
            ["A", "Atomicity", "A transaction fully completes or fully rolls back"],
            ["C", "Consistency", "A transaction moves the database from one valid state to another valid state"],
            ["I", "Isolation", "Concurrent transactions should not corrupt each other"],
            ["D", "Durability", "Committed data should survive failures"],
          ],
        },
      ],
    },
    {
      title: "Atomicity",
      blocks: [
        {
          kind: "text",
          text: [
            "Atomicity means a transaction is treated as one unit.",
            "If one part fails, the whole transaction should be rolled back. This prevents partial updates.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `BEGIN;

UPDATE accounts
SET balance = balance - 100
WHERE id = 1;

UPDATE accounts
SET balance = balance + 100
WHERE id = 2;

COMMIT;`,
        },
      ],
    },
    {
      title: "Consistency",
      blocks: [
        {
          kind: "text",
          text: [
            "Consistency means transactions should preserve database rules.",
            "Rules can include primary keys, foreign keys, check constraints, not null constraints, and application-level invariants.",
          ],
        },
      ],
    },
    {
      title: "Isolation",
      blocks: [
        {
          kind: "text",
          text: [
            "Isolation controls how concurrent transactions see each other's changes.",
            "Without proper isolation, two users or processes can read and write overlapping data in ways that produce incorrect results.",
          ],
        },
      ],
    },
    {
      title: "Durability",
      blocks: [
        {
          kind: "text",
          text: [
            "Durability means that once a transaction is committed, the database should keep that committed result even after a crash or restart.",
            "Database systems use mechanisms such as logs, checkpoints, and storage synchronization to support durability.",
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
            "ACID atomicity is about all-or-nothing transactions.",
            "Atomic value in relational modeling is about one indivisible value in a table cell.",
            "Consistency in ACID does not mean every business rule is magically correct. The rules must be defined and enforced.",
            "Isolation level is configurable in many databases, so behavior can differ by database and configuration.",
          ],
        },
      ],
    },
  ],
}

export default entry