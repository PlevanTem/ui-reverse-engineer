# 评测目录

Showcase 与测试样例库中的案例仅供学习、研究与技术评测，相关设计、商标及素材的权利归原权利人所有，展示不代表商业使用授权。

本目录只服务于 UI Reverse Engineer Skill 的离线自我优化，不建设生产级观测平台。当前只固化 Restore；其余模式在有真实评测需求后各自增加一份最终方案。

## Single source of control

项目沟通与审阅先读[文档索引](../docs/README.md)、[当前架构](../docs/architecture.md)和[当前评测方案](../docs/evaluation-plan.md)。其中时间/文档版本、迭代项、实测快照和后续路线便于追踪，不替代下表控制文件。

| 控制面 | 唯一来源 | 不负责 |
| --- | --- | --- |
| Restore 最终评测 | [`restore.md`](restore.md) | 运行命令、Loop 修复策略 |
| Restore 执行 SOP | [`../references/restore.md`](../references/restore.md) | 字段定义、评分锚点 |
| 数据与命令接口 | [`../references/restore/interfaces.md`](../references/restore/interfaces.md) | 解释流程或重复评测方案 |
| Loop 局部视觉准则 | [`../references/restore/criteria.md`](../references/restore/criteria.md) | 最终 E2E 判定 |
| Case 字段 | [`case-schema.json`](case-schema.json) | 评分与运行结果 |
| 跨 case 报告格式 | [`templates/report.md`](templates/report.md) | 保存原始事实 |
| 同一 case 多 run 轨迹汇总 | [`../scripts/restore/challenge-report.mjs`](../scripts/restore/challenge-report.mjs) | `RestoreChallengeReport/v2` provenance DAG；只读投影，按合同与 scorer 分组，不产生新评分 |

## 目录

```text
evals/
├── README.md
├── restore.md                 # Restore 唯一最终评测方案
├── cases.yaml                 # case 元数据；草稿与可评测状态分开
├── case-schema.json           # case 数据 Schema
├── fixtures/                  # 授权且冻结的输入素材
├── pipeline/                  # 五维最终 E2E grader
├── templates/                 # 跨 case 报告模板与红线 profile 模板
├── case-manager/              # 本地 case 管理与结果查看
└── results/<run_id>/          # 脱敏 manifest、评分与报告
```

## 运行约定

1. 只比较冻结输入、视口、状态和交互要求一致的 case。
2. `cases.yaml` 是 case 元数据的事实源；未冻结 fixture 的 `draft` case 不进入正式评测。
   `technology_stack`、`technology_stack_source`、`technology_stack_evidence` 及源码类输入只属于评测数据面，用于数据集分析、分层统计和事后审计。它们不得进入 Restore 生成上下文；生成只接收合同投影出的 `RestoreGenerationInput/v1` / `v2` 白名单。
3. manifest 记录 dataset/case 版本、fixture 和产物哈希、Skill commit、模型/effort、环境和运行设置。
4. Loop 的 C1/C2/C3 只用于修复；最终交付使用五维 E2E 和六类红线。
5. Judge 未校准时结果为探索性；未知项不得补造分数。
6. results 不保存凭据、私人素材、大型原始会话或未脱敏路径。
7. 历史六维报告保持原样，不与当前五维结果混合聚合。

## Case 字段

- `ui_types` 与 `task_types` 使用稳定 ID；改名不改变 ID，被引用类型先归档再删除。
- `description` 只写事实描述，`keywords` 单独保存检索词。
- 技术栈与源码证据是 evaluator-only 元数据；Case Manager 可以维护和统计，但不得导出给实现者或拼接进生成 prompt。
- 未知 URL 为 `null`；未核实技术栈为空列表，不能解释为确认不存在。
- URL 技术分析必须区分当前实现、页面介绍的产品能力和历史版本证据；Canvas/3D 页面须完成 API、renderer、模型资源与页面映射的强制核验。证据分层与版本漂移处理见 [`../references/technology-stack-analysis.md`](../references/technology-stack-analysis.md)。
- 可用本地 [`stack-audit`](../scripts/stack-audit/README.md) 脚本采集页面证据和执行人工裁决门禁；脚本输出不自动写回案例，正式案例仍以 `cases.yaml` 的人工审核记录为准。
- `difficulty` 使用 `easy / medium / hard`；`status` 使用草稿、可评测和退役状态。
- 完整约束见 [`case-schema.json`](case-schema.json)，图形维护入口见 [`case-manager/`](case-manager/README.md)。

当前 `cases.yaml` 中的案例仍是草稿；没有冻结截图、视口、交互状态和必要素材前，不构成可复现评测集。

## 检查

```powershell
node scripts/restore/tests/restore.test.mjs
node scripts/restore/tests/capture.test.mjs
node scripts/restore/tests/archive-audit.test.mjs
node scripts/restore/tests/scratch-audit.test.mjs
cd evals/case-manager
npm run build
npm run test:sites
```

若环境提供 `skills-ref`，再运行 `skills-ref validate .`。无法运行的检查必须如实记录。

### 统一工程检查

模块依赖与复用入口见[整体架构](../docs/architecture.md)。使用 Node 24+ 运行维护检查器；运行端的既有版本约定不变。先预览，再执行：

