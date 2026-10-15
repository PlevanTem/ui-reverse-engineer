# Restore Loop v0.1 历史审批报告契约

v0.2 报告由 [运行时接口](../../references/restore/interfaces.md) 从结构化记录生成；本文件保留旧 HTML 报告与审批兼容口径。

状态：0.1 试行模板。范围：**一个 case 的一次完整 `--restore` run**，可包含多页面、多视口、多状态和多轮修复。跨 case 的 Skill 版本决策继续使用[版本评测报告](../templates/report.md)与 [E2E spec](site-restore-v1.md)，不把单个还原审批等同于 Skill 版本 Go。

本文把[自迭代 PRD](../../references/restore-iteration-prd.md)的过程记录转成可统一审阅的报告输入。报告是生成产物，不是另一个评测器；评测义务和阈值必须在 fixture/run manifest 中先行冻结。

## 1. 文档过程与冻结点

| 时点 | 必须产生的记录 | 何时冻结/可改 |
| --- | --- | --- |
| T0 接收任务 | 用户输入、requested/observed URL、目标页面/状态/视口、环境、排除范围 | 首次 baseline 前冻结；变更升 fixture 版本 |
| T1 取证 | 参考截图/动作/资源与源码线索、来源、时间、哈希、覆盖和未知项 | baseline 前保存；新增发现可追加，不覆盖历史记录 |
| T2 基线 | 首次 `restored/` 快照、启动方式、状态覆盖、红线、诊断指标 | 每个 run 必须有第 0 轮；原始数据只读 |
| T3 每轮循环 | 假设、目标偏差、候选快照、前后指标、回归、证据、keep/revert/inconclusive | 每轮追加记录；回退不删除失败实验 |
| T4 结束 | 最终产物、全部适用状态复测、残差/未知、停止原因、评委可信度 | 形成待审报告；审批时不得再悄悄改项目或参考 |
| T5 审批 | 决策、审阅者、理由、条件、时间、报告摘要哈希 | 独立 JSON；改报告后摘要变化，旧审批失效 |

每一条 `pass/fail/unknown/not_applicable` 附证据位置。`unknown` 和 `not_requested` 不得转换为通过；被拒绝或回退的轮次仍列入时间线。过程文档可分为 run manifest、每轮原始记录与最终 HTML，HTML 负责索引和审批，不复制庞大的浏览器 trace。

## 2. 报告数据最小结构

机器输入为 `restore-loop-report/v0.1` JSON，字段见[报告 JSON Schema](../templates/restore-loop-report.schema.json)和[示例数据](../templates/examples/restore-loop-report.sample.json)；审批记录另有[审批 Schema](../templates/restore-loop-approval.schema.json)。必填顶层：`schema_version`、`report_id`、`run`、`input`、`output`、`quality`、`iterations`、`process_docs`。原则如下：

- `run`：run/case/fixture/Skill/评分器版本，采集环境、报告日期、停止原因，关联 manifest 哈希。
- `input`：原始任务、实际落地页、目标页面/状态/视口、设计约束、验收条件、排除范围、已证实技术栈、参考证据与资源、未知/阻塞项。保留 requested 与 observed URL。
- `output`：可运行项目路径、入口/启动命令、快照或提交标识、实现覆盖、技术选择及重要替代/差异。
- `quality.redlines`：每条红线的 `id/status/evidence`；`quality.metrics`：静态、动态、个性化/响应式、运行/E2E 的 `baseline/final/delta/unit/method/coverage/confidence/evidence`。`delta = final - baseline`；任一端缺测时 delta 也为 `null`，不能写 0。改善方向由指标定义决定，不只看正负号。
- `quality.judge`：未校准/已校准/人工复核状态、样本量、κ、顺序偏差等；没有结果则显式 `unmeasured`。
- `quality.rubric_scores`：可选的六维 0–4 E2E 分、权重、评分者、置信、理由和证据；总分由维度分计算。实现者自评须标明 `implementer-provisional`，不能替代盲评校准或跨方案版本结论。
- `iterations`：从 0 轮基线到每一轮候选的假设、改动引用、前后摘要、回归、证据与决策；时间顺序和轮次 ID 唯一。
- `process_docs`：T0–T4 文档的阶段、标题、相对路径、完成状态、摘要、更新时间和 SHA-256；汇编器从 `docs/index.json` 与真实文件计算哈希，渲染时复验。
- `quality.comparisons`：按冻结状态与视口成对索引参考图、候选图和可选差异图；图像在 HTML 中并列呈现，视觉差异数字仍为诊断证据。
- `residuals`：剩余问题、未知、不可复现状态和其风险；`evidence_index`：报告中引用的证据 ID、类型、相对路径或安全 URL、哈希、完整性。

