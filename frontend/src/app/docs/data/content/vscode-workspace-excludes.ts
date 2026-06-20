import type { UtilityDef } from "../types"

const entry: UtilityDef = {
  id: "vscode-workspace-excludes",
  kind: "codenote",
  name: "VS Code Workspace Excludes",
  desc: "Hide generated folders from the VS Code Explorer and exclude them from search results.",
  intro:
    "This document shows how to use a project-level VS Code settings file to hide generated folders such as __pycache__, .next, and node_modules from the Explorer sidebar and normal search results.",
  sections: [
    {
      title: "Create the workspace settings file",
      blocks: [
        {
          kind: "text",
          text: [
            "Create a .vscode directory inside the project root. VS Code reads settings.json from this folder automatically when the project is opened.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `mkdir -p .vscode
nano .vscode/settings.json`,
        },
      ],
    },
    {
      title: "Add Explorer and search excludes",
      blocks: [
        {
          kind: "text",
          text: [
            "Use files.exclude to hide folders from the Explorer sidebar. Use search.exclude to remove them from normal VS Code search results.",
          ],
        },
        {
          kind: "code",
          language: "typescript",
          code: `{
  "files.exclude": {
    "**/__pycache__": true,
    "**/.next": true,
    "**/node_modules": true
  },
  "search.exclude": {
    "**/__pycache__": true,
    "**/.next": true,
    "**/node_modules": true
  }
}`,
        },
      ],
    },
    {
      title: "Apply the settings",
      blocks: [
        {
          kind: "text",
          text: [
            "VS Code applies the workspace settings automatically. If the window is already open, reload it once after saving the file.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `code .`,
        },
        {
          kind: "text",
          text: [
            "If VS Code is already open, use the command palette and run Developer: Reload Window.",
          ],
        },
      ],
    },
    {
      title: "Confirm the project layout",
      blocks: [
        {
          kind: "text",
          text: [
            "The .vscode/settings.json file must be inside the same project root that is opened in VS Code.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `my-project/
  .vscode/
    settings.json
  backend/
  frontend/
  node_modules/
  .next/`,
        },
      ],
    },
    {
      title: "What each rule does",
      blocks: [
        {
          kind: "table",
          headers: ["Setting", "Purpose"],
          rows: [
            ["files.exclude", "Hides matching files and folders from the Explorer sidebar."],
            ["search.exclude", "Prevents matching files and folders from appearing in normal search results."],
            ["**/__pycache__", "Matches Python bytecode cache folders at any depth."],
            ["**/.next", "Matches Next.js build output folders at any depth."],
            ["**/node_modules", "Matches Node.js dependency folders at any depth."],
          ],
        },
      ],
    },
    {
      title: "Notes",
      blocks: [
        {
          kind: "text",
          text: [
            "These settings are project-specific when stored under .vscode/settings.json.",
            "Copy the same .vscode/settings.json file into other projects when the same behavior is needed.",
            "If settings.json already exists, merge the files.exclude and search.exclude blocks into the existing JSON instead of replacing the whole file.",
          ],
        },
      ],
    },
  ],
}

export default entry