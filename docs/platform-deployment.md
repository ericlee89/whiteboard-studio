# 同一套源码：VPS 独立运行，或 Vercel + VPS

本版本提供两种部署方式，保留原来的 Windows / 本地 Docker 工作方式。

| 方式 | 用户入口 | 业务、模型调用与视频渲染 | 持久数据 |
| --- | --- | --- | --- |
| VPS 独立部署 | VPS 的 HTTPS 域名 | 同一台 VPS 的应用容器 | VPS 上的 PostgreSQL、项目与成品卷 |
| Vercel + VPS | Vercel 域名或绑定的自定义域名 | Vercel 网关转发到 VPS 后端执行 | 同一套 VPS 数据卷 |

Vercel 模式仍需要可通过 HTTPS 访问的 VPS 后端。可以先发布网站入口，取得固定域名，再配置后端；配置完成前只能查看部署状态提示。Vercel 部署的是无状态、零第三方依赖的流式网关，页面 SSR、静态资源、登录、聊天和业务接口都由同一后端响应；视频任务在 VPS 持续执行。这里不声称视频在 Vercel Functions 内渲染，也不依赖函数实例保存项目。

网关使用同源路径保留 Cookie、JSON/表单请求、聊天流和媒体 Range；前端与 agent 仍共用现有 actions，无需分别实现两套接口。后台渲染任务启动后立即返回，用户继续轮询任务状态，因此出片时长不占用一个 Vercel 请求的整个生命周期。

## 一、准备 VPS

准备一台有 Docker Engine 和 Compose v2 的 Linux VPS，建议至少 2 核 / 4 GB，并为成品和渲染临时文件预留磁盘空间。这是起步配置建议，实际需求取决于视频长度和并发；本版本只支持一个应用实例独占其项目数据卷。

将完整源码上传到 VPS，进入与 `package.json` 同级的 `whiteboard-studio` 目录。域名的 A/AAAA 记录应正确指向该 VPS；开放 80/443，供随附的 Caddy 自动申请并续期 TLS 证书。数据库端口不会发布到公网，应用 4317 端口继续仅绑定服务器回环地址。

首次运行会生成 `.env.docker` 和五个独立随机密钥，已有数据库密码、加密密钥、TTS 配置与数据会保留。不要删除这个文件来升级，否则已有凭证可能无法解密。

## 二、只用 VPS

将示例域名替换为真实域名：

```sh
sh deploy-start.sh vps studio.example.com https://studio.example.com
```

启动后打开 `https://studio.example.com`，注册并登录自己的账号。公开部署始终开启账号认证，禁止沿用本地 `dev@local.test` 的免登录模式。

如果需要小米配音，在 VPS `.env.docker` 中填写 `MI_TTS_API_KEY`，然后重建应用容器的运行配置：

```sh
docker compose --env-file .env.docker -f docker-compose.yml -f docker-compose.vps.yml up -d
```

文字模型仍在应用的提供商设置中配置；TTS 凭证与文字模型凭证相互独立。服务器负责访问模型端点，原有 SSRF 校验继续有效。

## 三、使用 Vercel 入口

假设 VPS 后端为 `render.example.com`，用户入口为已分配的 `your-project.vercel.app` 或绑定到 Vercel 的 `studio.example.com`。

1. 在 Vercel 创建项目，Root Directory 选择源码中的 `whiteboard-studio`。仓库应是你自己的代码仓库；ZIP 需解压后上传到自己的 Git 仓库。使用项目里的 `vercel.json`，Framework 为 Other，不要把 Build Command 改成 `pnpm build`。
2. 在 VPS 启动后端。第三个参数必须是最终的 Vercel 用户入口：

   ```sh
   sh deploy-start.sh vercel-backend render.example.com https://studio.example.com
   ```

