import { registerRequiredSecret, type RegisteredSecret } from "@agent-native/core";

/**
 * 配音供应商凭证。
 *
 * 这两个 Key 以前只能写在项目根 `.env` 里，交付给别人时对方没有填写入口。
 * 注册进框架密钥库后，「设置 → API 密钥」会自动出现对应条目：填写、加密入库、
 * 渲染时由 start-render 解密并注入子进程环境。
 *
 * 优先级：密钥库 > .env。所以仓库里带一份 .env 做默认值，使用者覆盖时只动密钥库。
 * 两者都没有也能出片 —— Edge TTS 不需要凭证。
 */
const TTS_SECRETS: RegisteredSecret[] = [
  {
    key: "VOLC_TTS_API_KEY",
    label: "火山引擎语音合成",
    description:
      "火山引擎语音合成 TTS 的 API Key。standard 域是 36 位 UUID，plan 域是 ark- 开头的套餐 Key，两个域互不相通，打错域会报 45000010。",
    docsUrl: "https://console.volcengine.com/speech/app",
    scope: "user",
    kind: "api-key",
    required: false,
    usedFor: [
      {
        feature: "火山引擎配音",
        effectWhenRemoved: "无法用火山音色出片，可暂时切到 Edge TTS",
      },
    ],
  },
  {
    key: "MI_TTS_API_KEY",
    label: "小米 MiMo 语音合成",
    description:
      "小米 MiMo 的 token-plan Key（tp- 开头），仅用于小米九种音色。",
    scope: "user",
    kind: "api-key",
    required: false,
    usedFor: [
      {
        feature: "小米配音",
        effectWhenRemoved: "无法用小米音色出片，可暂时切到 Edge TTS",
      },
    ],
  },
];

function registerTtsSecrets() {
  for (const secret of TTS_SECRETS) {
    try {
      registerRequiredSecret(secret);
    } catch {
      // 重复注册按覆盖处理，这里静默兜住热重载时的重复调用
    }
  }
}

registerTtsSecrets();

export default function ttsSecretsPlugin() {
  registerTtsSecrets();
}
