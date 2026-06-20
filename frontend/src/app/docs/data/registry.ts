import gitLocalMirrorWorkflow from "./content/git-local-mirror-workflow"
import gitInitWorkflow from "./content/git-init-workflow"
import gitDiscardAndSwitch from "./content/git-discard-and-switch"
import gitBranchesAndLog from "./content/git-branches-and-log"
import sshEc2Connect from "./content/ssh-ec2-connect"
import bashAliases from "./content/bash-aliases"
import dockerImageContainerMentalModel from "./content/docker-image-container-mental-model"
import dockerResourceDiagnosticsCleanup from "./content/docker-resource-diagnostics-cleanup"
import dockerComposeWorkflow from "./content/docker-compose-workflow"
import dockerComposeDevWorkspace from "./content/docker-compose-dev-workspace"
import multiAgentWorktreeDockerWorkflow from "./content/multi-agent-worktree-docker-workflow"
import tmuxWorkflow from "./content/tmux-workflow"
import archWindowsVm from "./content/arch-windows-vm"
import browserSetupLinux from "./content/browser-setup-linux"
import archYayInstall from "./content/arch-yay-install"
import ec2AddSshKey from "./content/ec2-add-ssh-key"
import resticLocalBackup from "./content/restic-local-backup"
import resticRestoreTest from "./content/restic-restore-test"
import portInUse from "./content/port-in-use"
import nbconvertHtml from "./content/nbconvert-html"
import jupyterKernels from "./content/jupyter-kernels"
import gpuWatch from "./content/gpu-watch"
import ollamaLocalApi from "./content/ollama-local-api"
import tqdmIprogressFix from "./content/tqdm-iprogress-fix"
import archEpsonWifiPrinter from "./content/arch-epson-wifi-printer"
import dockerContainerNameConflict from "./content/docker-container-name-conflict"
import archDefaultBrowser from "./content/arch-default-browser"
import gcloudBigqueryProjectSetup from "./content/gcloud-bigquery-project-setup"
import dockerComposeProductionDeploy from "./content/docker-compose-production-deploy"
import n8nEc2ArxivRadar from "./content/n8n-ec2-arxiv-radar"
import vscodeWorkflow from "./content/vscode-workflow"
import codexLocalAgentSetup from "./content/codex-local-agent-setup"
import claudeCodeDockerSetup from "./content/claude-code-docker-setup"
import hermesLocalDeviceSetup from "./content/hermes-local-device-setup"
import hermesDockerLocalSetup from "./content/hermes-docker-local-setup"
import i3AltModKey from "./content/i3-alt-mod-key"
import i3ArchSetup from "./content/i3-arch-setup"
import i3DevModeWorkflow from "./content/i3-dev-mode-workflow"
import i3LidBehavior from "./content/i3-lid-behavior"
import i3LyLoginSetup from "./content/i3-ly-login-setup"
import i3PipewireSound from "./content/i3-pipewire-sound"
import i3ScreenLayoutProfiles from "./content/i3-screen-layout-profiles"
import i3ScreenshotWorkflow from "./content/i3-screenshot-workflow"
import i3TouchpadLibinput from "./content/i3-touchpad-libinput"
import archAsusLaptopControls from "./content/arch-asus-laptop-controls"
import nanoUsage from "./content/nano-usage"
import bigqueryCloudStorageArchive from "./content/bigquery-cloud-storage-archive"
import sshLocalDevice from "./content/ssh-local-device"
import findLocalIp from "./content/find-local-ip"
import cudaUbuntuSetup from "./content/cuda-ubuntu-setup"
import windowsVmUbuntu from "./content/windows-vm-ubuntu"
import pythonMultipleVersionsUbuntu from "./content/python-multiple-versions-ubuntu"
import nvmInstallUbuntu from "./content/nvm-install-ubuntu"
import archDisplayBrightnessNightMode from "./content/arch-display-brightness-night-mode"
import linuxServiceOperations from "./content/linux-service-operations"
import libreofficeReference from "./content/libreoffice-reference"
import vscodeWorkspaceExcludes from "./content/vscode-workspace-excludes"
import pythonImportPathPackages from "./content/python-import-path-packages"
import githubSshAuth from "./content/github-ssh-auth"
import bizdocsEsignContainer from "./content/bizdocs-esign-container"
import cppVscodeGccCmake from "./content/cpp-vscode-gcc-cmake"
import systemdNginxFullstackDeploy from "./content/systemd-nginx-fullstack-deploy"
import systemMaintenanceErrorReview from "./content/system-maintenance-error-review"
import vscodeNoteMdViewerExtension from "./content/vscode-note-md-viewer-extension"
import archHibernateSwapfileUki from "./content/arch-hibernate-swapfile-uki"
import archLtsKernelBootLifecycle from "./content/arch-lts-kernel-boot-lifecycle"
import gitPullRebase from "./content/git-pull-rebase"
import x11DpmsControl from "./content/x11-dpms-control"
import qdrantRagVectorIndexWorkflow from "./content/qdrant-rag-vector-index-workflow"
import linuxShellLineEditingShortcuts from "./content/linux-shell-line-editing-shortcuts"

