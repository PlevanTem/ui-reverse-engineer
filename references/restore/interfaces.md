# Restore low-level interfaces

Harbor 0.25.0 拥有 task、trial、multi-step、停止、verifier、reward、ATIF 和 regrade。Restore CLI 不再驱动完整 loop；它只提供 Harbor step 可调用的稳定领域工具。

## CLI

```powershell
node scripts/restore/cli.mjs contract-validate RUN
node scripts/restore/cli.mjs artifact-hash PATH
node scripts/restore/cli.mjs artifact-diff RUN BEFORE_SNAPSHOT_SHA AFTER_SNAPSHOT_SHA [output.json]
node scripts/restore/cli.mjs assessment-input RUN [output.json]
node scripts/restore/cli.mjs pairwise-verify RUN candidate-assessment.json pairwise-adapter.mjs
node scripts/restore/cli.mjs final-eval-input RUN [output.json]
node scripts/restore/cli.mjs report RUN
```

采集、归档审计和 scratch 审计继续使用各自脚本：

```powershell
node scripts/restore/archive-audit.mjs RUN
node scripts/restore/scratch-audit.mjs RUN
```

浏览器 capture 使用现有 Node/Python 入口，依赖必须由宿主显式提供。CLI 不安装依赖、不调用模型、不拥有 Harbor trial 状态。

## Stable contracts

| Capability | Source of truth |
| --- | --- |
| 冻结合同与生成白名单 | `contract.schema.json`、`generation-input.schema.json` |
| Capture / sequence | `capture.schema.json`、`capture-sequence.schema.json` |
| Loop assessment | `assessment.schema.json` 与 [`criteria.md`](criteria.md) |
| Pairwise decision | `pairwise.schema.json` |
| Final E2E request/result | `final-eval-request.schema.json`、[`../../evals/restore.md`](../../evals/restore.md) |
| Report and evidence archive | `report.mjs`、`archive-audit.mjs`、`scratch-audit.mjs` |

证据文件按原始字节 SHA-256 绑定；结构化 JSON 引用按 canonical digest 绑定，两者不得混用。历史报告只读重放可以标记 degraded，但不能把漂移证据作为正向结论。

## Harbor boundary

每个 step 在 `/workspace/restore-run` 写合同、项目、证据、评测和报告，并写 `evaluations/<step>.json`。Harbor 将该目录声明为 artifact，独立 verifier 只读取 artifact 与冻结 fixture。`continue_gate`、stop reason 和正式 reward 的唯一结构在 [`../harbor/restore-step-evaluation.schema.json`](../harbor/restore-step-evaluation.schema.json)。

不再提供 init/freeze/begin/next/continue、task lifecycle、checkpoint、delivery 或自动 trajectory worker 的 CLI 兼容入口。旧 run 只能作为历史证据读取；不得伪装成 Harbor trial 或 ATIF。
