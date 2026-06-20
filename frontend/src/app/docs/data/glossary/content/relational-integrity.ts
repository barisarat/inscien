import type { UtilityDef } from "@/app/docs/data/types"

const entry: UtilityDef = {
  id: "relational-integrity",
  kind: "codenote",
  name: "Domain, Entity, Referential Integrity, and Atomic Values",
  desc: "Core relational integrity ideas that protect valid values, identifiable rows, valid relationships, and single-value cells.",
  intro:
    "Relational integrity is a broad way to discuss data correctness in relational databases. The standard terms usually include domain integrity, entity integrity, and referential integrity. Atomic values are closely related because they describe how values should be stored inside table cells.",
  sections: [
    {
      title: "Overview",
      blocks: [
        {
          kind: "table",
          headers: ["Term", "Question it answers", "Typical SQL mechanism"],
          rows: [
            ["Domain integrity", "Is this column value valid?", "Data type, NOT NULL, CHECK"],
            ["Entity integrity", "Can this row be uniquely identified?", "PRIMARY KEY"],
            ["Referential integrity", "Does this relationship point to a valid row?", "FOREIGN KEY"],
            ["Atomic value", "Does this cell hold one indivisible value?", "Schema design"],
          ],
        },
      ],
    },
    {
      title: "Domain integrity",
      blocks: [
        {
          kind: "text",
          text: [
            "Domain integrity means values in a column must belong to the allowed domain for that column.",
            "The domain can include type, length, range, format, allowed set, and nullability.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `CREATE TABLE products (
    id INT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    price DECIMAL(10, 2) NOT NULL CHECK (price >= 0)
)`,
        },
        {
          kind: "text",
          text: [
            "In this example, price must be a decimal value, must not be null, and must be greater than or equal to zero.",
          ],
        },
      ],
    },
    {
      title: "Entity integrity",
      blocks: [
        {
          kind: "text",
          text: [
            "Entity integrity means each row should be uniquely identifiable.",
            "This is usually enforced with a primary key. A primary key should be unique and not null.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `CREATE TABLE users (
    id INT PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE
)`,
        },
      ],
    },
    {
      title: "Referential integrity",
      blocks: [
        {
          kind: "text",
          text: [
            "Referential integrity means relationships between tables should stay valid.",
            "A foreign key should point to an existing referenced row, unless the relationship is optional and null is allowed.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `CREATE TABLE orders (
    id INT PRIMARY KEY,
    user_id INT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
)`,
        },
      ],
    },
    {
      title: "Atomic value",
      blocks: [
        {
          kind: "text",
          text: [
            "An atomic value is a single indivisible value stored in one cell.",
            "For relational design, a cell should not contain a list of separate values that need to be independently searched, joined, counted, or constrained.",
          ],
        },
        {
          kind: "table",
          headers: ["Design", "Example", "Issue"],
          rows: [
            ["Non-atomic", "phone_numbers = '111,222,333'", "Individual phone numbers are hidden inside one string"],
            ["Atomic", "one phone number per row", "Each phone number can be queried and constrained"],
          ],
        },
      ],
    },
    {
      title: "Atomic value example",
      blocks: [
        {
          kind: "code",
          language: "bash",
          code: `CREATE TABLE user_phone_numbers (
    id INT PRIMARY KEY,
    user_id INT NOT NULL,
    phone_number VARCHAR(50) NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
)`,
        },
      ],
    },
    {
      title: "Common confusion",
      blocks: [
        {
          kind: "text",
          bullets: [
            "Relational integrity is a broad phrase. Referential integrity is the specific foreign key relationship rule.",
            "Domain integrity is not only about data type. It also includes allowed values and constraints.",
            "Entity integrity is about row identity, not business correctness by itself.",
            "Atomic does not mean short. It means the value should not be split into separate meaningful values for that design.",
          ],
        },
      ],
    },
  ],
}

export default entry