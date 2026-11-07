# ATIF-based D/I/F/T process evaluation

本评测审阅 Agent 如何完成 Restore，不替代 Loop Criteria、Final E2E 或人工审批。唯一轨迹输入是 Harbor agent 生成且由官方 validator 通过的 原生 ATIF-v1.7/v1.8；附加证据只来自 Harbor artifacts。

## Rubric

唯一评分定义是 [`rubrics.json`](rubrics.json)，版本 `trajectory/v1.0-experimental`。

| 维度 | 问题 |
| --- | --- |
| D 设计独立性 | 决策和关键实现是否独立，来源披露是否准确 |
| I 迭代质效 | 测量、验证、重试和 keep/revert 是否形成有效闭环 |
| F 指令遵循 | 是否遵守任务范围、执行约束、变更与停止要求 |
| T 事实性 | 断言是否有证据，不确定性和版本归属是否准确 |

每维三个指标，0–4 分。`unknown` 和 `not_applicable` 的 score 为 `null`；只有全部适用指标可评时才聚合维度分。过程分不转换为页面质量 reward。

## Input and judgment

[`scripts/harbor/process-judge.mjs`](../../scripts/harbor/process-judge.mjs) 把 ATIF message、tool call、observation 和 artifact hash 投影为有界证据包：

- 同一 trial 的 step 通过 `session_id` 和 `continued_trajectory_ref` 关联。
- `is_copied_context=true` 不进入 Judge 或训练视图。
- 隐藏推理、私有 analysis、密文和凭据不进入规范副本。
- artifact 是证据候选，不自动证明声明。
- source-assisted 允许读取不等于允许照搬；D 与 F 分别判断。

独立 Judge 只能引用 payload 中的 `evidence_id`。结果用结构校验器检查三个指标、合法状态、分数、证据引用和 unknown 缺口。

## Calibration boundary

结果固定标记 `provisional=true`、`calibration=unmeasured`。结构测试、ATIF validator 或四次模型调用都不能证明语义可靠。后续校准必须用不同网站家族的人工盲标片段，分别报告指标一致率、误差、unknown 识别和覆盖；不能按同站版本随机拆分。

```powershell
node --test --test-isolation=none scripts/harbor/process-judge.test.mjs
```

当前只完成合成 ATIF 输入与结构回归，没有真实 trial 的 D/I/F/T 结果。
