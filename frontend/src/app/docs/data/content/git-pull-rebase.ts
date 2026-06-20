import type { UtilityDef } from "../types"

const entry: UtilityDef = {
  id: "git-pull-rebase",
  kind: "codenote",
  name: "Git Pull with Rebase",
  desc: "Fix a divergent main branch when the remote main changed and the local main also has an unpushed commit.",
  intro:
    "This document shows how to handle a divergent main branch when GitHub has new work and the local main branch also has an unpushed commit. The workflow creates a local backup branch first, rebases local work after the remote update, pushes the result, and removes the backup branch after confirming the branch is synced.",
  sections: [
    {
      title: "When this happens",
      blocks: [
        {
          kind: "text",
          text: [
            "This case happens when the remote main branch has new work, but the local main branch also has a commit that has not been pushed yet.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `# Starting point:
# GitHub main:      A
# Your local main:  A
#
# Both sides are the same here.`,
        },
        {
          kind: "text",
          text: ["Then GitHub gets updated by another commit."],
        },
        {
          kind: "code",
          language: "bash",
          code: `# GitHub main:      A -> B
# Your local main:  A
#
# B = new work on GitHub.
# Your local branch is now behind.`,
        },
        {
          kind: "text",
          text: ["Then a local commit is created before pulling the remote update."],
        },
        {
          kind: "code",
          language: "bash",
          code: `# GitHub main:      A -> B
# Your local main:  A -> C
#
# C = your local commit.
# Now both sides have different new work.`,
        },
      ],
    },
    {
      title: "Expected pull error",
      blocks: [
        {
          kind: "text",
          text: [
            "A plain pull can stop because Git sees different new commits on both sides and needs an explicit strategy.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `git pull

# Expected error:
# hint: You have divergent branches and need to specify how to reconcile them.
# hint:
# hint:   git config pull.rebase false  # merge
# hint:   git config pull.rebase true   # rebase
# hint:   git config pull.ff only       # fast-forward only
# fatal: Need to specify how to reconcile divergent branches.
#
# Why it fails:
# Git sees B on GitHub.
# Git sees C locally.
# Both came after A.
# Git needs you to choose how to combine them.`,
        },
      ],
    },
    {
      title: "Create a backup branch first",
      blocks: [
        {
          kind: "text",
          text: [
            "Create a local backup branch before changing history with rebase. This gives a safe reference to the current local state.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `git branch backup-main-before-rebase

# Meaning:
# Save the current local main under another branch name.
# It does not change files.
# It does not switch branches.
# It does not push anything.`,
        },
      ],
    },
    {
      title: "Pull with rebase",
      blocks: [
        {
          kind: "text",
          text: [
            "Use rebase to take the remote main first, then place the local commit after it.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `git pull --rebase origin main

# Meaning:
# Take GitHub main first.
# Then put your local commit after it.
#
# Before:
# GitHub main:      A -> B
# Your local main:  A -> C
#
# After:
# GitHub main:      A -> B
# Your local main:  A -> B -> C`,
        },
      ],
    },
    {
      title: "Push the rebased main",
      blocks: [
        {
          kind: "text",
          text: [
            "After the rebase succeeds, push main so the remote branch receives the local commit after the remote update.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `git push origin main

# Meaning:
# Upload your updated local main to GitHub.
#
# Before push:
# GitHub main:      A -> B
# Your local main:  A -> B -> C
#
# After push:
# GitHub main:      A -> B -> C
# Your local main:  A -> B -> C`,
        },
      ],
    },
    {
      title: "Confirm branch state",
      blocks: [
        {
          kind: "text",
          text: [
            "Check the current branch and recent history before deleting the backup branch.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `git branch --show-current
git log --oneline --graph -10

# Expected state:
# Current branch is main.
# Recent history shows the remote update first.
# Your local commit appears after the remote update.
# The push has already synced main with GitHub.`,
        },
      ],
    },
    {
      title: "Delete the backup branch",
      blocks: [
        {
          kind: "text",
          text: [
            "After confirming everything is synced, delete the local backup branch.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `git branch -D backup-main-before-rebase

# Meaning:
# Delete only the local backup branch name.
# It does not delete your current main.
# It does not delete GitHub main.
#
# Why -D:
# Rebase recreated your local commit after B.
# The old backup commit and the new rebased commit have different IDs.
# So git branch -d can refuse with:
#
# error: the branch 'backup-main-before-rebase' is not fully merged`,
        },
      ],
    },
    {
      title: "Reusable command set",
      blocks: [
        {
          kind: "text",
          text: [
            "Use this compact set when the case is already clear: remote main changed, local main also has an unpushed commit, and rebase is the intended strategy.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `git branch backup-main-before-rebase
git pull --rebase origin main
git push origin main
git branch -D backup-main-before-rebase`,
        },
      ],
    },
  ],
}

export default entry