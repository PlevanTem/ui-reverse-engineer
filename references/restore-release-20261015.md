# Restore v0.2 合入清单（2026-10-15）

## 范围与判断

本次 PR 交付可复用的 Restore 运行控制、视觉自检、独立 E2E 接口和审阅报告，并纳入已有的七个草稿案例与 Case Manager。它证明管线能够保存、比较和报告单次运行；目前不证明自动生成质量达到正式验收线。UIR-0006 和 UIR-0007 的最终六维 E2E 均为 `incomplete`。原始案例产物保留在本地忽略目录，不提交到仓库。

## 文件清单

| 领域 | 主要文件 | 合入内容 |
| --- | --- | --- |
| Skill 入口 | `SKILL.md`、`README.md`、`README.en.md` | `--restore` 工作流、证据与推断边界、运行入口、限制说明 |
| 执行规范 | `references/restore-v0.2.md`、`references/restore-guide.md`、`references/restore/criteria.md`、`references/restore/interfaces.md` | 五模块职责、三类 0–4 视觉标准、预算、终止、数据接口 |
| 运行控制 | `scripts/restore/core.mjs`、`cli.mjs`、`pairwise.mjs`、`adapter.mjs` | 契约冻结、快照、三类评估、双顺序比较、回退及有界退出 |
| 取证与资源 | `scripts/restore/capture.py`、`capture.mjs`、`collect-assets.mjs`、`compare-screens.py` | 状态截图、资源映射及比较辅助 |
| 报告与用量 | `scripts/restore/report.mjs`、`extract-codex-usage.mjs`、`assets/restore/report.html`、`references/restore/token-usage.schema.json` | HTML 审批报告、时间暂停校正、可归属 token 用量与覆盖状态 |
| 独立 Eval | `evals/pipeline/grader.mjs`、`evals/specs/`、`evals/rubrics/`、`evals/templates/` | 六维最终验收与 UI 红线严重度契约；不复用 Loop 分数 |
| 案例与工作台基线 | `evals/cases.yaml`、`evals/case-schema.json`、`evals/case-manager/` | 七个草稿案例、录入/筛选/统计和本地报告预览 |
| 治理与历史 | `AGENTS.md`、`.gitignore`、`CHANGE_LOG.md`、`references/restore-iteration-prd.md`、`references/restore-brief-template.md`、`references/technology-stack-analysis.md` | 项目约束、生成物隔离、历史设计与技术栈取证 SOP |

## 已核查

- `node scripts/restore/tests/restore.test.mjs`：5/5 通过。
- `npm run build`：Case Manager 生产构建成功；`npm run test:sites`：4/4 通过。受限沙箱首次因子进程 `spawn EPERM` 失败，在获准的本地执行环境复跑通过。
- `python -X utf8 .../quick_validate.py .`：Skill valid。
- `evals/cases.yaml`：Schema v1.2 校验通过，七个 ID 唯一；UIR-0007 保持 `draft`。
- `TokenUsage/v0.2` 实例：Schema 校验通过；UIR-0007 报告展示 219 条逐响应记录中的 26,616,090 个可归属 tokens，覆盖状态为 `partial`。
- `git diff --check`：无空白错误。

## 已知限制

- 两个单 case 运行的最终 E2E 均不完整；没有经过校准的 Judge、跨 case 质量统计或正式 Go 结论。
- 30/60/120 分钟预算中的宿主模型调用只能协作式限时，除非宿主支持 deadline/cancel。
- token 用量的缺口不能由额度百分比或字符数补算。UIR-0007 已观察总量不包含父线程协调、后续时间校正和其他未归属用量。
- 七个案例尚未冻结可复现 fixture，不能直接当作正式评测集。

## 后续工作（本次 PR 不实现）

1. 梳理 Skill 评测工程 SOP、任务/证据/评分数据流图及跨方案运行约定。
2. 盘点单次 Restore、版本 Eval、审批和诊断报告，统一展示结构与审阅入口。
3. 设计评测工作台，整合案例维护、运行导入、报告预览及审阅操作。
4. 形成项目级 `DESIGN.md`，统一工具和报告的视觉系统。
