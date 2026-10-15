# 页面还原评测

新 restore 运行控制、视觉自检和单次 HTML 报告位于 [`scripts/restore/`](../scripts/restore/)，运行规范见 [Restore v0.2](../references/restore-v0.2.md)。本目录的六维 E2E Rubric 和 [独立评分器](pipeline/score-final.mjs)负责最终产物验收与跨 case 比较；`evals/pipeline/` 原有 v0.1 单次 run 命令为历史兼容入口。三类 Loop 评分不换算为六维 E2E 分数。

本目录当前聚焦 `--restore` 交付的可运行网站项目在指定页面与状态下的 E2E 还原质量；不评技能触发，也不评另外三种模式。方案中的样本规模、阈值和评分器标准均为待校准提案，未运行前不得填写成结果。

## 文件与目录

```text
evals/
├── README.md
├── cases.yaml                  # 7 个页面还原草稿案例；固定素材后再转为可评测
├── case-schema.json            # case 数据集 JSON Schema
├── specs/site-restore-v1.md    # 评测范围、设计、通过线和限制
├── specs/restore-loop-contract-v0.1.md # 历史试点口径；新运行见 references/restore/
├── specs/restore-loop-report-v0.1.md # 历史单次报告与审批契约
├── rubrics/site-restore-v1.md  # 分维度评分锚点和错误 taxonomy
├── templates/report.md         # 单轮/版本评测报告模板
├── templates/restore-loop-report.html # 单次还原的离线 HTML 审批模板
├── fixtures/                   # 授权、固定、可复用的输入素材
├── pipeline/                    # 独立六维 E2E 评分器、旧单 run 命令兼容入口；跨方案统计仍待实现
├── case-manager/                # 本地 Case 管理工具
└── results/<run_id>/            # manifest、评分明细、检查和报告
```

## 运行约定

1. 使用同一冻结 case 输入和视口配对比较；报告记录 dataset 版本、fixture 哈希、Skill commit、模型/effort、客户端与浏览器版本。
2. 每组产物保存为独立可运行的 `restored/` 项目，记录启动命令或静态入口；评分者和 Judge 不得看到组名或实现身份。
3. 确定性门禁只判项目契约、可启动/加载性和可复现交互；视觉/语义维度按 Rubrics 评分并保留证据。实现可用单文件或多文件，不按文件数或框架评分。
4. Judge 未通过人工校准或偏差检查时，结果只能作为探索性数据。
5. results 中不得放凭据、私人参考材料或大型原始会话；敏感 run 只存本地，仓库仅保留脱敏摘要。

## 自动化管线规划

评测目标是自动处理固定产物的校验、截图、浏览器检查、评分输入、配对统计和报告生成。各方案的模型调用接入单独作为 adapter；只有在确认当前客户端/接口能控制 Harness、Plugin 和 Skill 注入后，才能把任务发起也纳入自动化。v0.2 已实现运行控制器、证据契约、可选浏览器采集器、独立六维评分接口和单次 HTML 报告；浏览器依赖与 Judge 需宿主接入，跨方案版本统计尚未实现。UIR-0006 历史试点继续使用 v0.1 口径。

按顺序参考：

- [方案 spec](specs/site-restore-v1.md)
- [Restore v0.2](../references/restore-v0.2.md)：运行时视觉循环与独立最终验收；按需读 [Criteria](../references/restore/criteria.md) 和 [接口](../references/restore/interfaces.md)。运行时分数不改变本目录 E2E Rubric。
- [v0.1 历史报告契约](specs/restore-loop-report-v0.1.md)：旧单次报告与审批兼容口径。
- [Rubrics](rubrics/site-restore-v1.md)
- [报告模板](templates/report.md)

## Case 字段约定

- `ui_types` 是可维护的页面类型目录（如仪表盘、电商、内容站）；`task_types` 是可维护的任务类型目录（如页面还原、风格迁移、设计系统提取、需求反推）。两者各有独立稳定 `id`，case 分别通过 `ui_type_id` 和 `task_type_id` 引用。
- 类型目录支持新增、改名和归档；被 case 引用的类型不能物理删除，先归档以避免历史数据悬空。改名不改变稳定 ID。
- `description` 写简短事实描述；`keywords` 单独保存可筛选关键词。
- `url` 未知或不适用时为 `null`；`technology_stack` 必须是字符串列表，未知或尚未核实时为空列表。空列表不表示已确认页面没有相关技术。只按源码/运行时及视觉映射证据录入已确认技术；具体函数名、参数值、单个资源或模块清单放入证据备注或省略。网站技术栈分析按[专用 SOP](../references/technology-stack-analysis.md) 执行。
- `difficulty` 使用 `easy` / `medium` / `hard`。布局密度、交互复杂度、素材完整度、参考歧义度和响应式范围仅作为分级指引，不单独录入 case；在难度输入旁悬浮查看三个等级的判定口径。Schema v1.2 移除了 v1.1 的 `difficulty_factors` 字段，导入旧数据时会保留三档难度并忽略逐项因子。
- `status` 区分草稿、可用于评测和退役；统计页默认以可用 case 为总体，并允许切换统计范围。
- 完整字段约束见 [`case-schema.json`](case-schema.json)。
- 通过 [`case-manager/`](case-manager/README.md) 图形化维护案例集。

## 当前样本集

`cases.yaml` 目前包含 7 个页面还原任务，来源是用户提供的网站 URL。页面描述、关键词、UI 类型和难度为基于可访问页面状态的整理；技术栈只记录页面资源或 DOM 中能核实的线索，证据不足时留空并标出未核实范围。UIR-0006 的技术栈核查尚未完成，不能把空列表解释为确认官网未使用 Three.js。Awwwards 案例指向平台上的 Build in Amsterdam 资料页；UIR-0007 记录了可访问首页的 Canvas/视频配对、字体和设置面板证据，不把其尚未冻结的动态状态当成评测 fixture。

这 7 个案例均为 `draft`：目前没有在仓库中冻结授权的目标截图、视口、交互状态和必要素材，不能直接作为可复现评测输入。案例库中的观察描述用于后续整理 fixture，不等同于已经建立了评分基准。
