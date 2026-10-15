# Restore v0.2 接口与命令

适用于实现者和工具接入者；日常用户先看 [还原指南](../restore-guide.md)。运行工具位于 `scripts/restore/`，系统评分器位于 `evals/pipeline/score-final.mjs`。Node 20+，仅浏览器采集需要宿主提供 Playwright。CLI 不自行安装依赖、不猜测模型 API。

## 五模块

| 模块 | 契约 | 决策 |
| --- | --- | --- |
| Criteria | `criteria.md` + 每页冻结 obligations | 什么算忠实 |
| Measure | `Capture/v0.2` + `LoopAssessment/v0.2` | 证据与绝对质量 |
| Verify | `IterationDecision/v0.2` | keep / revert / inconclusive |
| Controller | `run.json`、预算与追加式 `events.jsonl` | 下一步与停止原因 |
| Guardrails | 哈希、状态覆盖、证据引用、限时限轮 | 拒绝无效进步 |

## 最短运行链

```powershell
node scripts/restore/cli.mjs init reverse_output/example_20261014 https://example.com ordinary
# 编辑 run 内的 contract.json，保存参考证据到 evidence/；填写 observed_url、环境、状态、视觉 QA、启动命令、最终 E2E 版本。
node scripts/restore/cli.mjs freeze reverse_output/example_20261014
# 在 restored/ 生成可运行基线；由独立诊断器从 assessment-input 生成 LoopAssessment/v0.2。
node scripts/restore/cli.mjs assessment-input reverse_output/example_20261014 request.json
node scripts/restore/cli.mjs baseline reverse_output/example_20261014 baseline-assessment.json
node scripts/restore/cli.mjs begin reverse_output/example_20261014 hypothesis.json
# 修改 restored/，采集受影响状态和哨兵；独立绝对评委生成 candidate-assessment.json。
node scripts/restore/cli.mjs verify reverse_output/example_20261014 candidate-assessment.json pairwise-adapter.mjs
# verify 返回带 A/B 双顺序证据的 assessment 与 verification 路径：
node scripts/restore/cli.mjs record reverse_output/example_20261014 <verify-assessment.json> <verify-verification.json>
node scripts/restore/cli.mjs next reverse_output/example_20261014
# 停止后由独立 Eval 模块评最终版，缺少 Judge adapter 则如实返回 incomplete。
node scripts/restore/cli.mjs eval reverse_output/example_20261014 evals/pipeline/score-final.mjs judge-adapter.mjs
node scripts/restore/cli.mjs report reverse_output/example_20261014
```

额度限制、宿主故障或等待用户恢复造成的**外部暂停**，在取得宿主时间证据后用 `time-exclude RUN interval.json` 登记。输入含 `schema_version:"TimeExclusion/v0.2"`、`start_at`、`end_at`、`reason:quota_limit|user_wait|external_block`、`source`。控制器拒绝与既有运行事件重叠的区间；预算只扣除已证实的外部暂停。模型思考、工具调用和正常取证仍计执行时间。运行已停止时保留原停止事件，报告追加校正结论，不暗改历史，也不自动重开 Loop。

模型用量由宿主或模型 API 提供后，执行 `usage-record RUN token-usage.json`。输入遵循 [TokenUsage/v0.2 Schema](token-usage.schema.json)：`coverage:partial|complete`、`coverage_note`、`records[]`。每条 record 含唯一 `id`、`stage:restore_loop|finalization|supplemental_audit|other`、`agent`、`source_type:codex_session|model_api|manual`、可追溯的 `source_ref`、起止 `window`、`response_count` 和 `usage`。`usage` 的 `input_tokens` 包含 `cached_input_tokens`，`output_tokens` 包含 `reasoning_output_tokens`，`total_tokens=input_tokens+output_tokens`。不把缓存或推理字段重复加到总量；不以账户剩余额度反推单 run 用量。缺少可归属记录时报告显示 `unavailable`，部分来源时必须写 `partial` 和缺口。`report.json.token_usage` 保存汇总与逐来源记录，HTML 展示总量及分段。旧报告无此字段时按未知处理。

Codex 宿主可用 `node scripts/restore/extract-codex-usage.mjs manifest.json token-usage.json` 从指定的会话 JSONL、root turn 与时间窗口抽取 `token_usage_record`。manifest 使用 `CodexUsageExtraction/v0.2`，含 `coverage`、`coverage_note`、`sources:[{id,file,stage,agent,source_ref,root_turn_ids,start_at,end_at}]`。输入日志路径仅用于本机抽取，输出只保留线程引用；脚本按响应 ID 去重并拒绝重复跨段计数。抽取结果仍需 `usage-record` 固化为带哈希的 run 观察记录；补记用量会改变报告哈希，旧审批失效。

`next` 返回 `repair`、`verify`、`abort`、`final_e2e` 或 `report`。没有可用的独立评委时，可用 `eval-record` 输入经独立评分器产生的结果；否则执行 `eval` 并标记 `incomplete`。支持显式 `stop RUN blocked|failed 原因`。第 0 轮不计修复轮数；每次尝试含回退和待判都计一轮。`profile RUN TIER` 只可在 freeze 前调整一次；累积时间不重置。

## 证据与输入