3. 在 Vercel 的项目环境变量中配置下面三项，Production 范围：

   | 名称 | 值 |
   | --- | --- |
   | `STUDIO_BACKEND_URL` | `https://render.example.com` |
   | `STUDIO_PUBLIC_URL` | `https://studio.example.com` |
   | `STUDIO_GATEWAY_SECRET` | VPS `.env.docker` 自动生成的同名值 |

   后端的 `APP_URL` 必须等于 Vercel 的 `STUDIO_PUBLIC_URL`。两个 URL 均为纯 HTTPS origin，不能带 `/v1`、用户名、密码或查询参数。它们不是模型的 Base URL。

4. 部署 / Redeploy Vercel 项目。首次发布时三项后端变量可以全部留空，网站将显示“后端待配置”，HTTP 状态为 503，业务接口同样拒绝访问；这不表示完整应用已经可用。变量只填了一部分或格式不合法时，构建会给出错误。全部配置完成并重新部署后，再从公开入口注册、登录和使用。不要把 PostgreSQL 密码、TTS Key、加密密钥或 `.env.docker` 上传到 Vercel。网关凭证只存在两端的环境变量中，不嵌入构建产物。
5. 此模式下直接打开 `https://render.example.com` 返回 403 是预期行为：后端要求可信网关凭证。浏览器只使用 Vercel 入口；网关凭证不替代最终用户的登录。

构建命令为 `node scripts/deploy/build-vercel.cjs`；构建只输出三个小文件组成的 Node.js 网关与 Build Output API 路由，不安装整个视频应用的依赖，不运行数据库迁移，也不复制用户项目。`.vercelignore` 排除 Dockerfile、引擎、数据、配置密钥和其他应用源码，避免 Vercel 自动按完整容器或框架构建。

浏览器请求必须使用 `STUDIO_PUBLIC_URL` 对应的固定 Host。预览部署域名不会自动获得生产后端访问权限；如需 Preview，使用独立测试后端与测试凭证，并为该预览配置匹配的公开 URL，不要把生产域名和多个 Preview 混用。

## 四、升级、备份与限制

```sh
# 使用当前模式升级；保留 .env.docker 和数据卷
docker compose --env-file .env.docker -f docker-compose.yml -f docker-compose.vps.yml up --build -d --wait

# 查看应用和 HTTPS 入口日志
docker compose --env-file .env.docker -f docker-compose.yml -f docker-compose.vps.yml logs --tail=100 app caddy

# 停止服务，保留数据
docker compose --env-file .env.docker -f docker-compose.yml -f docker-compose.vps.yml down
```

请同时备份 `.env.docker`、PostgreSQL、`studio-data`、`studio-state` 和 Caddy 数据卷。不要使用 `down -v` 作为升级步骤。容器重启会将未完成任务标为中断并释放锁，已生成成品仍保留。

本地 `dev@local.test` 项目不会自动转移给新注册的云端账号，旧开发 PGlite 数据库也不会自动转换为生产 PostgreSQL。搬迁原有项目需要单独迁移并核对归属。

这是供自己或受信任团队使用的单实例工作室。所有业务状态都在 VPS；本版本没有新增分布式渲染、自动扩容或独立对象存储。网关支持 HTTP/SSE，暂不转发 WebSocket 功能。Vercel 的请求体、函数时长和带宽限制仍适用；渲染不在函数中执行，但长聊天与文件传输仍受单次请求限制。大文件上传需要另行设计直传，不能靠网关消除平台限制。

## 五、验证范围

自动化检查覆盖部署参数、公开模式认证要求、网关请求及响应流、Cookie、Range、后端凭证校验、Windows 旧链接与越界路径拒绝。`scripts/verify-deployment.mjs` 是本地 HTTPS 网关 + 原应用后端的浏览器验收；使用临时数据库和合成账号，Edge 配音是真实免费服务。

本地网关测试不等于 Vercel 云端部署，不等于真实 VPS 的 DNS/TLS 验收，也不等于 Docker 镜像已在本环境运行。真实上线后应从最终域名再检查登录、保存、聊天、取消任务和出片下载。

平台文档：

- Vercel Build Output API：https://vercel.com/docs/build-output-api/primitives
- Vercel Functions Streaming：https://vercel.com/docs/functions/streaming-functions
- Vercel Functions Limits：https://vercel.com/docs/functions/limitations
