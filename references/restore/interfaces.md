# Restore low-level interfaces

直接 URL 的自动推导、合同冻结、brief 投影与已授权登录统一见 [Harbor 自动入口](../harbor/automation.md)。叙述事实只存 contract.task_description；brief 与 Data Factory task 均从合同生成。

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

Harbor 自动入口注入锁定 Playwright SDK；独立使用 capture 的宿主仍须提供相应浏览器与依赖。CLI 不安装依赖、不调用模型、不拥有 Harbor trial 状态。

## Stable contracts

| Capability | Source of truth |
| --- | --- |
| 冻结合同与生成白名单 | [`validateContract`](../../scripts/restore/core.mjs)、[generation-input.schema.json](generation-input.schema.json)、[v2](generation-input-v2.schema.json) |
| Capture / sequence | [`capture.mjs`](../../scripts/restore/capture.mjs)、[capture-step.schema.json](capture-step.schema.json) |
| Loop assessment / Pairwise decision | [`criteria.md`](criteria.md)、领域模块的绑定检查 |
| Final E2E request/result | `final-eval-request.schema.json`、[`../../evals/restore.md`](../../evals/restore.md) |
| Report and evidence archive | `report.mjs`、`archive-audit.mjs`、`scratch-audit.mjs` |

证据文件按原始字节 SHA-256 绑定；结构化 JSON 引用按 canonical digest 绑定，两者不得混用。历史报告只读重放可以标记 degraded，但不能把漂移证据作为正向结论。

## Harbor boundary

每个 step 在 `/home/pwuser/restore-run` 写合同、项目、证据、评测和报告，并写 `evaluations/<step>.json`。Harbor 将该目录声明为 artifact，独立 verifier 只读取 artifact 与冻结 fixture。`continue_gate`、stop reason 和正式 reward 的唯一结构在 [`../harbor/restore-step-evaluation.schema.json`](../harbor/restore-step-evaluation.schema.json)。

Harbor worker 使用 `observe-url.mjs`、`seal-prepare.mjs` 与 `capture.mjs` 完成观察、合同冻结和声明状态采集，命令见 [runtime worker](../harbor/runtime-skill.md)。seal-prepare 不创建旧 run.json；capture 读取 contract-lock.json，仍由 Harbor 控制整体 deadline。

CLI 中 assessment-input、final-eval-input、report 保留为读取旧 run.json 的历史核查接口；pairwise-verify 还会写历史记录。它们不直接适用于新 Harbor worker，不能通过生成伪旧状态来补造运行或轨迹。新 trial 的结果来自 evaluations、verifier 和 Harbor result，正式质量缺失时保持 incomplete。

## 合同字段 restore/v0.2

本项目没有独立的 contract.schema.json，实际校验实现为上表的 validateContract。观察工具创建合同草稿，Agent 完善同一文件：

- 必需顶层：schema_version=`restore/v0.2`、requested_url、observed_url、start_command、environment、e2e_profile、generation_policy、states、obligations、runtime_gates、reference_evidence。environment 含 browser/os/dpr/locale；e2e_profile 含 rubric_version/scorer_version。
- generation_policy：mode=`fixture_only|source_assisted`、case_metadata_visibility=`id_only`、source_reuse=`forbidden|allowed`，策略与复用权限必须对应。技术栈和源码评测元数据不能进入合同。可选 case_source 只接受 case_id、dataset_sha256。
- task_description：title、scenario、user_intent、description、evidence_refs，结构见 [task-description.schema.json](task-description.schema.json)。user_intent 未知为 null，否则含 text 与 observed/inferred basis。叙述证据必须来自冻结截图/动态证据；brief 与 Data Factory task 只作投影。
- state：id/page_id/viewport_id/path、viewport={width,height}、ready_selector、regions、steps、sentinel；至少一个 sentinel。动作见 [capture-step.schema.json](capture-step.schema.json)，需要延续状态时显式指定共享 session，默认隔离。
- obligation：id、criterion_id=`C1|C2|C3`、state_id、region_id、expected、method、importance、required、target、applicability、reference_evidence；区域、状态、证据引用须有效。目标分与适用性按 [criteria.md](criteria.md) 校验。
- runtime_gate：id、description。reference_evidence：id、kind、uri、sha256，支持 screenshot/sequence/video/audio/checks/source；本地相对路径不可越界或通过 symlink 绕过。
- resources 保存允许生成使用的本地资源及哈希；unknowns 记录未观察状态、时序和资源缺口。轮数或滚轮输入次数不能证明终点。可选 [interactive_scene](interactive-scene.schema.json) 与 [optimization](optimization.schema.json) 保留状态、区域和资源绑定；优化合同生成 v2 输入，其余生成 v1。

不再提供 init/freeze/begin/next/continue、task lifecycle、checkpoint、delivery 或自动 trajectory worker 的 CLI 兼容入口。旧 run 只能作为历史证据读取；不得伪装成 Harbor trial 或 ATIF。
