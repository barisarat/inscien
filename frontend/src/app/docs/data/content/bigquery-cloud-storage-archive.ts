import type { UtilityDef } from "../types"

const entry: UtilityDef = {
  id: "bigquery-cloud-storage-archive",
  kind: "codenote",
  name: "BigQuery to Cloud Storage Archive",
  desc: "Archive selected BigQuery tables to Cloud Storage as Parquet, then validate that the exports can be downloaded and read back.",
  intro:
    "Archive BigQuery tables to a Cloud Storage bucket as Parquet files. This is the flow used before deleting tables from BigQuery: export, confirm the objects exist, read them back locally, and only then remove the original tables. Assumes gcloud, the project venv, and ADC auth are already set up. See the gcloud and BigQuery setup page if not.",
  resources: [
    { label: "Google Cloud SDK and BigQuery Setup", href: "/docs/gcloud-bigquery-project-setup" },
  ],
  sections: [
    {
      title: "Placeholders used below",
      blocks: [
        {
          kind: "text",
          text: [
            "Replace these before running any cell. The archive path shown here is the convention used throughout the rest of the page.",
          ],
          bullets: [
            "YOUR_PROJECT_ID:  GCP project ID",
            "YOUR_DATASET_ID:  BigQuery dataset to archive",
            "YOUR_ARCHIVE_BUCKET:  Cloud Storage bucket for archives",
            "TABLE_NAME_1, TABLE_NAME_2:  tables to export",
            "YYYY-MM-DD:  snapshot date for the archive path",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `# variables to construct cloud storage paths:
gs://YOUR_ARCHIVE_BUCKET/bigquery/YOUR_DATASET_ID/TABLE_NAME/snapshot_date=YYYY-MM-DD/data.parquet`,
        },
      ],
    },
    {
      title: "Install Cloud Storage client",
      blocks: [
        {
          kind: "text",
          text: [
            "The BigQuery client alone is enough to submit an export job to Cloud Storage, but the Storage client is needed to create the bucket and to download the files back for validation.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `pip install google-cloud-storage`,
        },
      ],
    },
    {
      title: "Verify Python auth and project",
      blocks: [
        {
          kind: "text",
          text: [
            "Confirm the notebook kernel sees the right project and ADC credentials before running any export.",
          ],
        },
        {
          kind: "code",
          language: "python",
          code: `import os, sys
from google.auth import default

print(sys.executable)
print("GOOGLE_CLOUD_PROJECT:", os.getenv("GOOGLE_CLOUD_PROJECT"))
print("CLOUDSDK_CONFIG:", os.getenv("CLOUDSDK_CONFIG"))

creds, project = default()
print("ADC project:", project)
print("Credentials type:", type(creds).__name__)`,
        },
      ],
    },
    {
      title: "Create or reuse the archive bucket",
      blocks: [
        {
          kind: "text",
          text: [
            "Bucket names are globally unique across all of GCP. The bucket location should match the BigQuery dataset location so export, load, and external-table operations stay in the same region. Common values: EU, US, europe-west1.",
          ],
        },
        {
          kind: "code",
          language: "python",
          code: `from google.cloud import storage

project_id = "YOUR_PROJECT_ID"
bucket_name = "YOUR_ARCHIVE_BUCKET"
bucket_location = "EU"

storage_client = storage.Client(project=project_id)
bucket = storage_client.bucket(bucket_name)

print("Exists before create:", bucket.exists())

if not bucket.exists():
    bucket = storage_client.create_bucket(bucket_name, location=bucket_location)
    print("Created bucket:", bucket.name)
else:
    print("Bucket already exists:", bucket.name)`,
        },
      ],
    },
    {
      title: "Check the dataset location",
      blocks: [
        {
          kind: "text",
          text: [
            "Export jobs require the source dataset and the destination bucket to be in compatible locations. Read the dataset location so the bucket region can be matched to it.",
          ],
        },
        {
          kind: "code",
          language: "python",
          code: `from google.cloud import bigquery

project_id = "YOUR_PROJECT_ID"
dataset_id = "YOUR_DATASET_ID"

bq_client = bigquery.Client(project=project_id)
dataset = bq_client.get_dataset(f"{project_id}.{dataset_id}")

print("Dataset location:", dataset.location)`,
        },
      ],
    },
    {
      title: "Export tables to Cloud Storage",
      blocks: [
        {
          kind: "text",
          text: [
            "Iterate over the tables and submit one extract job each. Each job writes a single Parquet file to the snapshot-dated path. For large tables, replace data.parquet with a wildcard pattern like data*.parquet to let BigQuery shard the output.",
          ],
        },
        {
          kind: "code",
          language: "python",
          code: `project_id = "YOUR_PROJECT_ID"
dataset_id = "YOUR_DATASET_ID"
bucket_name = "YOUR_ARCHIVE_BUCKET"
snapshot_date = "YYYY-MM-DD"

tables = [
    "TABLE_NAME_1",
    "TABLE_NAME_2",
]

bq_client = bigquery.Client(project=project_id)

for table_id in tables:
    source_table = f"{project_id}.{dataset_id}.{table_id}"
    destination_uri = (
        f"gs://{bucket_name}/bigquery/{dataset_id}/{table_id}"
        f"/snapshot_date={snapshot_date}/data.parquet"
    )

    extract_job = bq_client.extract_table(
        source_table,
        destination_uri,
        job_config=bigquery.job.ExtractJobConfig(destination_format="PARQUET"),
    )
    extract_job.result()

    print("Export completed")
    print(source_table)
    print(destination_uri)
    print()`,
        },
      ],
    },
    {
      title: "Validate archived Parquet files",
      blocks: [
        {
          kind: "text",
          text: [
            "Download each archived Parquet back to /tmp, read it with pandas, and print its shape and first rows. This is a debug/validation step only.",
          ],
        },
        {
          kind: "code",
          language: "python",
          code: `from google.cloud import storage
from pathlib import Path
import pandas as pd

project_id = "YOUR_PROJECT_ID"
dataset_id = "YOUR_DATASET_ID"
bucket_name = "YOUR_ARCHIVE_BUCKET"
snapshot_date = "YYYY-MM-DD"
download_root = Path(f"/tmp/{dataset_id}_archive_validation")

tables = [
    "TABLE_NAME_1",
    "TABLE_NAME_2",
]

storage_client = storage.Client(project=project_id)
bucket = storage_client.bucket(bucket_name)
download_root.mkdir(parents=True, exist_ok=True)

for table_id in tables:
    object_name = (
        f"bigquery/{dataset_id}/{table_id}"
        f"/snapshot_date={snapshot_date}/data.parquet"
    )
    local_path = download_root / f"{table_id}.parquet"

    blob = bucket.blob(object_name)
    blob.download_to_filename(str(local_path))

    df = pd.read_parquet(local_path)

    print("=" * 80)
    print(f"TABLE: {table_id}")
    print(f"OBJECT: gs://{bucket_name}/{object_name}")
    print(f"LOCAL FILE: {local_path}")
    print(f"SHAPE: {df.shape}")
    print(df.head(3))`,
        },
      ],
    },
    {
      title: "Deletion checklist",
      blocks: [
        {
          kind: "text",
          text: [
            "Only delete the original BigQuery tables after every item below is confirmed. Deletion itself can be done from the BigQuery UI.",
          ],
          bullets: [
            "Every export job completed without error.",
            "The expected objects exist in Cloud Storage at the snapshot_date path.",
            "Each Parquet file downloaded and read back with pandas.",
            "Shape and sample rows look correct.",
            "No dashboard, scheduled query, app, or notebook still depends on the original BigQuery tables.",
          ],
        },
      ],
    },
  ],
}

export default entry