import type { UtilityDef } from "../types"

const entry: UtilityDef = {
  id: "restic-local-backup",
  kind: "codenote",
  name: "Restic Local Backup",
  desc: "Incremental snapshot backups of projects to a local backup drive using restic, with exclude rules for Linux development environments.",
  intro:
    "This page shows how to create and manage local restic backups for projects on an external drive. Page is designed to replicate initial installation and setup. The workflow is applicable to daily backup management as well.",
    resources: [
    { label: "Restic Official Site", href: "https://restic.net/" },
    { label: "Restic Restore Test with External Drive", href: "/docs/restic-restore-test" },
  ],
    sections: [
        {
  title: "Overview",
  blocks: [
    {
      kind: "text",
      bullets: [
        "Find the backup drive partition with lsblk.",
        "Mount the backup SSD to a persistent local mount folder such as ~/mnt/restic-backup.",
        "Set REPO to a restic repository folder inside the mounted backup drive.",
        "Install restic and create the repository once with restic init.",
        "Backup with an exclude selected files logic.",
        "Inspect snapshots, verify integrity, and test restore.",
        "Apply cleanup with forget and prune.",
      ],
    },
  ],
},
    {
      title: "Install",
      blocks: [
        {
          kind: "code",
          language: "bash",
          code: `# Arch
sudo pacman -S restic

# Debian / Ubuntu
sudo apt install restic`,
        },
      ],
    },
    {
  title: "Find the drive with lsblk",
  blocks: [
    {
      kind: "text",
      text: [
        "Run lsblk first to see all block devices, filesystem types, labels, and mount points. This tells you the real device name to mount and whether the SSD is already mounted.",
      ],
    },
    {
      kind: "code",
      language: "bash",
      code: `lsblk -f`,
    },
    {
      kind: "text",
      text: [
        "Example output:",
      ],
    },
    {
      kind: "code",
      language: "bash",
      code: `NAME        FSTYPE  LABEL     MOUNTPOINTS
nvme0n1
├─nvme0n1p1
└─nvme0n1p2 ntfs    backupssd`,
    },
    {
      kind: "text",
      text: [
        "Reading the output: the device to mount is the partition name, for example /dev/nvme0n1p2. The LABEL column shows the drive label, for example backupssd. If MOUNTPOINTS is empty, the drive is not mounted yet.",
        "For this workflow, use a persistent mount folder inside the home directory, for example ~/mnt/restic-backup. This folder remains after reboot, unlike runtime paths under /run/media.",
        "The REPO path is the mount path plus a subfolder name for the restic repository, for example ~/mnt/restic-backup/restic-projects.",
      ],
    },
  ],
},
    {
  title: "Mount the SSD",
  blocks: [
    {
      kind: "text",
      text: [
        "If the drive is not yet mounted, mount it manually using the device name from lsblk. This workflow uses a persistent mount folder under the home directory instead of a temporary runtime path under /run/media.",
      ],
    },
    {
      kind: "code",
      language: "bash",
      code: `# Set the partition name from lsblk
export DRIVE_NAME=nvme0n1p2

# Use a persistent local mount folder for this backup workflow
export MOUNT_PATH="$HOME/mnt/restic-backup"

# Create the mount folder if it does not exist yet
mkdir -p "$MOUNT_PATH"

# Mount the NTFS backup partition
sudo mount -t ntfs3 "/dev/$DRIVE_NAME" "$MOUNT_PATH"

# Confirm the disk is mounted and reachable
lsblk -f
ls "$MOUNT_PATH"`,
    },
    {
      kind: "text",
      text: [
        "If the mount succeeds, the SSD contents should appear under ~/mnt/restic-backup. The folder itself persists after reboot, but the disk must be mounted again unless an automatic mount rule is configured.",
      ],
    },
    {
      kind: "code",
      language: "bash",
      code: `# Unmount after backup work is done
sudo umount "$HOME/mnt/restic-backup"`,
    },
  ],
},
    {
  title: "Set environment variables",
  blocks: [
    {
      kind: "text",
      text: [
        "$HOME is available by default in any shell session. Use it to keep the mount and repository paths generic across machines.",
      ],
    },
    {
      kind: "code",
      language: "bash",
      code: `echo "$HOME"`,
    },
    {
      kind: "text",
      text: [
        "Export MOUNT_PATH and REPO once per session. After export, $REPO can be used in all restic commands below.",
      ],
    },
    {
      kind: "code",
      language: "bash",
      code: `export MOUNT_PATH="$HOME/mnt/restic-backup"
export REPO="$MOUNT_PATH/restic-projects"

echo "$MOUNT_PATH"
echo "$REPO"`,
    },
    {
      kind: "text",
      text: ["Example output:"],
    },
    {
      kind: "code",
      language: "bash",
      code: `/home/example_user/mnt/restic-backup
/home/example_user/mnt/restic-backup/restic-projects`,
    },
  ],
},
    {
      title: "Initialise the repository",
      
      blocks: [
        {
          kind: "text",
          text: ["After the initial installation make the restic backup folder and initialize restic. This istep is done only during the initial setup."],
        },
        {
          kind: "code",
          language: "bash",
          code: `mkdir -p $REPO
restic -r $REPO init`,
        },
      ],
    },
    {
      title: "Inspect project size before backup",
      blocks: [
        {
          kind: "text",
          text: [
            "Useful before the first backup to confirm the data size. Also use the file counts to validate rules are skipping folders like node_modules, .venv, and build output.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `du -h --max-depth=2 ~/projects 2>/dev/null | sort -h

find ~/projects -type f | wc -l`,
        },
      ],
    },
    {
      title: "Dry run before first backup",
      blocks: [
        {
          kind: "text",
          text: [
            "Scan the source and apply exclusions without writing any data. This is useful to again to confirm actual backup file size before committing.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `restic -r $REPO backup ~/projects --exclude-file ~/projects/.backup/ignore.txt --dry-run -v`,
        },
      ],
    },
    {
      title: "Daily backup",
      blocks: [
        {
          kind: "text",
          text: [
            "Run the same command without the dry run flag to execute backup. Restic creates a new snapshot and reuses unchanged data from previous ones.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `restic -r $REPO backup ~/projects --exclude-file ~/projects/.backup/ignore.txt
restic -r $REPO snapshots`,
        },
      ],
    },
    {
      title: "Inspect and verify",
      blocks: [
        {
          kind: "text",
          text: [
            "You can see the new list of snapshots and latest files to confirm the process was completed successfully.",
          ]
        },
        {
          kind: "code",
          language: "bash",
          code: `restic -r $REPO snapshots
restic -r $REPO ls latest
restic -r $REPO check`,
        },
      ],
    },
    {
      title: "Restore test",
      blocks: [
        {
          kind: "text",
          text: [
            "Another step in the backup process is to test the restorability. Make sure you simulate the backup restore after the first installation and periodically. The full restore procedure is provided under the resources section above.",
          ]
        },
      ],
    },
    {
      title: "Cleanup: forget old snapshots",
      blocks: [
        {
          kind: "text",
          text: [
            "Run to remove old snapshots by a given policy, then prune to free the actual storage.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `restic -r $REPO forget --keep-last 7 --keep-weekly 4 --keep-monthly 6
restic -r $REPO prune`,
        },
      ],
    },
    {
      title: "Exclude file",
      blocks: [
        {
          kind: "text",
          text: [
            "Exclude file is optional, however it is especially useful for developers keeping the virtual environemnts and build related folders within the repositories. The following is an example exclude file list for a Python and Reach/Next.js development environemnt.",

          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `
# Location: ~/projects/.backup/ignore.txt
# Adjust path to match your project root
**/.venv
**/venv
**/node_modules
**/.next
**/__pycache__
**/.pytest_cache
**/.mypy_cache
**/.ruff_cache
**/.turbo
**/.parcel-cache
**/.cache
**/dist
**/build
**/coverage
**/*.pyc
**/*.pyo`,
        },
      ],
    },
  ],
  
}

export default entry