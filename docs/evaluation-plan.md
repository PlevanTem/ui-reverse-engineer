# Harbor-native evaluation plan

评测分三层，控制权不重叠：Loop Criteria 指导每轮修复；D/I/F/T Judge 审阅过程；Final E2E 产生正式质量 reward。Harbor 只编排和保存事实，不重定义这些评分。

## Per-step

每个 step 的独立 verifier 校验 `RestoreStepEvaluation/v1`：

```json
{
  "continue_gate": 1,
  "stop_reason": null
}
```

`continue_gate=1` 表示仍有明确改进方向且预算允许；`0` 停止后续 step。停止原因只允许 `target_reached`、`plateau`、`cycle_detected`、`budget_exhausted`、`blocked`、`failed`。这是既有停止语义的流程投影，不是质量分数。

每轮还保存同状态证据、measurement、Diff、独立 A/B 与 B/A、keep/revert/inconclusive 及回归检查。缺独立证据不能写 keep。

## Process Judge

[`scripts/harbor/process-judge.mjs`](../scripts/harbor/process-judge.mjs) 只读取官方校验通过的 ATIF 和 Harbor artifacts，按 [`evals/trajectory/rubrics.json`](../evals/trajectory/rubrics.json) 输出 D/I/F/T。复制上下文和私有推理不进入 Judge 输入。过程分不替代页面最终验收，语义校准仍为 `unmeasured`。

## Final E2E

最后实际执行 step 同时完成五维 Final E2E、红线、报告固化和正式 reward。未知、绑定错误或证据不全使结果 incomplete，并且不生成七维正式 reward。Harbor 的 final 策略只选最后实际 step，不对多轮均值。

## Regrade

证据、task 和 artifact hash 不变时，可用 Harbor regrade 只重跑独立 verifier，不重新执行 Agent。regrade 不能修复缺 ATIF、缺 fixture 或错误的源策略，也不能把旧 trial 改写成新任务。

## Acceptance boundary

`node scripts/check.mjs harbor` 验证格式、Schema、task lint、ATIF fixture、round-trip、遗留实现清理和合成数据导出。它不启动 Docker、浏览器、模型或真实 trial。运行验收必须等待一个新建且已授权的 ready case；此前状态保持 `not_run`。
