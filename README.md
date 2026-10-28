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

多个 Restore run 需要统一复盘时，使用 `node scripts/restore/challenge-report.mjs OUTPUT_DIR RUN_DIR...` 生成 `RestoreChallengeReport/v2` 的 `challenge-report.json` 与 `challenge-report.html`。聚合器从各 run 的事实源确定性投影 provenance DAG，保留 run、版本、候选 artifact、assessment、verification、diff、static-check 和 Final E2E 的节点、哈希与边；大证据仍留在原 run，通过相对链接访问，以控制生成成本和 Agent 上下文。Final E2E、Loop Assessment 与绑定 `run.best` 的 StaticCheckSuite 分开呈现，只在相同合同、Rubric 和 scorer 组内允许横向比较；缺失结果带结构化原因与可恢复性，不按零分处理。

单次报告模板支持窄屏校验值换行；报告展示检查见 [`evals/README.md`](evals/README.md#检查)，不等同于游戏或页面的 E2E 通过。

## 如何开始

### 项目展示网站与设计系统

[访问项目网站](https://plevantem.github.io/ui-reverse-engineer/) · [设计系统](https://plevantem.github.io/ui-reverse-engineer/design-system.html)

本地展示站包含首页、案例库、Tiny Skies 详情、快速上手和设计系统预览。先阅读 [DESIGN.md](DESIGN.md) 审计视觉与组件约定，再按 [website/README.md](website/README.md) 构建和预览。案例元数据由 `evals/cases.yaml` 生成，草稿状态与公开展示分开；网站由 GitHub Pages 工作流构建部署。

首页 04 按能力与机制对比 Screenshot to Code、Open Lovable 与本项目；单元格附官方来源，未见说明不等于不支持，不作为同条件效果排名。

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

## Restore 浏览器采集环境

仓库自动采集脚本使用 Playwright 获取冻结截图、交互序列、运行时资源与控制台检查。默认 Python 入口为 `scripts/restore/capture.py`；宿主浏览器提供等价能力时也可用其取证。Node/Python 入口会在截图序列化期间冻结页面时钟，避免昂贵截图推进游戏或动画状态；该能力要求 `requirements-dev.txt` 固定的 Playwright/Chromium 或提供等价 Clock + CDP lifecycle 能力的宿主版本。需要本地脚本且尚无依赖时安装一次：

```powershell
python -m pip install -r requirements-dev.txt
python -m playwright install chromium
```

用下面的命令确认驱动和浏览器可启动：

```powershell
python -c "from playwright.sync_api import sync_playwright; p=sync_playwright().start(); b=p.chromium.launch(headless=True); print(b.version); b.close(); p.stop()"
```

`scripts/restore/capture.mjs` 是 Node 可选实现。只有需要运行该实现时才安装：

```powershell
npm install --save-dev playwright
npx playwright install chromium
```

Playwright 提供自动化浏览器，不能代替宿主提供的浏览器 MCP、视频理解或页面访问权限。遇到登录、反爬或网络限制时，继续记录可观察证据与失败原因，不把缺失状态标为已核实。

## 输入与边界

| 输入 | 能做什么 | 边界 |
| --- | --- | --- |
| 网站 URL | 检查结构、布局、视觉状态、响应式和主要交互；主动检查页面公开加载的源码与运行时资源 | 需要可用浏览器/网页读取能力；跨域、登录或工具限制可能阻止部分源码核验，需记录缺口 |
| 截图 / Figma | 提取布局、颜色、字体、间距和组件风格 | 静态图看不到的交互需标为推断 |
| 视频 / 录屏 | 从关键帧整理操作顺序、状态变化和动效 | 需要客户端支持视频/视觉输入；快速变化的细节可能只能推测 |
| 源码 URL / HTML、CSS、JS | 从结构与实现推断信息架构、token 和状态逻辑 | 读到源码不等于核实了页面的实时外观 |
| 本地 HTML | 作为 `--transfer` 的迁移目标 | `--transfer` 需要本地 HTML 目标 |
| `DESIGN.md` | 作为 `--transfer` 的风格来源 | 使用文件内定义的设计 token |

普通网站 URL 即可启动技术栈分析的源码发现，不要求用户另提供代码托管链接；实际可检查范围取决于当前客户端的浏览器和网页读取能力。但 Restore 评测和 clean-room run 默认只使用冻结 fixture，不额外搜索公开资料或读取 case 源码证据；只有用户任务与冻结策略明确允许 `source_assisted` 时才可复用源码。安装 Skill 不会自动安装浏览器 MCP，也不会增加客户端原本没有的视频理解或本地文件访问能力。`--transfer` 会先给出迁移方案，确认后再改页面；`--restore` 会生成 brief 并直接完成还原，只有用户明确要求先审 brief 时才暂停。

## 效果展示

Showcase 与测试样例库中的案例仅供学习、研究与技术评测，相关设计、商标及素材的权利归原权利人所有，展示不代表商业使用授权。

### Tiny Skies：从 v1 到 v28 的自迭代还原

对标 [Tiny Skies 原网站](https://tinyskies.vercel.app/)，用 **生成 → 独立评估 → 差异修复** 的循环推进 3D 网页游戏还原。88 秒横屏视频先对比原站与 v28，再展示版本变化、Agent 的观察/计划/修复，以及自动汇总的评测报告。

[![Tiny Skies 中文横屏演示：原站对比、v1–v28 迭代与评测报告](https://github.com/PlevanTem/ui-reverse-engineer/releases/download/tiny-skies-v28-showcase/poster-landscape-zh.jpg)](https://github.com/PlevanTem/ui-reverse-engineer/releases/download/tiny-skies-v28-showcase/tiny-skies-social-landscape.mp4)

[观看/下载中文横屏视频（88 秒，1080p）](https://github.com/PlevanTem/ui-reverse-engineer/releases/download/tiny-skies-v28-showcase/tiny-skies-social-landscape.mp4) · [English version](https://github.com/PlevanTem/ui-reverse-engineer/releases/download/tiny-skies-v28-showcase/tiny-skies-social-landscape-en.mp4) · [展示媒体与校验信息](https://github.com/PlevanTem/ui-reverse-engineer/releases/tag/tiny-skies-v28-showcase)

- **实现边界：** 本案例为源码辅助还原（source-assisted），不是 clean-room 基准。前端样式与交互实现可参考公开代码；3D 场景和美术资产用代码重建，不镜像原站美术资产，未接入 3D 生成 MCP。
- **审阅方式：** 视频尾帧展示最新独立评测摘要；本地完整报告用于审阅状态证据、核心迭代轨迹和未解决问题。展示片不是全流程测试录像，媒体 Release 不包含完整案例输出。
- **结果边界：** 当前评测仍为 `fail / provisional`，存在交互差异与未验证的长链玩法，Judge 尚未校准。版本改善不等于完整 E2E 通过，也不是模型已完成 RL 训练的证明。

## 项目结构

```text
ui-reverse-engineer/
├── AGENTS.md                 # 项目级长期规则、维护约定与检查要求
├── SKILL.md                  # Agent 运行时入口与四种工作流
├── README.md                 # 中文使用说明与项目结构
├── README.en.md              # 英文使用说明
├── CHANGE_LOG.md             # 重要迭代、大量修改和推送记录
├── requirements-dev.txt       # Restore Python 浏览器采集依赖
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
    ├── cases.yaml            # 11 个页面还原草稿案例；冻结素材后可用于评测
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
- [网站技术栈分析 SOP](references/technology-stack-analysis.md)：源码与视觉证据交叉核验；Canvas/3D 页面必须通过 API、renderer、模型资源与页面映射门禁，含 Three.js 归因和版本漂移复盘
- [技术栈审计脚本](scripts/stack-audit/README.md)：本地采集、第一方源码候选扫描和人工证据门禁，不自动确认技术栈
- [Restore 执行流程](references/restore.md)：冻结参考、隔离生成输入、记录 `v0 → vN` 完整轨迹、有界修复、停止与最终验收
- [交互场景还原](references/restore/interactive-scenes.md)：玩法关键路径、目标可达性、同语义成对证据、3D 模型/纹理/解码依赖、相机与动画实现；能力排查、阶段进度和提前停止要求由 Restore 执行流程统一控制
- [还原 brief 模板](references/restore-brief-template.md)
- Restore 按 30/60/120 分钟、最多 3/6/9 轮三档做有界视觉迭代。候选相对当前 best 增量判断，报告展示完整生成轨迹。keep / revert / inconclusive、可审计改善与最终达标的唯一决策规则见三维 0–4 [Loop Criteria](references/restore/criteria.md)；命令、字段和报告流见[接口](references/restore/interfaces.md)。
- 已冻结 run 需要继续时，用 `continue OLD_RUN NEW_RUN [TIER]` 创建带哈希 lineage 的新 run；父时间戳、契约和账本不改，冻结输入、生成策略和当前工作树被复制后作为新 `v0` 重新评测。父 `design_brief.md` 同时复制为子 run 的可写工作副本；父 brief 不存在时从冻结 contract 生成最小副本。子报告链接父轨迹，不复制父 run 的可变事实。详见[接口](references/restore/interfaces.md#最短运行链)。
- 冻结后发现关键路径或验收义务遗漏时，用 `refreeze OLD_RUN NEW_RUN CONTRACT_SOURCE [TIER]` 建立 `contract_refreeze` lineage。它只继承父 `best` 快照，从显式新合同及其证据进入 `prepare`，不继承父评分或未验证工作树。完整规则见[接口](references/restore/interfaces.md#最短运行链)。
- `cases.yaml` 的源码与技术栈证据属于评测数据面，只用于分析统计和事后审计；生成侧只接收 `RestoreGenerationInput/v1` 白名单，默认不接收源码证据。静态检查按 [`StaticCheckSuite/v1`](references/restore/static-check.schema.json) 自动汇总，不替代独立视觉评测。新记录的逐版本 assessment 证据使用内容寻址归档；运行期仍严格拒绝缺失或漂移，历史报告重放则显式降级并排除受影响质量结论。结构化 JSON 引用使用 canonical digest，证据引用使用文件字节 SHA-256；二者不能互换。完整规则见[接口](references/restore/interfaces.md#证据不可变性与历史报告重放)。
- E2E 只评价最终交付产物，报告与审批只使用一份最终结果。`PostRunE2EReview/v1` 通过哈希绑定最终产物和冻结契约；存在时，它是最终质量视图的权威结果。报告记录 Judge 提供方/模型、评测时间、Rubric/Scorer 版本、环境及限制，不记录评委角色或标识。字段定义见[接口与 Schema](references/restore/interfaces.md#冻结与输出)。
- 每个 case 使用六个稳定红线 ID，并按冻结状态、区域、交互和事实边界判定。Rubric v1.2-draft 的新 case 必须提供 `RedlineProfile/v1`；grader 只校验契约和判断的一致性，不替代视觉判断。见 [Restore 最终 E2E](evals/restore.md)。
- 最终 E2E 使用五个等权维度：`layout`、`style`、`content`、`interaction`、`robustness`。`fidelity` 不再计分；事实越界由 `fabrication` 红线处理。单 case 通过要求所有适用维度 ≥3 且红线无失败，不再重复设置 75 分门槛。
- `interaction` 与 `robustness` 评测允许 evaluator 在浏览器中使用 browse control 操作交互控件、观察可见反馈并检查不同视口；未检查的控制台或资源状态必须保留为未检查。
- 游戏、编辑器等持续交互系统不能以“入口可点”判定完成：冻结关键路径须覆盖核心循环、成功/失败、重试/复位及目标已观察的持久化/解锁；可见 `x/N` 目标不可达时，`reachable` 失败且最终 `interaction` 红线至少为 S2。
- 需要验证 reload 后持久化时，CaptureStep 支持同一浏览器上下文的 `reload` 动作；完整动作与就绪语义见[接口](references/restore/interfaces.md#动态采集)。
- 需要验证跨导航的长程解锁链时，可让相关 states 显式共享 `session_id`；默认仍逐 state 隔离，共享会话禁止预载 `storage_state`，完整规则见[接口](references/restore/interfaces.md#动态采集)。
- 若有维度未知，完整总分保持空值；报告另显示已评分维度折算分和权重覆盖率，不将折算分冒充完整 E2E 总分。
- [DESIGN.md 资产模板](references/design-md-template.md)
- [风格迁移指南](references/transfer-guide.md)

中文 README 为默认入口；英文版见 [README.en.md](README.en.md)。
