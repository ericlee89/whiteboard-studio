#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
if [ "$#" -ne 3 ]; then
  echo 'Usage: ./deploy-start.sh vps studio.example.com https://studio.example.com'
  echo '   or: ./deploy-start.sh vercel-backend render.example.com https://studio.example.com'
  exit 1
fi
docker compose version >/dev/null
if [ "$(docker info --format '{{.OSType}}')" != linux ]; then
  echo 'Docker must run Linux containers.' >&2
  exit 1
fi
docker run --rm --user "$(id -u):$(id -g)" -v "$PWD:/config" -w /config \
  node:22-bookworm-slim node scripts/deploy/init-vps.cjs "$1" "$2" "$3"
docker compose --env-file .env.docker -f docker-compose.yml -f docker-compose.vps.yml config --quiet
docker compose --env-file .env.docker -f docker-compose.yml -f docker-compose.vps.yml up --build -d --wait --wait-timeout 300
docker compose --env-file .env.docker -f docker-compose.yml -f docker-compose.vps.yml ps
echo 'Deployment started. In Vercel mode configure the three gateway environment variables before opening the public app.'
