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

这是评估目标与既有方法要求，不代表 runner 已接通。目前 step instruction 要求 Agent 保存记录；separate verifier 实际只校验提交的结构、字段和值域，不会执行独立比较。POLA 各轮因此保持 inconclusive。

## Process Judge

[`scripts/harbor/process-judge.mjs`](../scripts/harbor/process-judge.mjs) 为 ATIF 和 Harbor artifacts 提供 D/I/F/T 请求/提示构造及结果校验，rubric 来自 [`evals/trajectory/rubrics.json`](../evals/trajectory/rubrics.json)；它本身不执行模型。接线时输入须先通过官方 ATIF 校验。复制上下文和私有推理不进入 Judge 输入。过程分不替代页面最终验收，语义校准仍为 `unmeasured`。

## Final E2E

最后实际执行 step 同时完成五维 Final E2E、红线、报告固化和正式 reward。未知、绑定错误或证据不全使结果 incomplete，并且不生成七个正式 reward 字段。Harbor 的 final 策略只选最后实际 step，不对多轮均值。

当前自动路径仍缺独立 Judge 执行和 grader 接线；上述完整评估是目标行为，不能用 Agent 自填的 complete/reward 声明替代。

## Regrade

证据、task 和 artifact hash 不变时，可用 Harbor regrade 只重跑独立 verifier，不重新执行 Agent。regrade 不能修复缺 ATIF、缺 fixture 或错误的源策略，也不能把旧 trial 改写成新任务。

## Acceptance boundary

`node scripts/check.mjs harbor` 验证格式、Schema、task lint、ATIF fixture、round-trip、遗留实现清理和合成数据导出。它不启动 Docker、浏览器、模型或真实 trial。POLA 直接 URL 已实跑验证执行与数据链路，独立视觉质量仍 incomplete。真实验收范围、ATIF 版本与剩余限制统一见 [自动入口](../references/harbor/automation.md)。正式 ready-case 和提前停止仍未实跑。

## 下一阶段：Harbor 接评估执行链

状态：planned，尚未执行。Harbor 继续拥有生命周期；复用现有 Loop Criteria、独立 pairwise、五维 Final E2E 和六种停止原因，不增加评分规则或第二个 harness。

| 顺序 | 工作与现有接点 | 产物与检查 |
| --- | --- | --- |
| 1 | 从 contract-lock、参考/候选 capture 和 artifact hash 构造领域请求；拆出 assessment、pairwise、finalInput 中对旧 run.json 的依赖 | 使用现有请求 Schema；不生成伪 run/events，绑定缺失时 incomplete |
| 2 | 在 Harbor 的可信独立评估路径执行 Judge adapter；实现者上下文与 evaluator-only 数据隔离 | 记录 assessor、模型/adapter 版本、输入/输出摘要、可见用量、覆盖与失败；模型调用不是一个自建 loop |
| 3 | Loop 调用现有同状态测量、匿名 A/B 与 B/A、回归检查；最终调用现有 grader | 产物先保存完整结果，再校验独立身份、合同/代码/环境/rubric 绑定和证据引用；不能只验证分数范围 |
| 4 | 把已校验结果投影为 RestoreStepEvaluation/v1，再交给 Harbor verifier 与 final reward 策略 | continue_gate 只控流程；unknown/N/A 保持原语义；用途资格仍由 Data Factory 原控制文件决定 |
| 5 | 以 ATIF 与 Harbor artifacts 接 D/I/F/T 过程 Judge，保持其与 Final E2E 分离 | 继续使用现有 rubric 和 process-judge.mjs；不以最终质量倒推过程评分 |
| 6 | 实跑授权 URL：生成、至少一次修复、独立判定、最终评估、导出及 verifier-only regrade | 保存真实通过/失败/未知结果；验证既有提前停止；不升级 POLA draft 或伪造 ready fixture |

执行依赖首先是**可调用且隔离的 Judge adapter 与模型认证通路**，不是再装一套数据协议。当前 verifier 为 no-network；远程 Judge 若放入该路径，必须先明确调整为仅模型 gateway 的 allowlist 并隔离凭据，不能假定现有无网络容器可以访问模型。本轮不改变网络或认证策略。版本/安装继续由 [依赖控制说明](../references/harbor/automation.md#依赖与安装边界)及对应 lock 管理，不另加观测平台或训练依赖。

工程回归覆盖请求投影、绑定错误、证据缺失、Judge 不可用/超时、不同顺序比较和 reward 投影；真实验收单列模型、浏览器、early stop 与 regrade。静态合成通过不能升级质量链路状态。
