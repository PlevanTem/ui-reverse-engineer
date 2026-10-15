# E2E Grader

本目录只保留跨 case / 方案评测使用的最终六维评测 grader [`grader.mjs`](grader.mjs)。单次 Restore 的运行控制、诊断、报告和审批由 [`scripts/restore/`](../../scripts/restore/) 负责；字段与流向见 [Restore v0.2 接口](../../references/restore/interfaces.md)。

grader 通过标准输入接收 [`FinalEvalRequest/v0.2`](../../references/restore/final-eval-request.schema.json)，输出 `E2EResultRef/v0.2`。Rubric v1.1-draft 的 request 必须包含 [`RedlineProfile/v1`](../../references/restore/redline-profile.schema.json)。grader 不读取 Loop 自评分，不执行页面采集或修复，也不生成单次运行报告。红线采用 `E2ERedlineAssessment/v1` 字段；grader 校验适用性、状态、S0–S3 严重度、影响类别、状态/区域范围和证据引用的一致性。它校验评测者提交的判断是否自洽，不根据截图自动判定 UI 语义。宿主未提供独立 Judge 时，结果保持 `incomplete`。

对于 `interaction` 和 `robustness`，evaluator 可以在浏览器中使用 browse control 直接操作最终交付页面，包括点击交互控件、改变输入值、观察可见反馈，以及检查不同视口。应记录操作步骤、视口、可见结果和限制；未检查的控制台、资源或其他状态仍须标为未检查。

评分结果本身不等同于完整评测审计记录。调用方保留 Judge 提供方、可核验模型名、评测起止时间/时区、Rubric/Scorer 版本、环境、产物及契约哈希、校准状态和局限；不记录评委角色或标识。最终产物的 E2E 结果是报告和审批的唯一 E2E 口径；哈希绑定的 [`PostRunE2EReview/v1`](../../references/restore/post-run-e2e-review.schema.json) 存在时，它覆盖 `run.json.e2e` 在最终结果视图中的展示，但不改写原始运行记录。

```powershell
node scripts/restore/cli.mjs eval <run-directory> evals/pipeline/grader.mjs <judge-adapter.mjs>
```

具体红线触发条件、影响类别、严重度映射和 status 决策见 [UI 红线评测规格](../specs/site-restore-v1.md#红线严重度与判定算法)及 [`E2ERedlineAssessment/v1`](../../references/restore/e2e-redline.schema.json)。旧评测记录未带严重度字段，保留为历史结果；不得由新 grader 静默推断或改分。

v0.1 单次报告渲染器、Schema、演示输入和命令别名已退役。既有 v0.1 `report.html` 是可独立阅读的历史产物，不再由当前项目重新渲染或升级。
