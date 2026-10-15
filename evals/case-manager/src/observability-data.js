const DIMENSIONS = [
  ["layout", "结构布局"], ["style", "视觉细节"], ["content", "内容完整"],
  ["interaction", "交互状态"], ["robustness", "响应稳健"],
];

export const EVAL_DIMENSIONS = DIMENSIONS;
export const RUN_STORAGE_KEY = "ui-reverse-engineer-observability:runs:v1";

export function normalizeReport(input, { caseId = null, variant = "未标注方案", importedAt = new Date().toISOString() } = {}) {
  if (input?.schema_version !== "RestoreReport/v0.2" || !input.run_id || !input.contract) {
    throw new Error("需要 RestoreReport/v0.2 格式的 report.json。");
  }
  const e2e = input.e2e ?? {};
  const rounds = (input.rounds ?? []).map((round, index) => ({
    number: round.round ?? index + 1,
    issue: round.issue_id ?? "未标注问题",
    hypothesis: round.hypothesis ?? "未记录修复假设",
    decision: round.decision ?? "inconclusive",
    at: round.at ?? round.started_at ?? null,
    candidate: round.candidate ?? null,
  }));
  const reference = input.contract.reference_evidence ?? [];
  const finalEvidence = e2e.evidence ?? input.best?.evidence ?? [];
  return {
    id: input.run_id,
    caseId,
    variant,
    importedAt,
    startedAt: input.started_at ?? null,
    source: "report.json",
    demo: Boolean(input.demo),
    tier: input.tier ?? "unknown",
    referenceUrl: input.contract.observed_url ?? input.contract.requested_url ?? null,
    stateCount: input.contract.states?.length ?? 0,
    loopStop: input.stop?.reason ?? "unknown",
    artifactHash: input.artifact_sha256 ?? input.stop?.artifact_sha256 ?? null,
    contractHash: input.contract_sha256 ?? null,
    rounds,
    e2e: {
      status: e2e.status ?? "incomplete",
      total: Number.isFinite(e2e.total_100) ? e2e.total_100 : null,
      provisional: e2e.provisional !== false,
      dimensions: Array.isArray(e2e.dimensions) ? e2e.dimensions : [],
      redlines: Array.isArray(e2e.redlines) ? e2e.redlines : [],
      calibration: e2e.calibration ?? { status: "unmeasured" },
      reason: e2e.reason ?? null,
    },
    approval: input.approval?.decision ?? null,
    evidence: [...reference.map((item) => ({ ...item, stage: "reference" })), ...finalEvidence.map((item) => ({ ...item, stage: "final" }))],
    previewUrl: input.preview_url ?? null,
  };
}

export function loadImportedRuns() {
  try {
    const value = JSON.parse(localStorage.getItem(RUN_STORAGE_KEY) ?? "[]");
    return Array.isArray(value) ? value : [];
  } catch { return []; }
}

function demoRun(id, caseId, variant, date, scores, stop, decisions, approved = null) {
  const total = Math.round(scores.reduce((sum, score) => sum + score * 20 / 4, 0));
  return {
    id, caseId, variant, importedAt: date, startedAt: date, source: "synthetic-demo", demo: true,
    tier: caseId === "UIR-0001" ? "complex" : "refined", referenceUrl: null, stateCount: caseId === "UIR-0001" ? 4 : 3,
    loopStop: stop, artifactHash: `demo-artifact-${id.toLowerCase()}`, contractHash: `demo-contract-${caseId.toLowerCase()}`,
    rounds: decisions.map((decision, index) => ({ number: index + 1, issue: ["构图比例", "主体质感", "滚动节奏"][index] ?? "局部偏差", hypothesis: ["调整关键区域比例", "重建主体光影", "校正关键帧时序"][index] ?? "修复局部偏差", decision, at: date, candidate: `demo-candidate-${index + 1}` })),
    e2e: { status: scores.some((score) => score < 3) ? "fail" : "pass", total, provisional: true, dimensions: DIMENSIONS.map(([key], index) => ({ id: key, status: "scored", score: scores[index], reason: "合成演示评分，非真实评委结论", evidence: [`demo-evidence-${id}`] })), redlines: ["runnable", "structure", "interaction", "obstruction", "fabrication", "external_writes"].map((key) => ({ id: key, status: "pass", reason: "演示状态" })), calibration: { status: "unmeasured" }, reason: null },
    approval: approved, evidence: [{ id: `demo-evidence-${id}`, kind: "screenshot", uri: "演示证据，不含真实文件", stage: "final" }], previewUrl: null,
  };
}

export const DEMO_RUNS = [
  demoRun("RUN-2401", "UIR-0001", "Luna · 基线", "2026-10-12T09:15:00+08:00", [2, 2, 1, 2, 3], "budget_exhausted", ["keep", "revert", "inconclusive"]),
  demoRun("RUN-2402", "UIR-0001", "Luna · Product Design", "2026-10-12T10:40:00+08:00", [3, 3, 2, 3, 3], "plateau", ["keep", "keep", "inconclusive"]),
  demoRun("RUN-2403", "UIR-0001", "Luna · Restore Skill", "2026-10-12T14:05:00+08:00", [3, 4, 3, 3, 3], "target_reached", ["keep", "keep", "keep"], "conditional_go"),
  demoRun("RUN-2404", "UIR-0002", "Luna · 基线", "2026-10-13T09:25:00+08:00", [2, 2, 2, 2, 3], "budget_exhausted", ["keep", "revert"]),
  demoRun("RUN-2405", "UIR-0002", "Luna · Product Design", "2026-10-13T11:05:00+08:00", [3, 3, 3, 3, 3], "target_reached", ["keep", "keep"], "go"),
  demoRun("RUN-2406", "UIR-0002", "Luna · Restore Skill", "2026-10-13T15:20:00+08:00", [4, 3, 3, 3, 3], "target_reached", ["keep", "keep", "keep"], "go"),
];

export function auditEvents(runs) {
  return runs.flatMap((run) => [
    { id: `${run.id}:start`, at: run.startedAt, runId: run.id, action: "运行开始", detail: `方案：${run.variant}`, actor: "系统", source: run.source },
    ...run.rounds.map((round) => ({ id: `${run.id}:round:${round.number}`, at: round.at ?? run.startedAt, runId: run.id, action: `第 ${round.number} 轮 · ${round.decision}`, detail: round.hypothesis, actor: "Restore Loop", source: run.source })),
    { id: `${run.id}:e2e`, at: run.startedAt, runId: run.id, action: "E2E 记录", detail: run.e2e.status === "incomplete" ? "评分未完成" : `${run.e2e.status} · ${run.e2e.total ?? "—"}/100`, actor: "独立评测", source: run.source },
    ...(run.approval ? [{ id: `${run.id}:approval`, at: run.startedAt, runId: run.id, action: "审批记录", detail: run.approval, actor: "审阅者", source: run.source }] : []),
  ]).sort((a, b) => Date.parse(b.at ?? 0) - Date.parse(a.at ?? 0));
}
