import type { UtilityDef } from "../types"

const entry: UtilityDef = {
  id: "libreoffice-reference",
  kind: "codenote",
  name: "LibreOffice Reference",
  desc: "Use LibreOffice on Arch Linux for writing documents, editing office files, opening PDFs visually, and exporting documents to PDF.",
  intro:
    "LibreOffice is the main office suite on Linux. It provides separate apps for documents, spreadsheets, presentations, drawings, formulas, and database files. The same libreoffice command can launch each app with a different parameter.",
  sections: [
    {
      title: "Install LibreOffice",
      blocks: [
        {
          kind: "text",
          text: [
            "Install LibreOffice from the Arch repositories. libreoffice-fresh is usually the best default choice for a normal desktop setup.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `sudo pacman -S libreoffice-fresh`,
        },
      ],
    },
    {
      title: "Launch office apps",
      blocks: [
        {
          kind: "text",
          text: [
            "LibreOffice is the host suite. Each app can be launched from the same libreoffice command by passing the target app name.",
          ],
        },
        {
          kind: "table",
          headers: ["Command", "App", "Use case"],
          rows: [
            ["libreoffice --writer", "Writer", "Text documents, letters, notes, translations, PDF export"],
            ["libreoffice --calc", "Calc", "Spreadsheets, tables, CSV files"],
            ["libreoffice --impress", "Impress", "Presentations and slide decks"],
            ["libreoffice --draw", "Draw", "Drawings, diagrams, and visual PDF edits"],
            ["libreoffice --math", "Math", "Formula documents"],
            ["libreoffice --base", "Base", "Database-style documents"],
          ],
        },
      ],
    },
    {
      title: "Open a file directly",
      blocks: [
        {
          kind: "text",
          text: [
            "A file can be opened directly. LibreOffice chooses the matching app based on the file type.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `libreoffice document.odt
libreoffice document.docx
libreoffice spreadsheet.xlsx
libreoffice presentation.pptx`,
        },
        {
          kind: "text",
          text: [
            "Use Writer for .odt and .docx files. .odt is OpenDocument Text, the native LibreOffice Writer format.",
          ],
        },
      ],
    },
    {
      title: "Create a blank document",
      blocks: [
        {
          kind: "text",
          text: [
            "Use Writer when starting from a blank document. This is the normal choice for letters, explanations, translation notes, declarations, and formal text documents.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `libreoffice --writer`,
        },
      ],
    },
    {
      title: "Export a document to PDF",
      blocks: [
        {
          kind: "text",
          text: [
            "From the LibreOffice interface, use File, Export As, then Export Directly as PDF. This is the safest method when you want to review the document before creating the final PDF.",
          ],
        },
        {
          kind: "text",
          text: [
            "For command-line export, use headless mode. This creates a PDF in the current directory.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `libreoffice --headless --convert-to pdf document.odt`,
        },
      ],
    },
    {
      title: "Edit an existing PDF visually",
      blocks: [
        {
          kind: "text",
          text: [
            "Use Draw when the task is to open a PDF and make visual changes. This is useful for small text changes, moving objects, adding text boxes, or adjusting document pages visually.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `libreoffice --draw document.pdf`,
        },
        {
          kind: "text",
          bullets: [
            "PDF editing is not the same as editing a Word document.",
            "Complex PDFs may open with shifted layout or split text boxes.",
            "For scanned PDFs, the page may behave like an image instead of editable text.",
            "After editing, export the result back to PDF from File, Export As.",
          ],
        },
      ],
    },
    {
      title: "Daily use summary",
      blocks: [
        {
          kind: "table",
          headers: ["Task", "Use"],
          rows: [
            ["Write a new document", "LibreOffice Writer"],
            ["Export a document to PDF", "Writer PDF export"],
            ["Open and edit .odt", "Writer"],
            ["Open and edit .docx", "Writer"],
            ["Work with spreadsheets", "Calc"],
            ["Prepare slides", "Impress"],
            ["Edit a PDF visually", "Draw"],
            ["Create formulas", "Math"],
            ["Work with database documents", "Base"],
          ],
        },
      ],
    },
  ],
}

export default entry