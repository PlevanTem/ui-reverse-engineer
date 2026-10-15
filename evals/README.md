# 评测目录

本目录只服务于 UI Reverse Engineer Skill 的离线自我优化，不建设生产级观测平台。当前只固化 Restore；其余模式在有真实评测需求后各自增加一份最终方案。

## Single source of control

| 控制面 | 唯一来源 | 不负责 |
| --- | --- | --- |
| Restore 最终评测 | [`restore.md`](restore.md) | 运行命令、Loop 修复策略 |
| Restore 执行 SOP | [`../references/restore.md`](../references/restore.md) | 字段定义、评分锚点 |
| 数据与命令接口 | [`../references/restore/interfaces.md`](../references/restore/interfaces.md) | 解释流程或重复评测方案 |
| Loop 局部视觉准则 | [`../references/restore/criteria.md`](../references/restore/criteria.md) | 最终 E2E 判定 |
| Case 字段 | [`case-schema.json`](case-schema.json) | 评分与运行结果 |
| 跨 case 报告格式 | [`templates/report.md`](templates/report.md) | 保存原始事实 |

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
3. manifest 记录 dataset/case 版本、fixture 和产物哈希、Skill commit、模型/effort、环境和运行设置。
4. Loop 的 C1/C2/C3 只用于修复；最终交付使用五维 E2E 和六类红线。
5. Judge 未校准时结果为探索性；未知项不得补造分数。
6. results 不保存凭据、私人素材、大型原始会话或未脱敏路径。
7. 历史六维报告保持原样，不与当前五维结果混合聚合。

## Case 字段

- `ui_types` 与 `task_types` 使用稳定 ID；改名不改变 ID，被引用类型先归档再删除。
- `description` 只写事实描述，`keywords` 单独保存检索词。
- 未知 URL 为 `null`；未核实技术栈为空列表，不能解释为确认不存在。
- `difficulty` 使用 `easy / medium / hard`；`status` 使用草稿、可评测和退役状态。
- 完整约束见 [`case-schema.json`](case-schema.json)，图形维护入口见 [`case-manager/`](case-manager/README.md)。

当前 `cases.yaml` 中的案例仍是草稿；没有冻结截图、视口、交互状态和必要素材前，不构成可复现评测集。

## 检查

```powershell
node scripts/restore/tests/restore.test.mjs
cd evals/case-manager
npm run build
npm run test:sites
```

若环境提供 `skills-ref`，再运行 `skills-ref validate .`。无法运行的检查必须如实记录。