import dataCollections from "./glossary/content/data-collections"
import bagOfWords from "./glossary/content/bag-of-words"
import programmingParadigms from "./glossary/content/programming-paradigms"
import sqlDatabaseAndTable from "./glossary/content/sql-database-and-table"
import relationalIntegrity from "./glossary/content/relational-integrity"
import acidTransactions from "./glossary/content/acid-transactions"
import fastapiSetup from "./content/fastapi-setup"
import fastapiSqlAlcemyCrud from "./content/fastapi-sqlalchemy-crud"
import fastapiPostgresAuthRepositoryAsync from  "./content/fastapi-postgres-auth-repository-async"
import fastapiAuthenticationAuthorization from "./content/fastapi-authentication-authorization"
import fastapiTestingPytest from "./content/fastapi-testing-pytest"
import fastapiAlembicMigrations from "./content/fastapi-alembic-migrations"
import fastapiSettingsEnvironment from "./content/fastapi-settings-environment"
import fastapiErrorHandlingResponses from "./content/fastapi-error-handling-responses"
import fastapiFileUploadCorsFrontend from "./content/fastapi-file-upload-cors-frontend"

import type { UtilityDef } from "./types"

export type DocsSectionSlug = "ml" | "dev" | "linux" | "glossary"

export type DocsSection = {
  slug: DocsSectionSlug
  title: string
  desc: string
  sidebarTitle: string
  searchPlaceholder: string
  categoryOrder: string[]
}

export type DocsListingGroup = {
  category: string
  items: Array<{
    id: string
    name: string
    desc: string
    href: string
  }>
}

export const docsEntries: UtilityDef[] = [
  gitLocalMirrorWorkflow,
  gitInitWorkflow,
  gitDiscardAndSwitch,
  gitBranchesAndLog,
  sshEc2Connect,
  bashAliases,
  dockerImageContainerMentalModel,
  dockerResourceDiagnosticsCleanup,
  dockerComposeWorkflow,
  dockerComposeDevWorkspace,
  multiAgentWorktreeDockerWorkflow,
  tmuxWorkflow,
  archWindowsVm,
  browserSetupLinux,
  archYayInstall,
  ec2AddSshKey,
  resticLocalBackup,
  resticRestoreTest,
  portInUse,
  nbconvertHtml,
  jupyterKernels,
  gpuWatch,
  ollamaLocalApi,
  tqdmIprogressFix,
  archEpsonWifiPrinter,
  dockerContainerNameConflict,
  archDefaultBrowser,
  gcloudBigqueryProjectSetup,
  dockerComposeProductionDeploy,
  n8nEc2ArxivRadar,
  vscodeWorkflow,
  codexLocalAgentSetup,
  claudeCodeDockerSetup,
  hermesLocalDeviceSetup,
  hermesDockerLocalSetup,
  i3AltModKey,
  i3ArchSetup,
  i3DevModeWorkflow,
  i3LidBehavior,
  i3LyLoginSetup,
  i3PipewireSound,
  i3ScreenLayoutProfiles,
  i3ScreenshotWorkflow,
  i3TouchpadLibinput,
  archAsusLaptopControls,
  nanoUsage,
  bigqueryCloudStorageArchive,
  sshLocalDevice,
  findLocalIp,
  cudaUbuntuSetup,
  windowsVmUbuntu,
  pythonMultipleVersionsUbuntu,
  nvmInstallUbuntu,
  archDisplayBrightnessNightMode,
  linuxServiceOperations,
  libreofficeReference,
  vscodeWorkspaceExcludes,
  pythonImportPathPackages,
  githubSshAuth,
  bizdocsEsignContainer,
  cppVscodeGccCmake,
  systemdNginxFullstackDeploy,
  systemMaintenanceErrorReview,
  vscodeNoteMdViewerExtension,
  archHibernateSwapfileUki,
  archLtsKernelBootLifecycle,
  gitPullRebase,
  x11DpmsControl,
  qdrantRagVectorIndexWorkflow,
  linuxShellLineEditingShortcuts,
  fastapiSetup,
  fastapiSqlAlcemyCrud,
  fastapiPostgresAuthRepositoryAsync,
  fastapiAuthenticationAuthorization,
  fastapiTestingPytest,
  fastapiAlembicMigrations,
  fastapiSettingsEnvironment,
  fastapiErrorHandlingResponses,
  fastapiFileUploadCorsFrontend
]

