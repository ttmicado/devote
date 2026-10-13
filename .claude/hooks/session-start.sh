#!/bin/bash
# Claude Code on the web（クラウドセッション）で依存関係とDBを準備する
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"

pnpm install --frozen-lockfile

# ローカル Postgres + pgvector（クラウド環境用。ローカル開発は docker compose を使う）
if command -v pg_ctlcluster >/dev/null 2>&1; then
  if [ ! -f /usr/share/postgresql/16/extension/vector.control ]; then
    (apt-get install -y postgresql-16-pgvector >/dev/null 2>&1 \
      || (apt-get update >/dev/null 2>&1 && apt-get install -y postgresql-16-pgvector >/dev/null 2>&1)) || true
  fi
  pg_ctlcluster 16 main start 2>/dev/null || true
  su postgres -c "psql -tc \"SELECT 1 FROM pg_roles WHERE rolname='devote'\" | grep -q 1 \
    || psql -c \"CREATE USER devote WITH PASSWORD 'devote' SUPERUSER;\"" >/dev/null 2>&1 || true
  su postgres -c "psql -tc \"SELECT 1 FROM pg_database WHERE datname='devote'\" | grep -q 1 \
    || psql -c 'CREATE DATABASE devote OWNER devote;'" >/dev/null 2>&1 || true
  echo "export DATABASE_URL=postgres://devote:devote@localhost:5432/devote" >> "${CLAUDE_ENV_FILE:-/dev/null}"
  DATABASE_URL=postgres://devote:devote@localhost:5432/devote pnpm db:migrate >/dev/null 2>&1 || true
fi
