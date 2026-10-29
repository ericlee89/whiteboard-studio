@echo off
setlocal
cd /d "%~dp0"
docker compose version >nul 2>&1
if errorlevel 1 goto unavailable
docker info --format "{{.OSType}}" | findstr /x "linux" >nul
if errorlevel 1 goto unavailable
docker run --rm -v "%CD%:/config" -w /config node:22-bookworm-slim node scripts/docker/init-env.cjs
if errorlevel 1 exit /b 1
docker compose --env-file .env.docker config --quiet
if errorlevel 1 exit /b 1
docker compose --env-file .env.docker up --build -d --wait --wait-timeout 240
if errorlevel 1 exit /b 1
echo Containers are healthy. Open http://localhost:4317 unless APP_PORT was changed.
echo See docs\docker-deployment.md for status and logs.
docker compose --env-file .env.docker ps
exit /b 0
:unavailable
echo Start Docker Desktop with Linux containers and Docker Compose v2, then retry.
exit /b 1
