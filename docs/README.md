---
doc_id: RESTORE-DOCS
doc_version: "2.0.0"
doc_set: "restore-harbor-native-2026.11.07"
status: current
updated_at: "2026-11-07"
timezone: Asia/Shanghai
owner: project-maintainer
---

# 项目架构与评测入口

当前版本把 task、trial、multi-step、停止控制、verifier、reward、ATIF、dataset 和 regrade 迁移到 Harbor 0.25.0。Restore 只保留可复用领域工具。当前没有 Docker、云 sandbox 或 ready case，运行验收为 `not_run`。

## 阅读路径

| 目的 | 唯一入口 |
| --- | --- |
| 系统边界和数据流 | [Harbor-native architecture](architecture.md) |
| 评测分层、停止与 regrade | [Harbor-native evaluation plan](evaluation-plan.md) |
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
| schema 1.4 multi-step task 生成 | implemented / synthetic only |
| ATIF-v1.8 validator 与 round-trip | implemented / fixture verified |
| separate verifier、resume、artifact transfer、early stop | `not_run` |
| ready case 真正 trial | `not_run`；当前全部 case 为 draft |
| Trial Package 与 DatasetSnapshot/v2 | implemented / synthetic only |
| SFT/RL 执行 | out of scope |
