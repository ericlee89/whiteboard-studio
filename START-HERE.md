部署到 VPS 或 Vercel + VPS：请先阅读 [START-DEPLOY.md](START-DEPLOY.md)。Vercel 模式仍需要 VPS 后端。

# 白板工作室

推荐在 Windows 上使用 Docker 版：安装并启动 Docker Desktop（Linux containers），运行 `docker-start.cmd`。首次会建立 `.env.docker` 并构建应用和 PostgreSQL 服务，默认访问 http://localhost:4317。详见 `docs/docker-deployment.md`。容器内已安装渲染所需 Node、Python、ffmpeg、Chromium 和字体；宿主机无需单独安装。

小米配音若提示“缺少小米凭证”：请阅读 `docs/mimo-config-fix.md`。此版会显式读取项目根目录的 `.env`，通过子进程环境传递 TTS 配置；仍需在本机填写有效的 MI_TTS_API_KEY。

Windows 出片若曾出现 `EPERM ... symlink`：请先阅读 `docs/windows-fix.md`。此版已将 Windows 渲染依赖目录改为 junction，并修复取消任务依赖 Linux `/proc` 的问题。

带页面截图的操作手册：`docs/whiteboard-studio-handbook.pdf`（11 页）。完整实测视频、字幕、三种封面与文件检查结果位于 `docs/test-output/`。自定义模型的本地接口补测记录位于 `docs/model-test/`。

要求：Node.js ≥22.22、pnpm、Python 3、ffmpeg/ffprobe。

Windows：先安装上述依赖及 pnpm，再双击 `start.cmd`。macOS/Linux：运行 `sh start.sh`。启动器会安装缺少的项目依赖、浏览器与 Edge TTS，并打开 `http://127.0.0.1:4317`。

也可手动运行：

```bash
pnpm install
npm --prefix engine ci --ignore-scripts
cd engine && npx playwright install chromium && cd ..
python3 -m pip install edge-tts
pnpm dev
```

打开终端显示的 localhost 地址，进入「白板视频工作室」。可新建项目、修改旁白和画面要点、保存、渲染预览，或一键出片。任务显示真实工序和日志，完成后可下载视频与封面。不要同时运行两个实例。

AI 润色和内容生成使用原生助手的 Connect AI。未连接模型时，手工编辑、预览和已配置 TTS 的导出仍可用。

如用小米配音，在本机未跟踪的 .env 文件加入 MI_TTS_API_KEY；可用 MI_TTS_BASE_URL 覆盖默认 https://api.xiaomimimo.com/v1。火山配音使用 VOLC_TTS_API_KEY（或原引擎支持的 AppId/Token 环境变量）。密钥不进入网页、项目或发布稿。

data/episodes 是项目源；data/jobs 是每次导出独立快照。原技能引擎在 engine/，保留其参考文档。演示画布为结构示意，精确逐笔画面使用「渲染预览」。Edge 需要互联网连接，未连接配音服务不产生假音轨。

应用仅运行在本机，不发布到 Cloudflare Worker：ffmpeg、Chromium 和本地文件无法在该托管环境直接运行。请勿公开暴露本地开发端口。

验收范围：类型检查与框架检查通过；浏览器完成桌面/手机、深/浅色检查，保存后刷新验证通过；原引擎实际生成场景静帧和三画幅封面。补充完成从新建项目到有声 MP4、字幕、封面的页面全链路测试：2 幕、25.02 秒、1920×1080、30 FPS，实际播放、下载、完整解码与字幕时间轴检查通过。AI 自动写稿、真实自定义模型推理与小米/火山付费配音未实测。一键出片显示真实工序和失败日志。

如 Chromium 自动下载受限，可在 .env 设置 WB_CHROMIUM 为本机浏览器可执行文件完整路径。若组织网络使用额外受信 CA，可在启动前设置 SSL_CERT_FILE 指向该 PEM 文件；Edge TTS 将增补此 CA 并保留 TLS 证书校验。

原始技能：https://github.com/wwwzhouhui/skills_collection/tree/main/whiteboard-video-factory
官方脚手架：https://github.com/BuilderIO/agent-native

## 自定义模型（本次新增）

打开「设置 → 模型 → 添加提供商」，选择「自定义（OpenAI 兼容）」，填写 API 地址、API Key、精确模型 ID 和显示名称，然后保存。无需读取模型列表，也无需使用 Builder.io；「读取模型列表」是可选操作。

手填的模型 ID 会加入模型选择器；显示名称用于该配置弹窗的识别。保存仅表示配置已存储，不表示服务连通或具备工具调用能力。用于分镜生成等操作的模型应支持工具调用。

同一作用域目前只有一套 OpenAI 兼容地址/密钥。保存会更新该作用域现有 OpenAI 连接；其他已选模型 ID 会保留。个人/组织权限沿用框架规则，组织配置仅管理员可写，个人配置受组织策略限制。

密钥通过共享密钥库加密保存，不进入项目 JSON 或源码包。生产环境请配置稳定的密钥加密参数；本地开发由框架使用机器本地密钥。

补测已通过：配置保存、模型选择、流式 Chat Completions 请求、回复持久化、只读 list-episodes 工具往返。接口是本地确定性测试程序，未使用真实模型；此结论不等于已验证任意服务商的模型能力。另修复聊天正文的中文字体回退。
