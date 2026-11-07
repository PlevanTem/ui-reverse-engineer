# Restore brief：结构化任务的可读投影

design_brief.md 不再单独填写。任务事实只写入 contract.json；运行后的实现、评测与版本事实分别来自 Harbor artifacts 和评测记录。brief 由程序投影这些事实，不能反向修改冻结合同。

| 内容 | 唯一写入位置 |
| --- | --- |
| 网站场景、用户目标及还原任务描述 | contract.task_description |
| 页面、视口、操作序列、可达状态 | contract.states |
| 构图、样式、动态要求及验收依据 | contract.obligations |
| 图片、字体等允许资源 | contract.resources |
| 引用证据与内容哈希 | contract.reference_evidence |
| 未观察到或不可访问的范围 | contract.unknowns |
| 实现结果、残差、各版本决策 | 已有 assessment、verify、diff、Final E2E 记录 |

URL prepare 的唯一提示词：[url-task-prompt.md](restore/url-task-prompt.md)。叙述字段规范：[task-description.schema.json](restore/task-description.schema.json)。

prepare 阶段运行 `node scripts/restore/task-description.mjs RUN_DIR`，从合同生成 brief 的任务摘要；后续 report.mjs 将同一叙述和已有过程/评测投影为完整 brief。两者调用同一个 taskDescriptionMarkdown()，不再额外生成 task.md、task-description.json 或手写平行说明。未知用户目标用 null，合理推断标为 inferred，不成为未经观察的功能要求。

人工 case 直接提供冻结目标，prepare 不重新推导；历史合同没有 task_description 时保持可读。新增 URL 任务必须提供通过视觉证据引用校验的 task_description 才能进入 baseline。