报告页面必须区分**输入事实、输出实现、测量结果、过程决策和最终审批**，不得在一个“综合分”中混写。指标的分子/分母与适用场景依[运行契约](restore-loop-contract-v0.1.md)；现有 0–4 E2E 维度分可以展示，但不能用诊断指标取代版本评分。

## 3. 审批规则

审批状态：`pending`、`go`、`conditional_go`、`no_go`。报告同时显示机器门禁和人工决策，审阅者可填写理由和条件；条件 Go 必须填写明确的后续条件。正向审批要求 T0–T4 文档完整且哈希匹配，fixture、manifest、最终产物具有有效 SHA-256，至少有一条带有效哈希的参考证据，适用红线均通过、指标非缺测，红线/指标/迭代所引证据能在索引中找到。Judge 未校准时，审批 JSON 必须有 `manual_reviewed: true`，由审阅者在页面勾选确认。观察到的严重红线失败或待判红线，不能在模板中选择 Go；未校准的视觉评委结果不能被标为已证实的质量结论。机器门禁只判断材料完整性和显式状态，不替审阅者作质量判断。

静态 HTML 的“导出审批记录”只生成本地 JSON，**不验证审阅者身份，也不写回服务器**。正式生效由既有项目审批/归档流程接收该 JSON；用渲染器的 `--approval` 参数重新生成已记录审批的 HTML。审批 JSON 包含 `run_id`、`case_id`、规范化报告 JSON 的 `report_sha256`、HTML 模板的 `template_sha256`、决策、审阅者、日期、理由与条件。渲染器校验两个哈希绑定；数据或模板变化后必须重新审批。用户能在一个页面审阅完整证据并记录决定，但本模板不冒充电子签名系统。

## 4. 产物与命令

```text
evals/templates/restore-loop-report.html                 # 自包含 HTML 页面模板
evals/templates/restore-loop-report.schema.json          # 报告输入结构
evals/templates/restore-loop-approval.schema.json        # 审批导出结构
evals/templates/examples/restore-loop-report.sample.json # 标明演示、非真实评测的输入
evals/pipeline/init-restore-run.mjs                     # 建立 run 和 T0–T4 骨架
evals/pipeline/compare-screens.py                       # 配对截图诊断
evals/pipeline/build-restore-report.mjs                 # 文件哈希 + 汇编
evals/pipeline/render-restore-report.mjs                  # JSON → 自包含 HTML
results/<run_id>/<case_id>/report.json                    # 真实运行的结构化输入
results/<run_id>/<case_id>/report.html                    # 待审或已审页面
results/<run_id>/<case_id>/approval.json                  # 独立审批记录
```

在仓库根目录运行：

```powershell
node evals/pipeline/init-restore-run.mjs evals/results/<run_id>/<case_id> <UIR-0000> <url>
python evals/pipeline/compare-screens.py <reference.png> <candidate.png> --json <score.json> --diff <diff.png>
node evals/pipeline/build-restore-report.mjs evals/results/<run_id>/<case_id>
node evals/pipeline/render-restore-report.mjs <report.json> <report.html>
node evals/pipeline/render-restore-report.mjs <report.json> <approved.html> --approval <approval.json>
```

报告汇编器只消费已有数据并计算文件哈希，不自动采集网站、调用模型或给出新的质量分。HTML 的样式和审批交互脚本内联；配对截图以相对路径嵌入展示，trace 与项目产物仍由证据索引链接。若单独移动 HTML 而不携带 evidence 目录，配对图将不可见。真实证据/项目产物的授权和保管沿用[评测目录规则](../README.md)；示例输入不得被当作评测结果。

## 5. 审批前完整性清单

1. 输入范围与参考证据可定位，实际落地页和取证缺口清楚。
2. 最终项目可启动，页面/状态/视口覆盖与差异列明。
3. 基线及每轮的 keep/revert/inconclusive 均有前后依据；回归未被隐藏。
4. 红线、关键指标、评分器校准状态与残差各自可见；缺测没有被填成零或通过。
5. 审批决定绑定本次报告摘要，条件和未解决事项有处理人或后续动作。

这是**审批报告的输入/呈现契约**。UIR-0006 已完成一条人工编排的源码辅助试运行，覆盖三种状态和一轮针对图标的修复；尚未实现无人值守取证、修复控制器、经校准的 Judge 或跨 case 版本评分。下一步需用异质动态 case 检查字段是否足以解释决策，再冻结 v1 结构。
