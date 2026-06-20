import type { UtilityDef } from "../types"

const entry: UtilityDef = {
  id: "git-discard-and-switch",
  kind: "codenote",
  name: "Discard Local Changes and Switch Branch",
  desc: "Steps to discard all tracked and untracked local changes, then switch to another branch.",
  intro:
    "When you need to abandon local work entirely and move to a different branch, two commands handle the two categories of changes: git restore resets tracked files that have been modified, and git clean removes untracked files and folders that Git has never recorded. Both steps are needed for a fully clean working tree. This case can happen when unwanted local changes made in production such as celery outputs, local data updates etc.",
  sections: [
    {
      title: "Understand the two categories",
      blocks: [
        {
          kind: "text",
          text: [
            "git status will show two kinds of local changes that block a clean branch switch.",
          ],
        },
        {
          kind: "text",
          bullets: [
            "Tracked modified files: files Git knows about that have been changed since the last commit. Cleared with git restore.",
            "Untracked files and folders: new files or generated output that Git has never recorded. Cleared with git clean.",
          ],
        },
      ],
    },
    {
      title: "Preview what will be deleted",
      blocks: [
        {
          kind: "text",
          text: [
            "Before deleting anything, do a dry run to see exactly which untracked files and folders git clean would remove. Nothing is deleted at this step.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `git clean -fdn`,
        },
      ],
    },
    {
      title: "Discard all local changes",
      blocks: [
        {
          kind: "text",
          text: [
            "Once you have confirmed what will be removed, run both commands in sequence. This is permanent for untracked files and cannot be recovered.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `git restore .
git clean -fd`,
        },
        {
          kind: "text",
          text: [
            "git restore . resets every tracked modified file back to the last commit. git clean -fd deletes all untracked files (-f forces the delete, -d includes untracked directories).",
          ],
        },
      ],
    },
    {
      title: "Switch to an existing branch",
      blocks: [
        {
          kind: "text",
          text: [
            "If the branch already exists locally, fetch any remote updates and switch directly.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `git fetch origin
git switch <branch-name>`,
        },
      ],
    },
    {
      title: "Switch to a new remote branch",
      blocks: [
        {
          kind: "text",
          text: [
            "If the branch exists on the remote but not yet locally, create it and set tracking in one step.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `git fetch origin
git switch -c <branch-name> --track origin/<branch-name>`,
        },
      ],
    },
    {
      title: "Full safe sequence",
      blocks: [
        {
          kind: "text",
          text: [
            "The complete sequence from a unwanted working tree to a clean branch switch, including the dry run preview.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `git restore .
git clean -fdn        # preview - nothing deleted yet
git clean -fd         # actual delete
git fetch origin

# if branch already exists locally:
git switch <branch-name>

# if branch is remote only:
git switch -c <branch-name> --track origin/<branch-name>`,
        },
      ],
    },
  ],
}

export default entry