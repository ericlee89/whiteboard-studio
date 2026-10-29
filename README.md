# 白板工作室 · Whiteboard Studio

使用 whiteboard-video-factory 原引擎的本地视频工作室。请先阅读 [START-HERE.md](START-HERE.md)。

Windows 使用 start.cmd，macOS/Linux 使用 sh start.sh。可编辑项目与分镜、渲染白板预览、生成封面，并连接配音后导出有声视频。详细验证与限制见 [docs/verification.md](docs/verification.md)。

以下保留官方 Chat 脚手架说明，便于后续扩展。

## Official scaffold reference

The minimal agent-native starter app — a clean, ChatGPT-style shell with chat at
the center, durable threads, standard app navigation, auth, live sync, and
actions. Start here when you want a real browser app to build on without
committing to a domain template.

**Live app: [chat.agent-native.com](https://chat.agent-native.com?utm_source=github&utm_medium=referral&utm_content=chat-readme)**

Chat is the basic agent-native app starting point. It gives you the app-agent
loop wired end to end and one example action, so you can add your own UI, data,
and actions on top.

## Features

- ChatGPT-style shell with a threads list and durable chat history.
- Auth, live sync, and application state wired out of the box.
- The action surface the agent and UI share, plus one example action to copy.
- A minimal, brandable base for any domain app.

## Develop locally

Scaffold your own copy and run it:

```bash
npx --yes @agent-native/core@latest create my-app --standalone --template chat
cd my-app
corepack enable
pnpm install
pnpm dev
```

Full docs: [agent-native.com/docs/template-chat](https://agent-native.com/docs/template-chat?utm_source=github&utm_medium=referral&utm_content=chat-readme).
