import type { UtilityDef } from "../types"

const entry: UtilityDef = {
  id: "gcloud-bigquery-project-setup",
  kind: "codenote",
  name: "Google Cloud SDK and Local BigQuery Setup",
  desc: "Install Google Cloud CLI globally on the host while keeping each client's gcloud config, Python venv, and BigQuery auth isolated per project.",
  intro:
    "This setup assumes the host may hold several Google Cloud accounts and projects over its lifecycle. The Google Cloud CLI is installed once globally, but each project keeps its own gcloud config directory, Python venv, and notebook kernel. CLOUDSDK_CONFIG is what keeps client accounts from mixing.",
  resources: [
  { label: "BigQuery to Cloud Storage archive", href: "/docs/bigquery-cloud-storage-archive" },
  ],
    sections: [
    {
      title: "Install gcloud globally (Arch)",
      blocks: [
        {
          kind: "text",
          text: [
            "Install the Google Cloud CLI system-wide, not inside a Python venv. On Arch, the AUR package is the simplest route.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `yay -S google-cloud-cli`,
        },
        {
          kind: "text",
          text: ["Verify the install. Expected path is /usr/bin/gcloud."],
        },
        {
          kind: "code",
          language: "bash",
          code: `gcloud version
which gcloud`,
        },
      ],
    },
    {
      title: "Create an isolated gcloud config directory",
      blocks: [
        {
          kind: "text",
          text: [
            "Each client or project gets its own gcloud config directory. Pointing CLOUDSDK_CONFIG at this directory keeps accounts, projects, and ADC credentials separated from other work on the same host.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `mkdir -p ~/gcloud-configs/client1`,
        },
      ],
    },
    {
      title: "Create the project venv and notebook kernel",
      blocks: [
        {
          kind: "text",
          text: ["Python dependencies stay inside the project venv, separate from the global gcloud install."],
        },
        {
          kind: "code",
          language: "bash",
          code: `cd ~/projects/client1_data_analysis
python -m venv .venv
source .venv/bin/activate
pip install --upgrade pip`,
        },
        {
          kind: "text",
          text: ["Install notebook and BigQuery packages. google-cloud-bigquery-storage is optional but speeds up to_dataframe() downloads."],
        },
        {
          kind: "code",
          language: "bash",
          code: `pip install ipykernel pandas db-dtypes pyarrow jupyter google-cloud-bigquery google-cloud-bigquery-storage`,
        },
        {
          kind: "text",
          text: ["Register the venv as a notebook kernel so VS Code and Jupyter can pick it up by name."],
        },
        {
          kind: "code",
          language: "bash",
          code: `python -m ipykernel install --user --name client1-bq`,
        },
      ],
    },
    {
      title: "Create a sourced project shell file",
      blocks: [
        {
          kind: "text",
          text: [
            "A small shell file activates the venv and exports the isolated gcloud config and project ID in one step. It is meant to be sourced, not executed.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `nano ~/projects/client1_data_analysis/client1.sh`,
        },
        {
          kind: "text",
          text: ["Paste the following and save."],
        },
        {
          kind: "code",
          language: "bash",
          code: `cd ~/projects/client1_data_analysis
source .venv/bin/activate
export CLOUDSDK_CONFIG=$HOME/gcloud-configs/client1
export GOOGLE_CLOUD_PROJECT=your-gcp-project-id`,
        },
        {
          kind: "text",
          text: ["Source it in any new shell or tmux pane for this project."],
        },
        {
          kind: "code",
          language: "bash",
          code: `source client1.sh  # cd first`, 
        },
        {
          kind: "text",
          text: ["Verify the current shell context points at the right venv, config, and project."],
        },
        {
          kind: "code",
          language: "bash",
          code: `echo $VIRTUAL_ENV
echo $CLOUDSDK_CONFIG
echo $GOOGLE_CLOUD_PROJECT
which python`,
        },
      ],
    },
    {
      title: "Authenticate gcloud (two logins)",
      blocks: [
        {
          kind: "text",
          text: [
            "Two separate logins are required. gcloud auth login authenticates the CLI. gcloud auth application-default login creates Application Default Credentials used by Python client libraries like google-cloud-bigquery.",
            "Always source the project shell file first so both logins land inside the isolated config directory.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `# Check the Extras section for more info about double login

source ~/projects/client1_data_analysis/client1.sh

# CLI auth
gcloud auth login
gcloud config set project your-gcp-project-id

# Application Default Credentials for Python libraries
gcloud auth application-default login`,
        },
        {
          kind: "text",
          text: ["Verify auth, active config, and that the isolated config directory is populated."],
        },
        {
          kind: "code",
          language: "bash",
          code: `gcloud auth list
gcloud config list
gcloud auth application-default print-access-token
ls -la ~/gcloud-configs/client1`,
        },
      ],
    },
    
    {
      title: "Open your code editor from the sourced shell",
      blocks: [
        {
          kind: "text",
          text: [
            "Launch your code editor (VS Code used here) from a shell that has already sourced the project file so the environment is inherited cleanly. Then select the project kernel or .venv interpreter from the notebook kernel picker.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `source ~/projects/client1_data_analysis/client1.sh
code .`,
        },
      ],
    },
    {
      title: "Validate BigQuery access from a notebook",
      blocks: [
        {
          kind: "text",
          text: [
            "Creating a client does not guarantee the auth chain works. Always validate with a real table query.",
          ],
        },
        {
          kind: "code",
          language: "python",
          code: `import os, sys
from google.auth import default
from google.cloud import bigquery

print(sys.executable)
print(os.getenv("GOOGLE_CLOUD_PROJECT"))

creds, project = default()
print("ADC project:", project)

client = bigquery.Client(project="your-gcp-project-id")
print("BigQuery client created")`,
        },
        {
          kind: "text",
          text: ["Run a small query against a known table to confirm end-to-end access."],
        },
        {
          kind: "code",
          language: "python",
          code: `query = """
SELECT *
FROM \`your-gcp-project-id.your_dataset.your_table\`
ORDER BY data_date DESC
LIMIT 10
"""
df = client.query(query).to_dataframe()
display(df)`,
        },
      ],
    },
    {
      title: "Fix the BigQuery Storage warning",
      blocks: [
        {
          kind: "text",
          text: [
            "If you see 'UserWarning: BigQuery Storage module not found, fetch data with the REST endpoint instead', install the storage client and restart the notebook kernel.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `pip install google-cloud-bigquery-storage`,
        },
      ],
    },
    {
      title: "Daily workflow",
      blocks: [
        {
          kind: "code",
          language: "bash",
          code: `cd ~/projects/client1_data_analysis
source ~/projects/client1_data_analysis/client1.sh
code .`,
        },
      ],
    },
    {
      title: "Operational notes",
      blocks: [
        {
          kind: "text",
          bullets: [
            "gcloud is installed globally on the host and Python packages stay inside the project .venv.",
            "CLOUDSDK_CONFIG is what isolates this client's account and config from others on the same machine.",
            "gcloud auth login handles the CLI and later gcloud auth application-default login is what makes Python client libraries authenticate in notebooks.",
            "A successful bigquery.Client() constructor does not prove auth works. Always confirm with a real table query.",
          ],
        },
      ],
    },
    {
      title: "Extras: Understand the two auth tracks",
      blocks: [
        {
          kind: "text",
          text: [
            "In this case, two separate auth tracks run in parallel on the same machine. gcloud CLI auth is used by gcloud commands. ADC (Application Default Credentials) is used by Python client libraries like bigquery.Client() and storage.Client(). The two logins populate two different stores, and either can be logged in without the other.",
          ],
          bullets: [
            "Browser UI for BigQuery uses the browser's Google account.",
            "gcloud auth login sets the CLI account.",
            "gcloud auth application-default login sets the ADC account for Python libraries.",
            "When the same account is used in all three places, UI, CLI, and Python all act as the same IAM principal.",
          ],
        },
        {
          kind: "text",
          text: ["Verify the CLI side."],
        },
        {
          kind: "code",
          language: "bash",
          code: `gcloud auth list
gcloud config get-value project`,
        },
        {
          kind: "text",
          text: [
            "Verify ADC exists. This prints an access token but does not show the email behind it.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `gcloud auth application-default print-access-token`,
        },
        {
          kind: "text",
          text: [
            "Check whether Python is being forced to a specific credential file. If this is empty, Python falls back to the ADC file created by application-default login, which is what we want for local development.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `echo $GOOGLE_APPLICATION_CREDENTIALS`,
        },
        {
          kind: "text",
          text: [
            "Resolve ADC in Python directly. This shows the credential class, the detected project, and whether the identity is a user account (service_account_email is None) or a service account.",
          ],
        },
        {
          kind: "code",
          language: "python",
          code: `import google.auth

creds, project = google.auth.default()
print("ADC credential class:", type(creds).__name__)
print("ADC project:", project)
print("service_account_email:", getattr(creds, "service_account_email", None))
print("quota_project_id:", getattr(creds, "quota_project_id", None))`,
        },
        {
          kind: "text",
          text: ["Expected output for a local user-credential setup:"],
        },
        {
          kind: "code",
          language: "bash",
          code: `ADC credential class: Credentials
ADC project: your-gcp-project-id
service_account_email: None
quota_project_id: your-gcp-project-id`,
        },
        {
          kind: "text",
          bullets: [
            "service_account_email: None confirms ADC is using user credentials, not a service account. Thus, IAM permissions follow the user permissions as well.",
          ],
        },
      ],
    },

  ],
}

export default entry