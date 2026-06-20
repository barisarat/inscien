import type { UtilityDef } from "../types"

const entry: UtilityDef = {
  id: "gpu-watch",
  kind: "codenote",
  name: "GPU Monitoring",
  desc: "GPU utilization, memory, and process monitoring with nvidia-smi for one-shot or refreshed views, and nvtop for an interactive interface.",
  intro:
    "GPU monitoring from the terminal. nvidia-smi gives a snapshot or a refreshed view via watch. nvtop is an interactive monitor that handles multiple GPUs and shows utilization graphs over time.",
  sections: [
    {
      title: "One-shot nvidia-smi",
      blocks: [
        {
          kind: "text",
          text: [
            "Print a single snapshot of GPU utilization, memory used and free, temperature, and running processes.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `nvidia-smi`,
        },
      ],
    },
    {
      title: "Live refresh with watch",
      blocks: [
        {
          kind: "text",
          text: [
            "Run nvidia-smi on a fixed interval and refresh the display in place. Useful for watching utilization and memory during training runs.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `watch -n 1 nvidia-smi`,
        },
        {
          kind: "text",
          text: ["Adjust the refresh interval as needed:"],
        },
        {
          kind: "code",
          language: "bash",
          code: `watch -n 2 nvidia-smi    # refresh every 2 seconds
watch -n 0.5 nvidia-smi  # refresh every 500ms`,
        },
        {
          kind: "text",
          text: ["Exit with Ctrl+c."],
        },
      ],
    },
    {
      title: "Interactive monitor with nvtop",
      blocks: [
        {
          kind: "text",
          text: [
            "nvtop is a interactive monitor for GPUs. It shows per-GPU utilization graphs over time, memory usage, temperature, and the processes using each GPU. Better than watch + nvidia-smi when monitoring multiple GPUs or watching utilization patterns over time.",
          ],
        },
        {
          kind: "text",
          text: ["Install on Ubuntu and Debian:"],
        },
        {
          kind: "code",
          language: "bash",
          code: `sudo apt install nvtop`,
        },
        {
          kind: "text",
          text: ["Install on Arch:"],
        },
        {
          kind: "code",
          language: "bash",
          code: `sudo pacman -S nvtop`,
        },
        {
          kind: "text",
          text: ["Run:"],
        },
        {
          kind: "code",
          language: "bash",
          code: `nvtop`,
        },
        {
          kind: "text",
          text: ["Exit with q."],
        },
      ],
    },
  ],
}

export default entry