export const glossaryEntries: UtilityDef[] = [
  dataCollections,
  bagOfWords,
  programmingParadigms,
  sqlDatabaseAndTable,
  relationalIntegrity,
  acidTransactions,
]

export const utilities: UtilityDef[] = [
  ...docsEntries,
  ...glossaryEntries,
]

export const DOCS_SECTIONS: DocsSection[] = [
  {
    slug: "ml",
    title: "ML Docs",
    desc: "Practical notes for notebooks, local AI workflows, RAG, AI coding agents, and machine learning development.",
    sidebarTitle: "ML Docs",
    searchPlaceholder: "Filter docs",
    categoryOrder: [
      "ML and Notebook Workflow",
      "AI Coding Agents",
    ],
  },
  {
    slug: "dev",
    title: "Dev Docs",
    desc: "Repeatable development, Git, Docker, server, deployment, cloud, and editor workflows.",
    sidebarTitle: "Dev Docs",
    searchPlaceholder: "Filter docs",
    categoryOrder: [
      "Editors and IDEs",
      "Languages and Runtimes",
      "Git",
      "Containers and Docker",
      "FastAPI Project Examples",
      "Server and Deployment",
      "Cloud and Data Platforms",
    ],
  },
  {
    slug: "linux",
    title: "Linux Docs",
    desc: "Shell and terminal, system operations, Arch, i3, hardware, backup, and maintenance workflows.",
    sidebarTitle: "Linux Docs",
    searchPlaceholder: "Filter docs",
    categoryOrder: [
      "Shell and Terminal",
      "System Operations",
      "Linux Desktop Workflow",
    ],
  },
  {
    slug: "glossary",
    title: "Glossary",
    desc: "Practical terminology for machine learning, databases, programming, and data representation.",
    sidebarTitle: "Glossary",
    searchPlaceholder: "Filter docs",
    categoryOrder: [
      "Data Structures and Representation",
      "Information Retrieval",
      "Programming Concepts",
      "Database Concepts",
    ],
  },
]

export const DOCS_SECTION_ORDER: DocsSectionSlug[] = [
  "ml",
  "dev",
  "linux",
  "glossary",
]

