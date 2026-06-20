import type { UtilityDef } from "../types"

const entry: UtilityDef = {
  id: "tqdm-iprogress-fix",
  kind: "codenote",
  name: "Fix tqdm IProgress Warning in VS Code",
  desc: "Resolve the TqdmWarning: IProgress not found by upgrading jupyter, ipywidgets, and related packages.",
  intro:
    "This warning appears when tqdm cannot find the ipywidgets progress bar extension in the current Jupyter environment. The fix is to upgrade the relevant packages inside the active venv.",
  sections: [
    {
      title: "The warning",
      blocks: [
        {
          kind: "code",
          language: "bash",
          code: `TqdmWarning: IProgress not found. Please update jupyter and ipywidgets.
See https://ipywidgets.readthedocs.io/en/stable/user_install.html`,
        },
      ],
    },
    {
      title: "Fix",
      blocks: [
        {
          kind: "text",
          text: [
            "Run this inside the venv the notebook kernel uses. In VS Code, activate the venv in the terminal first, or run it directly in a notebook cell.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `pip install --upgrade pip jupyter ipywidgets widgetsnbextension jupyterlab_widgets tqdm`,
        },
        {
          kind: "text",
          text: ["After the install, reload the VS Code window and rerun the kernel:"],
          bullets: [
            "Ctrl+Shift+P → Developer: Reload Window",
            "Then restart the kernel from the notebook toolbar",
          ],
        },
      ],
    },
  ],
}

export default entry