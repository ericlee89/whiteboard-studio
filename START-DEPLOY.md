# 选择部署方式

完整步骤见 [docs/platform-deployment.md](docs/platform-deployment.md)。

| 目标 | 操作 |
| --- | --- |
| Windows 本地 Docker | 原有 `docker-start.cmd` |
| Linux 本地 Docker | 原有 `sh docker-start.sh` |
| 独立 VPS | `sh deploy-start.sh vps studio.example.com https://studio.example.com` |
| Vercel + VPS | 先 `sh deploy-start.sh vercel-backend render.example.com https://studio.example.com`，再将同一源码的网关部署到 Vercel |

Vercel 模式仍需要 VPS 后端。它是同源流式访问入口，数据、模型调用、页面渲染与视频生成都在 VPS。Vercel 配置 `STUDIO_BACKEND_URL`、`STUDIO_PUBLIC_URL`、`STUDIO_GATEWAY_SECRET` 三项环境变量；后端 `APP_URL` 与公开 URL 保持一致。

VPS 两种公开模式都会开启账号登录。HTTPS 由 Caddy 处理，数据库和成片使用持久数据卷。更新源码时保留 `.env.docker` 和所有数据卷。

首次 Vercel 发布可以暂不设置三项后端变量；此时网站返回 HTTP 503 并提示“后端待配置”，登录与出片尚不可用。三项变量全部配置并重新部署后才会转发到 VPS。