export const DOCS_ENTRY_SECTION: Record<string, DocsSectionSlug> = {
  "tqdm-iprogress-fix": "ml",
  "nbconvert-html": "ml",
  "jupyter-kernels": "ml",
  "ollama-local-api": "ml",
  "qdrant-rag-vector-index-workflow": "ml",
  "codex-local-agent-setup": "ml",
  "claude-code-docker-setup": "ml",
  "hermes-local-device-setup": "ml",
  "hermes-docker-local-setup": "ml",
  "multi-agent-worktree-docker-workflow": "ml",

  "docker-image-container-mental-model": "dev",
  "docker-resource-diagnostics-cleanup": "dev",
  "docker-compose-workflow": "dev",
  "docker-compose-dev-workspace": "dev",
  "git-local-mirror-workflow": "dev",
  "git-init-workflow": "dev",
  "git-discard-and-switch": "dev",
  "git-branches-and-log": "dev",
  "git-pull-rebase": "dev",
  "github-ssh-auth": "dev",
  "python-import-path-packages": "dev",
  "python-multiple-versions-ubuntu": "dev",
  "nvm-install-ubuntu": "dev",
  "cpp-vscode-gcc-cmake": "dev",
  "vscode-workflow": "dev",
  "vscode-workspace-excludes": "dev",
  "nano-usage": "dev",
  "vscode-note-md-viewer-extension": "dev",
  "ssh-ec2-connect": "dev",
  "ec2-add-ssh-key": "dev",
  "ssh-local-device": "dev",
  "find-local-ip": "dev",
  "docker-compose-production-deploy": "dev",
  "n8n-ec2-arxiv-radar": "dev",
  "systemd-nginx-fullstack-deploy": "dev",
  "cuda-ubuntu-setup": "dev",
  "gcloud-bigquery-project-setup": "dev",
  "bigquery-cloud-storage-archive": "dev",

  "bash-aliases": "linux",
  "linux-shell-line-editing-shortcuts": "linux",
  "tmux-workflow": "linux",
  "linux-service-operations": "linux",
  "system-maintenance-error-review": "linux",
  "arch-lts-kernel-boot-lifecycle": "linux",
  "restic-local-backup": "linux",
  "restic-restore-test": "linux",
  "port-in-use": "linux",
  "gpu-watch": "linux",
  "docker-container-name-conflict": "linux",
  "arch-hibernate-swapfile-uki": "linux",
  "arch-windows-vm": "linux",
  "browser-setup-linux": "linux",
  "arch-yay-install": "linux",
  "i3-alt-mod-key": "linux",
  "i3-arch-setup": "linux",
  "i3-dev-mode-workflow": "linux",
  "i3-lid-behavior": "linux",
  "i3-ly-login-setup": "linux",
  "i3-pipewire-sound": "linux",
  "i3-screen-layout-profiles": "linux",
  "i3-screenshot-workflow": "linux",
  "i3-touchpad-libinput": "linux",
  "arch-asus-laptop-controls": "linux",
  "arch-epson-wifi-printer": "linux",
  "arch-default-browser": "linux",
  "windows-vm-ubuntu": "linux",
  "arch-display-brightness-night-mode": "linux",
  "bizdocs-esign-container": "linux",
  "x11-dpms-control": "linux",
  "libreoffice-reference": "linux",

  "data-collections": "glossary",
  "bag-of-words": "glossary",
  "programming-paradigms": "glossary",
  "sql-database-and-table": "glossary",
  "relational-integrity": "glossary",
  "acid-transactions": "glossary",

  "fastapi-setup": "dev",
  "fastapi-sqlalchemy-crud": "dev",
  "fastapi-postgres-auth-repository-async": "dev",
  "fastapi-authentication-authorization": "dev",
  "fastapi-testing-pytest": "dev",
  "fastapi-alembic-migrations": "dev",
  "fastapi-settings-environment": "dev",
  "fastapi-error-handling-responses": "dev",
  "fastapi-file-upload-cors-frontend": "dev"
}

