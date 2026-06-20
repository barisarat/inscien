import type { UtilityDef } from "../types"

const entry: UtilityDef = {
  id: "nbconvert-html",
  kind: "codenote",
  name: "Jupyter Notebook to HTML",
  desc: "Convert a Jupyter notebook to a clean HTML file with output only.",
  intro: "Export a notebook as HTML without showing the source code so you can share results as a standalone page.",
  sections: [
    {
      title: "Quick reference",
      blocks: [
        {
          kind: "code",
          language: "bash",
          code: `jupyter nbconvert --to html --no-input your_notebook.ipynb

# Safer when working inside a venv
python -m jupyter nbconvert --to html --no-input your_notebook.ipynb`,
        },
      ],
    },
    {
      title: "Create a venv and install nbconvert",
      blocks: [
        {
          kind: "text",
          text: [
            "For a new virtual environment, install nbconvert first. This is enough when the notebook already has saved outputs and you only need to export them to HTML.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `python -m venv .venv
source .venv/bin/activate

python -m pip install --upgrade pip
python -m pip install nbconvert`,
        },
        {
          kind: "text",
          text: [
            "Run the conversion through Python when you want to make sure the active venv is used.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `python -m jupyter nbconvert --to html --no-input your_notebook.ipynb`,
        },
      ],
    },
    {
      title: "Install for site workflow",
      blocks: [
        {
          kind: "text",
          text: [
            "For a site workflow that exports notebooks repeatedly, install nbconvert, jupyter, and ipykernel in the same venv.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `python -m pip install nbconvert jupyter ipykernel`,
        },
      ],
    },
    {
      title: "Execute during conversion",
      blocks: [
        {
          kind: "text",
          text: [
            "If the notebook does not already have saved outputs, execute it during conversion. The venv must also contain the notebook dependencies needed by the notebook itself.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `python -m pip install nbconvert ipykernel

python -m jupyter nbconvert --to html --no-input --execute your_notebook.ipynb`,
        },
      ],
    },
    {
      title: "Verify the venv tools",
      blocks: [
        {
          kind: "text",
          text: [
            "Check that Python, pip, and jupyter all come from the active virtual environment.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `which python
which pip
which jupyter

python -m jupyter nbconvert --version

# Expected paths should point into .venv:
# /home/example-user/projects/tools/nbconvert/.venv/bin/python
# /home/example-user/projects/tools/nbconvert/.venv/bin/pip
# /home/example-user/projects/tools/nbconvert/.venv/bin/jupyter`,
        },
      ],
    },
    {
      title: "Flags",
      blocks: [
        {
          kind: "text",
          bullets: [
            "--to html — output format",
            "--no-input — strips all code cells from the output, leaving only results and markdown",
            "--execute — runs the notebook before writing the HTML output",
          ],
        },
        {
          kind: "text",
          text: [
            "The output file is placed in the same directory as the notebook with a .html extension. To write to a different location:",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `python -m jupyter nbconvert --to html --no-input your_notebook.ipynb --output-dir ./exports`,
        },
      ],
    },
  ],
}

export default entry