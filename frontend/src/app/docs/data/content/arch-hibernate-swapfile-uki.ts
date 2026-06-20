import type { UtilityDef } from "../types"

const entry: UtilityDef = {
  id: "arch-hibernate-swapfile-uki",
  kind: "codenote",
  name: "Arch Hibernate with Swapfile and UKI",
  desc: "Configure hibernate on Arch Linux with systemd-boot, UKI, encrypted root, zram, and an ext4 swapfile resume setup.",
  intro:
    "This page documents a complete Arch Linux hibernate setup where the system originally had only zram swap. The workflow creates a persistent disk-backed swapfile, adds the resume target to the UKI kernel command line, adds the mkinitcpio resume hook, rebuilds the boot images, and verifies that the system restores the previous session after hibernate.",
  sections: [
    {
      title: "Overview",
      blocks: [
        {
          kind: "text",
          bullets: [
            "Hibernate needs disk-backed swap because the RAM image must survive power off.",
            "zram is useful for runtime swap, but it cannot store a hibernation image because it lives in RAM.",
            "A swapfile on ext4 is valid for hibernate when the kernel is given the filesystem UUID and resume offset.",
            "With systemd-boot and UKI, the kernel command line is usually stored in /etc/kernel/cmdline.",
            "The resume hook must run in initramfs before normal filesystem startup.",
            "After a successful resume, the hibernation image is invalidated and the swap area is reused normally.",
          ],
        },
      ],
    },
    {
      title: "Initial problem",
      blocks: [
        {
          kind: "text",
          text: [
            "The system had the hibernate command available, but it did not have a practical hibernate setup. The only active swap was zram, which is not suitable for hibernate.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `systemctl hibernate`,
        },
        {
          kind: "text",
          text: ["Example failure:"],
        },
        {
          kind: "code",
          language: "bash",
          code: `Call to Hibernate failed: Not enough suitable swap space for hibernation available on compatible block devices and file systems`,
        },
      ],
    },
    {
      title: "Check memory, swap, filesystem, and free disk",
      blocks: [
        {
          kind: "text",
          text: [
            "Check the current memory size, active swap devices, root filesystem type, and available disk space before creating a swapfile.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `free -h
swapon --show
findmnt -no FSTYPE /
df -h /`,
        },
        {
          kind: "text",
          text: ["Example output before the swapfile setup:"],
        },
        {
          kind: "code",
          language: "bash",
          code: `               total        used        free      shared  buff/cache   available
Mem:            62Gi       7.6Gi        49Gi       106Mi       4.9Gi        54Gi
Swap:          4.0Gi          0B       4.0Gi

NAME       TYPE      SIZE USED PRIO
/dev/zram0 partition   4G   0B  100

ext4

Filesystem        Size  Used Avail Use% Mounted on
/dev/mapper/root  1.8T  537G  1.2T  31% /`,
        },
        {
          kind: "text",
          bullets: [
            "The system has 62 GiB RAM.",
            "The only swap is 4 GiB zram.",
            "The root filesystem is ext4.",
            "The root filesystem has enough free disk space for a large swapfile.",
          ],
        },
      ],
    },
    {
      title: "Create the disk-backed swapfile",
      blocks: [
        {
          kind: "text",
          text: [
            "Create a disk-backed swapfile large enough for hibernate. For a 62 GiB RAM machine, an 80 GiB swapfile is a practical size. This keeps zram for normal runtime swap and adds the swapfile for hibernate.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `sudo fallocate -l 80G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile`,
        },
        {
          kind: "text",
          text: ["Verify the active swap devices:"],
        },
        {
          kind: "code",
          language: "bash",
          code: `swapon --show
free -h`,
        },
        {
          kind: "text",
          text: ["Expected output shape:"],
        },
        {
          kind: "code",
          language: "bash",
          code: `NAME       TYPE      SIZE USED PRIO
/dev/zram0 partition   4G   0B  100
/swapfile  file       80G   0B   -2

Swap:           83Gi          0B        83Gi`,
        },
      ],
    },
    {
      title: "Make the swapfile persistent",
      blocks: [
        {
          kind: "text",
          text: [
            "Add the swapfile to /etc/fstab so it is enabled automatically after reboot. Keep zram as the higher priority runtime swap and give the disk swapfile a lower priority.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `echo '/swapfile none swap defaults,pri=10 0 0' | sudo tee -a /etc/fstab`,
        },
        {
          kind: "text",
          text: ["Verify after the next reboot with:"],
        },
        {
          kind: "code",
          language: "bash",
          code: `swapon --show`,
        },
        {
          kind: "text",
          text: ["Expected output shape after reboot:"],
        },
        {
          kind: "code",
          language: "bash",
          code: `NAME       TYPE      SIZE USED PRIO
/swapfile  file       80G   0B   10
/dev/zram0 partition   4G   0B  100`,
        },
      ],
    },
    {
      title: "Understand the two hibernate requirements",
      blocks: [
        {
          kind: "text",
          text: [
            "A working hibernate setup needs two separate pieces. The swapfile gives the system a place to write the memory image. The boot configuration tells the next boot where to read that image back from.",
          ],
        },
        {
          kind: "table",
          headers: ["Requirement", "Purpose", "Status after creating swapfile"],
          rows: [
            ["Disk-backed swap", "Stores the RAM image during hibernate", "Ready"],
            ["Resume configuration", "Finds and restores the saved image during early boot", "Still needed"],
          ],
        },
        {
          kind: "text",
          text: [
            "If hibernate powers off but the next boot starts a fresh session, the storage exists but the resume path is missing.",
          ],
        },
      ],
    },
    {
      title: "Get the resume UUID and offset",
      blocks: [
        {
          kind: "text",
          text: [
            "For a swapfile, the kernel needs the filesystem UUID and the physical offset of the swapfile. This is different from a swap partition because /swapfile is a file inside the root filesystem.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `findmnt -no UUID -T /swapfile

sudo filefrag -v /swapfile | awk '$1=="0:" {print $4}' | sed 's/\\.\\.//'`,
        },
        {
          kind: "text",
          text: ["Example values from this setup:"],
        },
        {
          kind: "code",
          language: "bash",
          code: `f6c19f5d-1c81-4856-8ee6-8552dfe9f973
447834112`,
        },
        {
          kind: "text",
          text: [
            "These values become the resume kernel parameters.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `resume=UUID=f6c19f5d-1c81-4856-8ee6-8552dfe9f973 resume_offset=447834112`,
        },
      ],
    },
    {
      title: "Confirm the boot method",
      blocks: [
        {
          kind: "text",
          text: [
            "Check whether the system uses GRUB or systemd-boot with UKI. In this setup, GRUB was not present and bootctl confirmed systemd-boot with UKI.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `test -f /etc/default/grub && echo "grub default config exists"
test -f /boot/grub/grub.cfg && echo "grub boot config exists"

bootctl status`,
        },
        {
          kind: "text",
          text: ["Useful signs of systemd-boot with UKI:"],
        },
        {
          kind: "code",
          language: "bash",
          code: `Current Boot Loader: systemd-boot
Current Stub: systemd-stub
type: Boot Loader Specification Type #2 (UKI, .efi)
source: /boot/EFI/Linux/arch-linux.efi`,
        },
        {
          kind: "text",
          bullets: [
            "Do not run grub-mkconfig if GRUB is not used.",
            "Do not assume /boot/loader/entries/*.conf controls the kernel command line when using UKI.",
            "For this UKI setup, /etc/kernel/cmdline is the command line source.",
          ],
        },
      ],
    },
    {
      title: "Check the current kernel command line source",
      blocks: [
        {
          kind: "text",
          text: [
            "Read /etc/kernel/cmdline. This file should match the active kernel command line before adding the resume parameters.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `cat /etc/kernel/cmdline`,
        },
        {
          kind: "text",
          text: ["Initial value from this setup:"],
        },
        {
          kind: "code",
          language: "bash",
          code: `cryptdevice=PARTUUID=9432a0b4-f59e-4c24-95c7-23a637e1765a:root root=/dev/mapper/root zswap.enabled=0 rw rootfstype=ext4`,
        },
      ],
    },
    {
      title: "Update the UKI kernel command line",
      blocks: [
        {
          kind: "text",
          text: [
            "Back up the current file, then add resume=UUID and resume_offset to the same single line. This does not make every boot resume from hibernate. It only makes early boot check for a valid hibernation image at that location.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `sudo cp /etc/kernel/cmdline /etc/kernel/cmdline.bak

sudo tee /etc/kernel/cmdline >/dev/null <<'EOF'
cryptdevice=PARTUUID=9432a0b4-f59e-4c24-95c7-23a637e1765a:root root=/dev/mapper/root zswap.enabled=0 rw rootfstype=ext4 resume=UUID=f6c19f5d-1c81-4856-8ee6-8552dfe9f973 resume_offset=447834112
EOF

cat /etc/kernel/cmdline`,
        },
        {
          kind: "text",
          bullets: [
            "resume=UUID points to the filesystem that contains the swapfile.",
            "resume_offset points to the physical start of the swapfile inside that filesystem.",
            "Normal reboot and normal shutdown still boot normally when no valid hibernation image exists.",
          ],
        },
      ],
    },
    {
      title: "Update mkinitcpio hooks",
      blocks: [
        {
          kind: "text",
          text: [
            "Add the resume hook before filesystems. This makes initramfs check for the hibernation image early enough during boot.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `sudo cp /etc/mkinitcpio.conf /etc/mkinitcpio.conf.bak
sudo nano /etc/mkinitcpio.conf`,
        },
        {
          kind: "text",
          text: ["Original active hook line from this setup:"],
        },
        {
          kind: "code",
          language: "bash",
          code: `HOOKS=(base udev autodetect microcode modconf kms keyboard keymap consolefont block encrypt filesystems fsck)`,
        },
        {
          kind: "text",
          text: ["Updated active hook line:"],
        },
        {
          kind: "code",
          language: "bash",
          code: `HOOKS=(base udev autodetect microcode modconf kms keyboard keymap consolefont block encrypt resume filesystems fsck)`,
        },
        {
          kind: "text",
          bullets: [
            "Keep the existing hooks.",
            "Only insert resume before filesystems.",
            "For encrypted root using the encrypt hook, keep encrypt before resume.",
          ],
        },
      ],
    },
    {
      title: "Rebuild UKI and initramfs",
      blocks: [
        {
          kind: "text",
          text: [
            "Rebuild the boot images so the updated command line and resume hook are included in the UKI files.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `sudo mkinitcpio -P`,
        },
        {
          kind: "text",
          text: [
            "Watch for errors. Warnings may appear depending on firmware and modules, but the command should complete successfully. If the command fails, do not continue to hibernate testing until the error is fixed.",
          ],
        },
      ],
    },
    {
      title: "Reboot and verify active configuration",
      blocks: [
        {
          kind: "text",
          text: [
            "Reboot once after rebuilding. Then verify that the running kernel command line includes the resume parameters and that the swapfile is active.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `sudo reboot`,
        },
        {
          kind: "text",
          text: ["After reboot:"],
        },
        {
          kind: "code",
          language: "bash",
          code: `cat /proc/cmdline
swapon --show`,
        },
        {
          kind: "text",
          text: ["Expected output shape:"],
        },
        {
          kind: "code",
          language: "bash",
          code: `cryptdevice=PARTUUID=9432a0b4-f59e-4c24-95c7-23a637e1765a:root root=/dev/mapper/root zswap.enabled=0 rw rootfstype=ext4 resume=UUID=f6c19f5d-1c81-4856-8ee6-8552dfe9f973 resume_offset=447834112

NAME       TYPE      SIZE USED PRIO
/swapfile  file       80G   0B   10
/dev/zram0 partition   4G   0B  100`,
        },
      ],
    },
    {
      title: "Test hibernate restore",
      blocks: [
        {
          kind: "text",
          text: [
            "Create a simple marker under /tmp, hibernate, then power the laptop back on. If hibernate works, the old desktop session returns and the marker still exists.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `touch /tmp/hibernate-ram-test
date
systemctl hibernate`,
        },
        {
          kind: "text",
          text: [
            "Resume with the laptop power button. Then check:",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `ls -l /tmp/hibernate-ram-test
date`,
        },
        {
          kind: "table",
          headers: ["Result", "Meaning"],
          rows: [
            ["Previous desktop and apps return", "Hibernate restore works"],
            ["/tmp/hibernate-ram-test exists", "The old memory session was restored"],
            ["Fresh login with no old apps", "Resume configuration is not being used or the image was not accepted"],
          ],
        },
      ],
    },
    {
      title: "Kernel choice rule",
      blocks: [
        {
          kind: "text",
          text: [
            "A hibernation image contains kernel state, loaded modules, driver state, device state, userspace processes, and the desktop session. Resume with the same kernel entry that created the image.",
          ],
        },
        {
          kind: "table",
          headers: ["Hibernate created from", "Resume with"],
          rows: [
            ["Rolling kernel", "Rolling kernel"],
            ["LTS kernel", "LTS kernel"],
          ],
        },
        {
          kind: "text",
          bullets: [
            "Do not intentionally hibernate from rolling and resume with LTS.",
            "Do not intentionally hibernate from LTS and resume with rolling.",
            "If rolling is the default boot entry, hibernate from rolling for daily use.",
            "If LTS is preferred for stability, make LTS the default boot entry before using hibernate regularly.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `uname -r`,
        },
      ],
    },
    {
      title: "How hibernate images are reused",
      blocks: [
        {
          kind: "text",
          text: [
            "Every hibernate call writes a new image into swap. It does not create separate image files. After a successful resume, the image is invalidated and the swap area can be used normally again.",
          ],
        },
        {
          kind: "text",
          bullets: [
            "Hibernate now writes the current session image into /swapfile.",
            "On the next boot, initramfs checks the configured resume location.",
            "If a valid image exists, the old session is restored.",
            "If no valid image exists, the system boots normally.",
            "Old hibernation images do not pile up as separate files.",
          ],
        },
      ],
    },
    {
      title: "Normal boot behavior after this setup",
      blocks: [
        {
          kind: "text",
          text: [
            "The resume parameters do not force the system to restore from hibernate every time. They only allow the boot process to check for a valid hibernation image.",
          ],
        },
        {
          kind: "table",
          headers: ["Action", "Next boot behavior"],
          rows: [
            ["systemctl hibernate", "Power on restores the old session if the same kernel entry is used"],
            ["sudo reboot", "Boots normally"],
            ["sudo poweroff", "Boots normally on next power on"],
            ["Normal shutdown from desktop", "Boots normally on next power on"],
            ["No valid hibernate image exists", "Boots normally"],
          ],
        },
      ],
    },
    {
      title: "Debug commands",
      blocks: [
        {
          kind: "text",
          text: [
            "Use these commands if hibernate powers off but resumes into a fresh session.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `cat /proc/cmdline
grep '^HOOKS=' /etc/mkinitcpio.conf
swapon --show

journalctl -b -1 | grep -Ei 'hibernate|resume|PM:|swap'
journalctl -b | grep -Ei 'hibernate|resume|PM:|swap'`,
        },
      ],
    },
    {
      title: "Rollback notes",
      blocks: [
        {
          kind: "text",
          text: [
            "If hibernate support needs to be removed, restore the backed up command line and mkinitcpio config, rebuild UKI, and reboot. Remove the swapfile only after disabling it and removing the fstab entry.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `# Restore boot configuration backups
sudo cp /etc/kernel/cmdline.bak /etc/kernel/cmdline
sudo cp /etc/mkinitcpio.conf.bak /etc/mkinitcpio.conf
sudo mkinitcpio -P
sudo reboot`,
        },
        {
          kind: "text",
          text: ["Optional swapfile removal:"],
        },
        {
          kind: "code",
          language: "bash",
          code: `# Disable the swapfile for the current session
sudo swapoff /swapfile

# Remove or comment the /swapfile line in /etc/fstab
sudo nano /etc/fstab

# Delete the swapfile after it is no longer active
sudo rm /swapfile`,
        },
      ],
    },
    {
      title: "Config file locations",
      blocks: [
        {
          kind: "text",
          bullets: [
            "Kernel command line source for UKI: /etc/kernel/cmdline",
            "mkinitcpio hooks: /etc/mkinitcpio.conf",
            "Persistent swap configuration: /etc/fstab",
            "Swapfile path: /swapfile",
            "systemd-boot status check: bootctl status",
            "Active runtime kernel command line: /proc/cmdline",
          ],
        },
      ],
    },
  ],
}

export default entry