export const DOCS_CATEGORY: Record<string, string> = {
  "tqdm-iprogress-fix": "ML and Notebook Workflow",
  "nbconvert-html": "ML and Notebook Workflow",
  "jupyter-kernels": "ML and Notebook Workflow",
  "ollama-local-api": "ML and Notebook Workflow",
  "qdrant-rag-vector-index-workflow": "ML and Notebook Workflow",

  "bash-aliases": "Shell and Terminal",
  "linux-shell-line-editing-shortcuts": "Shell and Terminal",

  "vscode-workflow": "Editors and IDEs",
  "vscode-workspace-excludes": "Editors and IDEs",
  "vscode-note-md-viewer-extension": "Editors and IDEs",
  "nano-usage": "Editors and IDEs",

  "python-import-path-packages": "Languages and Runtimes",
  "python-multiple-versions-ubuntu": "Languages and Runtimes",
  "nvm-install-ubuntu": "Languages and Runtimes",
  "cpp-vscode-gcc-cmake": "Languages and Runtimes",

  "git-local-mirror-workflow": "Git",
  "git-init-workflow": "Git",
  "git-discard-and-switch": "Git",
  "git-branches-and-log": "Git",
  "git-pull-rebase": "Git",
  "github-ssh-auth": "Git",

  "docker-image-container-mental-model": "Containers and Docker",
  "docker-resource-diagnostics-cleanup": "Containers and Docker",
  "docker-compose-workflow": "Containers and Docker",
  "docker-compose-dev-workspace": "Containers and Docker",

  "codex-local-agent-setup": "AI Coding Agents",
  "claude-code-docker-setup": "AI Coding Agents",
  "hermes-local-device-setup": "AI Coding Agents",
  "hermes-docker-local-setup": "AI Coding Agents",
  "multi-agent-worktree-docker-workflow": "AI Coding Agents",

  "ssh-ec2-connect": "Server and Deployment",
  "ec2-add-ssh-key": "Server and Deployment",
  "ssh-local-device": "Server and Deployment",
  "find-local-ip": "Server and Deployment",
  "docker-compose-production-deploy": "Server and Deployment",
  "n8n-ec2-arxiv-radar": "Server and Deployment",
  "systemd-nginx-fullstack-deploy": "Server and Deployment",
  "cuda-ubuntu-setup": "Server and Deployment",

  "gcloud-bigquery-project-setup": "Cloud and Data Platforms",
  "bigquery-cloud-storage-archive": "Cloud and Data Platforms",

  "linux-service-operations": "System Operations",
  "system-maintenance-error-review": "System Operations",
  "arch-lts-kernel-boot-lifecycle": "Linux Desktop Workflow",
  "port-in-use": "System Operations",
  "gpu-watch": "System Operations",
  "docker-container-name-conflict": "System Operations",
  "arch-hibernate-swapfile-uki": "Linux Desktop Workflow",

  "tmux-workflow": "Linux Desktop Workflow",
  "restic-local-backup": "Linux Desktop Workflow",
  "restic-restore-test": "Linux Desktop Workflow",
  "arch-windows-vm": "Linux Desktop Workflow",
  "browser-setup-linux": "Linux Desktop Workflow",
  "arch-yay-install": "Linux Desktop Workflow",
  "i3-alt-mod-key": "Linux Desktop Workflow",
  "i3-arch-setup": "Linux Desktop Workflow",
  "i3-dev-mode-workflow": "Linux Desktop Workflow",
  "i3-lid-behavior": "Linux Desktop Workflow",
  "i3-ly-login-setup": "Linux Desktop Workflow",
  "i3-pipewire-sound": "Linux Desktop Workflow",
  "i3-screen-layout-profiles": "Linux Desktop Workflow",
  "i3-screenshot-workflow": "Linux Desktop Workflow",
  "i3-touchpad-libinput": "Linux Desktop Workflow",
  "arch-asus-laptop-controls": "Linux Desktop Workflow",
  "arch-epson-wifi-printer": "Linux Desktop Workflow",
  "arch-default-browser": "Linux Desktop Workflow",
  "windows-vm-ubuntu": "Linux Desktop Workflow",
  "arch-display-brightness-night-mode": "Linux Desktop Workflow",
  "bizdocs-esign-container": "Linux Desktop Workflow",
  "x11-dpms-control": "Linux Desktop Workflow",
  "libreoffice-reference": "Linux Desktop Workflow",

  "data-collections": "Data Structures and Representation",
  "bag-of-words": "Information Retrieval",
  "programming-paradigms": "Programming Concepts",
  "sql-database-and-table": "Database Concepts",
  "relational-integrity": "Database Concepts",
  "acid-transactions": "Database Concepts",

  "fastapi-setup": "FastAPI Project Examples",
  "fastapi-sqlalchemy-crud": "FastAPI Project Examples",
  "fastapi-postgres-auth-repository-async": "FastAPI Project Examples",
  "fastapi-authentication-authorization": "FastAPI Project Examples",
  "fastapi-testing-pytest": "FastAPI Project Examples",
  "fastapi-alembic-migrations": "FastAPI Project Examples",
  "fastapi-settings-environment": "FastAPI Project Examples",
  "fastapi-error-handling-responses": "FastAPI Project Examples",
  "fastapi-file-upload-cors-frontend": "FastAPI Project Examples"
}

export const WORKFLOW_CATEGORY = DOCS_CATEGORY

export const CATEGORY_ORDER = [
  "ML and Notebook Workflow",
  "AI Coding Agents",
  "Editors and IDEs",
  "Languages and Runtimes",
  "Git",
  "Containers and Docker",
  "FastAPI Project Examples",
  "Server and Deployment",
  "Cloud and Data Platforms",
  "Shell and Terminal",
  "System Operations",
  "Linux Desktop Workflow",
  "Data Structures and Representation",
  "Information Retrieval",
  "Programming Concepts",
  "Database Concepts",
]

export function getDocsSection(slug: string) {
  return DOCS_SECTIONS.find((section) => section.slug === slug)
}

export function getDocsEntry(id: string) {
  return utilities.find((item) => item.id === id)
}

export function getDocsEntriesBySection(slug: DocsSectionSlug) {
  return utilities.filter((item) => DOCS_ENTRY_SECTION[item.id] === slug)
}

export function getDocsListingGroups(slug: DocsSectionSlug): DocsListingGroup[] {
  const section = getDocsSection(slug)

  if (!section) return []

  const map = new Map<string, DocsListingGroup>()

  for (const cat of section.categoryOrder) {
    map.set(cat, { category: cat, items: [] })
  }

  for (const item of getDocsEntriesBySection(slug)) {
    const cat = DOCS_CATEGORY[item.id] ?? "Other"

    if (!map.has(cat)) {
      map.set(cat, { category: cat, items: [] })
    }

    map.get(cat)!.items.push({
      id: item.id,
      name: item.name,
      desc: item.desc,
      href: `/docs/${item.id}`,
    })
  }

  return Array.from(map.values()).filter((group) => group.items.length > 0)
}
