# Harbor Trial Data Factory

本接口只把 Harbor trial 整理为可审计的数据候选，不执行 SFT、RL、模型注册或部署。Harbor 的 ATIF-v1.8 是唯一轨迹主数据；Restore 的 `AgentEpisode/v1` 与 `AgentStep/v1` 只是治理 sidecar，不能补造缺失轨迹。

```text
Harbor task + trial
  ├─ agent/trajectory.json (ATIF-v1.8)
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

`manifest.json` 记录 Harbor trial/task/job、task digest、Skill lock、ATIF 状态、source policy、隐私处理、覆盖范围及逐用途资格。多 step 文件必须保持同一 `session_id`，前一文件用 `continued_trajectory_ref` 指向后一文件。`is_copied_context=true` 还必须携带可解析的前序 `trajectory_id`、`step_id` 和精确内容摘要；消息保留在规范 ATIF 副本中以便审计，但训练视图必须过滤。

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

Snapshot 在导入前校验包内摘要，按 Episode fingerprint 精确去重，并用 `case_id`，缺失时用 `task_name`，做稳定的 80/10/10 分组切分。输出中性 `trajectory`、`sft`、`preference` 和 `rl` 视图，以及 `quarantine.jsonl`。同一 case/任务不会跨 split。

用途资格是独立门禁：

| 条件 | 影响 |
| --- | --- |
| ATIF 缺失或非法 | 四种训练候选全部关闭 |
| `source_reuse=allowed` | 四种训练候选全部关闭 |
| 私有推理被移除或凭据需遮蔽 | 四种训练候选全部关闭，保留审计包 |
| 无决定性的独立 pairwise 证据 | Preference 关闭 |
| 正式最终 reward 不完整 | RL 关闭 |
| 复制上下文 | 从训练视图过滤，不改写规范 ATIF |

这些视图只是后处理候选，不代表适合某个模型、损失函数或训练目标。

## 唯一控制文件

- Trial Package：[`trial-data-manifest.schema.json`](trial-data-manifest.schema.json)
- Episode：[`agent-episode.schema.json`](agent-episode.schema.json)
- Step：[`agent-step.schema.json`](agent-step.schema.json)
- Snapshot：[`dataset-snapshot.schema.json`](dataset-snapshot.schema.json)
- ATIF：Harbor 0.25.0 内置 ATIF-v1.8 Pydantic model 与 validator

当前迁移只完成静态结构与合成数据验证。真实 Harbor trial、浏览器环境、会话续接、separate verifier、artifact transfer 和 early stopping 均为 `not_run`。
