// src/app/docs/data/jupyter-kernels.ts

import type { UtilityDef } from "../types"

const entry: UtilityDef = {
  id:   "jupyter-kernels",
  kind: "codenote",
  name: "Register Jupyter Kernels",
  desc: "Register and list Jupyter kernels using venv",

  intro:
    "In this case we assume no jupyter is availble in the global environment, instead we will use the venv to install the jupyter and manage the operations after venv activation.",

  sections: [

    

    {
      title: "Register a venv as a kernel",
      blocks: [
        {
          kind: "text",
          text: ["Typical pattern with a project-local venv:"],
        },
        {
          kind: "code",
          language: "bash",
          code: `cd /home/$USER/projects/my_ml_project
source .venv/bin/activate
pip install ipykernel
python -m ipykernel install --user --name=my_ml_project`,
        },
      ],
    },

    {
      title: "List kernels",
      blocks: [
        {
          kind: "code",
          language: "bash",
          code: `jupyter kernelspec list          # names + paths
jupyter kernelspec list --json   # full details including argv`,
        },
      ],
    },

    {
      title: "Inspect a kernel's Python",
      blocks: [
        {
          kind: "text",
          text: [
            "Each kernel stores its Python path as an absolute path in `kernel.json`. Read it to verify which interpreter the kernel actually launches.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `cat ~/.local/share/jupyter/kernels/finlab-backend/kernel.json`,
        },
        {
          kind: "text",
          text: ["The `argv` field is the launch command:"],
        },
        {
          kind: "code",
          language: "bash",
          code: `"argv": [
  "/full/path/to/project/.venv/bin/python",
  "-Xfrozen_modules=off",
  "-m",
  "ipykernel_launcher",
  "-f",
  "{connection_file}"
]`,
        },
        {
          kind: "text",
          text: ["Check whether that Python still exists:"],
        },
        {
          kind: "code",
          language: "bash",
          code: `ls -l "/full/path/to/project/.venv/bin/python"

# or as a boolean check
test -x "/full/path/to/project/.venv/bin/python" && echo "exists" || echo "missing"`,
        },
      ],
    },

    {
      title: "Fix a kernel",
      blocks: [
        {
          kind: "text",
          text: [
            "A kernel will be no longer availble if its registered Python path no longer available in case like after renaming a project folder or recreating a venv. The fix is to uninstall and register again from the new location, keeping the same --name so existing notebooks that reference the kernel keep working.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `jupyter kernelspec uninstall old-kernel-name

cd /path/to/current/project
source .venv/bin/activate
pip install ipykernel
python -m ipykernel install --user --name=old-kernel-name`,
        },
      ],
    },
  ],
}

export default entry