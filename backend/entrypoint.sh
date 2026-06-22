#!/bin/sh
# Run the backend as the owner of the bind-mounted data dir, so everything we persist there
# (SQLite DB, chunk manifest, narration mp3s, job state) is owned by the *host user* — not
# root. This keeps `./data` writable by both the container and the user, with no manual
# chown and regardless of how Docker is run (rootful or rootless). On rootless Docker the
# container is already mapped to the host user (the dir reads as uid 0 here), so we just run
# as-is; on rootful Docker we adopt the host dir's uid/gid and drop privileges to it.
set -e

DATA_DIR=/workspace/data
TARGET_UID=$(stat -c '%u' "$DATA_DIR" 2>/dev/null || echo 0)
TARGET_GID=$(stat -c '%g' "$DATA_DIR" 2>/dev/null || echo 0)

if [ "$(id -u)" = "0" ] && [ "$TARGET_UID" != "0" ]; then
  # We're root and the data dir belongs to a real host user: take ownership of anything left
  # over from an earlier run as a different user (self-heals the read-only-DB problem), then
  # exec the app as that user so new files are host-owned too.
  chown -R "$TARGET_UID:$TARGET_GID" "$DATA_DIR" 2>/dev/null || true
  # Give the dropped user a writable HOME so any library that caches under ~ doesn't hit
  # root-owned /root (the embedding model cache is pinned to the data dir via env instead).
  export HOME=/tmp
  exec setpriv --reuid "$TARGET_UID" --regid "$TARGET_GID" --clear-groups "$@"
fi

exec "$@"
