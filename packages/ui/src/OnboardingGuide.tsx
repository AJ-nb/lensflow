import { Check, CircleHelp, EyeOff, SkipForward } from "lucide-react";
import { ONBOARDING_STEPS, type OnboardingState, type OnboardingStep } from "@lensflow/contracts";

const STEP_COPY: Record<OnboardingStep, { label: string; title: string; detail: string; studioStep: number }> = {
  asset: { label: "素材", title: "选择一张可分析的素材", detail: "捕捉、上传或选择已有图片；有效素材记录会自动完成这一步。", studioStep: 1 },
  analysis: { label: "分析", title: "完成一次结构化分析", detail: "先确认本地测量，再运行快速分析；示例中的结果已预计算。", studioStep: 2 },
  composition: { label: "组合", title: "形成可检查的最终提示词", detail: "使用五轴词卡或正文补充，进入预检时记录完成。", studioStep: 3 },
  preflight: { label: "预检", title: "检查模型、能力和发送内容", detail: "只有预检通过并主动提交时，才会记录这一步。", studioStep: 4 },
  result: { label: "结果", title: "揭示一个稳定结果", detail: "点击卡片、按 Enter，或使用“揭示全部”完成首次创作。", studioStep: 5 }
};

export function OnboardingGuide({ state, onModeChange, onJump }: {
  state: OnboardingState;
  onModeChange: (mode: OnboardingState["mode"]) => void;
  onJump: (step: number) => void;
}) {
  if (state.mode !== "active") return null;
  const current = ONBOARDING_STEPS.find((step) => !state.completedSteps.includes(step));
  const copy = current ? STEP_COPY[current] : null;
  return <section className="lf-onboarding" aria-label="新手引导" data-onboarding-step={current ?? "complete"}>
    <div className="lf-onboarding-progress">
      <span><CircleHelp size={16} />首次创作 {state.completedSteps.length}/{ONBOARDING_STEPS.length}</span>
      <div aria-label={`已完成 ${state.completedSteps.length} 个步骤`}>{ONBOARDING_STEPS.map((step) => <i key={step} className={state.completedSteps.includes(step) ? "is-complete" : step === current ? "is-current" : ""}>{state.completedSteps.includes(step) ? <Check size={11} /> : STEP_COPY[step].studioStep}</i>)}</div>
    </div>
    <div className="lf-onboarding-copy">
      <div><span>{copy?.label ?? "完成"}</span><strong>{copy?.title ?? "首次创作流程已完成"}</strong><small>{copy?.detail ?? "引导进度已保留，可从右上角帮助按钮再次查看。"}</small></div>
      {copy && <button className="lf-button" type="button" onClick={() => onJump(copy.studioStep)}>定位当前步骤</button>}
    </div>
    <div className="lf-onboarding-controls">
      <label><input type="checkbox" checked onChange={(event) => { if (!event.target.checked) onModeChange("disabled"); }} />新手模式</label>
      <button type="button" onClick={() => onModeChange("skipped")}><SkipForward size={15} />跳过</button>
      <button type="button" onClick={() => onModeChange("disabled")}><EyeOff size={15} />不再显示</button>
    </div>
  </section>;
}
