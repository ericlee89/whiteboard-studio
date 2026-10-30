import { Button } from "@/components/ui/button";
import type { PreflightIssue } from "../../../actions/preflight";

export interface PreflightResult {
  issues: PreflightIssue[];
  errors: number;
  warnings: number;
  totalChars: number;
  estimatedSeconds: number;
}

export function PreflightPanel({
  result,
  onClose,
  onProceed,
  onJump,
}: {
  result: PreflightResult;
  onClose: () => void;
  onProceed: () => void;
  onJump: (scene: number) => void;
}) {
  const { issues, errors, warnings, estimatedSeconds } = result;
  const min = Math.floor(estimatedSeconds / 60);
  const sec = estimatedSeconds % 60;

  return (
    <div className="setup-mask" role="dialog" aria-modal="true">
      <div className="setup-card">
        <header className="setup-head">
          <h2>出片前检查</h2>
          <p>
            {errors > 0 ? `${errors} 项必须处理` : "没有阻塞问题"}
            {warnings > 0 ? ` · ${warnings} 项建议调整` : ""}
            {estimatedSeconds > 0 ? ` · 预计 ${min} 分 ${sec} 秒` : ""}
          </p>
        </header>

        <ul className="preflight-list">
          {issues.map((it, i) => (
            <li key={`${it.title}-${i}`} className={`preflight-item is-${it.level}`}>
              <span className="preflight-dot" />
              <div className="preflight-body">
                <strong>{it.title}</strong>
                <p>{it.detail}</p>
                {typeof it.scene === "number" && (
                  <button
                    className="preflight-jump"
                    onClick={() => onJump(it.scene!)}
                  >
                    跳到第 {it.scene + 1} 幕
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>

        <footer className="setup-foot">
          <Button variant="ghost" onClick={onClose}>
            返回修改
          </Button>
          <Button variant={errors > 0 ? "outline" : "default"} onClick={onProceed}>
            {errors > 0 ? "仍然出片" : "继续出片"}
          </Button>
        </footer>
      </div>
    </div>
  );
}
