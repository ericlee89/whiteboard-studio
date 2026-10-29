#!/bin/sh
set -eu
cd "$(dirname "$0")"
docker compose version >/dev/null
if [ "$(docker info --format '{{.OSType}}')" != linux ]; then
  echo 'Start a Docker engine using Linux containers, then retry.' >&2
  exit 1
fi
docker run --rm --user "$(id -u):$(id -g)" -v "$PWD:/config" -w /config \
  node:22-bookworm-slim node scripts/docker/init-env.cjs
docker compose --env-file .env.docker config --quiet
docker compose --env-file .env.docker up --build -d --wait --wait-timeout 240
docker compose --env-file .env.docker ps
