import type { UtilityDef } from "../types"

const entry: UtilityDef = {
  id: "qdrant-rag-vector-index-workflow",
  kind: "codenote",
  name: "Qdrant RAG Vector Index Workflow",
  desc: "Docker-based workflow for using Qdrant as a vector database in a RAG system, including manifest export, database source export, embedding execution, production deployment, and safe reindex checks.",
  intro:
    "This page documents a reusable Qdrant RAG workflow using committed frontend manifests, backend-generated database manifests, local embeddings, Qdrant vector storage, and an answer endpoint. The commands and paths are written as a directly usable reference for this codebase while keeping the workflow generic enough for similar Docker-based RAG systems.",
  resources: [
    { label: "Qdrant Documentation", href: "https://qdrant.tech/documentation/" },
    { label: "FastEmbed Documentation", href: "https://qdrant.github.io/fastembed/" },
    { label: "Docker Compose Production Deploy", href: "/docs/docker-compose-production-deploy" },
  ],
  sections: [
    {
      title: "Overview",
      blocks: [
        {
          kind: "text",
          bullets: [
            "Use Qdrant as the vector store for normalized RAG chunks.",
            "Keep source extraction separate from vector indexing.",
            "Export frontend-owned content into committed JSON manifests.",
            "Export backend database content into generated JSON manifests.",
            "Embed chunk text with the same embedding model used for query-time retrieval.",
            "Store vectors and source payloads in Qdrant.",
            "Generate answers only from selected retrieved evidence.",
            "Save query events and selected source metadata in MySQL if analytics or debugging is needed.",
            "Run reindex only after verifying all expected manifests are available.",
          ],
        },
      ],
    },
    {
      title: "System flow",
      blocks: [
        {
          kind: "text",
          text: [
            "The RAG system has two main phases: indexing time and query time. Indexing time builds the Qdrant collection. Query time embeds the user query, retrieves matching chunks, selects evidence, and generates an answer.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `Indexing time:
source content
  -> frontend manifest export
  -> backend database source export
  -> manifest validation
  -> chunk embedding
  -> Qdrant collection recreate
  -> vector upsert with payload metadata

Query time:
user question
  -> query embedding
  -> Qdrant vector search
  -> lexical retrieval merge
  -> evidence selection
  -> answer generation
  -> query event logging`,
        },
      ],
    },
    {
  title: "Indexed source categories",
  blocks: [
    {
      kind: "text",
      text: [
        "The same indexing flow can support frontend-owned content and backend-owned content. Frontend content is usually exported from static files, registries, rendered pages, or metadata files. Backend content is usually exported from database tables or internal services.",
      ],
    },
    {
      kind: "table",
      headers: ["Source category", "Storage owner", "Content mode", "Manifest type"],
      rows: [
        ["Content 1", "Frontend source files", "full_text", "Frontend source manifest"],
        ["Content 2", "Frontend rendered files", "full_text_or_rendered_output", "Frontend source manifest"],
        ["Content 3", "Frontend metadata files", "metadata_only", "Frontend source manifest"],
        ["Content 4", "Backend database", "metadata_only", "Backend-generated manifest"],
        ["Content 5", "Backend service output", "metadata_plus_internal_brief", "Backend-generated manifest"],
      ],
    },
    {
      kind: "text",
      bullets: [
        "Frontend manifests are generated from files that already exist in the frontend application or static assets.",
        "Backend manifests are generated from database-backed or service-backed content.",
        "Full-text sources can support direct technical answers.",
        "Rendered-output sources can support answers based on visible rendered content, tables, and output text.",
        "Metadata-only sources should be used for discovery and navigation.",
        "Backend database sources must be exported from the active database environment before reindexing.",
      ],
    },
  ],
},
    {
      title: "Chunk format",
      blocks: [
        {
          kind: "text",
          text: [
            "Every source becomes one or more normalized chunks. The indexer does not need to know the original source implementation once the chunk format is produced.",
          ],
        },
        {
          kind: "code",
          language: "typescript",
          code: `type LabChunk = {
  sourceType: string
  sourceId: string
  chunkId: string
  parentId?: string
  title: string
  description?: string
  category?: string
  sectionTitle?: string
  url: string
  externalUrl?: string
  contentMode: "full_text" | "full_text_or_rendered_output" | "metadata_only" | "metadata_plus_internal_brief"
  text: string
  metadata: Record<string, string | number | boolean | string[]>
}`,
        },
        {
          kind: "text",
          bullets: [
            "chunkId must be unique across all manifests.",
            "url should point to the internal page used for citations.",
            "text is the field embedded into the vector store.",
            "metadata should stay JSON-safe.",
            "contentMode controls answer grounding behavior.",
          ],
        },
      ],
    },
    {
      title: "Local Docker services",
      blocks: [
        {
          kind: "text",
          text: [
            "Run Qdrant as an internal Docker Compose service. The backend talks to Qdrant through the Compose service name.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `qdrant:
  image: qdrant/qdrant
  container_name: ubuntu-web-qdrant
  restart: unless-stopped
  ports:
    - "127.0.0.1:6333:6333"
  volumes:
    - qdrant_data:/qdrant/storage

volumes:
  qdrant_data:`,
        },
        {
          kind: "text",
          bullets: [
            "Bind Qdrant to 127.0.0.1 for local inspection.",
            "Use the Docker service name inside backend containers.",
            "Persist Qdrant data with qdrant_data.",
            "Do not expose Qdrant publicly in production unless a separate security layer is added.",
          ],
        },
      ],
    },
    {
      title: "Backend mounts and environment",
      blocks: [
        {
          kind: "text",
          text: [
            "The backend container needs read access to committed frontend manifests and write access to generated backend manifests.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `backend:
  volumes:
    - ./backend:/workspace
    - ./frontend/public/lab-index:/frontend-lab-index:ro

  environment:
    - QDRANT_URL=http://qdrant:6333
    - QDRANT_COLLECTION=mlnotebooks_lab_chunks
    - LAB_FRONTEND_INDEX_DIR=/frontend-lab-index
    - LAB_BACKEND_INDEX_DIR=/workspace/generated/lab-index
    - LAB_TOP_K=10`,
        },
        {
          kind: "text",
          bullets: [
            "LAB_FRONTEND_INDEX_DIR points to committed frontend manifest files.",
            "LAB_BACKEND_INDEX_DIR points to backend-generated manifest files.",
            "QDRANT_URL should use http://qdrant:6333 inside Docker.",
            "If reindex runs from a worker container, mount the same paths there as well.",
          ],
        },
      ],
    },
    {
      title: "Embedding and answer models",
      blocks: [
        {
          kind: "text",
          text: [
            "Qdrant stores vectors but does not create embeddings in this setup. The backend creates embeddings and writes the vectors to Qdrant.",
          ],
        },
        {
          kind: "code",
          language: "python",
          code: `LAB_EMBEDDING_MODEL = "BAAI/bge-small-en-v1.5"
LAB_VECTOR_SIZE = 384
LAB_ANSWER_MODEL = "gpt-5.4-nano"`,
        },
        {
          kind: "text",
          bullets: [
            "Use the same embedding model during indexing and query-time retrieval.",
            "The Qdrant vector size must match the embedding model output size.",
            "Changing the embedding model requires a full reindex.",
            "Changing only the answer model does not require reindexing.",
          ],
        },
      ],
    },
    {
  title: "Frontend manifest export",
  blocks: [
    {
      kind: "text",
      text: [
        "Run the frontend export when frontend-owned sources change. The generated manifest files are committed for a simple deployment flow.",
      ],
    },
    {
      kind: "code",
      language: "bash",
      code: `docker compose exec frontend npm run lab:export`,
    },
    {
      kind: "text",
      text: [
        "The export writes normalized JSON manifests into the frontend Lab index directory.",
      ],
    },
    {
      kind: "code",
      language: "bash",
      code: `frontend/public/lab-index/`,
    },
    {
      kind: "text",
      text: [
        "Commit the generated manifests with the content change.",
      ],
    },
    {
      kind: "code",
      language: "bash",
      code: `git add frontend/public/lab-index/*.json
git commit -m "Update lab index manifests"`,
    },
  ],
},
    {
  title: "Backend database source export",
  blocks: [
    {
      kind: "text",
      text: [
        "Backend database sources are exported from the active database environment. This avoids committing environment-specific database content.",
      ],
    },
    {
      kind: "code",
      language: "bash",
      code: `docker compose exec backend python scripts/lab_export_courses.py`,
    },
    {
      kind: "text",
      text: [
        "The generated backend manifest is written into the backend Lab index directory.",
      ],
    },
    {
      kind: "code",
      language: "bash",
      code: `backend/generated/lab-index/`,
    },
    {
      kind: "text",
      bullets: [
        "Run this locally for local database content.",
        "Run this in production for production database content.",
        "Run it before reindexing when backend database sources change.",
      ],
    },
  ],
},
    {
  title: "Manifest validation",
  blocks: [
    {
      kind: "text",
      text: [
        "Always validate manifests before running reindex. The reindex script recreates the Qdrant collection, so a missing manifest can create a partial index.",
      ],
    },
    {
      kind: "code",
      language: "bash",
      code: `docker compose exec backend python scripts/lab_check_manifests.py`,
    },
    {
      kind: "text",
      text: [
        "Expected output should show all expected source groups with non-zero counts.",
      ],
    },
    {
      kind: "code",
      language: "bash",
      code: `frontend source manifests: > 0
backend database manifests: > 0
total: expected total chunk count`,
    },
    {
      kind: "text",
      bullets: [
        "If frontend manifests are zero, check /frontend-lab-index inside the backend container.",
        "If backend database manifests are zero, run the backend export script.",
        "Do not run reindex until expected manifest counts are correct.",
      ],
    },
  ],
},
    {
      title: "Reindex execution",
      blocks: [
        {
          kind: "text",
          text: [
            "The reindex script loads all manifests, embeds chunk text, recreates the Qdrant collection, and upserts vector points with payload metadata.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `docker compose exec backend python scripts/lab_reindex.py`,
        },
        {
          kind: "text",
          text: [
            "Expected final output should show the total chunk count and the Qdrant point count.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `"total_chunks": 1274
"points_count": 1274`,
        },
        {
          kind: "text",
          bullets: [
            "Reindex is required after source manifests change.",
            "Reindex is required after backend database source export changes.",
            "Reindex is required after changing embedding model or vector size.",
            "Reindex is not required for UI-only changes.",
            "Reindex is not required for answer prompt-only changes.",
          ],
        },
      ],
    },
    {
      title: "Qdrant checks",
      blocks: [
        {
          kind: "text",
          text: [
            "Use the Qdrant check script to confirm backend connectivity and the collection list.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `docker compose exec backend python scripts/lab_check_qdrant.py`,
        },
        {
          kind: "text",
          text: [
            "Use the collection count helper to confirm the indexed point count.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `docker compose exec backend python - <<'PY'
from services.lab.qdrant_store import get_lab_collection_count
print(get_lab_collection_count())
PY`,
        },
      ],
    },
    {
      title: "Qdrant point payload",
      blocks: [
        {
          kind: "text",
          text: [
            "Each Qdrant point stores the embedding vector and the payload needed for retrieval, evidence selection, answer generation, and citation rendering.",
          ],
        },
        {
          kind: "code",
          language: "python",
          code: `payload = {
    "sourceType": chunk["sourceType"],
    "sourceId": chunk["sourceId"],
    "chunkId": chunk["chunkId"],
    "parentId": chunk.get("parentId", ""),
    "title": chunk["title"],
    "description": chunk.get("description", ""),
    "category": chunk.get("category", ""),
    "sectionTitle": chunk.get("sectionTitle", ""),
    "url": chunk["url"],
    "externalUrl": chunk.get("externalUrl", ""),
    "contentMode": chunk["contentMode"],
    "text": chunk["text"],
    "metadata": chunk.get("metadata", {}),
}`,
        },
        {
          kind: "text",
          text: [
            "Keeping text in the payload lets the answer endpoint use selected evidence without reading the original source files at query time.",
          ],
        },
      ],
    },
    {
      title: "Retrieval and evidence selection",
      blocks: [
        {
          kind: "text",
          text: [
            "Retrieval should combine vector search with a generic lexical layer. This improves exact technical term matching without hardcoding case-specific query expansions.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `query
  -> FastEmbed vector
  -> Qdrant vector candidates
  -> BM25-style lexical candidates
  -> score merge
  -> page diversification
  -> evidence selection
  -> answer prompt`,
        },
        {
          kind: "text",
          bullets: [
            "Vector search handles semantic similarity.",
            "Lexical search handles commands, package names, dataset names, and exact terms.",
            "Page diversification prevents one source from dominating all candidates.",
            "Evidence selection sends only the strongest chunks to the answer model.",
          ],
        },
      ],
    },
    {
      title: "Answer endpoint",
      blocks: [
        {
          kind: "text",
          text: [
            "The answer endpoint receives the user question, performs retrieval, selects evidence, calls the answer model, returns answer and citations, and optionally logs the event.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `POST /api/lab/answer

{
  "query": "How do I convert notebooks to HTML?",
  "limit": 10
}`,
        },
        {
          kind: "text",
          bullets: [
            "The response should include answer, citations, retrieved count, and insufficient-context flag.",
            "Inline citations should point to internal source URLs.",
            "Metadata-only sources should be used for discovery and navigation, not full-detail claims.",
          ],
        },
      ],
    },
    {
      title: "Query event logging",
      blocks: [
        {
          kind: "text",
          text: [
            "Query event logging stores each answer request in MySQL. This is analytics and debugging history, not a persistent chat session.",
          ],
        },
        {
          kind: "table",
          headers: ["Field group", "Stored data"],
          rows: [
            ["User fields", "user_id, user_email, user_tier"],
            ["Anonymous fields", "anonymous_id"],
            ["Query and answer", "query_text, answer_text"],
            ["Source metadata", "citations_json, selected_sources_json"],
            ["Quality metadata", "retrieved_count, insufficient_context"],
            ["Model metadata", "answer_model, embedding_model"],
            ["Request metadata", "route, client_ip, client_user_agent"],
          ],
        },
        {
          kind: "text",
          bullets: [
            "Logged-in requests should store user id and email.",
            "Logged-out requests should store a browser-level anonymous id.",
            "Selected sources are saved for later inspection of answer grounding.",
          ],
        },
      ],
    },
    {
      title: "Local update sequence",
      blocks: [
        {
          kind: "text",
          text: [
            "Use this sequence when locally rebuilding the full RAG index after source content changes.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `docker compose exec frontend npm run lab:export

docker compose exec backend python scripts/lab_export_courses.py

docker compose exec backend python scripts/lab_check_manifests.py

docker compose exec backend python scripts/lab_reindex.py`,
        },
      ],
    },
    {
      title: "Production Docker requirements",
      blocks: [
        {
          kind: "text",
          text: [
            "Production needs Qdrant, a persistent Qdrant volume, backend access to committed manifests, backend access to generated manifests, and a cache volume for the local embedding model.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `qdrant:
  image: qdrant/qdrant
  container_name: mlnotebooks-qdrant
  restart: unless-stopped
  volumes:
    - qdrant_data:/qdrant/storage

backend:
  volumes:
    - ./frontend/public/lab-index:/frontend-lab-index:ro
    - ./backend/generated/lab-index:/workspace/generated/lab-index
    - hf_cache:/root/.cache/huggingface

volumes:
  qdrant_data:
  hf_cache:`,
        },
        {
          kind: "text",
          bullets: [
            "qdrant_data persists the vector collection.",
            "hf_cache avoids redownloading the embedding model after every rebuild.",
            "No public Qdrant port is required for the backend to use Qdrant.",
          ],
        },
      ],
    },
    {
      title: "Production update sequence",
      blocks: [
        {
          kind: "text",
          text: [
            "Use this sequence when committed manifests or production database sources changed.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `git pull

docker compose --env-file .env.prod -f compose.prod.yaml build
docker compose --env-file .env.prod -f compose.prod.yaml up -d

docker compose --env-file .env.prod -f compose.prod.yaml exec backend python scripts/lab_export_courses.py

docker compose --env-file .env.prod -f compose.prod.yaml exec backend python scripts/lab_check_manifests.py

docker compose --env-file .env.prod -f compose.prod.yaml exec backend python scripts/lab_reindex.py`,
        },
        {
          kind: "text",
          text: [
            "If only UI or prompt logic changed, skip the export and reindex steps.",
          ],
        },
      ],
    },
    {
      title: "When to run each command",
      blocks: [
        {
          kind: "table",
          headers: ["Change", "Local action", "Production action"],
          rows: [
            ["Frontend-owned source content changed", "Run lab:export and commit JSON", "Pull and run lab_reindex.py"],
            ["Backend database sources changed", "Run lab_export_courses.py and lab_reindex.py", "Run lab_export_courses.py and lab_reindex.py"],
            ["Only UI changed", "No reindex", "No reindex"],
            ["Only prompt changed", "No reindex", "No reindex"],
            ["Embedding model changed", "Full lab_reindex.py", "Full lab_reindex.py"],
            ["Qdrant volume recreated", "Full lab_reindex.py", "Full lab_reindex.py"],
            ["Query logging migration added", "Run migration once", "Run migration once"],
          ],
        },
      ],
    },
    {
      title: "Safe reindex checklist",
      blocks: [
        {
          kind: "text",
          bullets: [
            "Confirm Qdrant is running.",
            "Confirm frontend manifests exist in /frontend-lab-index.",
            "Export backend database sources from the active environment.",
            "Run lab_check_manifests.py.",
            "Verify all expected source counts are non-zero.",
            "Run lab_reindex.py.",
            "Confirm Qdrant points_count equals the total manifest count.",
            "Ask one question for each major source category.",
          ],
        },
      ],
    },
    {
  title: "Common failure: partial index",
  blocks: [
    {
      kind: "text",
      text: [
        "A partial index happens when reindex runs while one or more manifests are missing. Since reindex recreates the collection, the previous complete index is replaced by whatever sources were visible at that moment.",
      ],
    },
    {
      kind: "code",
      language: "bash",
      code: `docker compose exec backend bash -lc "ls -lh /frontend-lab-index"

docker compose exec backend bash -lc "ls -lh /workspace/generated/lab-index"

docker compose exec backend python scripts/lab_check_manifests.py`,
    },
    {
      kind: "text",
      text: [
        "If required manifests are missing or zero, fix the mount or export step before reindexing.",
      ],
    },
  ],
},
    {
      title: "Common failure: Qdrant name resolution",
      blocks: [
        {
          kind: "text",
          text: [
            "If reindex fails with Temporary failure in name resolution, the backend cannot resolve the Qdrant service name.",
          ],
        },
        {
          kind: "code",
          language: "bash",
          code: `docker compose ps

docker compose exec backend bash -lc 'echo $QDRANT_URL'

docker compose exec backend bash -lc 'python - <<PY
import socket
print(socket.gethostbyname("qdrant"))
PY'`,
        },
        {
          kind: "text",
          bullets: [
            "The Qdrant service name must match QDRANT_URL.",
            "Use http://qdrant:6333 from inside Docker Compose.",
            "Do not use localhost from inside the backend container unless Qdrant runs in the same container.",
          ],
        },
      ],
    },
    {
      title: "Common failure: wrong vector size",
      blocks: [
        {
          kind: "text",
          text: [
            "A vector size mismatch means the collection was created with a different vector dimension than the embedding model produces.",
          ],
        },
        {
          kind: "text",
          bullets: [
            "Check the embedding model output dimension.",
            "Check the Qdrant collection vector size.",
            "Recreate the collection with a full reindex after changing embedding model.",
            "Do not mix vectors from different embedding models in the same collection.",
          ],
        },
      ],
    },
  ],
}

export default entry