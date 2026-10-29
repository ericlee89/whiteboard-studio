> 公开 VPS 和 Vercel + VPS 的配置见 [platform-deployment.md](platform-deployment.md)。本页保留本地 Docker Desktop 流程。

# Docker 部署与容器验收

此部署使用 Linux 容器，让 Windows 宿主机不再承担 Node、Python、ffmpeg 或 Chromium 的安装。应用和 PostgreSQL 为两个服务，渲染仍使用原引擎的真实工序。

## Windows 快速启动

1. 安装并启动 Docker Desktop，使用 **Linux containers**，确认 `docker compose version` 可以执行。
2. 解压新版完整源码，进入包含 Dockerfile、docker-compose.yml 的白板工作室目录。
3. 在 PowerShell 执行 `.\docker-start.cmd`，或直接双击 docker-start.cmd。
4. 首次启动会下载 Node 基础镜像、应用依赖、Chromium 和系统库，请等待构建完成。脚本会等待服务健康，默认访问 **http://localhost:4317**。

Linux / macOS 使用：

```sh
sh docker-start.sh
```

启动脚本只依赖 Docker。它先用临时 Node 容器初始化 `.env.docker`，再执行 Compose；宿主机无需安装 Node 或 Python。

## 初次配置

`.env.docker` 根据 `.env.docker.example` 自动建立，数据库密码、会话签名、密钥加密和服务间签名材料分别生成随机值。再次启动会保留已有值，避免密码或加密密钥意外变化。

默认 `LOCAL_SINGLE_USER=1`，复用原应用的本地单人工作区，页面直接进入 dev@local.test 测试身份。Compose 只向宿主机 **127.0.0.1** 发布应用端口，数据库不发布端口，并显式启用框架为受信本地工作台提供的生产文件桥接选项。用于账号模式时设置 `LOCAL_SINGLE_USER=0`，重新创建容器，并使用现有登录 / 注册配置。此默认配置定位为本机工作台，不是面向公网的多用户发布配置。

小米配音在 `.env.docker` 中配置：

```dotenv
MI_TTS_API_KEY=替换为与你的服务地址匹配的有效小米TTS密钥
MI_TTS_BASE_URL=https://api.xiaomimimo.com/v1
```

聊天 / 写稿模型继续在应用“设置 → 模型”中配置，它与 TTS 密钥分开。Edge TTS 无需 Key，但仍需要能访问语音服务的网络。

不要在 `.env.docker` 中填 Windows 的 WB_CHROMIUM、Python 或 D 盘路径。浏览器和 Python 已包含在镜像内。值含 `$`、`#` 等字符时用单引号包围；密钥只保留在自己的配置文件中。

修改 `.env.docker` 后执行以下命令，重新创建容器并注入新值：

```sh
docker compose --env-file .env.docker up -d --force-recreate --wait --wait-timeout 240
```

如果修改过 POSTGRES_PASSWORD，已有数据库卷里的数据库密码不会自动跟着改变；日常更新应保留初始化时生成的密码及加密材料。

## 常用命令

在项目根目录执行：

```sh
# 查看服务状态，正常应为 healthy
docker compose --env-file .env.docker ps

# 查看启动、数据库迁移和出片日志
docker compose --env-file .env.docker logs -f --tail=100 app

# 查看数据库日志
docker compose --env-file .env.docker logs --tail=100 db

# 停止并移除容器；命名卷保留
docker compose --env-file .env.docker down

# 修改源码后重建并运行
docker compose --env-file .env.docker up --build -d --wait --wait-timeout 240
```

Compose 每次均使用 `--env-file .env.docker`。初始化后用 `docker compose --env-file .env.docker config --quiet` 验证配置；不带 `--quiet` 的 config 可能输出插值后的凭证。

## 完整出片验收

可以先在页面新建 1 至 2 幕短片，选择 Edge TTS，保存后预览，再一键出片。检查有声 MP4、SRT 字幕和三种封面。

默认本地单人模式下，也可运行随包附带的验收程序：

```sh
docker compose --env-file .env.docker exec app node scripts/docker/smoke-render.cjs
```

它创建独立测试项目，实际执行预览、在线 Edge 配音和完整出片，下载 MP4、字幕、三种封面，用 ffprobe 检查视频尺寸和音轨，并用 ffmpeg 完整解码。结果保存在 `/app/data/docker-smoke/<项目ID>/acceptance.json` 和同目录产物中；测试不会发布内容，也不会调用付费 TTS 或文本模型。

多用户账号模式通过登录后的页面执行同样步骤；CLI 不替用户绕过认证。该验收必须在真正运行容器后执行，不能仅凭配置检查就认定出片成功。

## 数据与更新

|命名卷|用途|
|---|---|
|studio-data|项目、任务快照、视频、字幕、封面及验收产物|
|studio-state|框架本地运行状态|
|postgres-data|聊天、账户、模型配置与其他结构化数据|

重建镜像和普通 `down` 保留这些命名卷。`.env.docker` 也应保留并备份，否则已有模型密钥可能无法解密。应用以非 root 的 node 用户运行，运行目录采用 Docker 命名卷；不会把 Windows 的 node_modules 或项目磁盘目录挂到 `/app`。

容器异常重启后，未完成的旧任务会标为“服务已重新启动，请重新出片”，释放对应锁。完成的作品仍保留。当前应用只支持一个 app 实例共享这些本地文件，勿扩容多个 app 实例。

旧 Windows 工程中的 data 不会自动出现在新命名卷中。请先保留旧工程备份；文件项目可在另行迁移后继续使用，旧的开发内嵌数据库不会直接转换成 PostgreSQL。旧账号、聊天和模型配置的迁移需单独处理。

建议备份 PostgreSQL 和应用数据：

```sh
docker compose --env-file .env.docker exec db pg_dump -U whiteboard -d whiteboard -Fc -f /tmp/whiteboard.dump
docker compose --env-file .env.docker cp db:/tmp/whiteboard.dump ./whiteboard.dump
docker compose --env-file .env.docker cp app:/app/data ./data-backup
```

这些导出可能包含项目或配置数据，应由你本地保管，同时保留 `.env.docker`。

## 打包镜像到其他机器

完成真实容器验收后，可在有 Docker 的机器打包两个镜像：

```sh
docker image save -o whiteboard-studio-images.tar whiteboard-studio:local postgres:16-bookworm
```

目标机器载入镜像，准备相同 Compose 文件及自己的 `.env.docker` 后运行：

```sh
docker image load -i whiteboard-studio-images.tar
docker compose --env-file .env.docker up -d --no-build --wait --wait-timeout 240
```

镜像包不包含命名卷或用户数据，数据迁移另行备份与恢复。x86-64 与 ARM 机器需要各自兼容架构的镜像。

## 本次验证范围

开发环境没有 Docker / Podman 或容器引擎接口，也没有容器启动所需的系统能力，因此未实际执行 Docker 镜像构建、Compose 拉起或 PostgreSQL 16 容器验收。已完成的检查及其结果见 `docker-verification.json`。

Dockerfile 已按多阶段构建准备；Compose 已进行官方规范的 schema 验证。生产构建、初始化配置和中断任务恢复分别验证。开发环境中的任何数据库协议替代测试均不等同于真实 PostgreSQL 容器测试。

参考文档：
- https://playwright.dev/docs/docker
- https://playwright.dev/docs/browsers
- https://docs.docker.com/reference/compose-file/services/
- https://docs.docker.com/compose/how-tos/environment-variables/set-environment-variables/
