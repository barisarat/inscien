import type { UtilityDef } from "../types"

const entry: UtilityDef = {
  id: "vscode-workflow",
  kind: "codenote",
  name: "VS Code Workflow",
  desc: "Keyboard-driven VS Code workflow with a clean UI, visible editor tabs, Explorer navigation, and a small custom shortcut set.",
  intro:
    "Keyboard-driven workflows for VS Code. This page documents the clean UI settings, custom tab shortcuts, Explorer tree navigation, and daily editing shortcuts used for a minimal development setup.",
  sections: [
    {
      title: "Overview",
      blocks: [
        {
          kind: "text",
          bullets: [
            "Use visible editor tabs instead of a single-tab workflow.",
            "Use Ctrl+, and Ctrl+. to move between open tabs.",
            "Use Ctrl+Shift+E to focus the Explorer tree.",
            "Use Ctrl+1 to return from the Explorer tree to the editor.",
            "Use the Explorer tree for file selection, rename, delete, copy, cut, paste, and folder navigation.",
            "Use a minimal VS Code UI so i3 handles the window environment and VS Code stays focused on editing.",
            "Keep the shortcut set small so the workflow is easy to remember.",
          ],
        },
      ],
    },
    {
      title: "Open user settings",
      blocks: [
        {
          kind: "text",
          text: [
            "Open the command palette and edit user settings directly as JSON.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `Ctrl+Shift+P
Preferences: Open User Settings (JSON)`,
        },
        {
          kind: "text",
          text: [
            "On Linux, the file is usually stored here.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `~/.config/Code/User/settings.json`,
        },
        {
          kind: "text",
          text: [
            "For Code OSS, the path may be different.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `~/.config/Code - OSS/User/settings.json`,
        },
      ],
    },
    {
      title: "Open keyboard shortcuts",
      blocks: [
        {
          kind: "text",
          text: [
            "Use the keyboard shortcuts UI for searching command names and checking existing bindings.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `Ctrl+K Ctrl+S`,
        },
        {
          kind: "text",
          text: [
            "Open the raw keyboard shortcuts JSON when the final configuration should be edited directly.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `Ctrl+Shift+P
Preferences: Open Keyboard Shortcuts (JSON)`,
        },
        {
          kind: "text",
          text: [
            "On Linux, the file is usually stored here.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `~/.config/Code/User/keybindings.json`,
        },
        {
          kind: "text",
          text: [
            "For Code OSS, the path may be different.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `~/.config/Code - OSS/User/keybindings.json`,
        },
      ],
    },
    {
      title: "User settings JSON",
      blocks: [
        {
          kind: "text",
          text: [
            "Use this user settings file for the clean VS Code view. It keeps editor tabs visible, disables preview tabs, hides the title/menu/status/activity UI, disables the command center, and keeps the editor focused.",
          ],
        },
        {
          kind: "code",
          language: "json",
          code: `{
  // Theme
  "workbench.colorTheme": "Visual Studio Dark",

  // Editor basics
  "editor.minimap.enabled": false,
  "editor.stickyScroll.enabled": false,
  "files.autoSave": "afterDelay",

  // Extension behavior
  "extensions.ignoreRecommendations": true,
  "extensions.autoUpdate": false,
  "update.mode": "none",

  // TypeScript / JavaScript
  "js/ts.updateImportsOnFileMove.enabled": "never",

  // Telemetry
  "redhat.telemetry.enabled": false,

  // GitHub Copilot disabled
  "github.copilot.enable": {
    "*": false,
    "plaintext": false,
    "markdown": false,
    "scminput": false
  },

  // Minimal UI
  "window.titleBarStyle": "native",
  "window.customTitleBarVisibility": "never",
  "window.menuBarVisibility": "hidden",
  "window.commandCenter": false,
  "workbench.layoutControl.enabled": false,
  "workbench.statusBar.visible": false,
  "workbench.activityBar.location": "hidden",
  "workbench.activityBar.compact": true,
  "workbench.navigationControl.enabled": false,
  "workbench.browser.showInTitleBar": false,

  // Tabs
  "workbench.editor.showTabs": "multiple",
  "workbench.editor.enablePreview": false,
  "workbench.editor.enablePreviewFromQuickOpen": false,

  // Chat layout
  "chat.viewSessions.orientation": "stacked",

  // Confirmations
  "window.confirmSaveUntitledWorkspace": false,
  "explorer.confirmPasteNative": false,

  // Turkish locale allowed for unicode highlighting
  "editor.unicodeHighlight.allowedLocales": {
    "tr": true
  }
}`,
        },
        {
          kind: "text",
          bullets: [
            "window.titleBarStyle sets VS Code to use the native title bar mode.",
            "window.customTitleBarVisibility removes the remaining custom title bar strip.",
            "window.menuBarVisibility hides the File, Edit, Selection, View, Go, Run, Terminal, Help row.",
            "workbench.layoutControl.enabled removes the layout control icon area.",
            "window.commandCenter disables the command center in the title area.",
            "workbench.statusBar.visible hides the bottom status bar.",
            "workbench.activityBar.location hides the left activity icon strip.",
            "workbench.editor.showTabs keeps the normal tab row visible.",
            "workbench.editor.enablePreview disables preview tabs so opened files stay as real tabs.",
            "workbench.editor.enablePreviewFromQuickOpen disables preview behavior from quick open.",
          ],
        },
      ],
    },
    {
      title: "Keyboard shortcuts JSON",
      blocks: [
        {
          kind: "text",
          text: [
            "Use this small keyboard shortcuts file. It keeps only the custom shortcuts used in the workflow.",
          ],
        },
        {
          kind: "code",
          language: "json",
          code: `// Place your key bindings in this file to override the defaults
[
  {
    "key": "ctrl+n",
    "command": "explorer.newFile",
    "when": "filesExplorerFocus && !inputFocus"
  },
  {
    "key": "ctrl+shift+n",
    "command": "explorer.newFolder",
    "when": "filesExplorerFocus && !inputFocus"
  },
  {
    "key": "ctrl+,",
    "command": "workbench.action.previousEditor"
  },
  {
    "key": "ctrl+.",
    "command": "workbench.action.nextEditor"
  }
]`,
        },
        {
          kind: "text",
          bullets: [
            "Ctrl+, moves to the previous open editor tab.",
            "Ctrl+. moves to the next open editor tab.",
            "Ctrl+N creates a new file only when the Explorer tree is focused.",
            "Ctrl+Shift+N creates a new folder only when the Explorer tree is focused.",
            "The when condition keeps file and folder creation scoped to the Explorer tree.",
          ],
        },
      ],
    },
    {
      title: "Reload VS Code after settings changes",
      blocks: [
        {
          kind: "text",
          text: [
            "Some UI settings apply only after the VS Code window reloads. Use the command palette to reload the window.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `Ctrl+Shift+P
Developer: Reload Window`,
        },
        {
          kind: "text",
          text: [
            "A full restart also works.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `pkill code
code`,
        },
      ],
    },
    {
      title: "Effective daily shortcut set",
      blocks: [
        {
          kind: "text",
          text: [
            "This is the small set used in daily work.",
          ],
        },
        {
          kind: "table",
          headers: ["Shortcut", "Action"],
          rows: [
            ["Ctrl+Shift+E", "Focus Explorer tree"],
            ["Ctrl+1", "Focus editor"],
            ["Ctrl+,", "Previous open tab"],
            ["Ctrl+.", "Next open tab"],
            ["Ctrl+N", "New file when Explorer is focused"],
            ["Ctrl+Shift+N", "New folder when Explorer is focused"],
            ["Up / Down", "Move inside Explorer tree"],
            ["Left / Right", "Collapse or expand folders in Explorer"],
            ["Enter", "Open selected file"],
            ["F2", "Rename selected file or folder"],
            ["Delete", "Delete selected file or folder"],
            ["Ctrl+C", "Copy selected file or folder"],
            ["Ctrl+X", "Cut selected file or folder"],
            ["Ctrl+V", "Paste selected file or folder"],
          ],
        },
      ],
    },
    {
      title: "Tab workflow",
      blocks: [
        {
          kind: "text",
          text: [
            "Tabs are visible and preview mode is disabled. Opening a file keeps it as a real tab instead of replacing the previous file.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `Ctrl+,        # previous open tab
Ctrl+.        # next open tab
Ctrl+W        # close current tab
Ctrl+Shift+T  # reopen closed tab`,
        },
        {
          kind: "text",
          bullets: [
            "Ctrl+, and Ctrl+. move between open tabs, not code history.",
            "Go Back and Go Forward are not part of this workflow.",
            "The goal is predictable tab switching, not navigation history.",
          ],
        },
      ],
    },
    {
      title: "Explorer tree workflow",
      blocks: [
        {
          kind: "text",
          text: [
            "Use the Explorer tree when navigating the project structure or managing files and folders.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `Ctrl+Shift+E  # focus Explorer tree
Ctrl+1        # return to editor

Up / Down     # move selection
Right         # expand selected folder
Left          # collapse selected folder
Enter         # open selected file

Ctrl+N        # new file when Explorer is focused
Ctrl+Shift+N  # new folder when Explorer is focused
F2            # rename selected file or folder
Delete        # delete selected file or folder
Ctrl+C        # copy selected file or folder
Ctrl+X        # cut selected file or folder
Ctrl+V        # paste selected file or folder`,
        },
        {
          kind: "text",
          bullets: [
            "The Explorer must be focused before Ctrl+N creates a project file.",
            "The Explorer must be focused before Ctrl+Shift+N creates a project folder.",
            "Use Ctrl+Shift+E first when file or folder creation does not trigger.",
            "Use Ctrl+1 to leave the tree and return to the editor.",
          ],
        },
      ],
    },
    {
      title: "Open files quickly",
      blocks: [
        {
          kind: "text",
          text: [
            "Use quick open when the file name is known. This is faster than expanding the tree deeply.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `Ctrl+P        # open file by name
Ctrl+Shift+F  # search across the project
Ctrl+F        # search current file
Ctrl+G        # go to line
Ctrl+Shift+O  # go to symbol in current file
Ctrl+T        # go to symbol in workspace`,
        },
        {
          kind: "text",
          bullets: [
            "Use Ctrl+P for direct file navigation.",
            "Use Ctrl+Shift+F when the file is unknown but the text is known.",
            "Use Ctrl+F for local search inside the current file.",
          ],
        },
      ],
    },
    {
      title: "Editor groups and splits",
      blocks: [
        {
          kind: "text",
          text: [
            "VS Code arranges open files into editor groups. Splits create additional groups either side by side or stacked, and each group can be focused directly by position.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `Ctrl+\\           # split active editor into a second group
Ctrl+K Ctrl+\\    # split active editor downward
Ctrl+1           # focus editor group 1
Ctrl+2           # focus editor group 2
Ctrl+3           # focus editor group 3
Ctrl+K <arrow>   # move current editor to another group`,
        },
      ],
    },
    {
      title: "Create a 2x2 layout",
      blocks: [
        {
          kind: "text",
          text: [
            "First split side by side, then split one of the groups downward.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `Ctrl+\\          # left and right split
Ctrl+K Ctrl+\\  # split the active group downward`,
        },
      ],
    },
    {
      title: "Text editing shortcuts",
      blocks: [
        {
          kind: "text",
          text: [
            "These are the useful editing shortcuts to keep. They cover comments, line movement, selection, and common save or undo actions.",
          ],
        },
        {
          kind: "table",
          headers: ["Shortcut", "Action"],
          rows: [
            ["Ctrl+S", "Save"],
            ["Ctrl+Z", "Undo"],
            ["Ctrl+Shift+Z", "Redo"],
            ["Ctrl+/", "Toggle line comment"],
            ["Ctrl+D", "Select next occurrence"],
            ["Alt+Up / Alt+Down", "Move current line up or down"],
            ["Shift+Alt+Up / Shift+Alt+Down", "Duplicate current line"],
            ["Ctrl+Shift+K", "Delete current line"],
            ["Ctrl+Left / Ctrl+Right", "Move word by word"],
            ["Ctrl+Shift+Left / Ctrl+Shift+Right", "Select word by word"],
          ],
        },
      ],
    },
    {
      title: "Troubleshooting settings save errors",
      blocks: [
        {
          kind: "text",
          text: [
            "If VS Code reports an error while saving settings, check that the JSON is valid and that the file is owned by the current user.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `ls -l ~/.config/Code/User/settings.json
ls -l ~/.config/Code/User/keybindings.json`,
        },
        {
          kind: "text",
          text: [
            "Fix ownership if the files are owned by root or another user.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `sudo chown "$USER:$USER" ~/.config/Code/User/settings.json
sudo chown "$USER:$USER" ~/.config/Code/User/keybindings.json`,
        },
      ],
    },
    {
      title: "File locations",
      blocks: [
        {
          kind: "text",
          bullets: [
            "User settings: ~/.config/Code/User/settings.json",
            "Keyboard shortcuts: ~/.config/Code/User/keybindings.json",
            "Code OSS user settings: ~/.config/Code - OSS/User/settings.json",
            "Code OSS keyboard shortcuts: ~/.config/Code - OSS/User/keybindings.json",
          ],
        },
      ],
    },
  ],
}

export default entry