import type { UtilityDef } from "../types"

const entry: UtilityDef = {
  id: "vscode-note-md-viewer-extension",
  kind: "codenote",
  name: "VS Code Note Markdown Viewer Extension",
  desc: "Create, package, install, and publish a small VS Code extension that opens .note.md files in a custom rendered Markdown viewer.",
  intro:
    "This guide shows how to create a small VS Code extension that registers a custom viewer for .note.md files. The viewer renders Markdown in a clean read view, keeps normal .md files unchanged, and avoids the default Markdown preview behavior where double click can jump back to the source editor. The workflow covers local Node setup, extension files, package configuration, local testing, VSIX installation, Marketplace publishing, access token setup, and patch updates.",
  resources: [
    {
      label: "VS Code Extension API",
      href: "https://code.visualstudio.com/api",
    },
    {
      label: "Publishing VS Code Extensions",
      href: "https://code.visualstudio.com/api/working-with-extensions/publishing-extension",
    },
    {
      label: "Visual Studio Marketplace Publisher Management",
      href: "https://marketplace.visualstudio.com/manage",
    },
    {
      label: "Azure DevOps",
      href: "https://dev.azure.com",
    },
  ],
  sections: [
    {
      title: "Overview",
      blocks: [
        {
          kind: "text",
          bullets: [
            "Use a custom file pattern such as *.note.md for rendered note files.",
            "Keep normal *.md files untouched so regular Markdown behavior still works.",
            "Register a custom editor provider in the VS Code extension.",
            "Render Markdown inside a webview with markdown-it.",
            "Add buttons for Edit Source and Copy Source.",
            "Package the extension as a VSIX for local installation.",
            "Publish to the Marketplace only after local testing works.",
          ],
        },
      ],
    },
    {
      title: "Install Node with nvm",
      blocks: [
        {
          kind: "text",
          text: [
            "Install Node locally on the host system because VS Code extension development and F5 testing work best outside Docker. Docker can compile the project, but local Node is simpler for extension testing, packaging, and installing the VSIX into the local editor.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `# Install nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash

# Reload the current shell
source ~/.bashrc

# Verify nvm is available
command -v nvm

# Install and use the latest LTS Node version
nvm install --lts
nvm use --lts

# Verify Node and npm
node --version
npm --version`,
        },
        {
          kind: "text",
          text: [
            "If the shell runs inside tmux and nvm is not available after installation, reload the shell config or restart the shell in the current pane.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `source ~/.bashrc

# If needed, restart the current shell process
exec bash`,
        },
      ],
    },
    {
      title: "Create the extension project",
      blocks: [
        {
          kind: "text",
          text: [
            "Create a standalone project folder for the extension. The folder name can be anything, but keep it generic if the project will be published later.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `mkdir -p ~/projects/vscode-note-viewer/src
cd ~/projects/vscode-note-viewer

npm init -y`,
        },
        {
          kind: "text",
          text: [
            "Install markdown-it as a runtime dependency and TypeScript plus VS Code types as development dependencies.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `npm install markdown-it
npm install -D typescript @types/node @types/vscode @types/markdown-it @vscode/vsce`,
        },
      ],
    },
    {
      title: "Create package.json",
      blocks: [
        {
          kind: "text",
          text: [
            "Replace the generated package.json with an extension manifest. The publisher can stay as local while testing. Before Marketplace publishing, replace it with the real publisher ID.",
          ],
        },
        {
          kind: "code",
          language: "typescript",
          code: `{
  "name": "note-md-viewer",
  "displayName": "Note Markdown Viewer",
  "description": "A simple custom Markdown note viewer for .note.md files.",
  "version": "0.0.1",
  "publisher": "local",
  "repository": {
    "type": "git",
    "url": "https://github.com/your-username/note-md-viewer.git"
  },
  "engines": {
    "vscode": "^1.90.0"
  },
  "categories": [
    "Other"
  ],
  "activationEvents": [
    "onCustomEditor:noteMdViewer.viewer"
  ],
  "main": "./out/extension.js",
  "contributes": {
    "customEditors": [
      {
        "viewType": "noteMdViewer.viewer",
        "displayName": "Note Markdown Viewer",
        "selector": [
          {
            "filenamePattern": "*.note.md"
          }
        ],
        "priority": "default"
      }
    ],
    "commands": [
      {
        "command": "noteMdViewer.openAsNote",
        "title": "Open as Note Markdown Viewer"
      }
    ]
  },
  "scripts": {
    "compile": "tsc -p ./",
    "watch": "tsc -watch -p ./",
    "package": "vsce package",
    "publish": "vsce publish"
  },
  "dependencies": {
    "markdown-it": "^14.1.0"
  },
  "devDependencies": {
    "@types/markdown-it": "^14.1.2",
    "@types/node": "^20.14.0",
    "@types/vscode": "^1.90.0",
    "@vscode/vsce": "^3.9.1",
    "typescript": "^5.5.0"
  }
}`,
        },
        {
          kind: "text",
          bullets: [
            "The package name is the extension package name.",
            "The displayName is what users see in VS Code.",
            "The publisher must match the Marketplace publisher ID before publishing.",
            "The filenamePattern controls which files open with the custom viewer.",
            "The command name vsce still works even when the package is @vscode/vsce.",
          ],
        },
      ],
    },
    {
      title: "Create tsconfig.json",
      blocks: [
        {
          kind: "text",
          text: [
            "Create a TypeScript config that compiles source files from src into out.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `nano tsconfig.json`,
        },
        {
          kind: "code",
          language: "typescript",
          code: `{
  "compilerOptions": {
    "module": "commonjs",
    "target": "ES2022",
    "outDir": "out",
    "lib": [
      "ES2022",
      "DOM"
    ],
    "sourceMap": true,
    "rootDir": "src",
    "strict": true,
    "noImplicitAny": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "exclude": [
    "node_modules",
    ".vscode-test"
  ]
}`,
        },
      ],
    },
    {
      title: "Create the extension source file",
      blocks: [
        {
          kind: "text",
          text: [
            "Create src/extension.ts. This registers the custom editor, renders Markdown into a webview, and adds buttons for editing and copying the source.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `mkdir -p src
nano src/extension.ts`,
        },
        {
          kind: "code",
          language: "typescript",
          code: `import * as vscode from "vscode"
import MarkdownIt from "markdown-it"

export function activate(context: vscode.ExtensionContext) {
  const provider = new NoteMarkdownViewerProvider()

  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider(
      "noteMdViewer.viewer",
      provider,
      {
        webviewOptions: {
          retainContextWhenHidden: true
        },
        supportsMultipleEditorsPerDocument: true
      }
    )
  )

  context.subscriptions.push(
    vscode.commands.registerCommand("noteMdViewer.openAsNote", async (uri?: vscode.Uri) => {
      const targetUri = uri ?? vscode.window.activeTextEditor?.document.uri

      if (!targetUri) {
        vscode.window.showInformationMessage("Open a .note.md file first.")
        return
      }

      await vscode.commands.executeCommand("vscode.openWith", targetUri, "noteMdViewer.viewer")
    })
  )
}

export function deactivate() {}

class NoteMarkdownViewerProvider implements vscode.CustomTextEditorProvider {
  private readonly markdown: MarkdownIt

  constructor() {
    this.markdown = new MarkdownIt({
      html: false,
      linkify: true,
      breaks: true
    })
  }

  async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel
  ): Promise<void> {
    webviewPanel.webview.options = {
      enableScripts: true
    }

    const updateWebview = () => {
      webviewPanel.webview.html = this.getHtml(document)
    }

    const changeSubscription = vscode.workspace.onDidChangeTextDocument(event => {
      if (event.document.uri.toString() === document.uri.toString()) {
        updateWebview()
      }
    })

    webviewPanel.onDidDispose(() => {
      changeSubscription.dispose()
    })

    webviewPanel.webview.onDidReceiveMessage(async message => {
      if (message.command === "editSource") {
        await vscode.commands.executeCommand("vscode.openWith", document.uri, "default", {
          preview: false
        })
      }

      if (message.command === "copySource") {
        await vscode.env.clipboard.writeText(document.getText())
        vscode.window.showInformationMessage("Note source copied.")
      }
    })

    updateWebview()
  }

  private getHtml(document: vscode.TextDocument): string {
    const nonce = getNonce()
    const rendered = this.markdown.render(document.getText())

    return \`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-\${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Note Markdown Viewer</title>
<style>
  body {
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-editor-foreground);
    background: var(--vscode-editor-background);
    padding: 24px 32px;
    line-height: 1.55;
  }

  .toolbar {
    position: sticky;
    top: 0;
    z-index: 10;
    display: flex;
    gap: 8px;
    padding: 8px 0 16px 0;
    background: var(--vscode-editor-background);
    border-bottom: 1px solid var(--vscode-editorWidget-border);
    margin-bottom: 24px;
  }

  button {
    color: var(--vscode-button-foreground);
    background: var(--vscode-button-background);
    border: none;
    border-radius: 4px;
    padding: 6px 10px;
    cursor: pointer;
  }

  button:hover {
    background: var(--vscode-button-hoverBackground);
  }

  h1 {
    font-size: 1.8em;
    margin-top: 0;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--vscode-editorWidget-border);
  }

  h2 {
    font-size: 1.35em;
    margin-top: 32px;
    padding-bottom: 6px;
    border-bottom: 1px solid var(--vscode-editorWidget-border);
  }

  h3 {
    font-size: 1.1em;
    margin-top: 24px;
  }

  p {
    margin: 10px 0;
  }

  a {
    color: var(--vscode-textLink-foreground);
  }

  code {
    font-family: var(--vscode-editor-font-family);
    background: var(--vscode-textCodeBlock-background);
    padding: 2px 4px;
    border-radius: 4px;
  }

  pre {
    background: var(--vscode-textCodeBlock-background);
    padding: 14px;
    border-radius: 6px;
    overflow-x: auto;
  }

  pre code {
    padding: 0;
    background: transparent;
  }

  table {
    border-collapse: collapse;
    margin: 16px 0;
    width: 100%;
  }

  th,
  td {
    border: 1px solid var(--vscode-editorWidget-border);
    padding: 8px 10px;
    text-align: left;
    vertical-align: top;
  }

  blockquote {
    border-left: 4px solid var(--vscode-textLink-foreground);
    margin-left: 0;
    padding-left: 16px;
    opacity: 0.9;
  }

  hr {
    border: none;
    border-top: 1px solid var(--vscode-editorWidget-border);
    margin: 24px 0;
  }

  ::selection {
    background: var(--vscode-editor-selectionBackground);
  }
</style>
</head>
<body>
  <div class="toolbar">
    <button id="editSource">Edit Source</button>
    <button id="copySource">Copy Source</button>
  </div>

  <main>
    \${rendered}
  </main>

  <script nonce="\${nonce}">
    const vscode = acquireVsCodeApi()

    document.getElementById("editSource").addEventListener("click", () => {
      vscode.postMessage({ command: "editSource" })
    })

    document.getElementById("copySource").addEventListener("click", () => {
      vscode.postMessage({ command: "copySource" })
    })
  </script>
</body>
</html>\`
  }
}

function getNonce() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
  let text = ""

  for (let i = 0; i < 32; i += 1) {
    text += chars.charAt(Math.floor(Math.random() * chars.length))
  }

  return text
}`,
        },
      ],
    },
    {
      title: "Compile the extension",
      blocks: [
        {
          kind: "text",
          text: [
            "Run compile after creating package.json, tsconfig.json, and src/extension.ts. If TypeScript reports that no inputs were found, check that src/extension.ts exists.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `npm run compile`,
        },
        {
          kind: "text",
          text: [
            "A successful compile creates out/extension.js. This is the compiled file that VS Code loads.",
          ],
        },
      ],
    },
    {
      title: "Test in Extension Development Host",
      blocks: [
        {
          kind: "text",
          text: [
            "Open the extension folder in VS Code and press F5. This starts a new Extension Development Host window where the extension can be tested without installing it globally.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `code .`,
        },
        {
          kind: "text",
          bullets: [
            "Press F5 in VS Code.",
            "Create a file named test.note.md in the Extension Development Host window.",
            "Open the file and confirm it opens with the custom rendered viewer.",
            "Use Edit Source to open the raw Markdown.",
            "Use Copy Source to copy the full Markdown source.",
            "Try double clicking text in the rendered view and confirm it selects text instead of jumping to the source editor.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `# Example test file name
test.note.md`,
        },
      ],
    },
    {
      title: "Package as VSIX",
      blocks: [
        {
          kind: "text",
          text: [
            "Package the extension into a VSIX file. The VSIX can be installed locally, attached to GitHub Releases, or published to the Marketplace.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `npm run package`,
        },
        {
          kind: "text",
          text: [
            "The output file should look like note-md-viewer-0.0.1.vsix. Warnings about missing README, LICENSE, repository, or .vscodeignore should be cleaned up before public publishing.",
          ],
        },
      ],
    },
    {
      title: "Install the VSIX locally",
      blocks: [
        {
          kind: "text",
          text: [
            "Install the packaged extension into the normal VS Code environment. Use --force if reinstalling the same version during local testing.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `code --install-extension ./note-md-viewer-0.0.1.vsix

# Reinstall same version during testing
code --install-extension ./note-md-viewer-0.0.1.vsix --force`,
        },
      ],
    },
    {
      title: "Configure notes workspace",
      blocks: [
        {
          kind: "text",
          text: [
            "Set the custom viewer as the default editor for .note.md files inside the notes workspace. This keeps normal .md files separate.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `mkdir -p ~/notes/.vscode
nano ~/notes/.vscode/settings.json`,
        },
        {
          kind: "code",
          language: "typescript",
          code: `{
  "workbench.editorAssociations": {
    "*.note.md": "noteMdViewer.viewer"
  }
}`,
        },
        {
          kind: "text",
          text: [
            "After saving settings, reload the VS Code window or reopen the notes folder.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `code ~/notes`,
        },
      ],
    },
    {
      title: "Recommended note naming",
      blocks: [
        {
          kind: "text",
          text: [
            "Use .note.md only for notes that should open in the custom rendered viewer. Keep regular .md for source-first Markdown editing.",
          ],
        },
        {
          kind: "table",
          headers: ["File", "Use"],
          rows: [
            ["commands.note.md", "Rendered command reference"],
            ["links.note.md", "Rendered link reference"],
            ["project-notes.note.md", "Rendered long-form notes"],
            ["draft.md", "Normal Markdown source editing"],
            ["README.md", "Normal project README"],
          ],
        },
      ],
    },
    {
      title: "Add cleanup files before publishing",
      blocks: [
        {
          kind: "text",
          text: [
            "Before public release, add a README, LICENSE, and .vscodeignore file. This removes packaging warnings and prevents unnecessary files from entering the VSIX package.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `nano README.md
nano LICENSE
nano .vscodeignore`,
        },
        {
          kind: "text",
          text: [
            "A basic .vscodeignore can exclude source files, maps, local VSIX packages, and development-only files. Keep runtime dependencies and out/extension.js in the package.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `.vscode/**
.vscode-test/**
src/**
.gitignore
.git/**
node_modules/@types/**
tsconfig.json
*.vsix
*.map`,
        },
      ],
    },
    {
      title: "Marketplace publisher and token setup",
      blocks: [
        {
          kind: "text",
          text: [
            "Marketplace publishing uses two related but separate pieces. The Marketplace publisher ID identifies who publishes the extension. The Azure DevOps Personal Access Token authenticates the publishing command.",
          ],
        },
        {
          kind: "table",
          headers: ["Item", "Where it is created", "Used for"],
          rows: [
            [
              "Publisher ID",
              "Visual Studio Marketplace publisher management",
              "The publisher field in package.json and the vsce login command",
            ],
            [
              "Azure DevOps organization",
              "Azure DevOps",
              "The account workspace where the Personal Access Token is created",
            ],
            [
              "Personal Access Token",
              "Azure DevOps user settings",
              "The secret pasted into vsce login",
            ],
            [
              "vsce login command",
              "Local terminal",
              "Stores publishing credentials for the publisher ID",
            ],
          ],
        },
        {
          kind: "text",
          bullets: [
            "Open the Marketplace publisher management page.",
            "Create a publisher and note the exact publisher ID.",
            "Use that exact publisher ID in package.json.",
            "Open Azure DevOps with the same Microsoft account.",
            "Create or select an Azure DevOps organization.",
            "Create a Personal Access Token with Marketplace Manage permission.",
            "Run npx vsce login with the Marketplace publisher ID.",
            "Paste the Personal Access Token when prompted.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `# Marketplace publisher management
https://marketplace.visualstudio.com/manage

# Azure DevOps workspace
https://dev.azure.com`,
        },
      ],
    },
    {
      title: "Publisher ID, token, and login command",
      blocks: [
        {
          kind: "text",
          text: [
            "Do not confuse the Marketplace publisher ID with the Azure DevOps organization name or the Personal Access Token. They may look related in a small setup, but they are different concepts.",
          ],
        },
        {
          kind: "table",
          headers: ["Value", "Example", "Where it goes"],
          rows: [
            [
              "Marketplace publisher ID",
              "your-publisher-id",
              "package.json publisher field and npx vsce login argument",
            ],
            [
              "Azure DevOps organization",
              "your-devops-org",
              "Used in Azure DevOps to create the token",
            ],
            [
              "Personal Access Token",
              "Secret token string",
              "Pasted into the terminal after npx vsce login",
            ],
          ],
        },
        {
          kind: "text",
          text: [
            "The package.json publisher must match the Marketplace publisher ID, not the token and not a display name.",
          ],
        },
        {
          kind: "code",
          language: "typescript",
          code: `{
  "publisher": "your-publisher-id"
}`,
        },
        {
          kind: "text",
          text: [
            "The login command also uses the Marketplace publisher ID. After running the command, paste the Azure DevOps Personal Access Token when prompted.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `# Login with the Marketplace publisher ID
npx vsce login your-publisher-id

# Example shape
npx vsce login my-extension-publisher`,
        },
        {
          kind: "text",
          text: [
            "If verification fails with an access denied error, check three things first: the publisher field in package.json, the publisher ID used in npx vsce login, and the Microsoft account used to create the Personal Access Token.",
          ],
        },
      ],
    },
    {
      title: "Publish to Marketplace",
      blocks: [
        {
          kind: "text",
          text: [
            "After login succeeds, publish from the extension folder. Run compile first so the latest out/extension.js is included.",
            "Publish only after npx vsce login succeeds for the same publisher ID used in package.json.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `npm run compile
npx vsce publish`,
        },
        {
          kind: "text",
          text: [
            "After publish, the extension appears under the publisher extension ID. Search indexing can take time, but direct install by ID may work earlier.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `# Direct install by extension ID after publication
code --install-extension your-publisher-id.note-md-viewer`,
        },
      ],
    },
    {
      title: "Publish updates",
      blocks: [
        {
          kind: "text",
          text: [
            "Marketplace versions are immutable. If version 0.0.1 was already published, publishing 0.0.1 again fails. Bump the version for every update, including README-only updates.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `# Bump patch version with npm
npm version patch

# Or publish and bump patch in one command
npx vsce publish patch`,
        },
        {
          kind: "table",
          headers: ["Command", "Use"],
          rows: [
            ["npx vsce publish patch", "Small fixes, README updates, minor UI changes"],
            ["npx vsce publish minor", "New feature update"],
            ["npx vsce publish major", "Breaking change"],
          ],
        },
      ],
    },
    {
      title: "Common errors",
      blocks: [
        {
          kind: "table",
          headers: ["Error", "Cause", "Fix"],
          rows: [
            [
              "npm: command not found",
              "Node and npm are not installed on the host",
              "Install Node with nvm or the system package manager",
            ],
            [
              "Missing script: compile",
              "package.json still has the default npm init content",
              "Replace package.json with the extension manifest that defines scripts.compile",
            ],
            [
              "No inputs were found in config file",
              "src/extension.ts is missing",
              "Create src/extension.ts and run npm run compile again",
            ],
            [
              "Personal Access Token verification failed",
              "Publisher ID, account, or token permissions do not match",
              "Use the exact publisher ID and create a PAT with Marketplace Manage permission",
            ],
            [
              "version already exists",
              "Marketplace does not allow publishing the same version twice",
              "Run npx vsce publish patch or update version manually",
            ],
          ],
        },
      ],
    },
    {
      title: "Security notes",
      blocks: [
        {
          kind: "text",
          bullets: [
            "Do not commit Personal Access Tokens.",
            "Keep the local vsce credential file private.",
            "Do not publish personal note content with the extension repository.",
            "Keep extension source generic and free of private file names, publisher secrets, and local machine details.",
            "Use placeholders in README examples instead of personal account names or private paths.",
          ],
        },
      ],
    },
    {
      title: "Final workflow",
      blocks: [
        {
          kind: "code",
          language: "bash",
          code: `# Development cycle
npm run compile
npm run package
code --install-extension ./note-md-viewer-0.0.1.vsix --force

# Publish cycle
npm run compile
npx vsce publish patch`,
        },
        {
          kind: "text",
          bullets: [
            "Use .note.md for rendered copy-friendly notes.",
            "Use Edit Source from the viewer when the file needs to be changed.",
            "Use normal .md for source-first Markdown editing.",
            "Use workspace settings to make *.note.md open with the custom viewer by default.",
          ],
        },
      ],
    },
  ],
}

export default entry