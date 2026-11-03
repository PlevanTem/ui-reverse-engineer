---
doc_id: RESTORE-EVALUATION-PLAN
doc_version: "1.0.0"
doc_set: "restore-vnext-codex-2026.11.03"
status: current-with-pending-acceptance
created_at: "2026-11-03"
updated_at: "2026-11-03"
evidence_as_of: "2026-11-03"
timezone: Asia/Shanghai
owner: project-maintainer
implementation_ref: d6e3b03202c66069cd0ff33fa0d58d0d3fef468c
review_baseline: d410f11f18a7fbcf253db1a912d717c6d327d08a
iteration_items: [IT-03, IT-04, IT-05, IT-06]
---

# 当前 Codex 评测方案与验收路线

本文组织已有评测的关系、输入证据、验证状态与下一步实验，供长期迭代和项目审阅。评分锚点、阈值、字段和命令仍由链接的控制文件维护，不另设总分或 reward。当前工程链路可用；原生自动续跑、真实新增开发 E2E、Judge 校准与新任务提效分别验收。

## 评测分层与控制来源

| 层次 | 核心问题 | 当前入口/证据 | 唯一控制来源 |
| --- | --- | --- | --- |
| 工程与准备 | harness 是否正确、输入是否齐备 | engineering / preparation；回归、Schema、规格/缓存 | [工程检查](../evals/README.md#统一工程检查)、[评估接口](../references/evaluation/interfaces.md) |
| 开发效果 | 当前候选哪里需要修复 | Loop 测量/验证/决策，匹配状态的视觉/行为/音频；按需 development_e2e | [Loop Criteria](../references/restore/criteria.md)、[grader 定义](../evals/restore.md) |
| 过程轨迹 | 依赖了什么、是否有效迭代/遵循指令/忠于证据 | 公开主/子会话 → 按维证据 → 外部 Codex Judge | [轨迹评测与 rubric](../evals/trajectory/README.md)、[轨迹接口](../references/trajectory/interfaces.md) |
| 独立最终验收 | 网站目标是否达成、升级是否更好 | 冻结候选、独立五维 E2E/红线、公平新任务对照 | [最终 E2E](../evals/restore.md)、[升级验收协议](../evals/vnext-acceptance.md) |

开发反馈可以指导修复，被反复查看的样例归开发数据；独立评审上下文与留出集是不同边界。留出详情不进入当前实现者的反馈循环。工程绿色、Job completed、HTTP 成功或轨迹增多，均不能推出网站质量通过。

## 数据链与评测单元

[当前全览图](diagrams/codex-evaluation-loop.svg)对应以下关系：

```text
网站 Task / Restore run / Codex 主会话与关联子会话
  → Checkpoint：产物、合同、环境、实现、配置与公开轨迹窗口
  → Suite / Job：依赖、累计预算、执行状态
  → 原评估器结果：结论、证据、unknown 与覆盖
  → 当前目标反馈 + 独立 Langfuse 交付回执
```

实际字段由 [config Schema](../references/evaluation/config.schema.json)、[records Schema](../references/evaluation/records.schema.json)与[接口](../references/evaluation/interfaces.md)控制。网站任务、开发检查点、完整过程评分和独立验收不是同一个评测单元。

检查点结果只描述当前开发窗口；完整任务轨迹仍走既有结束后评估。轻量信号唤起 worker，status 核对目标后提供反馈，现有 Task 控制有界续跑。显式 CLI 已实测，不能据此推导 Desktop 已接管全部生命周期。

## 四维 Judge 的证据视角

| 维度 | 主要证据 | 需要区分 |
| --- | --- | --- |
| D 设计独立性 | 来源访问、公开设计决策、生成文件、实现/素材披露 | 独立实现、部分参考、核心运行时复用；允许读源码与原创程度不同 |
| I 迭代质效 | 候选、测量、验证、keep/revert 决策、真实失败与恢复 | 可核验改进与同因重试；轮次增多不自动有效 |
| F 指令遵循 | 当时公开用户要求、有效约束、可审计委派与行动 | 指令上下文缺失与真实违反；合同不能替代未采集要求 |
| T 事实性 | 声明、当时已有结果、版本/产物绑定与引用 | 同期支持与事后诊断；旧版本证据与新版本结论 |

具体指标、锚点、聚合与 unknown 处理以[轨迹评测](../evals/trajectory/README.md)及其 rubric 为准。v2 仍为 experimental，calibration=unmeasured。结构测试通过不能证明模型可靠。

输入先 inspect，记录来源、截取/未选范围、时间窗与缺口。运行账本只补充事实，不冒充完整工具轨迹；公开摘要不冒充隐藏思维；缺失指令/委派不补造。unknown、N/A、数字分与覆盖分开呈现；后来的 Final E2E 不倒灌过程判断。

## Langfuse 与本地证据

本地冻结证据、结果与回执用于复核；Langfuse 关联执行、判断和评分。检查点 observations 使用 restore.codex-checkpoint.*，API Scores 使用 restore.checkpoint.*；完整过程保留原生 EVAL 路径。按实际 source/命名空间记录，不混成完整任务 reward。

确认绑定目的地、payload 与结果摘要；不确定写入先查询，已确认回执可复用。交付恢复不是重新评估，也不表示实时重查了旧记录。自动交付当前覆盖 completed Job；失败/uncertain 详细诊断留本地，具体见[接口](../references/evaluation/interfaces.md#langfuse)。

## 已验证快照与限制

下表为 evidence_as_of、implementation_ref 所指历史实测摘要。本次文档整理读取了既有回执/日志，没有重新执行完整回归、网站生成或语义 Judge。

| 项目 | 已观察结果 | 能支持什么 |
| --- | --- | --- |
| 全量工程回归 | 186/186，0 跳过；Case Manager 构建/打包与 4/4 | 当时工程回归通过，不是页面质量 |
| 数据契约 | 28 Schema、28 个真实配置/Checkpoint/Job/结果实例离线通过 | 结构符合契约，不证明语义真实 |
| Codex CLI 触发 | progress 启动后台 worker；status 进入当前工具上下文 | 显式绑定后的 CLI 可用，不是原生 hook 激活 |
| 历史版本验证 | 8 项 Job 与交付保留、绑定暂停；429 后查询恢复 | 版本重评与重复去重有记录，不是 8 次质量改进 |
| 最终单独验收 | 显式目录内 2 项 Job：工程 passed、准备 limited；未替换自动绑定 | 原会话额度未重置；最终 QA 不是新自动绑定激活 |
| 交付与去重 | 最终 2 observation / 2 个 source=API 状态评分回读一致；同目标再次执行 0 新增 | 检查点交付/去重可用，不是新增四维语义评分 |
| 原证据 | run、账本、合同、best 不变；归档完整、0 hash mismatch | Firewood 历史来源未被本轮重写 |
| 开发 E2E 接口 | 合成样例调用真实 grader，完成前可评且不写原 E2E | 接口/隔离已测，不是实际 Firewood 视觉/动态/声音验收 |
| 过程与升级收益 | 既有 F/T 有 unknown；本轮语义 Judge 调用 0；quality_improvement=null | 未测得还原度/提效；0 Judge 调用不等于维护过程零成本 |

本机原始证据在忽略目录 reverse_output/evaluation/firewood-codex-20261103/ 与 reverse_output/evaluation/firewood-codex-final-20261103/；后者包含 smoke-report.json、validation-drain.json、repeat-drain.json 及 results 内日志/回执。它们不随 Git 分发；他人只有仓库时可审阅本摘要及提交，不能声称已独立复核全部原始材料。私人轨迹、凭据、媒体与平台项目链接不写入本文。

## 如何判断下一版是否更好

口径和比较资格由[升级验收协议](../evals/vnext-acceptance.md)控制，执行顺序为：

1. 从 [cases.yaml](../evals/cases.yaml)选择、冻结可评测任务，完成正式输入/红线 profile/启动预检；草稿不充作正式样本。
2. 固定基线/新版代码、可见模型设置、环境、允许来源/资源、目标、评估器和累计预算，使用独立新执行上下文。新 worktree 本身不能消除历史生成、已见结果或对话上下文泄漏。
3. 分开开发反馈与留出审阅，保存真实失败、重试、unknown 和不可比较原因；Firewood 历史补采不直接当公平新对照。
4. 用同一方法独立测两臂的 E2E/红线/覆盖、完整任务耗时与可见成本，以及协议内的有效改进、提前停止/催促、恢复和反馈延迟。准备/评测/修复开销纳入成本，评审和实现记录分别归属。
5. 质量、效率分别报告；缺完整可比分母或独立结果则保留 unknown/null，不输出虚构提升百分比。
6. 跨网站家族重复配对后再讨论项目整体收益。人工标注/分歧分析用于校准；调试样例与未参与调试的验证样例分开。

## 后续迭代与验收顺序

| 项目 | 关联迭代 | 资源依赖 | 需要交付的证据 | 当前状态 |
| --- | --- | --- | --- | --- |
| NEXT-01 原生闭环激活 | IT-03 / IT-05 | 支持且已审阅信任的 Codex hooks、真实绑定任务 | 按原协议保存宿主实际调用、绑定会话续跑、预期阶段任务进展三类证据 | unverified |
| NEXT-02 真实开发 E2E | IT-02 / IT-05 | 独立 adapter、冻结合同/红线、浏览器与实际服务→产物绑定 | 匹配状态/输入序列的视觉/行为/音频证据、grader 结果、原 run 不变和反馈 | 待实测 |
| NEXT-03 校准与覆盖 | IT-04 / IT-05 | 公开指令/委派、声明配对、人工盲标与独立验证片段 | 按原方案给出可评分母、一致性/误差、unknown 识别与失败案例 | unmeasured |
| NEXT-04 新任务配对 | IT-01～IT-05 | 通过对应门禁的新任务、独立上下文/预算、不同网站家族 | 两臂完整结果、覆盖/红线、时间/成本归属、比较资格报告 | 未运行 |

这是依赖顺序，不承诺日期或预设提升比例。有新增实测才更新 evidence_as_of；文档版本、状态及 CHANGE_LOG 按实际变化更新。规则有变化先改其唯一来源，不通过修改摘要“提高分数”。

## 文档迭代记录

| 时间 | 文档版本 | 迭代项 | 变化 |
| --- | --- | --- | --- |
| 2026-11-03 | 1.0.0 | IT-03～IT-06 | 固化 Codex-only 评测分层、证据/交付关系、验证快照和后续验收；评分口径不变 |
