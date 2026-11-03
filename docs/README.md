---
doc_id: RESTORE-DOCS
doc_version: "1.0.0"
doc_set: "restore-vnext-codex-2026.11.03"
status: current
created_at: "2026-11-03"
updated_at: "2026-11-03"
timezone: Asia/Shanghai
owner: project-maintainer
implementation_ref: d6e3b03202c66069cd0ff33fa0d58d0d3fef468c
review_baseline: d410f11f18a7fbcf253db1a912d717c6d327d08a
---

# 项目架构与评测审阅入口

本版记录当前 Codex 内的 Restore vNext 与开发评估闭环。实现、脚本验证、宿主激活、网站质量和效率分别记录；Claude 适配、发布 SDK、常驻平台服务不在本版范围。

## 阅读路径与唯一控制来源

| 阅读目的 | 文档 | 职责 |
| --- | --- | --- |
| 了解当前系统 | [架构说明](architecture.md)与[当前全览图](diagrams/codex-evaluation-loop.svg) | 模块、数据流、状态所有权、实际边界 |
| 审阅评测与后续实验 | [当前评测方案](evaluation-plan.md) | 评测分层、证据关系、验证快照、验收路线 |
| 启用与调用闭环 | [Codex 评估接口](../references/evaluation/interfaces.md) | 唯一执行接口；字段以其链接的 Schema 为准 |
| 查看页面评分定义 | [最终 E2E](../evals/restore.md)、[Loop Criteria](../references/restore/criteria.md) | 分别控制最终评分、局部判断 |
| 查看过程评分定义 | [轨迹评测](../evals/trajectory/README.md)及其 rubric | D/I/F/T、可评性、覆盖与校准 |
| 查看升级对比协议 | [验收与比较](../evals/vnext-acceptance.md) | 公平配对、质量/成本及原生激活验收 |
| 查看历史设计 | [原总体提案](evaluation-suite-design.md) | 2026-11-02 历史背景，不作当前功能清单 |
| 追踪变更与发布 | [CHANGE_LOG](../CHANGE_LOG.md) | 实际迭代、验证、提交与推送记录 |

## 本版迭代项

以下 ID 只用于文档审阅，不是新的运行状态或评分字段。

| ID | 迭代项 | 截至 2026-11-03 的状态 |
| --- | --- | --- |
| IT-01 | 还原准备与资产规范 | 已有规格、准备检查、持久分块输入；并非自动全站穷举 |
| IT-02 | 视觉、交互、动效与音频 | 已有几何/盲比/证据与方法入口；不代表生成工具全部安装或页面通过 |
| IT-03 | 网站任务持久续跑 | 控制器与脚本协议已测；原生 hook 激活 unverified |
| IT-04 | 公开轨迹与四维评估 | 采集、v2 角色/上下文、外部 Judge 和上报已实现；校准 unmeasured |
| IT-05 | Codex 开发评估闭环 | Checkpoint/Job/额度/反馈/交付已实现；真实新增开发 E2E 与窗口 Judge 验收待补 |
| IT-06 | 长期审阅文档 | 首次建立文档集版本、元信息、当前方案与历史状态区分 |

后续验收顺序与资源依赖统一见[当前评测方案](evaluation-plan.md#后续迭代与验收顺序)，本表不另设门禁。

## 元信息与维护

关键架构/方案/接口文档使用 YAML front matter：doc_id、doc_version、doc_set、status、created_at、updated_at、timezone、owner、implementation_ref、review_baseline。时间按 Asia/Shanghai，日期精度为天。版本仅指文档，不冒充 Skill、包、rubric 或 Schema 版本；既有未编号文档不追溯编造版本。

implementation_ref 指说明所依据的代码提交，review_baseline 指本次整理前的 Git 基线，均是固定快照，不代表未来 HEAD。实际修订由 Git 和 CHANGE_LOG 追踪。历史实测用 evidence_as_of 标注，不能随文档更新时间自动变成重新实测。

维护时先改对应控制文件，再更新架构/方案的摘要与状态；正文结构或含义变化递增文档版本，修字可递增补丁版本，范围/兼容性变化须显式说明。保留已实现、已验证、待验收、历史提案的区别；私人原始轨迹、凭据、媒体与云端项目链接不进入本目录。

## 文档迭代记录

| 时间 | 文档版本 | 迭代项 | 变化 |
| --- | --- | --- | --- |
| 2026-11-03 | 1.0.0 | IT-06，关联 IT-01～IT-05 | 建立审阅入口、元信息与版本；按当前 Codex 范围整理架构及评测 |
