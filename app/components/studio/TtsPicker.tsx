import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ENGINE_PRESETS,
  VOICE_PRESETS,
  type EngineId,
} from "../../lib/studio-options";

export interface TtsChoice {
  engine: EngineId;
  voice: string;
  speed: number;
}

export function TtsPicker({
  current,
  onClose,
  onConfirm,
}: {
  current: TtsChoice;
  onClose: () => void;
  onConfirm: (choice: TtsChoice) => void;
}) {
  const [engine, setEngine] = useState<EngineId>(current.engine);
  const [voice, setVoice] = useState(current.voice);
  const [speed, setSpeed] = useState(current.speed);

  const pick = (id: EngineId) => {
    const preset = ENGINE_PRESETS.find((e) => e.id === id);
    setEngine(id);
    if (preset) setVoice(preset.voice);
  };

  const voices = VOICE_PRESETS[engine] || [];
  const known = voices.some((v) => v.id === voice);

  return (
    <div className="setup-mask" role="dialog" aria-modal="true">
      <div className="setup-card">
        <header className="setup-head">
          <h2>这次用哪个配音</h2>
          <p>选完就开始体检和渲染，中途不再打断。</p>
        </header>

        <div className="engine-row">
          {ENGINE_PRESETS.map((en) => (
            <button
              key={en.id}
              className={`engine-chip${engine === en.id ? " is-on" : ""}`}
              onClick={() => pick(en.id)}
            >
              <strong>{en.name}</strong>
              <small>{en.note}</small>
            </button>
          ))}
        </div>

        <div className="gen-field">
          <label htmlFor="tts-voice">音色</label>
          {engine === "volc" ? (
            <>
              <Input
                id="tts-voice"
                value={voice}
                onChange={(e) => setVoice(e.target.value)}
              />
              <p className="field-hint">
                火山音色 ID 从控制台音色广场复制，2.0 音色以 _bigtts 结尾。
              </p>
            </>
          ) : (
            <select
              id="tts-voice"
              value={voice}
              onChange={(e) => setVoice(e.target.value)}
            >
              {voices.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
              {!known && <option value={voice}>{voice}（当前）</option>}
            </select>
          )}
        </div>

        <div className="gen-field">
          <label htmlFor="tts-speed">语速 · {speed.toFixed(1)}×</label>
          <input
            id="tts-speed"
            type="range"
            min="0.5"
            max="2"
            step="0.1"
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
          />
        </div>

        <footer className="setup-foot">
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button onClick={() => onConfirm({ engine, voice, speed })}>
            开始出片
          </Button>
        </footer>
      </div>
    </div>
  );
}