- `contract.json`：记录 URL、浏览器环境、states、obligations、运行门禁、原站参考证据及其哈希。每个 state 有 `id/page_id/viewport_id/path/viewport/ready_selector/regions/steps/sentinel`。每项 obligation 对应有效区域、状态与 C1/C2/C3；C3 `not_applicable` 必须说明参考确无对应动态。
- 证据项：`{id,kind,uri,sha256}`，`uri` 为 run 内相对路径；支持 screenshot、sequence、video、checks、source。冻结后不得替换参考素材；改变任务契约需关联新 run 并保留原预算口径。
- `LoopAssessment/v0.2`：`binding` 必须等于 assessment request；`assessor:{role:'independent'|'implementer',id}`；`evidence`；`covered_states`；`units:[{obligation_id,status:'scored'|'unknown'|'not_applicable',score:0..4|null,reason,evidence:[id]}]`；`gates:[{id,status:'pass'|'fail'|'unknown',evidence:[id]}]`；`findings:[{id,obligation_id,severity:'blocking'|'obvious'|'minor',description,evidence:[id]}]`。基线另需 `stability:{status:'stable'|'variable',reason,evidence:[id]}`。
- `hypothesis.json`：`{issue_id,hypothesis,strategy,scope:'local'|'global',affected_states:[id],expected_change,preserve}`。每轮只处理一个偏差簇；复用同一失败假设触发停滞保护。
- `IterationDecision/v0.2`：`{schema_version,issue_id,binding,verifier:{role:'independent',id},evidence:[id],forward,reverse,visible_improvement,reason}`。前后两次比较均把结果归一为 `candidate / best / same / uncertain`；`forward=reverse=candidate` 且无关键回归才可 keep。

适配器协议：本地 Node 脚本从 stdin 读一份 JSON，从 stdout 只输出一份 JSON；诊断日志写 stderr。`measure RUN adapter.mjs output.json` 传 `LoopAssessmentRequest/v0.2`；`verify RUN assessment.json adapter.mjs` 对同一问题做 A/B 与 B/A 两次独立调用，返回的 `PairwiseVerdict/v0.2` 含 `binding/issue_id/choice:'A'|'B'|'same'|'uncertain'/assessor:{role:'independent',id}/reason/visible_improvement`，并生成交给 `record` 的两个文件；`eval RUN evals/pipeline/score-final.mjs judge.mjs` 传 `FinalEvalRequest/v0.2`。采集优先用已安装的 Python Playwright：`python scripts/restore/capture.py RUN reference|candidate BASE_URL output.json`；Node 环境已安装 Playwright 时也可用同目录 `capture.mjs`（若不在模块解析路径，设置 `RESTORE_PLAYWRIGHT_MODULE` 为其入口文件）。采集文件是证据，不能自动当作评分。原有 `compare-screens.py` 是局部诊断工具。

受限宿主若拒绝启动 Node 子进程，adapter 可改为导出 `async function evaluate(input,args)`，调用器自动转为同进程执行；此模式只能协作式限时，运行报告保留 `enforcement: cooperative`。适配器没有接通可用的视觉模型时必须返回未测或终止，不可生成占位分数。

参考采集后可将需要复用的已观察 URL、目标区域和视觉作用写入选择数组，调用 `node scripts/restore/collect-assets.mjs RUN reference-capture.json selection.json`。工具并发下载至内容哈希缓存并生成 `asset-map.json`，不可访问项保留原因。选择必须基于参考真实加载的资源；下载不会自动改写页面代码。

## 冻结与输出

- `run.json`：起始时间、档位、轮次、当前候选和最佳快照、停止记录、最终 E2E、token 用量及审批引用。
- `snapshots/`：按项目内容哈希保存候选；回退将工作目录移入 `discarded/`，保留失败实验。
- `observations/`：评估及验证原始 JSON；`events.jsonl`：追加式操作账本。运行文件在 `.gitignore` 中忽略，避免提交参考素材和用户项目。
- `report` 从以上事实源自动生成 T0–T4、`design_brief.md`、`report.json`、`report.html`。审批导出 JSON 后运行 `approve RUN approval.json`；批准仅在独立 E2E 无红线失败、分数达标时可用，未校准须人工复核。有条件批准必须记录条件。
- 旧 `evals/pipeline/` v0.1 命令保留兼容入口；旧试运行按原口径只读，不自动升级或补造 v0.2 结果。

## 预算与停止

| 档 | 总上限 | 修复轮数 | 最终检查预留 |
| --- | ---: | ---: | ---: |
| ordinary | 30 分钟 | 2 | 3 分钟 |
| refined | 60 分钟 | 3 | 6 分钟 |
| complex | 120 分钟 | 4 | 12 分钟 |

取证最多六分之一；首轮基线目标在总时间一半前。控制器在下一动作前检查剩余**有效执行时间**；报告同时保留墙钟跨度、已证实外部暂停和有效耗时。超时或达到轮次上限时交付最佳已有版本。`target_reached / plateau / cycle_detected / budget_exhausted / blocked / failed` 是 Loop 停止原因；`pass / fail / incomplete` 是 E2E 结果；审批状态单独记录。调用中强制停止依赖宿主的 deadline/cancel 支持，单纯 Skill 编排是协作式限时。
