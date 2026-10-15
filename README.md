# UI Reverse Engineer

中文 | [English](README.en.md)

**把界面参考转成可执行的需求、设计规范或可运行的网站还原项目。** 提供网页、截图、录屏、源码或现有页面，选择你要的结果；证据不足处会保留推断，不把猜测写成事实。

## 什么时候用

- **手上有参考页面，想尽可能还原**：`--restore` 逆向页面资源、视觉细节、动效和交互，交付可运行项目。
- **想知道一个界面背后的产品需求是什么**：`--query` 反推用户需求、核心功能和风格偏好，输出 JSON。
- **想把品牌风格沉淀下来复用**：`--design-md` 提取设计 token，生成 `DESIGN.md` 和索引。
- **已有页面要换视觉风格，但保留内容和功能**：`--transfer` 将参考风格迁移到本地 HTML。
- **既要分析需求又要生成页面**：默认流程是 `--query --restore`。

## 你会得到什么

| 模式 | 适合的问题 | 主要产物 |
| --- | --- | --- |
| `--query` | 这个成品界面可能对应什么需求？ | `query_instruction.json` |
| `--design-md` | 如何把这套视觉规则复用到其他页面？ | `design_assets/{brand}/DESIGN.md`、`design_assets/index.csv` |
| `--transfer` | 如何在保留原页面内容与交互的同时换风格？ | `{target}_transferred.html` |
| `--restore` | 如何复现参考页面的资源、视觉和交互？ | `design_brief.md` 与可运行的 `restored/` 项目 |

所有案例产物默认写入 `reverse_output/{case_name}_{YYYYMMDD}/`；设计资产写入 `design_assets/`。细节见 [`SKILL.md`](SKILL.md)。

## 如何开始

安装后直接用自然语言给任务和参考资料，例如：

```text
把这张产品截图反推成需求 JSON，只做需求分析，不生成页面。
```

```text
分析这个网站的视觉规范，生成可复用的 DESIGN.md。
```

```text
参考这个截图的视觉风格，迁移到本地的 ./index.html，保留原有文案和交互。
```

```text
还原这个网站，包括可取得的素材、响应式布局、滚动动效和主要交互；完成后给我可运行项目及对照结果。
```

也可以显式指定模式，如 `--query`、`--design-md`、`--transfer`、`--restore`；多个模式可组合。未指定时默认 `--query --restore`。

## 快速安装

在项目根目录运行对应命令。从 GitHub 默认分支安装；当前仓库为私有仓库，且该目录需先发布到默认分支。

**Codex**
```bash
npx --yes skills add https://github.com/PlevanTem/ui-reverse-engineer/tree/main/ui-reverse-engineer --skill ui-reverse-engineer --agent codex
```

**Claude Code**
```bash
npx --yes skills add https://github.com/PlevanTem/ui-reverse-engineer/tree/main/ui-reverse-engineer --skill ui-reverse-engineer --agent claude-code
```

**Grok Build**
```bash
npx --yes skills add https://github.com/PlevanTem/ui-reverse-engineer/tree/main/ui-reverse-engineer --skill ui-reverse-engineer --agent grok
```

**Gemini CLI**
```bash
npx --yes skills add https://github.com/PlevanTem/ui-reverse-engineer/tree/main/ui-reverse-engineer --skill ui-reverse-engineer --agent gemini-cli
```

**WorkBuddy**

WorkBuddy 当前通过本地 Skill 包导入；`vercel-labs/skills` CLI 暂无 WorkBuddy 安装目标。在 WorkBuddy 选择「添加 Skill / 上传 Skill」→ 选择 `ui-reverse-engineer` 技能包。

> 上述 `npx` 命令要求技能目录已提交到 GitHub 默认分支；私有仓库还要求当前账号有访问权限。若技能已在本地，先进入目标项目根目录运行 `npx --yes skills add <本地技能目录> --skill ui-reverse-engineer --agent <标识>`，将 `<本地技能目录>` 替换为实际路径。

## 输入与边界

| 输入 | 能做什么 | 边界 |
| --- | --- | --- |
| 网站 URL | 检查结构、布局、视觉状态、响应式和主要交互；主动检查页面公开加载的源码与运行时资源 | 需要可用浏览器/网页读取能力；跨域、登录或工具限制可能阻止部分源码核验，需记录缺口 |
| 截图 / Figma | 提取布局、颜色、字体、间距和组件风格 | 静态图看不到的交互需标为推断 |
| 视频 / 录屏 | 从关键帧整理操作顺序、状态变化和动效 | 需要客户端支持视频/视觉输入；快速变化的细节可能只能推测 |
| 源码 URL / HTML、CSS、JS | 从结构与实现推断信息架构、token 和状态逻辑 | 读到源码不等于核实了页面的实时外观 |
| 本地 HTML | 作为 `--transfer` 的迁移目标 | `--transfer` 需要本地 HTML 目标 |
| `DESIGN.md` | 作为 `--transfer` 的风格来源 | 使用文件内定义的设计 token |

普通网站 URL 即可启动源码发现，不要求用户另提供代码托管链接；实际可检查范围取决于当前客户端的浏览器和网页读取能力。安装 Skill 不会自动安装浏览器 MCP，也不会增加客户端原本没有的视频理解或本地文件访问能力。`--transfer` 会先给出迁移方案，确认后再改页面；`--restore` 会生成 brief 并直接完成还原，只有用户明确要求先审 brief 时才暂停。

