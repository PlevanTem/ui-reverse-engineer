---
doc_id: RESTORE-DOCS
doc_version: "2.1.0"
doc_set: "restore-harbor-native-2026.11.07"
status: current
updated_at: "2026-11-07"
timezone: Asia/Shanghai
owner: project-maintainer
---

# 项目架构与评测入口

当前版本把 task、trial、multi-step、停止控制、verifier、reward、ATIF、dataset 和 regrade 迁移到 Harbor 0.25.0。Restore 只保留可复用领域工具。POLA 直接 URL 已实跑验证执行与数据链路，独立视觉质量仍 incomplete。真实验收范围、ATIF 版本与剩余限制统一见 [自动入口](../references/harbor/automation.md)。正式 ready-case 和提前停止仍未实跑。

发布基线：PR [#10](https://github.com/PlevanTem/ui-reverse-engineer/pull/10) 已合入 main（`2fcd05e`），包含此前 Harbor 迁移与 POLA 实跑修复。旧 PR [#9](https://github.com/PlevanTem/ui-reverse-engineer/pull/9) 的本地 run 方案已被替代，不应另行合并回现行架构。当前旧工作区的未提交状态不能用来判断远端是否已发布。

## 阅读路径

| 目的 | 唯一入口 |
| --- | --- |
| 系统边界和数据流 | [Harbor-native architecture](architecture.md) |
| 评测分层、停止与 regrade | [Harbor-native evaluation plan](evaluation-plan.md) |
| 下一阶段评估执行接线 | [实施顺序、依赖与验收](evaluation-plan.md#下一阶段harbor-接评估执行链) |
| 依赖与安装边界 | [版本与 lock 的控制来源](../references/harbor/automation.md#依赖与安装边界) |
| Restore 执行方法 | [Restore SOP](../references/restore.md) |
| 低层 Restore 工具 | [Restore interfaces](../references/restore/interfaces.md) |
| Loop Criteria | [criteria.md](../references/restore/criteria.md) |
| Final E2E | [evals/restore.md](../evals/restore.md) |
| D/I/F/T 过程 Judge | [evals/trajectory/README.md](../evals/trajectory/README.md) |
| Harbor Trial Data Factory | [data-factory/interfaces.md](../references/data-factory/interfaces.md) |
| 工程与静态验收 | [evals/README.md](../evals/README.md) |
| 变更事实 | [CHANGE_LOG.md](../CHANGE_LOG.md) |

## 历史图

[2026-11-03 OpenBoard 实施流程](diagrams/ui-restore-workflow-board-20261103.png)与[数据流](diagrams/ui-restore-dataflow-board-20261103.png)是历史设计快照，不是当前运行架构或验收证据。对应 manifest 和可编辑 snapshot 仍保留供追溯。

## 当前状态

| 项目 | 状态 |
| --- | --- |
| 固定 Harbor 0.25.0 独立 `uv` 环境 | implemented / locally installed |
| schema 1.4 multi-step task 生成 | implemented / live URL verified; see runtime acceptance |
| 原生 ATIF-v1.7/v1.8 validator 与 round-trip | implemented / fixture verified |
| separate verifier、resume、artifact transfer、regrade | POLA live URL verified |
| early stopping | `not_run` |
| ready case 真正 trial | `not_run`；当前全部 case 为 draft |
| Trial Package 与 DatasetSnapshot/v2 | implemented / live URL verified; see runtime acceptance |
| 独立视觉 Judge → grader → reward 执行接线 | planned；当前 verifier 只做结构校验 |
| SFT/RL 执行 | out of scope |
