# E2E Grader

本目录只包含 Restore 最终五维 E2E 的确定性封装。评测方案见 [`../restore.md`](../restore.md)；单次运行控制、报告和审批见 [`../../references/restore/interfaces.md`](../../references/restore/interfaces.md)。

`grader.mjs` 从标准输入接收 [`FinalEvalRequest/v0.2`](../../references/restore/final-eval-request.schema.json)，调用独立 Judge adapter，并输出 `E2EResultRef/v0.2`。它负责：

- 校验冻结 binding、状态覆盖、证据引用和独立 evaluator；
- 强制五个稳定维度 ID 与等权权重；
- 校验 [`RedlineProfile/v1`](../../references/restore/redline-profile.schema.json) 和 [`E2ERedlineAssessment/v1`](../../references/restore/e2e-redline.schema.json) 的结构一致性；
- 按“红线无失败、每个适用维度 ≥3”决定单 case pass；
- 证据或独立 Judge 不足时返回 `incomplete`。

它不采集页面、不修复页面、不从截图自动判断语义，也不生成报告。

```powershell
node scripts/restore/cli.mjs eval <run-directory> evals/pipeline/grader.mjs <judge-adapter.mjs>
```

Rubric v1.2-draft 的 request 必须包含完整红线 profile。历史结果保留原版本，不由当前 grader 静默重评分。
