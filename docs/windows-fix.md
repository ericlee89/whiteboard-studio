# Windows 出片 EPERM 与跨平台修复说明

日期：2026-10-29。

## 截图中的错误原因

错误为 `EPERM: operation not permitted, symlink`，源目录是 `engine/node_modules`，目标目录是本次任务快照内的 `engine/node_modules`。

旧版渲染器固定使用 `fs.symlinkSync(target, link, "dir")`。Windows 普通目录符号链接涉及额外权限，普通用户运行时可能在这里被拒绝。应用页面与编辑功能不经过这一步，所以可以正常使用；首次预览或出片准备引擎时才会失败。

这条错误发生在任何 TTS 请求之前，与截图中选择小米 MiMo、API Key、模型 ID 或配音额度无关。截图也不能据此证明中文目录有问题。

## 修复内容

- Windows 使用绝对路径的目录联接 `junction`；Linux/macOS 继续使用目录符号链接 `dir`。
- 链接失败时保留原始错误码，并给出本地磁盘写入 / 安全软件的排查提示。
- 另外发现旧版“取消任务”依赖 Linux `/proc/<pid>/cmdline`，Windows/macOS 不具备这一机制。新版改为每次任务独立的取消标记，由实际渲染器终止它自己创建的工序及子进程。
- 任务进程结束后才释放任务槽，避免取消后旧任务尚未停止就同时启动新任务。Windows 使用系统 taskkill 终止所拥有的工序树，POSIX 使用该工序独立的进程组；HTTP 调用方不能传入任意 PID。

## 给已有工程安装补丁

1. 在启动应用的终端按 Ctrl+C，退出当前应用。
2. 备份自己的 `data` 和 `.env`，并保留现有工程目录。
3. 把补丁中的 `scripts/render-episode.cjs`、`scripts/render-process.cjs`、`actions/cancel-render.ts` 复制到工程相同相对路径并覆盖。`scripts/render-process.cjs` 是新增的必需文件。测试文件和本说明也可一起复制。
4. 重新双击 `start.cmd`，打开原项目，再点击“一键出片”。失败任务的旧日志会保留，新任务使用新的独立快照。
5. 此补丁没有新增 npm 依赖。源码改动针对 Windows 普通用户的目录链接权限，不要求为了此功能长期以管理员身份运行。

如果 junction 仍被拒绝，请检查工程是否在可写的本地磁盘，以及安全软件 / 组织策略是否限制目录联接。网络映射盘或不支持重解析点的文件系统不等同于普通本地 NTFS 目录。

如果随后出现小米服务的 HTTP / 凭证 / 音色错误，需要按新日志检查配音服务；那属于另一条链路。本次没有使用真实小米凭证调用付费接口。

## 验证范围

当前可用执行环境为 Linux、Node.js 24.22.1，不能把 Linux 测试当成 Windows 真机测试。

已执行 6 项进程 / 文件系统回归：带中文和空格路径的实际依赖加载；Windows 分支选择绝对路径 junction（分支模拟，非 Windows NTFS 真机）；EPERM 错误保留；启动前取消不执行工序；运行中取消停止工序及其心跳子进程；超时后终止工序。均通过。

浏览器完整回归记录见同目录 `windows-regression.json`。已交付的 11 页手册和前一版出片样例仍作为操作参考；本说明是本次 Windows 修复的补充。

原生 Windows / macOS 上的完整出片、小米 / 火山真实接口仍需要在相应机器与有效凭证下验证。
