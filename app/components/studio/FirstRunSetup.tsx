import { useEffect, useState } from "react";
import {
  IconVolume,
  IconSparkles,
  IconCheck,
  IconArrowRight,
  IconLoader2,
} from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const DISMISS_KEY = "studio.setup.dismissed";

const ENGINES = [
  {
    id: "edge",
    name: "Edge TTS",
    note: "免费，联网即可用，音色普通",
    keyName: null,
  },
  {
    id: "volc",
    name: "火山引擎",
    note: "音质最好，有逐字时间戳，字幕最准",
    keyName: "VOLC_TTS_API_KEY",
  },
  {
    id: "mi",
    name: "小米 MiMo",
    note: "九种音色，句级时间戳",
    keyName: "MI_TTS_API_KEY",
  },
] as const;

type EngineId = (typeof ENGINES)[number]["id"];

/**
 * 首次启动引导。
 *
 * 只问两件事：配音怎么出（必需）、AI 模型要不要现在配（可选）。
 * 判据是密钥库里有没有配音 Key —— 配好了就再也不弹；
 * 用免费 Edge 的没有 Key，点「以后再说」会记一个本地标记。
 */
export function FirstRunSetup() {
  const [state, setState] = useState<"checking" | "form" | "hidden">("checking");
  const [engine, setEngine] = useState<EngineId>("volc");
  const [key, setKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (localStorage.getItem(DISMISS_KEY) === "1") {
          if (alive) setState("hidden");
          return;
        }
        const res = await fetch("/_agent-native/secrets", {
          credentials: "same-origin",
        });
        if (!res.ok) {
          if (alive) setState("hidden");
          return;
        }
        const list = (await res.json()) as Array<{
          key: string;
          status: string;
        }>;
        const configured = list.some(
          (s) =>
            (s.key === "VOLC_TTS_API_KEY" || s.key === "MI_TTS_API_KEY") &&
            s.status === "set",
        );
        if (!alive) return;
        setState(configured ? "hidden" : "form");
      } catch {
        if (alive) setState("hidden");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // 本地标记写不进去也不该挡住使用
    }
    setState("hidden");
  };

  const current = ENGINES.find((e) => e.id === engine)!;

  const save = async () => {
    setError("");
    if (!current.keyName) {
      dismiss();
      return;
    }
    if (!key.trim()) {
      setError("请填写 API Key，或者选 Edge TTS 先跳过");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(
        `/_agent-native/secrets/${encodeURIComponent(current.keyName)}`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ value: key.trim() }),
        },
      );
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text.slice(0, 120) || `保存失败（${res.status}）`);
      }
      setState("hidden");
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  if (state !== "form") return null;

  return (
    <div className="setup-mask" role="dialog" aria-modal="true">
      <div className="setup-card">
        <header className="setup-head">
          <h2>开始之前</h2>
          <p>配好配音就能出片。以后想改，随时去设置里调。</p>
        </header>

        <section className="setup-section">
          <div className="setup-label">
            <IconVolume size={15} />
            配音引擎
            <em>必选</em>
          </div>
          <div className="setup-options">
            {ENGINES.map((e) => (
              <button
                key={e.id}
                className={`setup-option${engine === e.id ? " is-on" : ""}`}
                onClick={() => {
                  setEngine(e.id);
                  setError("");
                }}
              >
                <span className="setup-radio" />
                <span className="setup-option-text">
                  <strong>{e.name}</strong>
                  <small>{e.note}</small>
                </span>
                {engine === e.id && <IconCheck size={14} />}
              </button>
            ))}
          </div>

          {current.keyName && (
            <div className="setup-key">
              <label htmlFor="setup-key">{current.name} API Key</label>
              <Input
                id="setup-key"
                type="password"
                placeholder="粘贴 Key，只会加密存进本地密钥库"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                autoComplete="off"
              />
              <p className="setup-hint">
                保存后不会显示明文，也不会写进项目文件或源码。
              </p>
            </div>
          )}
        </section>

        <section className="setup-section">
          <div className="setup-label">
            <IconSparkles size={15} />
            AI 模型
            <em className="is-optional">可选</em>
          </div>
          <p className="setup-note">
            不配也能用：旁白和要点自己写，或者用已连接的模型。想让它代写分镜，去设置里填模型地址和 Key。
          </p>
          <a
            className="setup-link"
            href="/settings/providers"
            target="_blank"
            rel="noreferrer"
          >
            去设置里配置模型
            <IconArrowRight size={13} />
          </a>
        </section>

        {error && <p className="setup-error">{error}</p>}

        <footer className="setup-foot">
          <Button variant="ghost" onClick={dismiss} disabled={saving}>
            以后再说
          </Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? (
              <>
                <IconLoader2 size={15} className="setup-spin" />
                保存中
              </>
            ) : current.keyName ? (
              "保存并开始"
            ) : (
              "开始使用"
            )}
          </Button>
        </footer>
      </div>
    </div>
  );
}
