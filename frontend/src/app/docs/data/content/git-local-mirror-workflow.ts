import type { UtilityDef } from "../types"

const entry: UtilityDef = {
  id: "git-local-mirror-workflow",
  kind: "codenote",
  name: "Git Workflow for Local Mirror Repositories",
  desc: "A fully local Git workflow using a bare .git directory as the central remote, with no dependency on any external hosting.",
  intro:
    "This setup keeps a local .git directory as the central remote, clones working copies from it, and uses standard push/pull operations against that local source. In this way GitHub repositories can be copied fully and managed locally as well.",
  sections: [
    {
      title: "Acquiring the .git",
      blocks: [
        {
          kind: "text",
          text: [
            "The central bare repository can come from two places. Mirror it directly from a remote host to get a complete local copy of all branches, tags, and refs or convert an existing bundle file into a live bare repository if no remote is available.",
          ],
        },
        { kind: "text", text: ["From a remote (GitHub or any Git host):"] },
        {
          kind: "code",
          language: "bash",
          code: `git clone --mirror https://github.com/user/project_name.git project_name.git`,
        },
        { kind: "text", text: ["From a local bundle file:"] },
        {
          kind: "code",
          language: "bash",
          code: `git clone --bare project_name.bundle project_name.git`,
        },
        {
          kind: "text",
          text: [
            "Both produce a project_name.git directory that works identically as a local remote. The --mirror form also copies remote refs and is preferred when a live remote exists.",
          ],
        },
      ],
    },
    {
      title: "Daily workflow",
      blocks: [
        {
          kind: "text",
          text: [
            "Clone from the central bare repository to create a working copy, then use Git as normal from inside it.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `git clone /path/to/project_name.git
cd project_name

git add .
git commit -m "message"
git push
git pull`,
        },
      ],
    },
    {
      title: "Inspect remote",
      blocks: [
        {
          kind: "text",
          text: [
            "Verify where the working repository points before pushing or pulling. The output shows both fetch and push targets.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `git remote -v
# origin  /path/to/project_name.git (fetch)
# origin  /path/to/project_name.git (push)`,
        },
      ],
    },
    {
      title: "Change remote path",
      blocks: [
        {
          kind: "text",
          text: [
            "If the central repository has moved, or the working copy still points to an old bundle path, update the remote URL and verify.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `git remote set-url origin /new/path/to/project_name.git
git remote -v`,
        },
      ],
    },
    {
      title: "Branch operations",
      blocks: [
        {
          kind: "text",
          text: [
            "Check local and remote branches, then push a new branch with upstream tracking so future pushes need no arguments.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `git branch                     # local branches
git branch -a                  # all branches including remote
git branch --show-current      # active branch

git push -u origin branch_name # push and set upstream`,
        },
      ],
    },
    {
      title: "Inspect central repo",
      blocks: [
        {
          kind: "text",
          text: ["Run this inside the bare .git directory to see every branch, tag, and ref it holds."],
        },
        {
          kind: "code",
          language: "bash",
          code: `cd /path/to/project_name.git
git show-ref`,
        },
      ],
    },
  ],
}

export default entry