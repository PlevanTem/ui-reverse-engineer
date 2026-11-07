# Harbor Trial Data Factory

Episode 的 `task.description` 从冻结 `contract.task_description` 校验后投影，`task.contract_sha256` 记录源合同文件哈希。它不单独生成场景或改写任务；旧合同缺少叙述时保持 null。

本接口只把 Harbor trial 整理为可审计的数据候选，不执行 SFT、RL、模型注册或部署。Harbor 的 原生 ATIF-v1.7/v1.8 是唯一轨迹主数据；Restore 的 `AgentEpisode/v1` 与 `AgentStep/v1` 只是治理 sidecar，不能补造缺失轨迹。

```text
Harbor task + trial
  ├─ agent/trajectory.json (原生 ATIF-v1.7/v1.8)
  ├─ verifier/reward.json
  └─ artifacts/restore-run/**
          │
          ▼
export-trial.mjs → Trial Package → build-snapshot.mjs → DatasetSnapshot/v2
```

## Trial Package

```powershell
node scripts/data-factory/export-trial.mjs HARBOR_TRIAL NEW_PACKAGE
```

输入必须包含 Harbor 的 `result.json`、`lock.json`、`config.json` 及各已执行 step。导出器用固定 Harbor 环境的官方 validator 检查每个 `agent/trajectory.json`，核对一个 trial 内的 `session_id`，去除私有推理字段并遮蔽凭据。ATIF 缺失或非法时保留产物，但关闭 trajectory、SFT、Preference 和 RL 资格；不会从 Restore ledger 合成伪轨迹。

输出：

```text
package/
  manifest.json
  trajectories/index.json
  trajectories/<step>/trajectory.json
  episode.json
  steps.jsonl
  rewards/<step>.json
  artifacts.index.jsonl
```

`manifest.json` 记录 Harbor trial/task/job、task digest、Skill lock、ATIF 状态、source policy、隐私处理、覆盖范围及逐用途资格。多 step 文件必须保持同一 `session_id`。原生 Codex v1.7 可缺少可选的 `trajectory_id` 和 `continued_trajectory_ref`；索引按 Harbor 实际 step 顺序关联，不补造这些原生字段。存在显式续接引用时必须核对目标。每步还须包含本步 Restore instruction；重复导出前一步的旧轨迹不能充当本步覆盖。

恢复会话带来的逐条完全相同前缀，在规范副本中标记 `is_copied_context=true`，并记录可解析的前序轨迹身份（原生 ID，缺失时用原文件 SHA-256）、step_id、精确内容摘要和原 ATIF 摘要。只认内容精确匹配，不做语义去重。原生文件保持不变；规范副本再次通过官方 validator，训练视图过滤这些重复上下文。媒体复制到规范轨迹旁，索引保存媒体与规范 ATIF 的字节哈希。

正式 reward 仅来自最后实际执行 step，且必须同时包含以下 `0–1` 数值：

```text
restore_layout
restore_style
restore_content
restore_interaction
restore_robustness
restore_total
restore_redline_pass
```

任一值为 `unknown`、缺失、越界或绑定不完整时，正式 reward 不成立。不得用零补缺失值。`continue_gate` 只控制 Harbor step，不进入质量均值。

## Snapshot

```powershell
node scripts/data-factory/build-snapshot.mjs NEW_SNAPSHOT PACKAGE... --dataset-id DATASET_ID
```

Snapshot 在导入前校验 sidecar、规范 ATIF 和媒体字节摘要，按 Episode fingerprint 精确去重；同一 episode 的不同包版本冲突时拒绝导入，要求调用方明确选定版本，不能重复计数。用 `case_id`，缺失时用 `task_name`，做稳定的 80/10/10 分组切分。输出中性 `trajectory`、`sft`、`preference` 和 `rl` 视图，以及 `quarantine.jsonl`。同一 case/任务不会跨 split。

用途资格是独立门禁：

| 条件 | 影响 |
| --- | --- |
| ATIF 缺失或非法 | 四种训练候选全部关闭 |
| `source_reuse=allowed` | 四种训练候选全部关闭 |
| 私有推理被移除或凭据需遮蔽 | 四种训练候选全部关闭，保留审计包 |
| 无决定性的独立 pairwise 证据 | Preference 关闭 |
| 正式最终 reward 不完整 | SFT、Preference、RL 关闭 |
| 失败、超时或缺 verifier | SFT、Preference、RL 关闭，合法轨迹可供审计 |
| 复制上下文 | 在规范副本标注来源，从训练视图过滤；原生 ATIF 不变 |

这些视图只是后处理候选，不代表适合某个模型、损失函数或训练目标。

## 唯一控制文件

- Trial Package：[`trial-data-manifest.schema.json`](trial-data-manifest.schema.json)
- Episode：[`agent-episode.schema.json`](agent-episode.schema.json)
- Step：[`agent-step.schema.json`](agent-step.schema.json)
- Snapshot：[`dataset-snapshot.schema.json`](dataset-snapshot.schema.json)
- ATIF：Harbor 0.25.0 内置 原生 ATIF-v1.7/v1.8 Pydantic model 与 validator

真实 URL trial、续接、导出与 regrade 的验收范围统一见 [automation.md](../harbor/automation.md)；执行链路与独立视觉质量验收分别记录。
