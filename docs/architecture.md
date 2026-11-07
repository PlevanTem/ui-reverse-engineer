# Harbor-native architecture

Harbor 0.25.0 是唯一 task/trial harness。Restore 只保留合同、取证、比较、评分、报告和归档审计等领域工具，不再拥有完整 loop、checkpoint、Job 或 trajectory transport。

```mermaid
flowchart LR
  A[ready case / URL] --> B[Task compiler]
  B --> C[Harbor trial]
  C --> D[prepare / baseline / iteration]
  D --> E[Bound artifacts]
  E --> F[Separate verifier]
  F -->|continue_gate| C
  C --> G[Native ATIF]
  E --> H[Trial Package]
  G --> H
  H --> I[DatasetSnapshot]
  E -. 待接入 .-> J[Independent Judge runner]
  J -.-> K[Loop / Final E2E grader]
  K -.-> F
```

## Ownership

| Owner | Owns | Does not own |
| --- | --- | --- |
| Harbor | task、trial、multi-step、Agent session、early stop、separate verifier、artifacts、ATIF、regrade | Restore 评分含义、case 生命周期 |
| Restore domain tools | 合同/fixture 校验、capture、snapshot/hash/diff、既有 assessment/pairwise/grader/report 能力、archive/scratch audit | task/trial 生命周期、自动续跑、轨迹传输；历史工具仍依赖 run.json，不能假定已接上新 worker |
| Case Manager | `draft → ready → retired` 和 `cases.yaml` | 自动把 URL 写成正式 case |
| Data Factory | Harbor trial → Trial Package → Snapshot，资格/隔离/去重/分组切分 | 训练执行、模型注册、部署 |

## Task contract

- `task.toml` schema 1.4。
- `ordinary/refined/complex` 分别声明 3/6/9 个 iteration step。
- verifier 使用 `environment_mode = "separate"` 且无网络。
- Agent 与环境使用固定 digest 镜像；网络只允许目标 host 与 fixture manifest 声明的 host。
- `/home/pwuser/restore-run` 声明为 artifact，并按原路径提供给独立 verifier。
- `min_reward = { continue_gate = 1 }` 只控制是否执行下一 step。
- `multi_step_reward_strategy = "final"` 只采用最后实际执行 step 的正式质量评分。
- launcher 生成精简 runtime Skill 并通过 Harbor `--skill RUNTIME_SKILL` 注入；job lock 记录 Skill digest 和可用的 Git commit，不复制到 task。
- 启动前对所选 Agent 做 capability preflight；本项目要求 `atif=true`、`resume=true`、`skills=true`，否则失败关闭。

最终质量字段只有 `restore_layout`、`restore_style`、`restore_content`、`restore_interaction`、`restore_robustness`、`restore_total`、`restore_redline_pass`。缺证据时 trial/包保持 incomplete，不补零。

## Evaluation execution boundary

实线是当前执行与数据路径；虚线是下一阶段。现有 [`verifier.mjs`](../scripts/harbor/verifier.mjs) 在隔离容器中读取 step evaluation，验证结构、停止字段和 reward 范围，不会调用视觉 Judge，也不会重新推导其独立性或完整证据绑定。隔离执行不等于独立视觉评估已接通。

[`grader.mjs`](../evals/pipeline/grader.mjs) 已能校验独立评估结果；[`process-judge.mjs`](../scripts/harbor/process-judge.mjs) 已能构造/校验 D/I/F/T 输入输出。它们不包含完整的 Harbor Judge 执行接线。下一步复用这些领域能力，不恢复本地 coordinator；顺序、依赖和验收只维护在 [评估执行链计划](evaluation-plan.md#下一阶段harbor-接评估执行链)。工具版本与安装边界见 [依赖](../references/harbor/automation.md#依赖与安装边界)。

## Input routes

```text
ready case → 验证 status/fixture/evidence/image digest → 编译正式 task
URL        → 创建 exploratory task → prepare 冻结合同 → 不写 cases.yaml
no URL     → 停止并要求 URL
```

正式 case 还必须有 `evals/fixtures/<case-id>/manifest.json`、冻结证据、视口/状态、资源 SHA-256 和固定镜像 digest。当前所有 case 仍是 draft。

## Runtime boundary

POLA 直接 URL 已实跑验证执行与数据链路，独立视觉质量仍 incomplete。真实验收范围、ATIF 版本与剩余限制统一见 [自动入口](../references/harbor/automation.md)。正式 ready-case 和提前停止仍未实跑。