## 效果展示

当前暂无可核对的“逆向目标 + 结果”样例，先留出占位；后续补充时同时提供参考、产物与验证方式。

| 场景 | 逆向目标 / 参考 | 结果 | 验证方式 |
| --- | --- | --- | --- |
| 页面还原 | 待补充 | 待补充 | 待补充 |
| 设计资产提取 | 待补充 | 待补充 | 待补充 |
| 既有页面风格迁移 | 待补充 | 待补充 | 待补充 |

## 项目结构

```text
ui-reverse-engineer/
├── AGENTS.md                 # 项目级长期规则、维护约定与检查要求
├── SKILL.md                  # Agent 运行时入口与四种工作流
├── README.md                 # 中文使用说明与项目结构
├── README.en.md              # 英文使用说明
├── CHANGE_LOG.md             # 重要迭代、大量修改和推送记录
├── references/               # 按需加载的模板与详细指南
│   ├── design-md-template.md # DESIGN.md 设计资产模板
│   ├── transfer-guide.md     # 风格迁移指南
│   ├── technology-stack-analysis.md # 网站技术栈分析 SOP
│   ├── restore.md            # Restore 唯一执行 SOP
│   ├── restore-brief-template.md # 还原 brief 模板
│   └── restore/              # 精确接口、Schema 与局部视觉 Criteria
├── scripts/restore/          # v0.2 运行控制、采集适配器、报告和审批
├── assets/restore/           # v0.2 HTML 报告模板
└── evals/                    # --restore 页面 E2E 还原质量评测
    ├── README.md             # 评测目录、流程和自动化边界
    ├── cases.yaml            # 7 个页面还原草稿案例；冻结素材后可用于评测
    ├── case-schema.json      # Schema v1.2；区分 UI 类型和任务类型，难度保留三档
    ├── case-manager/         # 本地样本库；自动载入 cases.yaml，技术栈按高层模块拆分
    ├── restore.md            # Restore 唯一最终 E2E 评测方案
    ├── templates/            # 跨 case 版本评测报告模板
    ├── fixtures/              # 授权、冻结的输入素材
    ├── pipeline/              # 独立五维 E2E grader
    └── results/               # 按 run_id 保存结果摘要
```

当前评测入口、唯一方案和报告模板见 [`evals/README.md`](evals/README.md)。案例输出与用户私人素材不作为仓库模板；只提交授权明确、去除个人信息且体量可控的 fixture。

## 常见问题

### Skill 还原和浏览器 Ctrl+S 保存网页有什么区别？

Ctrl+S 保存的是浏览器当前加载的网页快照，具体包含哪些 HTML、资源和状态取决于浏览器的保存方式；动态数据、跨域资源和交互不一定能在离线环境正常工作。`--restore` 则根据参考页面的截图、状态、交互和资源证据，重新实现一个可运行、可修改的本地副本，并记录迭代与差异。前者适合存档，后者适合复现和继续开发。

## 进一步阅读

- [技能完整说明](SKILL.md)
- [网站技术栈分析 SOP](references/technology-stack-analysis.md)：源码与视觉证据交叉核验，含 Three.js 官网案例复盘和防复发清单
- [Restore 执行流程](references/restore.md)：冻结参考、建立基线、有界修复、停止与最终验收
- [还原 brief 模板](references/restore-brief-template.md)
- Restore 按 30/60/120 分钟三档做有界视觉迭代。三维 0–4 [Loop Criteria](references/restore/criteria.md)只负责修复导航；命令、字段和报告流见[接口](references/restore/interfaces.md)。
- E2E 只评价最终交付产物，报告与审批只使用一份最终结果。`PostRunE2EReview/v1` 通过哈希绑定最终产物和冻结契约；存在时，它是最终质量视图的权威结果。报告记录 Judge 提供方/模型、评测时间、Rubric/Scorer 版本、环境及限制，不记录评委角色或标识。字段定义见[接口与 Schema](references/restore/interfaces.md#冻结与输出)。
- 每个 case 使用六个稳定红线 ID，并按冻结状态、区域、交互和事实边界判定。Rubric v1.2-draft 的新 case 必须提供 `RedlineProfile/v1`；grader 只校验契约和判断的一致性，不替代视觉判断。见 [Restore 最终 E2E](evals/restore.md)。
- 最终 E2E 使用五个等权维度：`layout`、`style`、`content`、`interaction`、`robustness`。`fidelity` 不再计分；事实越界由 `fabrication` 红线处理。单 case 通过要求所有适用维度 ≥3 且红线无失败，不再重复设置 75 分门槛。
- `interaction` 与 `robustness` 评测允许 evaluator 在浏览器中使用 browse control 操作交互控件、观察可见反馈并检查不同视口；未检查的控制台或资源状态必须保留为未检查。
- 若有维度未知，完整总分保持空值；报告另显示已评分维度折算分和权重覆盖率，不将折算分冒充完整 E2E 总分。
- [DESIGN.md 资产模板](references/design-md-template.md)
- [风格迁移指南](references/transfer-guide.md)

中文 README 为默认入口；英文版见 [README.en.md](README.en.md)。
