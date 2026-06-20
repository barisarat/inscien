import type { UtilityDef } from "@/app/docs/data/types"

const entry: UtilityDef = {
  id: "sql-database-and-table",
  kind: "codenote",
  name: "SQL Database and SQL Table",
  desc: "Basic SQL storage terms: the database as a managed collection of objects and the table as rows and columns.",
  intro:
    "SQL database and SQL table are foundational terms. A database is the managed environment that stores objects. A table is one of the main objects inside it, organized as rows and columns.",
  sections: [
    {
      title: "Overview",
      blocks: [
        {
          kind: "table",
          headers: ["Term", "Meaning", "Example"],
          rows: [
            ["SQL", "A language used to define, query, and modify relational data", "SELECT, INSERT, UPDATE"],
            ["SQL database", "A managed database that contains tables and other database objects", "app_db"],
            ["SQL table", "A relation-like structure with rows and columns", "users"],
            ["Row", "One record in a table", "One user"],
            ["Column", "One named attribute in a table", "email"],
          ],
        },
      ],
    },
    {
      title: "What SQL means",
      blocks: [
        {
          kind: "text",
          text: [
            "SQL stands for Structured Query Language. It is used to create schema, read data, insert rows, update rows, delete rows, and define constraints.",
            "In practice, SQL is used with database systems such as PostgreSQL, MySQL, SQL Server, SQLite, and others.",
          ],
        },
      ],
    },
    {
      title: "SQL database",
      blocks: [
        {
          kind: "text",
          text: [
            "A SQL database is a managed collection of database objects. Tables are the most visible object, but a database can also contain views, indexes, constraints, functions, stored procedures, users, permissions, and metadata.",
            "The exact meaning of database can vary slightly between database systems, but in application development it usually means the named storage area used by an application.",
          ],
        },
      ],
    },
    {
      title: "SQL table",
      blocks: [
        {
          kind: "text",
          text: [
            "A SQL table stores data in rows and columns. Each row is a record. Each column defines one attribute of that record.",
            "Tables usually have constraints that protect data quality, such as primary keys, foreign keys, not null constraints, unique constraints, and check constraints.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `CREATE TABLE users (
    id INT PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL
)`,
        },
      ],
    },
    {
      title: "Table as a relation",
      blocks: [
        {
          kind: "text",
          text: [
            "In relational theory, a table is close to the idea of a relation. A relation represents a set of rows with the same attributes.",
            "In real SQL systems, tables can behave differently from pure mathematical relations. For example, SQL tables can have ordering in query output only when ORDER BY is used, and duplicate rows can exist unless constraints prevent them.",
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
            "SQL is the language. The database system is the software. The database is the managed storage area. The table is a structured object inside it.",
            "A table is not a spreadsheet, although it may visually look similar.",
            "A row is not automatically unique unless a key or constraint makes it unique.",
            "A column type alone is not always enough. Constraints are also needed for valid data.",
          ],
        },
      ],
    },
  ],
}

export default entry