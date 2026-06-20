import type { UtilityDef } from "../types"

const entry: UtilityDef = {
  id: "python-multiple-versions-ubuntu",
  kind: "codenote",
  name: "Multiple Python Versions on Ubuntu",
  desc: "Install several Python versions side by side on Ubuntu using the deadsnakes PPA, then create a venv pinned to a specific version.",
  intro:
    "Ubuntu ships with one Python version per release. The deadsnakes PPA provides additional Python versions as separate packages so multiple versions can coexist. Each version installs as its own binary (python3.9, python3.10, etc.) and can be used to create version pinned virtual environments.",
  sections: [
    {
      title: "Add the deadsnakes PPA",
      blocks: [
        {
          kind: "code",
          language: "bash",
          code: `sudo apt install software-properties-common
sudo add-apt-repository ppa:deadsnakes/ppa
sudo apt update`,
        },
      ],
    },
    {
      title: "Install Python versions",
      blocks: [
        {
          kind: "text",
          text: ["Install only the versions actually needed. Each one installs alongside the system Python without replacing it."],
        },
        {
          kind: "code",
          language: "bash",
          code: `sudo apt install python3.9 python3.10 python3.11 python3.12 python3.13`,
        },
        {
          kind: "text",
          text: ["Verify the installed binaries:"],
        },
        {
          kind: "code",
          language: "bash",
          code: `ls /usr/bin/python3*`,
        },
      ],
    },
    {
      title: "Install venv support",
      blocks: [
        {
          kind: "text",
          text: [
            "On Ubuntu, the venv module ships in a separate package per version. Install the matching venv package for each Python version that needs to create virtual environments.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `sudo apt install python3.9-venv python3.10-venv python3.11-venv python3.12-venv`,
        },
      ],
    },
    {
      title: "Create a venv with a specific version",
      blocks: [
        {
          kind: "text",
          text: ["Call the version specific binary to create the venv. The resulting environment is pinned to that interpreter."],
        },
        {
          kind: "code",
          language: "bash",
          code: `python3.11 -m venv myenv
source myenv/bin/activate
python --version
pip install --upgrade pip`,
        },
      ],
    },
  ],
}

export default entry