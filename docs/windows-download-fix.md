# Windows 成片链接 HTTP 400 修复

适用现象：日志已完成 `final.mp4` 与三张封面，但点击成品出现 HTTP 400，堆栈定位到 `server/routes/studio-file.get.ts` 的参数检查。

原因：`actions/render-status.ts` 用本机 `path.join()` 构建 URL 中的相对文件路径。Windows 输出 `engine\build\...`，文件接口却只接受 `engine/` 前缀。视频已经生成，错误发生在读取文件时，与配音、中文目录或缺少 BGM 无关。

修复包含两个文件：

- `actions/render-status.ts`：URL 路径改用 `path.posix.join()`，所有平台统一使用 `/`。
- `server/routes/studio-file.get.ts`：收到旧版 Windows 链接时先将 `\` 规范化为 `/`，再执行原有路径校验。保留登录和用户文件隔离，继续拒绝 `..`、非法扩展名等请求。

## 安装补丁

1. 停止应用服务。
2. 将补丁中的 `actions` 和 `server` 文件夹合并覆盖到已有项目根目录（与 `package.json` 同级）。无需替换 `.env`、`data` 或安装依赖。
3. 使用原来的启动命令重启，刷新作品页后再次打开成品。已有成功任务无需重新出片。
4. 若运行的是生产构建，需要重新构建后启动；Docker 部署则重新构建镜像并启动，保留现有数据卷及配置。

修复前也可在日志给出的 `...\engine\build\<项目ID>\outputs\final.mp4` 路径直接用本地播放器打开视频。

## 验证

`pnpm exec vitest run scripts/studio-file.test.ts --pool=forks --maxWorkers=1`：12 项通过，覆盖真实文件扫描、MP4/中文 PNG/中文字幕的正反斜杠链接、401/404 与路径越界的 400 响应。测试身份由隔离夹具提供，无真实服务凭证。

`pnpm typecheck` 和 `pnpm agent-native:doctor` 均通过。Windows 路径由 Node 的 `path.win32` 构造，原生 Windows 环境未实测。
