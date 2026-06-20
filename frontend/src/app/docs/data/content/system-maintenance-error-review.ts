import type { UtilityDef } from "../types"

const entry: UtilityDef = {
  id: "system-maintenance-error-review",
  kind: "codenote",
  name: "Linux System Maintenance and Error Review",
  desc: "Review Linux system freezes and runtime failures, inspect previous boot logs, check driver and package state, and safely update an Arch Linux workstation.",
  intro:
    "This workflow is a reusable maintenance reference for an Arch Linux workstation. It focuses on runtime freezes, previous boot log review, kernel and driver diagnostics, package checks, and safe full-system updates.",
  sections: [
    {
      title: "Overview",
      blocks: [
        {
          kind: "text",
          bullets: [
            "Use previous boot logs after a hard power-off, freeze, crash, or unexpected shutdown.",
            "Start with journalctl before changing packages, services, drivers, or kernel options.",
            "Separate kernel, driver, firmware, memory, power, service, and package evidence.",
            "Use targeted grep patterns to find lockups, hardware errors, GPU errors, memory pressure, and shutdown events.",
            "Check installed kernel and driver package versions before assuming a configuration problem.",
            "Use pacman -Syu for Arch kernel, firmware, and driver updates instead of updating one package by hand.",
            "After reboot, verify the new kernel, relevant packages, current boot logs, and affected subsystem state.",
          ],
        },
      ],
    },
    {
      title: "Check the previous boot after restart",
      blocks: [
        {
          kind: "text",
          text: [
            "After a freeze and reboot, use -b -1 to inspect the previous boot. This is usually more useful than checking the current boot.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `journalctl -b -1 -p err

journalctl -b -1 -e

journalctl -b -1 -n 100`,
        },
        {
          kind: "text",
          text: [
            "If the journal ends suddenly near the freeze time and has no clean shutdown sequence, the system likely locked before it could write more logs.",
          ],
        },
      ],
    },
    {
      title: "Inspect the event time window",
      blocks: [
        {
          kind: "text",
          text: [
            "Use a narrow time window around the event. This keeps the output readable and makes the cause easier to separate from old warnings.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `journalctl -b -1 --since "YYYY-MM-DD HH:MM" --until "YYYY-MM-DD HH:MM"

journalctl -k -b -1 --since "YYYY-MM-DD HH:MM" --until "YYYY-MM-DD HH:MM"`,
        },
        {
          kind: "text",
          text: [
            "Use the kernel-only command when the issue looks like a GPU, driver, firmware, suspend, power, or hardware problem.",
          ],
        },
      ],
    },
    {
      title: "Search for hard-freeze indicators",
      blocks: [
        {
          kind: "text",
          text: [
            "Search the previous boot for common GPU, memory, and kernel lockup terms. This is the fastest way to move from a general freeze report to a specific subsystem.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `journalctl -b -1 | grep -iE "nvidia|amdgpu|i915|nouveau|NVRM|Xid|GSP|gpu|drm|xorg|oom|out of memory|killed process|watchdog|soft lockup|hard lockup|hung task|blocked for more than|kernel panic"

journalctl -k -b -1 | grep -iE "nvidia|amdgpu|i915|nouveau|NVRM|Xid|GSP|gpu|drm|watchdog|lockup|hung|panic|blocked"`,
        },
        {
          kind: "text",
          text: [
            "GPU heartbeat, Xid, DRM, or firmware messages usually point below the user session. OOM or killed process messages point to memory pressure instead.",
          ],
        },
      ],
    },
    {
      title: "Interpret common log patterns",
      blocks: [
        {
          kind: "table",
          headers: ["Log pattern", "Meaning", "First action"],
          rows: [
            [
              "GPU heartbeat timed out",
              "The GPU driver or firmware path stopped responding.",
              "Update kernel and GPU packages, then monitor.",
            ],
            [
              "NVRM or Xid",
              "The Nvidia driver reported a GPU driver, firmware, or hardware event.",
              "Inspect the exact message and compare with recent driver changes.",
            ],
            [
              "amdgpu or i915 reset",
              "The AMD or Intel graphics driver attempted recovery or reset.",
              "Inspect kernel logs and recent kernel or firmware updates.",
            ],
            [
              "Out of memory or Killed process",
              "The kernel terminated a process due to memory pressure.",
              "Check RAM, swap, browser tabs, containers, and long-running processes.",
            ],
            [
              "watchdog, hard lockup, soft lockup",
              "The kernel detected a stuck CPU or blocked kernel path.",
              "Inspect kernel logs and recent driver or kernel updates.",
            ],
            [
              "User-session or service warnings",
              "Often unrelated application, desktop, or user-service messages.",
              "Do not treat as the cause unless they match the failure time and repeat with the failure.",
            ],
            [
              "Service messages after power key",
              "A service reacted to shutdown or power-off handling.",
              "Treat as shutdown handling unless it appears before the failure.",
            ],
          ],
        },
      ],
    },
    {
      title: "Check current GPU state",
      blocks: [
        {
          kind: "text",
          text: [
            "After reboot, confirm that the GPU driver is loaded and the GPU is visible. Use the tool that matches the installed graphics stack.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `nvidia-smi
nvidia-smi -q | grep -i "GSP"

lspci -nn | grep -Ei "vga|3d|display|amd|intel|nvidia"`,
        },
        {
          kind: "text",
          text: [
            "For Nvidia systems, nvidia-smi should show the driver version, GPU name, display state, memory usage, and active graphics processes such as Xorg, Wayland compositor, browser, or desktop shell.",
          ],
        },
      ],
    },
    {
      title: "Check installed kernel and graphics packages",
      blocks: [
        {
          kind: "text",
          text: [
            "On Arch, the kernel and graphics driver packages should move together. Always check both sides when debugging a graphics freeze.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `uname -r

pacman -Qs '^linux$'
pacman -Qs '^linux-lts$'

pacman -Qs '^nvidia-open$'
pacman -Qs '^nvidia-utils$'
pacman -Qs '^opencl-nvidia$'
pacman -Qs '^cuda$'

pacman -Qs '^mesa$'
pacman -Qs '^vulkan-radeon$'
pacman -Qs '^vulkan-intel$'
pacman -Qs '^linux-firmware$'`,
        },
        {
          kind: "text",
          text: [
            "The exact package names depend on the GPU vendor and Arch packaging state. Do not assume an old package name is available before checking pacman.",
          ],
        },
      ],
    },
    {
      title: "Check available driver packages",
      blocks: [
        {
          kind: "text",
          text: [
            "If a package name is not found, verify enabled repositories and package databases before removing anything. Do not remove the active graphics driver until the replacement package is confirmed.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `grep -nE "^\\[|^Include" /etc/pacman.conf

sudo pacman -Syy

pacman -Ss '^nvidia$'
pacman -Si nvidia
pacman -Si nvidia-open

pacman -Ss nvidia | grep -E '^extra/nvidia|^extra/nvidia-open|^extra/nvidia-dkms|^extra/nvidia-lts'

pacman -Ss mesa
pacman -Ss vulkan`,
        },
        {
          kind: "text",
          text: [
            "If pacman cannot find a package, stop and inspect the repository state. Do not proceed with partial package changes.",
          ],
        },
      ],
    },
    {
      title: "Check GPU driver parameters",
      blocks: [
        {
          kind: "text",
          text: [
            "Use driver parameter files to inspect loaded options. The exact paths and values depend on the driver.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `cat /proc/driver/nvidia/params | grep -Ei "EnableGpuFirmware|EnableGpuFirmwareLogs|Preserve|DynamicPowerManagement"

modinfo nvidia | grep -iE "firmware|power|modeset"

lsmod | grep -Ei "nvidia|amdgpu|i915|drm"`,
        },
        {
          kind: "text",
          text: [
            "Driver parameters are context, not a fix by themselves. Change them only after the logs point to a specific driver path.",
          ],
        },
      ],
    },
    {
      title: "Check memory and swap",
      blocks: [
        {
          kind: "text",
          text: [
            "Check memory and swap after freezes, browser-heavy sessions, container workloads, local builds, virtual machines, or long uptime. Memory pressure can look like a desktop or application freeze.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `free -h

swapon --show

journalctl -b -1 | grep -iE "oom|out of memory|killed process|memory allocation failure" | tail -120`,
        },
        {
          kind: "text",
          text: [
            "If the previous boot shows OOM or killed process messages, focus on RAM, swap, containers, browsers, and long-running processes before changing graphics drivers.",
          ],
        },
      ],
    },
    {
      title: "Check failed services",
      blocks: [
        {
          kind: "text",
          text: [
            "Failed services can explain missing hardware controls, network failures, audio failures, mount issues, or background maintenance failures. Check them separately from kernel logs.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `systemctl --failed

systemctl status service-name --no-pager -l

journalctl -u service-name -b --no-pager -n 100`,
        },
        {
          kind: "text",
          text: [
            "Replace service-name with the service shown by systemctl --failed. If a service failed after the power key or during shutdown, treat it as shutdown context unless it appeared before the failure.",
          ],
        },
      ],
    },
    {
      title: "Review current boot for fresh errors",
      blocks: [
        {
          kind: "text",
          text: [
            "After reboot, check whether the current boot is clean or already showing the same failure pattern.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `journalctl -k -b | grep -iE "NVRM|Xid|GSP|nvidia|amdgpu|i915|gpu|drm|watchdog|lockup|hung|panic|blocked|oom|out of memory" | tail -120`,
        },
        {
          kind: "text",
          text: [
            "Normal driver load messages are expected. Repeating heartbeat timeout, Xid, reset loops, OOM events, watchdog events, or hard lockup messages are not normal.",
          ],
        },
      ],
    },
    {
      title: "Run a safe Arch system update",
      blocks: [
        {
          kind: "text",
          text: [
            "On Arch, update the full system instead of updating only the kernel or only one driver. This keeps the kernel, modules, firmware, and user-space packages aligned.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `sudo pacman -Syu

sudo reboot`,
        },
        {
          kind: "text",
          text: [
            "After reboot, verify the new versions and confirm the affected subsystem still works.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `uname -r

pacman -Qs '^linux$'
pacman -Qs '^linux-lts$'

pacman -Qs '^nvidia-open$'
pacman -Qs '^nvidia-utils$'

nvidia-smi 2>/dev/null || true

systemctl --failed`,
        },
      ],
    },
    {
      title: "Post-update validation",
      blocks: [
        {
          kind: "text",
          text: [
            "After an update, compare the current boot logs with the failed previous boot. The goal is not to remove every warning. The goal is to confirm the fatal failure pattern is gone.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `journalctl -k -b | grep -iE "NVRM|Xid|GSP|nvidia|amdgpu|i915|gpu|drm|watchdog|lockup|hung|panic|blocked|oom|out of memory" | tail -120

nvidia-smi 2>/dev/null || true

systemctl --failed`,
        },
        {
          kind: "text",
          bullets: [
            "Good sign: the affected driver or service loads without repeating the previous failure pattern.",
            "Good sign: the current boot has no repeated lockup, OOM, reset, or watchdog messages.",
            "Good sign: systemctl --failed does not show a service related to the failure.",
            "Watch item: isolated firmware or platform warnings can remain without causing a failure.",
            "Bad sign: repeated heartbeat, reset, Xid, OOM, watchdog, or hard lockup messages return.",
          ],
        },
      ],
    },
    {
      title: "Live monitoring during test runtime",
      blocks: [
        {
          kind: "text",
          text: [
            "After a driver, kernel, firmware, or service change, monitor for the same failure pattern during normal use. This is useful during the first 24 to 48 hours after a change.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `watch -n 60 'journalctl -k -b | grep -iE "NVRM|Xid|GSP|nvidia|amdgpu|i915|gpu|drm|watchdog|lockup|hung|panic|blocked|oom|out of memory" | tail -40'`,
        },
        {
          kind: "text",
          text: [
            "If repeated subsystem or kernel errors appear while the system is still usable, save work and reboot before the session fully locks.",
          ],
        },
      ],
    },
    {
      title: "Maintenance decision table",
      blocks: [
        {
          kind: "table",
          headers: ["Situation", "Action"],
          rows: [
            [
              "One freeze after long uptime and an old driver or kernel version",
              "Update the full system, reboot, and monitor.",
            ],
            [
              "Same subsystem error returns after update",
              "Save logs from the failed boot and evaluate driver, kernel, firmware, power profile, service, or package alternatives.",
            ],
            [
              "Current boot has only normal load messages",
              "Keep the setup and monitor during normal work.",
            ],
            [
              "Current boot has platform firmware warnings only",
              "Track them, but do not treat them as the freeze cause by themselves.",
            ],
            [
              "Current boot has OOM or killed process messages",
              "Check memory, swap, containers, browser load, build jobs, and long-running processes.",
            ],
            [
              "A related service is failed",
              "Inspect systemctl status and journalctl -u for that service before changing driver packages.",
            ],
            [
              "TTY or SSH works during freeze",
              "Inspect logs and restart the affected service or reboot cleanly.",
            ],
            [
              "TTY and SSH are unavailable",
              "Use controlled reboot if possible, then inspect previous boot logs.",
            ],
          ],
        },
      ],
    },
    {
      title: "Command summary",
      blocks: [
        {
          kind: "code",
          language: "bash",
          code: `journalctl -b -1 -p err
journalctl -b -1 -e
journalctl -k -b -1 | grep -iE "NVRM|Xid|GSP|nvidia|amdgpu|i915|gpu|drm|watchdog|lockup|hung|panic|blocked|oom|out of memory"

uname -r
pacman -Qs '^linux$'
pacman -Qs '^linux-lts$'

lspci -nn | grep -Ei "vga|3d|display|amd|intel|nvidia"

lsmod | grep -Ei "nvidia|amdgpu|i915|drm"

free -h
swapon --show

systemctl --failed

sudo pacman -Syu
sudo reboot

journalctl -k -b | grep -iE "NVRM|Xid|GSP|nvidia|amdgpu|i915|gpu|drm|watchdog|lockup|hung|panic|blocked|oom|out of memory" | tail -120`,
        },
      ],
    },
  ],
}

export default entry