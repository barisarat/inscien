import type { UtilityDef } from "../types"

const entry: UtilityDef = {
  id: "git-init-workflow",
  kind: "codenote",
  name: "Git Init and First Push",
  desc: "Initialize a local repo, set the main branch, connect to a remote, and push for the first time.",
  intro:
    "This document provides a standard initial git setup when starting a project locally and later pushing to remote repository instead of starting from a pull operation.",
  sections: [
    {
      title: "Quick reference",
      blocks: [
        {
          kind: "code",
          language: "bash",
          code: `git init
git branch -M main
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push --set-upstream origin main`,
        },
      ],
    },
    {
      title: "Orient yourself first",
      blocks: [
        {
          kind: "code",
          language: "bash",
          code: `pwd           # confirm you are in the right directory
ls -la        # list all files including hidden (e.g. existing .git)
du -sh ./*    # check size of each item before committing`,
        },
      ],
    },
    {
      title: "Init and branch",
      blocks: [
        {
          kind: "code",
          language: "bash",
          code: `git init            # initialize repo in current directory
git branch -M main  # rename default branch to main
git branch          # confirm branch name`,
        },
      ],
    },
    {
      title: "Stage and commit",
      blocks: [
        {
          kind: "code",
          language: "bash",
          code: `git status        # see untracked files
git add .         # stage everything
git status        # confirm what is staged
git commit -m "Initial commit"`,
        },
      ],
    },
    {
      title: "Connect remote and push",
      blocks: [
        {
          kind: "code",
          language: "bash",
          code: `git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git remote -v                        # confirm remote URL
git push --set-upstream origin main  # first push, sets tracking branch`,
        },
      ],
    },
    {
      title: "Verify",
      blocks: [
        {
          kind: "code",
          language: "bash",
          code: `git branch   # confirm you are on main
git status   # should say "nothing to commit, working tree clean"`,
        },
      ],
    },
  ],
}

export default entry