import type { UtilityDef } from "../types"

const entry: UtilityDef = {
  id: "restic-restore-test",
  kind: "codenote",
  name: "Restic Restore Test with External Drive",
  desc: "Validate a restic backup by restoring onto a clean external drive. Step by step disk preparation, restore execution, file verification, and safe unplug.",
  intro:
    "To confirm a backup is properly set and can be restored we will replicate the full restore process in an external drive. This procedure uses an external harddisk conneted via USB as a clean restore target.",
  resources: [
    { label: "Restic Official Documentation", href: "https://restic.readthedocs.io/" },
    { label: "Restic Local Backup Setup", href: "/docs/restic-local-backup" },
  ],
  sections: [
    {
      title: "Identify the external disk",
      blocks: [
        {
          kind: "text",
          text: [
            "List all block devices to locate the external drive. It will appear separately from internal NVMe drives, typically as /dev/sda.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `lsblk -o NAME,SIZE,MODEL,FSTYPE,MOUNTPOINTS`,
        },
        {
          kind: "text",
          text: [
            "If the MOUNTPOINTS column shows a path for any partition under /dev/sda, the disk is already mounted. If empty, it is detected but not mounted. Do not continue unless the target disk is clearly identified.",
          ],
        },
      ],
    },
    {
      title: "Wipe and prepare the external disk",
      blocks: [
        {
          kind: "text",
          text: [
            "This destroys everything on the target disk. Unmount first if any partition is currently mounted.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `# unmount if mounted
sudo umount ~/mnt/restic-backup 2>/dev/null

# install gptfdisk if not available (Arch)
sudo pacman -S gptfdisk

# wipe and create fresh partition table
sudo wipefs -a /dev/sda
sudo sgdisk --zap-all /dev/sda
sudo parted -s /dev/sda mklabel gpt
sudo parted -s /dev/sda mkpart primary ext4 1MiB 100%

# format
sudo mkfs.ext4 -L restic_backup /dev/sda1`,
        },
      ],
    },
    {
      title: "Mount the prepared disk",
      blocks: [
        {
          kind: "code",
          language: "bash",
          code: `mkdir -p ~/mnt/restic-backup
sudo mount /dev/sda1 ~/mnt/restic-backup
sudo chown -R $USER:$USER ~/mnt/restic-backup`,
        },
        {
          kind: "text",
          text: [
            "Verify the mount succeeded and the filesystem is accessible.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `lsblk -f /dev/sda
df -h ~/mnt/restic-backup`,
        },
      ],
    },
    {
      title: "Set repository path and check snapshots",
      blocks: [
        {
          kind: "text",
          text: [
            "Point to the existing restic repository on the backup drive. This is the source you are validating, not the external restore target.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `export RESTIC_REPO=/run/media/$USER/backupssd/restic-projects
restic -r $RESTIC_REPO snapshots`,
        },
      ],
    },
    {
      title: "Run the restore",
      blocks: [
        {
          kind: "code",
          language: "bash",
          code: `mkdir -p ~/mnt/restic-backup/restore-test

# restore latest snapshot
restic -r $RESTIC_REPO restore latest --target ~/mnt/restic-backup/restore-test

# or restore a specific snapshot by ID
restic -r $RESTIC_REPO restore 1f52ec5d --target ~/mnt/restic-backup/restore-test`,
        },
        {
          kind: "text",
          text: [
            "A successful restore prints a summary with file count and total size. If it reports 0 restored files with permission errors, see the troubleshooting section below.",
          ],
        },
      ],
    },
    {
      title: "Verify restored files",
      blocks: [
        {
          kind: "text",
          text: [
            "Restic preserves the full original path inside the restore target. If the backed up path was /home/$USER/projects, the restored content appears under ~/mnt/restic-backup/restore-test/home/$USER/projects.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `# list top-level restored directories
ls ~/mnt/restic-backup/restore-test/home/$USER/projects

# compare sizes between original and restored
du -sh ~/projects
du -sh ~/mnt/restic-backup/restore-test/home/$USER/projects

# spot-check specific directories
ls ~/mnt/restic-backup/restore-test/home/$USER/projects/transcribe
ls ~/mnt/restic-backup/restore-test/home/$USER/projects/finlab_quant_code`,
        },
      ],
    },
    {
      title: "Safe unplug",
      blocks: [
        {
          kind: "text",
          text: [
            "Always unmount before disconnecting. Pulling the drive while mounted risks data corruption.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `sudo umount ~/mnt/restic-backup

# optional: power off the drive before unplugging
udisksctl power-off -b /dev/sda

# confirm unmounted
mount | grep restic-backup`,
        },
        {
          kind: "text",
          text: [
            "The ~/mnt/restic-backup directory remains after unmount as an empty folder. This is expected and can be kept for future restores.",
          ],
        },
      ],
    },
    {
      title: "Troubleshooting: permission errors on restore",
      blocks: [
        {
          kind: "text",
          text: [
            "If the restore fails with lchown errors and reports 0 restored files, the ext4 target is owned by root. Fix ownership and retry.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `sudo rm -rf ~/mnt/restic-backup/restore-test
sudo mkdir -p ~/mnt/restic-backup/restore-test
sudo chown -R $USER:$USER ~/mnt/restic-backup

# then rerun the restore command`,
        },
      ],
    },
    {
      title: "Quick reference",
      blocks: [
        {
          kind: "code",
          language: "bash",
          code: `# prepare disk
sudo wipefs -a /dev/sda
sudo sgdisk --zap-all /dev/sda
sudo parted -s /dev/sda mklabel gpt
sudo parted -s /dev/sda mkpart primary ext4 1MiB 100%
sudo mkfs.ext4 -L restic_backup /dev/sda1
mkdir -p ~/mnt/restic-backup
sudo mount /dev/sda1 ~/mnt/restic-backup
sudo chown -R $USER:$USER ~/mnt/restic-backup

# restore
export RESTIC_REPO=/run/media/$USER/backupssd/restic-projects
restic -r "$RESTIC_REPO" snapshots
mkdir -p ~/mnt/restic-backup/restore-test
restic -r "$RESTIC_REPO" restore latest --target ~/mnt/restic-backup/restore-test

# verify
ls ~/mnt/restic-backup/restore-test/home/$USER/projects
du -sh ~/projects
du -sh ~/mnt/restic-backup/restore-test/home/$USER/projects

# unplug
sudo umount ~/mnt/restic-backup`,
        },
      ],
    },
  ],
}

export default entry