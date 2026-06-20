import type { UtilityDef } from "../types"

const entry: UtilityDef = {
  id: "git-branches-and-log",
  kind: "codenote",
  name: "Git Branches, Log, and Merge",
  desc: "View commit history, manage local and remote branches, pull new branches, and merge into main.",
  intro:
    "This document covers standard branch operations for daily Git usage including: reading the commit log, listing branches, creating and switching branches, pushing to remote, pulling remote branches locally, and merging a feature branch into main.",
  sections: [
    {
      title: "Quick reference",
      blocks: [
        {
          kind: "code",
          language: "bash",
          code: `# log
git log --oneline -20
git log --oneline --graph --all

# branches
git branch
git branch -a
git fetch origin

# create, switch, push
git switch -c feature-branch
git push -u origin feature-branch

# pull remote branch
git fetch origin
git switch -c feature-branch --track origin/feature-branch

# merge to main
git switch main
git pull origin main
git merge feature-branch
git push origin main

# delete branches
git branch -d feature-branch
git branch -D feature-branch
git push origin --delete feature-branch

# prune stale remote-tracking refs
git branch -r
git ls-remote --heads origin
git fetch origin --prune
git remote prune origin
git config --global fetch.prune true`,
        },
      ],
    },
    {
      title: "View commit log",
      blocks: [
        {
          kind: "text",
          text: [
            "The log shows commit history for the current branch. The oneline format keeps it scannable.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `# last 20 commits, one line each
git log --oneline -20

# full detail on last 5
git log -5

# all branches as a graph
git log --oneline --graph --all`,
        },
      ],
    },
    {
      title: "List branches",
      blocks: [
        {
          kind: "text",
          text: [
            "Local branches are shown by default. Use -a to include remote branches. Fetch first to make sure the remote list is current.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `git branch                # local only
git branch -a             # local + remote
git branch --show-current # active branch
git fetch origin          # update remote refs`,
        },
      ],
    },
    {
      title: "Create a new branch and push",
      blocks: [
        {
          kind: "text",
          text: [
            "Create a branch from the current HEAD, switch to it, and push with upstream tracking so future pushes need no arguments.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `git switch -c feature-branch
git push -u origin feature-branch`,
        },
      ],
    },
    {
      title: "Pull a remote branch locally",
      blocks: [
        {
          kind: "text",
          text: [
            "When a branch exists on the remote but not locally, fetch first then create it with tracking.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `git fetch origin
git switch -c feature-branch --track origin/feature-branch`,
        },
      ],
    },
    {
      title: "Switch between branches",
      blocks: [
        {
          kind: "text",
          text: [
            "Use switch to move between existing local branches. Working tree must be clean or changes will block the switch.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `git switch main
git switch feature-branch`,
        },
      ],
    },
    {
      title: "Merge a branch into main",
      blocks: [
        {
          kind: "text",
          text: [
            "Switch to main, pull the latest, merge the feature branch, push, and clean up. This assumes no conflicts.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `git switch main
git pull origin main
git merge feature-branch
git push origin main`,
        },
      ],
    },
    {
      title: "Delete merged branch",
      blocks: [
        {
          kind: "text",
          text: [
            "After a successful merge, remove the branch locally. Delete the remote branch separately only when the branch should also be removed from the remote repository.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `# check current local branches
git branch

# delete local after merge
git branch -d feature-branch

# force delete local even if Git does not see it as merged
git branch -D feature-branch

# delete the real branch from the remote repository
git push origin --delete feature-branch`,
        },
        {
          kind: "text",
          bullets: [
            "git branch -d deletes a local branch only when Git considers it merged.",
            "git branch -D force-deletes a local branch. Use it only when you are sure the work is no longer needed.",
            "git push origin --delete branch_name deletes the branch from the remote repository, not just from your local branch list.",
          ],
        },
      ],
    },
    {
      title: "Prune stale remote branches",
      blocks: [
        {
          kind: "text",
          text: [
            "Remote-tracking branches such as origin/old-feature can remain in your local repo after the real remote branch is deleted. Check what your local repo remembers, compare it with the remote, then prune stale origin/* references.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `# check current remote-tracking branches remembered locally
git branch -r

# check which branches actually exist on the remote
git ls-remote --heads origin

# remove stale origin/* references that no longer exist on GitHub
git fetch origin --prune

# alternative direct prune command for the origin remote
git remote prune origin

# check again after cleanup
git branch -r`,
        },
        {
          kind: "text",
          text: [
            "git fetch origin --prune is usually the most useful command because it updates from origin and prunes stale remote-tracking refs in one step. git remote prune origin only prunes stale refs for origin.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `git fetch origin --prune

# Expected output when stale remote-tracking branches are removed:
# From github.com:example-user/example-repo
#  - [deleted]         (none)     -> origin/old-feature-branch
#  - [deleted]         (none)     -> origin/old-cleanup-branch
#  - [deleted]         (none)     -> origin/old-test-branch`,
        },
        {
          kind: "text",
          text: [
            "Make pruning automatic if you want future fetches to clean stale remote-tracking branches by default.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `git config --global fetch.prune true`,
        },
        {
          kind: "text",
          text: [
            "Do not use git fetch -r. The fetch command does not use -r as a prune shortcut.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `git fetch -r

# Expected error:
# error: unknown switch \`r\`
# usage: git fetch [<options>] [<repository> [<refspec>...]]`,
        },
      ],
    },
    {
      title: "Confirm remote branch list",
      blocks: [
        {
          kind: "text",
          text: [
            "List remote-tracking branches after pruning. This should only show branches that still exist on the remote.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `git branch -r

# Expected output:
#   origin/HEAD -> origin/main
#   origin/active-feature-branch
#   origin/main`,
        },
      ],
    },
  ],
}

export default entry
