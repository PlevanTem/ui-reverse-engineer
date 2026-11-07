# Restore evaluation and engineering checks

本目录保存 case 生命周期、评分控制文件和静态验收。Harbor 是唯一 harness；合成检查通过不代表真实 trial 或网站质量通过。

## 控制源

| 内容 | 唯一控制文件 |
| --- | --- |
| case 生命周期 | [`cases.yaml`](cases.yaml) |
| 局部循环判断 | [`../references/restore/criteria.md`](../references/restore/criteria.md) |
| Final E2E 与红线 | [`restore.md`](restore.md) |
| D/I/F/T 过程评分 | [`trajectory/rubrics.json`](trajectory/rubrics.json) |
| Harbor step 评测结构 | [`../references/harbor/restore-step-evaluation.schema.json`](../references/harbor/restore-step-evaluation.schema.json) |
| ready fixture 结构 | [`../references/harbor/fixture-manifest.schema.json`](../references/harbor/fixture-manifest.schema.json) |
| 数据工厂 | [`../references/data-factory/interfaces.md`](../references/data-factory/interfaces.md) |

## Input routes and case lifecycle

`create-task.mjs` 处理直接 URL，创建一次性 exploratory task；它不会修改 `cases.yaml`。`compile-cases.mjs` 只编译 `status=ready` 且 fixture 完整的 case。没有 URL 时必须停止并要求 URL。

```text
draft --冻结 URL/证据/状态/视口/资源哈希/镜像 digest--> ready
ready --明确退役原因--> retired
retired --新版本重新取证，不改写旧事实--> draft or new case
```

当前所有 case 保持 draft。正式 case 还要求 `evals/fixtures/<case-id>/manifest.json`，缺一项即失败关闭。

## Commands

```powershell
uv sync --project tools/harbor --locked

node scripts/harbor/create-task.mjs --url https://example.com --tier ordinary --output NEW_DIR
# 只有用户预先明确允许时才可增加：--source-policy source_assisted
node scripts/harbor/compile-cases.mjs --output NEW_DIR
node scripts/harbor/preflight.mjs --agent codex

node scripts/check.mjs harbor --plan
node scripts/check.mjs harbor
```

`harbor` profile 执行：Harbor/Data Factory 回归、合成 multi-step task 的 `harbor lint --json --extend-select ALL`、dataset/ATIF Pydantic round-trip、官方 ATIF validator、Codex Agent 的 ATIF/resume/Skill capability preflight、全部 JSON Schema 语法检查，以及活动代码/现行文档的遗留 harness 扫描。它不启动 Docker、模型、浏览器、云 sandbox 或真实 trial。

未来具备 sandbox 后：

```powershell
uv run --project tools/harbor harbor run `
  -p TASK_OR_DATASET `
  -a codex `
  -m MODEL `
  --skill . `
  --resume-trajectory
```

必须先跑一个新建、授权且 `ready` 的 case，再验收浏览器环境、会话连续性、separate verifier、artifact transfer、early stopping 和 regrade。此前这些状态一律为 `not_run`。

## Acceptance rules

- ordinary/refined/complex 必须保持 3/6/9 轮。
- stop reason 只能是 `target_reached`、`plateau`、`cycle_detected`、`budget_exhausted`、`blocked`、`failed`。
- `continue_gate` 不进入质量聚合。
- unknown/N/A 不得变成 0。
- ATIF 缺失或非法时不得合成轨迹。
- `source_reuse=allowed`、私有推理、复制上下文不得进入训练候选。
- regrade 只重跑独立 verifier，不重跑 Agent。
- 历史变更只留在 `CHANGE_LOG.md`；现行接口不保留旧 harness 兼容层。
