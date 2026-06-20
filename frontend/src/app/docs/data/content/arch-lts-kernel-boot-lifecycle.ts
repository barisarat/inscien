import type { UtilityDef } from "../types"

const entry: UtilityDef = {
  id: "arch-lts-kernel-boot-lifecycle",
  kind: "codenote",
  name: "Arch LTS Kernel Boot Lifecycle",
  desc: "Install, expose, test, compare, and remove an Arch Linux LTS kernel path with systemd-boot and UKI entries.",
  intro:
    "This page documents the full lifecycle for testing the Arch Linux LTS kernel as a second boot path. It covers why LTS is tested, how to install the matching LTS kernel modules, how to expose the LTS entry in systemd-boot when using unified kernel images, how to verify the selected kernel, how to compare boot history, and how to remove the LTS path when it does not provide a clear benefit.",
  sections: [
    {
      title: "Overview",
      blocks: [
        {
          kind: "text",
          bullets: [
            "Use the LTS kernel as a controlled test path, not as a blind replacement for the current rolling kernel.",
            "Keep the current rolling kernel installed while testing LTS.",
            "Install the matching LTS kernel module package for hardware drivers that depend on the kernel.",
            "For a systemd-boot setup using unified kernel images, confirm that the LTS UKI file exists under /boot/EFI/Linux.",
            "Use bootctl list to confirm that systemd-boot can see the LTS entry.",
            "Use a one-time boot command when the boot menu is hidden or when the default entry should not be changed.",
            "Compare boot history and kernel versions before deciding whether LTS gives a real advantage.",
            "Remove the LTS path if it does not reduce the issue being tested.",
          ],
        },
      ],
    },
    {
      title: "When this workflow applies",
      blocks: [
        {
          kind: "text",
          text: [
            "Use this workflow when you want to test whether a problem follows the latest rolling Arch kernel or whether it also appears on the LTS kernel. This is useful for kernel-facing issues involving graphics modules, wireless modules, suspend and resume behavior, PCIe behavior, or other hardware paths.",
            "The test is useful only when both paths can be compared with logs. A working boot alone is not enough. The target behavior should be checked on both kernels.",
          ],
        },
        {
          kind: "table",
          headers: ["Path", "Purpose"],
          rows: [
            ["Rolling kernel", "The normal Arch kernel path. It receives newer kernel changes sooner."],
            ["LTS kernel", "A more conservative longterm kernel path. It receives maintained fixes with less kernel churn."],
            ["Second boot path", "Keeps both kernels available so the system can return to the known working path."],
            ["Boot history comparison", "Shows which kernel was used in each boot and whether the target issue appeared."],
          ],
        },
      ],
    },
    {
      title: "Check the current kernel",
      blocks: [
        {
          kind: "text",
          text: [
            "Start by confirming the kernel that is currently running. This gives the baseline before installing or testing the LTS path.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `uname -r`,
        },
        {
          kind: "text",
          text: ["Example output for the rolling kernel:"],
        },
        {
          kind: "code",
          language: "bash",
          code: `7.0.3-arch1-2`,
        },
        {
          kind: "text",
          text: ["Example output for the LTS kernel:"],
        },
        {
          kind: "code",
          language: "bash",
          code: `6.18.26-2-lts`,
        },
      ],
    },
    {
      title: "Check the bootloader type",
      blocks: [
        {
          kind: "text",
          text: [
            "Check the bootloader before changing the kernel path. This workflow assumes systemd-boot with unified kernel images under /boot/EFI/Linux.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `bootctl status`,
        },
        {
          kind: "text",
          text: [
            "Relevant signs in the output are systemd-boot as the current boot loader, an EFI System Partition mounted under /boot, and a current entry such as arch-linux.efi.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `Current Boot Loader:
       Product: systemd-boot

Default Boot Loader Entry:
           id: arch-linux.efi
      version: 7.0.3-arch1-2
        linux: /boot//EFI/Linux/arch-linux.efi`,
        },
      ],
    },
    {
      title: "Check whether LTS is already installed",
      blocks: [
        {
          kind: "text",
          text: [
            "Before installing anything, check whether the LTS kernel and the matching LTS driver module package already exist.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `pacman -Qs '^linux-lts$' '^nvidia-open-lts$'`,
        },
        {
          kind: "text",
          text: [
            "If the command returns no package output, the LTS path is not installed. A reboot will not show an LTS option until the packages and boot entry exist.",
          ],
        },
      ],
    },
    {
      title: "Install the LTS kernel path",
      blocks: [
        {
          kind: "text",
          text: [
            "Install the LTS kernel and its matching kernel module package. Keep the rolling kernel installed. Do not remove the current kernel during the test.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `sudo pacman -S linux-lts nvidia-open-lts`,
        },
        {
          kind: "text",
          text: ["Expected package names:"],
        },
        {
          kind: "code",
          language: "bash",
          code: `Packages (2) linux-lts-6.18.26-2  nvidia-open-lts-1:595.71.05-3`,
        },
        {
          kind: "text",
          text: [
            "The package hook should generate the normal LTS initramfs. On a UKI system, this does not always create a visible LTS boot entry automatically.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `==> Building image from preset: /etc/mkinitcpio.d/linux-lts.preset: 'default'
==> Starting build: '6.18.26-2-lts'
==> Creating zstd-compressed initcpio image: '/boot/initramfs-linux-lts.img'
==> Initcpio image generation successful`,
        },
      ],
    },
    {
      title: "Check visible boot entries",
      blocks: [
        {
          kind: "text",
          text: [
            "After installing LTS, check whether systemd-boot can see the LTS entry. If only the rolling entry appears, the LTS package is installed but the LTS UKI is not exposed yet.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `bootctl list`,
        },
        {
          kind: "text",
          text: ["Example output when only the rolling UKI is visible:"],
        },
        {
          kind: "code",
          language: "bash",
          code: `type: Boot Loader Specification Type #2 (UKI, .efi)
title: Arch Linux (default) (selected)
id: arch-linux.efi
version: 7.0.3-arch1-2
linux: /boot//EFI/Linux/arch-linux.efi`,
        },
        {
          kind: "text",
          text: [
            "If there is no arch-linux-lts.efi entry, inspect the UKI files and mkinitcpio presets.",
          ],
        },
      ],
    },
    {
      title: "Inspect UKI files and presets",
      blocks: [
        {
          kind: "text",
          text: [
            "List the existing UKI files, kernel install configuration, and mkinitcpio preset files.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `ls -R /etc/kernel /etc/mkinitcpio.d /boot/EFI/Linux 2>/dev/null`,
        },
        {
          kind: "text",
          text: ["Example output when only the rolling UKI exists:"],
        },
        {
          kind: "code",
          language: "bash",
          code: `/boot/EFI/Linux:
arch-linux.efi

/etc/kernel:
cmdline  install.d

/etc/mkinitcpio.d:
linux-lts.preset  linux.preset`,
        },
        {
          kind: "text",
          text: [
            "The normal kernel may already generate a UKI, while the LTS preset may still be configured to create only an initramfs image.",
          ],
        },
      ],
    },
    {
      title: "Compare the rolling and LTS presets",
      blocks: [
        {
          kind: "text",
          text: [
            "Compare the normal kernel preset and the LTS preset. The normal preset usually shows the correct UKI path. The LTS preset may have the UKI line commented out or pointed at the wrong ESP path.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `cat /etc/mkinitcpio.d/linux.preset && echo "----- LTS -----" && cat /etc/mkinitcpio.d/linux-lts.preset`,
        },
        {
          kind: "text",
          text: ["Rolling preset example:"],
        },
        {
          kind: "code",
          language: "bash",
          code: `ALL_kver="/boot/vmlinuz-linux"
PRESETS=('default')
default_uki="/boot/EFI/Linux/arch-linux.efi"
default_options="--splash /usr/share/systemd/bootctl/splash-arch.bmp"`,
        },
        {
          kind: "text",
          text: ["LTS preset example before the UKI fix:"],
        },
        {
          kind: "code",
          language: "bash",
          code: `ALL_kver="/boot/vmlinuz-linux-lts"
PRESETS=('default')
default_image="/boot/initramfs-linux-lts.img"
#default_uki="/efi/EFI/Linux/arch-linux-lts.efi"
#default_options="--splash /usr/share/systemd/bootctl/splash-arch.bmp"`,
        },
        {
          kind: "text",
          text: [
            "The key difference is that the rolling preset writes a UKI to /boot/EFI/Linux, but the LTS preset writes only an initramfs image. On this system, the correct ESP path is /boot, not /efi.",
          ],
        },
      ],
    },
    {
      title: "Enable LTS UKI generation",
      blocks: [
        {
          kind: "text",
          text: [
            "Edit the LTS preset so it creates an LTS UKI under the same EFI directory used by the rolling kernel.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `sudo nano /etc/mkinitcpio.d/linux-lts.preset`,
        },
        {
          kind: "text",
          text: ["Change the LTS default section from this:"],
        },
        {
          kind: "code",
          language: "bash",
          code: `default_image="/boot/initramfs-linux-lts.img"
#default_uki="/efi/EFI/Linux/arch-linux-lts.efi"
#default_options="--splash /usr/share/systemd/bootctl/splash-arch.bmp"`,
        },
        {
          kind: "text",
          text: ["To this:"],
        },
        {
          kind: "code",
          language: "bash",
          code: `#default_image="/boot/initramfs-linux-lts.img"
default_uki="/boot/EFI/Linux/arch-linux-lts.efi"
default_options="--splash /usr/share/systemd/bootctl/splash-arch.bmp"`,
        },
        {
          kind: "text",
          text: [
            "This mirrors the rolling UKI setup but writes the LTS kernel to a separate file named arch-linux-lts.efi.",
          ],
        },
      ],
    },
    {
      title: "Generate the LTS UKI",
      blocks: [
        {
          kind: "text",
          text: [
            "After changing the preset, rebuild the LTS image. This should create the LTS unified kernel image.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `sudo mkinitcpio -p linux-lts`,
        },
        {
          kind: "text",
          text: ["Expected output includes the UKI target:"],
        },
        {
          kind: "code",
          language: "bash",
          code: `-> -k /boot/vmlinuz-linux-lts -U /boot/EFI/Linux/arch-linux-lts.efi --splash /usr/share/systemd/bootctl/splash-arch.bmp
==> Creating unified kernel image: '/boot/EFI/Linux/arch-linux-lts.efi'
==> Unified kernel image generation successful`,
        },
        {
          kind: "text",
          text: ["Confirm the two UKI files exist:"],
        },
        {
          kind: "code",
          language: "bash",
          code: `ls -l /boot/EFI/Linux/`,
        },
        {
          kind: "text",
          text: ["Expected output:"],
        },
        {
          kind: "code",
          language: "bash",
          code: `arch-linux.efi
arch-linux-lts.efi`,
        },
      ],
    },
    {
      title: "Confirm the LTS boot entry",
      blocks: [
        {
          kind: "text",
          text: [
            "Run bootctl list again. The LTS entry should now appear next to the rolling entry.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `bootctl list`,
        },
        {
          kind: "text",
          text: ["Expected entries:"],
        },
        {
          kind: "code",
          language: "bash",
          code: `title: Arch Linux (7.0.3-arch1-2) (default) (selected)
id: arch-linux.efi
version: 7.0.3-arch1-2

title: Arch Linux (6.18.26-2-lts) (not reported/new)
id: arch-linux-lts.efi
version: 6.18.26-2-lts`,
        },
      ],
    },
    {
      title: "Boot LTS once without changing the default",
      blocks: [
        {
          kind: "text",
          text: [
            "If the boot menu is hidden, use a one-time systemd-boot entry selection. This boots LTS once while keeping the rolling kernel as the default path.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `sudo systemctl reboot --boot-loader-entry=arch-linux-lts.efi`,
        },
        {
          kind: "text",
          text: [
            "After reboot, confirm that the LTS kernel is running.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `uname -r`,
        },
        {
          kind: "text",
          text: ["Expected output:"],
        },
        {
          kind: "code",
          language: "bash",
          code: `6.18.26-2-lts`,
        },
      ],
    },
    {
      title: "Verify the driver stack after boot",
      blocks: [
        {
          kind: "text",
          text: [
            "After booting LTS, confirm that the hardware driver stack still loads. For Nvidia Open systems, nvidia-smi should report the same driver branch.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `nvidia-smi`,
        },
        {
          kind: "text",
          text: [
            "The exact process list depends on the session, but the driver version should be visible and the command should return without hanging.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `NVIDIA-SMI 595.71.05
Driver Version: 595.71.05`,
        },
      ],
    },
    {
      title: "Review boot history",
      blocks: [
        {
          kind: "text",
          text: [
            "Use journalctl boot history to identify which boots are available for comparison. This is useful after several test reboots.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `journalctl --list-boots | tail -10`,
        },
        {
          kind: "text",
          text: ["Example output:"],
        },
        {
          kind: "code",
          language: "bash",
          code: `-5  boot_id  Wed 2026-05-06 12:03:46 +03 Thu 2026-05-07 10:32:50 +03
-4  boot_id  Thu 2026-05-07 10:33:28 +03 Thu 2026-05-07 20:42:24 +03
-3  boot_id  Thu 2026-05-07 20:44:10 +03 Thu 2026-05-07 20:53:29 +03
-2  boot_id  Thu 2026-05-07 20:54:32 +03 Fri 2026-05-08 12:06:51 +03
-1  boot_id  Fri 2026-05-08 12:08:47 +03 Fri 2026-05-08 12:26:35 +03
 0  boot_id  Fri 2026-05-08 12:27:47 +03 current`,
        },
        {
          kind: "text",
          text: [
            "The boot index changes after every reboot. Always check the list before comparing logs from previous boots.",
          ],
        },
      ],
    },
    {
      title: "Compare kernel versions across recent boots",
      blocks: [
        {
          kind: "text",
          text: [
            "Use this loop to show the kernel version used in recent boots. Add issue-specific grep checks only when testing a specific problem.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `for b in -5 -4 -3 -2 -1 0; do
  echo "===== boot $b ====="
  journalctl -b "$b" -k | grep -m1 "Linux version"
done`,
        },
        {
          kind: "text",
          text: ["Example output:"],
        },
        {
          kind: "code",
          language: "bash",
          code: `===== boot -5 =====
Linux version 7.0.3-arch1-2

===== boot -2 =====
Linux version 6.18.26-2-lts

===== boot 0 =====
Linux version 7.0.3-arch1-2`,
        },
        {
          kind: "text",
          text: [
            "This confirms which boot used the rolling kernel and which boot used the LTS kernel.",
          ],
        },
      ],
    },
    {
      title: "Decide whether LTS is useful",
      blocks: [
        {
          kind: "text",
          text: [
            "The LTS test is useful only if it produces a clear improvement. If the target issue appears on both kernels, LTS is not a proven solution. Keeping two kernels then adds extra maintenance without a clear benefit.",
          ],
        },
        {
          kind: "table",
          headers: ["Result", "Interpretation"],
          rows: [
            ["Issue disappears on LTS", "The rolling kernel path is suspicious. Keep LTS as a temporary daily path."],
            ["Issue appears on both kernels", "The issue likely follows a shared driver, firmware, hardware, or power-management path."],
            ["LTS creates new problems", "Return to the rolling kernel and remove the LTS test path."],
            ["Short LTS boot is clean but long LTS boot is not", "Compare longer sessions before treating LTS as stable."],
          ],
        },
      ],
    },
    {
      title: "Return to the rolling kernel",
      blocks: [
        {
          kind: "text",
          text: [
            "If LTS was booted once through systemd-boot, the next normal reboot usually returns to the default rolling kernel. Confirm after reboot.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `sudo reboot`,
        },
        {
          kind: "code",
          language: "bash",
          code: `uname -r`,
        },
        {
          kind: "text",
          text: ["Expected output for the rolling kernel:"],
        },
        {
          kind: "code",
          language: "bash",
          code: `7.0.3-arch1-2`,
        },
      ],
    },
    {
      title: "Remove the LTS packages",
      blocks: [
        {
          kind: "text",
          text: [
            "If the LTS test gives no clear benefit, remove the LTS packages to keep the system simple.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `sudo pacman -Rns linux-lts nvidia-open-lts`,
        },
        {
          kind: "text",
          text: ["Expected package removal:"],
        },
        {
          kind: "code",
          language: "bash",
          code: `Packages (2) linux-lts-6.18.26-2  nvidia-open-lts-1:595.71.05-3

Total Removed Size: 153.05 MiB`,
        },
        {
          kind: "text",
          text: [
            "The package hooks may remove the LTS UKI automatically. If manual removal says the file does not exist, that is fine.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `sudo rm /boot/EFI/Linux/arch-linux-lts.efi`,
        },
        {
          kind: "text",
          text: ["Safe output when the file was already removed:"],
        },
        {
          kind: "code",
          language: "bash",
          code: `rm: cannot remove '/boot/EFI/Linux/arch-linux-lts.efi': No such file or directory`,
        },
      ],
    },
    {
      title: "Verify cleanup",
      blocks: [
        {
          kind: "text",
          text: [
            "After removal, bootctl list should show only the real rolling entry. It may temporarily show the old LTS entry as reported and absent until the next reboot.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `bootctl list`,
        },
        {
          kind: "text",
          text: ["Expected real bootable entry:"],
        },
        {
          kind: "code",
          language: "bash",
          code: `title: Arch Linux (default) (selected)
id: arch-linux.efi
version: 7.0.3-arch1-2
linux: /boot//EFI/Linux/arch-linux.efi`,
        },
        {
          kind: "text",
          text: ["Temporary stale reported entry can appear like this:"],
        },
        {
          kind: "code",
          language: "bash",
          code: `title: arch-linux-lts.efi (reported/absent)
id: arch-linux-lts.efi`,
        },
        {
          kind: "text",
          text: [
            "This stale entry is not a real bootable file. Reboot once normally and check bootctl list again.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `sudo reboot
bootctl list`,
        },
      ],
    },
    {
      title: "Command summary",
      blocks: [
        {
          kind: "code",
          language: "bash",
          code: `# Check current kernel
uname -r

# Check bootloader and entries
bootctl status
bootctl list

# Check whether LTS packages exist
pacman -Qs '^linux-lts$' '^nvidia-open-lts$'

# Install LTS test path
sudo pacman -S linux-lts nvidia-open-lts

# Inspect UKI files and presets
ls -R /etc/kernel /etc/mkinitcpio.d /boot/EFI/Linux 2>/dev/null
cat /etc/mkinitcpio.d/linux.preset && echo "----- LTS -----" && cat /etc/mkinitcpio.d/linux-lts.preset

# Edit LTS preset if the UKI line is missing or wrong
sudo nano /etc/mkinitcpio.d/linux-lts.preset

# Generate LTS UKI
sudo mkinitcpio -p linux-lts
ls -l /boot/EFI/Linux/

# Confirm LTS entry
bootctl list

# Boot LTS once
sudo systemctl reboot --boot-loader-entry=arch-linux-lts.efi

# Verify selected kernel after reboot
uname -r

# Compare recent boot kernels
journalctl --list-boots | tail -10

for b in -5 -4 -3 -2 -1 0; do
  echo "===== boot $b ====="
  journalctl -b "$b" -k | grep -m1 "Linux version"
done

# Remove LTS when the test gives no clear benefit
sudo pacman -Rns linux-lts nvidia-open-lts
sudo rm /boot/EFI/Linux/arch-linux-lts.efi
bootctl list`,
        },
      ],
    },
    {
      title: "File locations",
      blocks: [
        {
          kind: "text",
          bullets: [
            "Rolling UKI: /boot/EFI/Linux/arch-linux.efi",
            "LTS UKI: /boot/EFI/Linux/arch-linux-lts.efi",
            "Rolling preset: /etc/mkinitcpio.d/linux.preset",
            "LTS preset: /etc/mkinitcpio.d/linux-lts.preset",
            "Kernel command line: /etc/kernel/cmdline",
            "systemd-boot config: /boot/loader/loader.conf",
          ],
        },
      ],
    },
  ],
}

export default entry