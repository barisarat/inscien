import type { UtilityDef } from "../types"

const entry: UtilityDef = {
  id: "nvm-install-ubuntu",
  kind: "codenote",
  name: "Install NVM on Ubuntu",
  desc: "Install Node Version Manager on Ubuntu, then install and switch between Node.js versions per user without touching system packages.",
  intro:
    "NVM (Node Version Manager) installs and manages multiple Node.js versions per user. The apt nodejs package installs system-wide, is often outdated, and makes version switching difficult. NVM avoids both problems and is the standard for modern JS development.",
  resources: [
    { label: "nvm-sh/nvm on GitHub", href: "https://github.com/nvm-sh/nvm" },
  ],
  sections: [
    {
      title: "Install NVM",
      blocks: [
        {
          kind: "text",
          text: [
            "The install script clones the NVM repo into ~/.nvm and adds initialization lines to ~/.bashrc or ~/.zshrc. Check the nvm-sh/nvm repo for the current release and replace v0.40.4 below if a newer version is out.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.4/install.sh | bash`,
        },
      ],
    },
    {
      title: "Activate NVM",
      blocks: [
        {
          kind: "text",
          text: ["Either restart the terminal, or reload the shell config in the current session."],
        },
        {
          kind: "code",
          language: "bash",
          code: `source ~/.bashrc`,
        },
        {
          kind: "text",
          text: ["Verify the install."],
        },
        {
          kind: "code",
          language: "bash",
          code: `nvm --version`,
        },
      ],
    },
    {
      title: "Install Node.js",
      blocks: [
        {
          kind: "text",
          text: ["Install the current LTS, set it as the active version, and pin it as the default for new shells."],
        },
        {
          kind: "code",
          language: "bash",
          code: `nvm install --lts
nvm use --lts
nvm alias default lts/*`,
        },
        {
          kind: "text",
          text: ["Confirm node and npm are available."],
        },
        {
          kind: "code",
          language: "bash",
          code: `node -v
npm -v`,
        },
      ],
    },
    {
      title: "Manage versions",
      blocks: [
        {
          kind: "code",
          language: "bash",
          code: `nvm install 20            # install a specific major version
nvm use 20                # switch the current shell to that version
nvm alias default 20      # set the default for new shells
nvm ls                    # list installed versions
nvm uninstall 18          # remove a version`,
        },
      ],
    },
    {
      title: "Inspect before piping (optional)",
      blocks: [
        {
          kind: "text",
          text: [
            "Piping a remote script straight into bash should only be done for trusted sources. To inspect the script before running it, download first.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `curl -O https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.4/install.sh
less install.sh
bash install.sh`,
        },
      ],
    },
  ],
}

export default entry