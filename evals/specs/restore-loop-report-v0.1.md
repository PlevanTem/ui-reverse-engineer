# Restore Loop v0.1 历史报告归档说明

v0.1 单次 Restore 报告已由 v0.2 统一报告取代。此文件只标记版本边界，不再定义运行 schema、HTML 模板或兼容命令。

## 历史产物

- 已生成的 v0.1 `report.html` 是静态历史文件，可继续在原 run 目录中阅读。
- v0.1 报告 JSON / 审批 Schema、演示报告、HTML 模板和渲染脚本已从活动结构移除。
- v0.1 run 不会自动转换为 v0.2，也不会用新模板重渲染；缺少的新字段继续视为未知。

## 当前结构

- 单次 run 的事实源、报告生成和人工审批由 [`Restore v0.2 接口`](../../references/restore/interfaces.md)定义。
- 报告结构由 `scripts/restore/report.mjs` 汇编为 `report.json`；`assets/restore/report.html` 是唯一单次 HTML 模板。
- 跨 case / 方案评测使用 [`site-restore-v1.md`](site-restore-v1.md)、Rubric 和 [`evals/templates/report.md`](../templates/report.md)。它不复用单次审批状态。