```powershell
node scripts/check.mjs local --plan
node scripts/check.mjs local
node scripts/check.mjs full --plan
node scripts/check.mjs full
```

`local` 运行完整 Restore/trajectory/检查器回归与 Schema 校验；浏览器选择器缺失时回归可以运行，但跳过测试会使总状态为 incomplete。`full` 要求设置 `RESTORE_CAPTURE_PYTHON`、`RESTORE_PLAYWRIGHT_MODULE`、`RESTORE_SCHEMA_PYTHON`，并加入 Case Manager 构建、打包与测试；缺少选择器在启动测试前阻断，已有依赖缺失或命令失败按实际失败记录。它不安装包、读取真实会话、调用模型或上报 Langfuse。Schema Python 必须已有 jsonschema；可用既有虚拟环境或明确的 PYTHONPATH，不写死本机依赖目录。

默认在新的 `reverse_output/checks/` 子目录保存 plan、逐项日志与 result，`--output NEW_DIRECTORY` 可指定新目录；已有目录不覆盖。failed、blocked、incomplete 都返回非零。passed 仅表示本次定义的工程检查成功；不能替代 skills-ref（可用时单独运行）、文档/展示审阅、真实云端回读、宿主激活、Judge 校准或页面质量/效率验收。

缺少最终 result 回执的中断执行也不能视为完成；保留现有日志，在新目录重跑工程检查。真实轨迹发送与 Judge 的恢复另按其唯一接口执行，不套用这个重跑规则。

Schema 检查也可以单独复用；只有显式提供的实例会被校验，不把 meta-schema 通过说成所有案例数据均有效：

```powershell
python -X utf8 scripts/validate-schemas.py
python -X utf8 scripts/validate-schemas.py --instance references/trajectory/view.schema.json path/to/views.json
```

该脚本仅加载仓库 Schema 与指定 JSON，拒绝未加载的远程引用；结果不表示语义正确。具体实例路径使用本次案例自己的忽略目录。

报告模板变更须检查桌面及窄屏渲染、资源链接、脚本错误和完整 SHA-256 页脚的换行；表格或证据对比容器内部滚动不等于整页溢出。折叠区尚未请求的 lazy 图片应与加载失败分开记录。以上仅验证报告呈现，不增加被测产物的 E2E 覆盖或质量分。

`capture.test.mjs` 包含手势、采样时序、模型依赖、提前停止与进度回归；设置 `RESTORE_CAPTURE_PYTHON` 为已安装 Playwright 的 Python 可执行文件后，还运行临时目录与 localhost 中的真实浏览器采集。提供 `RESTORE_PLAYWRIGHT_MODULE` 时同样验证 Node 采集器与 Python 的冻结绑定一致。该集成检查不安装依赖，不访问外站，不代表真实站点的视觉 E2E 通过。

本次能力审计、已修复项与剩余验证见 [交互场景 Restore 审计](audits/2026-10-16-restore-interactive-scenes.md)。

版本增量与 Firewood 诊断试验使用 [vNext 验收协议](vnext-acceptance.md)。运行 `node --test scripts/restore/tests/*.test.mjs` 覆盖规格、几何、匿名输入、音频和旧记录回放。浏览器压力较大时串行执行；Node/Python 的浏览器版本不同会按设计拒绝比较，不得用关闭环境门禁解决。

任务连续性包含 `task.test.mjs` 的状态、预算、锁竞争、崩溃恢复、会话隔离和真实 CLI/stdin 检查；宿主真实 hook 激活仍按 [vNext 验收协议](vnext-acceptance.md#continuity-activation)单独记录。

可选 [Firewood Langfuse 试点](langfuse-firewood-pilot.md)负责真实控制事件导入、来源/版本代码核验、OTLP 上报与 Score 读回核对；它不等于完整 Agent 轨迹或正式四维过程评分。运行 `node scripts/trajectory/langfuse-pilot.test.mjs` 检查投影与模拟 API 流程；真实服务连接另行验收。

[Agent 四维过程评估](trajectory/README.md)进一步采集宿主可导出的主/子代理事件，通过外部 Codex 执行 D/I/F/T 语义判断，Langfuse 原生开发规则自动生成评分并核对 `source=EVAL` 与 subject。它与前述 ledger 试点分别验收，仍不替代页面最终 E2E。采集 Schema、自动入口和持久恢复见[接口](../references/trajectory/interfaces.md)；案例验收见 [Firewood 协议](trajectory/firewood.md)，真实结果只写忽略目录。

v2 的角色/去重、指令来源、委派加密、证据单元和覆盖率验收见[分步方案](trajectory/iteration-plan.md)。`views.test.mjs`、`evidence.test.mjs`、`delegation.test.mjs` 与扩展的 collector/judge/auto/transport 检查覆盖相应回归；真实云端回读与模型语义校准仍分别验收。

[Codex 开发评估闭环](../references/evaluation/interfaces.md)复用现有工程、准备、开发 E2E 和轨迹评估器；统一 local/full 自动包含 `scripts/evaluation/*.test.mjs`。新增回归检查重复/并发、过期目标、快照/结果/适配器篡改、预算与暂停、主会话归属、公开轨迹窗口和 run 完成前的真实 grader 调用。合成 E2E 只验接口；当前没有新的 Firewood 视觉或全任务过程评分结果。
