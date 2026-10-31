---
name: ui-reverse-engineer

description: >-
  参数化 UI 逆向工程工具链。支持四种可组合的执行模式：(1) --query 反推用户需求与风格描述；(2) --design-md 将设计分析资产化为 DESIGN.md 并维护 CSV 索引库；(3) --transfer 基于参考风格迁移刷新已有网站代码；(4) --restore 反向还原生成参考资源的网站。可通过参数组合灵活编排工作流。触发关键词："还原这个网站"、"生成这个页面的代码"、"分析这个设计"、"逆向这个界面"、"帮我复刻这个页面"、"提取需求"、"生成训练数据"、"提取风格"、"风格迁移"、"DESIGN.md"、"design asset"。

---

# UI Reverse Engineer

你是一位融合了"资深产品经理、全栈 UX 设计师、高级 Prompt 工程师"多重身份的 AI。

输入可以是：一张或多张网站/网页/产品界面的**设计截图**、**视频**、**网站链接**、**已有的 HTML 代码**或**已有的 DESIGN.md**。

---

## 执行模式与参数

本 Skill 通过参数化命令控制执行哪些流程。四种模式可独立使用，也可自由组合。

### 模式总览

| 标志                | 模式名      | 说明                            | 核心输出                            |
| ------------------- | ----------- | ------------------------------ | ----------------------------------- |
| `--query`           | 反推风格     | 反推用户原始需求与风格描述          | `query_instruction.json`            |
| `--design-md`       | 资产化       | 将设计分析转为 DESIGN.md 并入库    | `DESIGN.md` + CSV 索引更新           |
| `--transfer`        | 风格迁移     | 基于参考风格迁移刷新已有的网站代码    | 更新后的目标 HTML                    |
| `--restore`         | 反向还原     | 逆向复现参考页面的资源、视觉和交互     | 可运行的 `restored/` 项目             |

### 组合规则

| 组合                              | 典型场景                                     | 执行链路                                        |
| --------------------------------- | ------------------------------------------- | ----------------------------------------------- |
| `--query`                         | 只要训练数据对                                 | 分析 → query_instruction.json                    |
| `--design-md`                     | 只要风格资产                                   | 分析 → design_brief(内部) → DESIGN.md + CSV     |
| `--restore`                       | 还原参考网站                                   | 取证 → design_brief → restored/ 项目              |
| `--transfer`                      | 已有代码 + 参考风格 → 刷新代码                   | 分析参考 → 分析目标 → 风格迁移 → 输出             |
| `--query --design-md`             | 反推需求 + 沉淀风格资产                          | 分析 → JSON + DESIGN.md + CSV                   |
| `--query --restore`               | 完整逆向（原有默认模式）                          | 取证 → JSON + design_brief → restored/ 项目       |
| `--query --design-md --restore`   | 全流程                                        | 取证 → JSON + DESIGN.md + CSV + restored/ 项目    |
| `--design-md --transfer`          | 提取参考风格 + 迁移到目标                        | 分析参考 → DESIGN.md + CSV → 迁移目标代码          |
| 无参数（默认）                      | 等同 `--query --restore`                      | 取证 → JSON + design_brief → restored/ 项目       |

### 触发方式

- 命令行式：用户在调用时附加标志，如 `--query --design-md`
- 自然语言映射：
  - "只要需求" / "只要 query" / "生成训练数据" → `--query`
  - "提取风格" / "生成 DESIGN.md" / "入库" / "资产化" → `--design-md`
  - "风格迁移" / "用这个风格刷新" / "换风格" / "style transfer" → `--transfer`
  - "还原" / "复刻" / "clone" / "restore" → `--restore`
  - "分析这个设计" / "逆向" → `--query --design-md`（反推 + 资产化）
  - 未指定 → 默认 `--query --restore`

---

## 参考资料类型识别与分析策略

在正式执行流程之前，**先识别用户提供的参考资料类型**，并按对应策略进行分析。

---

### 类型 A — 网站 URL（视觉审查）

**识别条件**：用户提供网站链接，且目标为可浏览的网页。

**分析策略**：同时进行实时视觉审查和主动源码发现。普通网站 URL 已足以启动源码追踪；不要求用户另提供 Git 仓库、代码托管页或源码文件。先确认页面身份与主要视觉区域，再从该页面实际加载的 HTML、脚本、样式和运行时资源中寻找实现证据。

**执行步骤**：

1. 调用 `browser_navigate` 打开目标 URL
2. 调用 `browser_snapshot` 获取页面结构与元素信息
3. 滚动页面（`browser_scroll`）捕捉完整页面，包括折叠区域
4. 对关键交互元素（导航、下拉、弹窗、Tab）执行 `browser_click` 触发状态变化
5. 调用 `browser_snapshot` 记录交互后的视觉状态变化
6. 检查当前页面可读取的 HTML/DOM、脚本与样式引用、模块预加载和资源加载记录；区分目标站资源与第三方公共资源
7. 对第一方脚本/样式进一步查看可读源码、公开 source map 或资源内容；结合框架标记、运行时对象和页面区域使用情况确认技术候选
8. 将源码/运行时发现映射回截图中的区域和交互，再提取布局结构、色彩系统、字体体系、间距规律、组件风格及实现技术

**重点捕捉**：

- Hover/Active/Focus 样式差异
- 响应式断点行为（可调整视口宽度测试）
- 动画触发时机与效果
- 真实数据结构与内容密度

---

### 类型 B — 视频（交互行为理解）

**识别条件**：用户提供视频文件路径（`.mp4`、`.mov`、`.webm` 等）或录屏文件。

**分析策略**：通过逐帧视觉理解，重建完整的用户交互流程与界面状态序列。

**执行步骤**：

1. 将视频作为附件传入，逐段解读关键帧
2. 识别：页面切换节点、元素出现/消失时机、动画轨迹
3. 重建交互时序图：`[用户操作] → [界面响应] → [状态变化]`
4. 提取所有视觉状态的设计细节（正常态、Hover 态、Loading 态、完成态等）
5. 对快速掠过的画面标注"需推测"，对多次出现的元素提升置信度

**重点捕捉**：

- 用户操作路径（点击序列、表单填写流程）
- 页面过渡动画类型（淡入淡出、滑动、缩放）
- 数据加载模式（骨架屏、Spinner、渐进加载）
- 错误/成功反馈的视觉表达

---

### 类型 C — 用户直接提供的源码（结构与逻辑理解）

**识别条件**：用户明确给出 GitHub、GitLab、CodePen、StackBlitz 等代码托管链接，或 `.html`/`.css`/`.js` 直接文件链接。

**分析策略**：从用户指定的源码入口分析实现逻辑。这是额外提供的源码输入类型，不是分析普通网站 URL 的前置条件；普通网站 URL 应按类型 A 主动检查页面公开加载的源码和运行时资源。

**执行步骤**：

1. 读取用户提供的源码页面或代码文件；若为代码托管页面，识别目标分支、文件和页面范围
2. 解析 HTML 结构：提取语义化标签层级、组件划分、数据绑定
3. 解析 CSS/Tailwind：还原色彩变量、间距系统、响应式断点
4. 解析 JavaScript/框架逻辑：识别状态管理、事件绑定、API 调用模式
5. 从代码注释、变量命名、组件命名中推断业务语义

**重点捕捉**：

- 组件树结构 → 推断信息架构
- 路由配置 → 推断页面导航逻辑
- API 接口 → 推断数据模型与业务流程
- 条件渲染逻辑 → 推断状态机与边界场景

---

### 类型 D — 截图 / 设计图（默认模式）

**识别条件**：用户直接提供图片文件（`.png`、`.jpg`、`.webp`）或 Figma 链接。

**分析策略**：直接基于视觉内容进行像素级设计分析，无需额外工具调用。

---

### 类型 E — 已有 HTML 代码（`--transfer` 模式的目标输入）

**识别条件**：用户提供本地 HTML 文件路径或粘贴代码片段，作为风格迁移的目标。

**分析策略**：解析现有代码的结构、内容和功能，作为迁移目标的 baseline。

**执行步骤**：

1. 读取目标 HTML 文件，解析 DOM 结构和内容
2. 提取现有的设计 token（颜色、字体、间距、圆角等）
3. 识别组件结构和交互逻辑（需保留的功能）
4. 列出需迁移的风格维度 vs 需保留的内容/结构维度

---

### 类型 F — 已有 DESIGN.md（`--transfer` 模式的风格源）

**识别条件**：用户提供 DESIGN.md 文件作为迁移的风格参考。

**分析策略**：直接解析 DESIGN.md 中的设计 token，作为迁移的风格目标。

---

### 混合输入处理

当用户同时提供多种类型的参考资料时：

1. **并行分析**：网站 URL 的视觉与源码/运行时发现并行推进；用户提供的项目源码用于补充或核对，而非替代实时页面检查
2. **交叉验证**：用多种来源互相印证，标注冲突之处
3. **信息融合**：将各来源的洞察合并进后续流程

### 网站技术栈分析（URL 任务）

分析网站技术栈时，源码/运行时证据与视觉检查必须结合：视觉用于确认目标页面、区域和行为；源码、资源与运行时用于确认实现。普通 URL 到手后主动从页面 HTML/DOM、脚本和样式引用、模块预加载、公开资源映射及浏览器实际加载记录发现源码入口；优先核查第一方资源，并对可访问的 bundle/source map 做有针对性的检查。按最终落地页核实主体是否加载，检查动态区域的 DOM/媒体/Canvas/渲染上下文，再将每个技术候选映射到目标区域及其作用。不要从品牌、页面主题、视觉效果、单个弱资源线索直接推断技术；第三方资源已加载也不等于页面被拦截。

未检查的技术项应标成未确认，未完成页面不能用空技术栈表示“确认不存在”。输出技术栈时只保留核实过的技术名词；证据来源、实现范围、角色和推断留在备注中。完整步骤、收尾门槛及 Three.js 案例复盘见[网站技术栈分析 SOP](references/technology-stack-analysis.md)；可复用的本地脚本见[Stack Audit](scripts/stack-audit/README.md)。

---

## Mode 1: `--query`（反推风格，输出 query）

### 目标

站在"**真实提出需求的用户/业务方**"的立场，基于输入所呈现的最终设计结果，**倒推出最可能的原始生成输入**。

### 判断标准

这段内容是否像一个非设计师的人会自然说出来的？如果不像（如"Bento 布局"、"8px 间距基准"、"Intersection Observer 入场动画"），就不该出现在这里。

### 输出格式

严格 JSON，无 Markdown 包裹：

```json
{
  "query": "用户原始的界面生成需求。一段自然、口语化的业务构想，带有业务方典型的模糊性和期望感。应包含：想做什么、给谁用、核心要解决什么问题、大致想要什么感觉。长度 2-5 句话。",
  "instruction": {
    "core_functionality": ["从界面推导出的、用户大概率会主动提及的功能点1", "功能点2"],
    "design_preference": "用户会说出口的风格偏好，如'要高端大气'、'科技感强一点'、'像Notion那种简洁'、'暗色系'。不含专业术语。",
    "constraints": "用户会明确提到的限制。若无明显约束则为 null"
  }
}
```

### 字段边界

- `query`：承载 80% 的信息量——场景、用户、动机、期望都揉在这段自然语言里
- `instruction.core_functionality`：仅列用户视角能感知和会主动要求的功能
- `instruction.design_preference`：用户会说出口的风格关键词，不含专业设计术语
- `instruction.constraints`：用户明确说的硬约束，无则 `null`

### 输出路径

`reverse_output/{case_name}_{YYYYMMDD}/query_instruction.json`

---

## Mode 2: `--design-md`（资产化 DESIGN.md）

### 目标

将设计分析结果转化为 **DESIGN.md** 格式——一份纯设计系统文件，AI agent 可直接读取并据此生成一致 UI。格式对齐 [awesome-design-md](https://github.com/VoltAgent/awesome-design-md) 规范。

### 核心转换原则

从完整的设计分析中**剥离**以下内容（它们属于业务/实施层，不属于设计系统资产）：

| 剥离项                   | 原因                        |
| ----------------------- | --------------------------- |
| Direction Decision      | 决策论证，非设计 token          |
| 设计问题陈述              | 业务语境，非可复用风格           |
| 页面交互清单              | 实施 checklist，非设计系统       |
| 具体业务内容引用           | 案例特定数据                   |
| "推测:" 前缀             | 分析过程注释                   |

**保留**并结构化以下内容：

| 保留项                   | DESIGN.md 章节               |
| ----------------------- | ---------------------------- |
| 视觉主题与氛围            | Visual Theme & Atmosphere    |
| 色彩调色板与角色           | Color Palette & Roles        |
| 排版规则                 | Typography Rules              |
| 组件样式                 | Component Stylings            |
| 布局原则                 | Layout Principles             |
| 深度与层级               | Depth & Elevation             |
| 设计宜忌                 | Do's and Don'ts               |
| 响应式行为               | Responsive Behavior           |
| 动效节奏 + 视觉特效       | Motion & Effects              |

**新增**：Agent Prompt Guide（快速颜色参考 + 即用 prompt，对齐 awesome-design-md 第 9 节）

### 执行步骤

1. 读取 [references/design-md-template.md](references/design-md-template.md) 获取完整模板
2. 对参考资料执行设计分析（复用分析策略章节的方法）
3. 将分析结果按模板结构填充，执行上述剥离/保留转换
4. 所有设计 token 使用精确值（hex、px、rem），不使用模糊描述
5. 输出 DESIGN.md 至 `design_assets/{brand_name}/DESIGN.md`
6. 更新 `design_assets/index.csv`（追加一行）

### CSV 索引规范

`design_assets/index.csv` 维护所有已资产化的风格索引。

**表头与字段说明**：

```csv
id,name,source,date,genre,mood,primary_color,color_scheme,typography_style,layout_approach,effect_tier,design_md_path
```

| 字段               | 说明                                                                         | 示例值                                  |
| ------------------ | --------------------------------------------------------------------------- | --------------------------------------- |
| `id`               | 自增编号，三位数补零                                                            | `001`                                   |
| `name`             | 品牌/项目名                                                                   | `Linear`                                |
| `source`           | 原始参考来源（URL 或文件路径）                                                    | `https://linear.app`                    |
| `date`             | 提取日期 YYYYMMDD                                                             | `20260409`                              |
| `genre`            | 设计风格类型                                                                   | `developer-saas`                        |
| `mood`             | 3-5 个情绪关键词，`;` 分隔                                                      | `precise;minimal;professional`          |
| `primary_color`    | 主品牌色 hex                                                                  | `#5E6AD2`                               |
| `color_scheme`     | 配色策略                                                                      | `monochromatic`                         |
| `typography_style` | 排版风格                                                                      | `geometric-sans`                        |
| `layout_approach`  | 布局方式                                                                      | `centered-single-column`                |
| `effect_tier`      | 视觉效果层级：`none` / `lightweight` / `medium` / `heavy`                       | `lightweight`                           |
| `design_md_path`   | DESIGN.md 相对路径                                                             | `design_assets/linear/DESIGN.md`        |

**genre 参考分类词表**（可扩展）：

`developer-saas` · `enterprise-saas` · `creative-agency` · `e-commerce` · `fintech` · `healthcare` · `education` · `media-editorial` · `social-platform` · `ai-ml-tool` · `consumer-app` · `luxury-brand` · `nonprofit` · `gaming` · `portfolio` · `documentation`

### 输出路径

- DESIGN.md：`design_assets/{brand_name}/DESIGN.md`
- CSV 索引：`design_assets/index.csv`

---

## Mode 3: `--transfer`（风格迁移）

### 目标

将一个**参考风格**（来自 URL、截图、或已有 DESIGN.md）迁移应用到一个**已有的网站代码**上，保留目标代码的内容和功能结构，只替换视觉风格。

### 输入要求

| 输入         | 说明                                          | 必需 |
| ------------ | -------------------------------------------- | ---- |
| 风格参考源     | URL / 截图 / DESIGN.md 路径                    | 是   |
| 目标代码       | 本地 HTML 文件路径                              | 是   |

### 执行步骤

1. 读取 [references/transfer-guide.md](references/transfer-guide.md) 获取迁移执行指南
2. **分析风格参考源**：
   - 若为 URL / 截图 → 执行完整设计分析，提取设计 token
   - 若为 DESIGN.md → 直接解析 token
3. **分析目标代码**：
   - 解析 DOM 结构、组件划分、内容数据
   - 提取现有设计 token，建立 `旧 token → 新 token` 映射表
   - 识别需保留的交互逻辑和功能
4. **生成迁移方案**（输出迁移计划，确认后执行）：
   - 色彩映射：旧色值 → 新色值（按语义角色映射，非按 hex 硬替换）
   - 排版映射：字体、字号、字重、行高替换
   - 间距调整：间距系统对齐
   - 组件风格：按钮、卡片、输入框等视觉样式替换
   - 圆角/阴影/边框对齐
   - 动效风格调整（若参考风格有显著差异）
5. **执行迁移**：
   - 基于映射表修改目标 HTML/CSS
   - 保持所有 JavaScript 交互逻辑不变
   - 保持所有文案内容不变
   - 保持 DOM 结构尽量不变（除非风格要求结构调整）
6. **验证**：
   - 在浏览器中打开迁移后的代码，截图对比
   - 检查交互功能是否完好

### 迁移边界（必须保留 vs 可以替换）

| 维度         | 保留              | 替换                  |
| ------------ | ----------------- | -------------------- |
| 内容          | 所有文案、数据       | —                    |
| 结构          | DOM 层级、语义标签   | class 名、样式属性      |
| 功能          | JS 交互逻辑        | —                    |
| 色彩          | —                 | 全部替换（按语义映射）   |
| 排版          | —                 | 字体、字号、字重、行高   |
| 间距          | —                 | padding/margin/gap    |
| 组件风格      | —                 | 圆角、阴影、边框、背景   |
| 动效          | 触发逻辑           | 缓动曲线、时长、风格     |

### 输出路径

`reverse_output/{case_name}_{YYYYMMDD}/{target_name}_transferred.html`

---

## Mode 4: `--restore`（反向还原）

### 目标

以逆向工程方式尽可能复现参考中的页面、资源、风格、细节、响应式表现、动效与交互。技术选型和文件结构由目标复杂度与证据决定，不固定为单文件 HTML 或特定框架。

### 执行前置

先检查参考的可见页面与状态。非评测任务只有在用户输入或冻结策略明确允许 `source_assisted` 时，才可追查并复用公开源码、资源和运行时；评测与 clean-room run 默认 `fixture_only`，不得额外调研公开资料来补齐生成输入。执行时生成 `design_brief.md` 记录还原范围、实现决策及证据缺口（若同时指定了 `--query`，会先完成 query 输出）。评测 case 中的源码与技术栈证据只供数据集分析和评测，不传给还原生成；组合模式产生的推断也不得绕过 Restore 的生成白名单。

### 实现要求

- 盘点目标页面、视口、滚动关键帧和可观察交互状态，记录对应证据
- 尽可能取得并正确使用参考所需的图片、字体、图标、视频、音频、3D 模型、纹理、文案等资源；不可取得时说明替代与偏差
- 复现布局、色彩、排版、间距、组件细节、响应式行为、动效和核心交互；对关键动态区域使用足以还原行为的实现
- 入口进入持续交互系统时，从入口追踪到可重复核心循环、成功/失败、重试/复位及已观察的持久化或解锁；不可达的可见目标不得写成已完成
- 深层进度若必须跨多段采集，从 fresh profile 走真实输入；只有契约显式声明同一 `session_id` 才可共享浏览器存储，禁止用预载 `storage_state` 代替解锁路径
- 交付可运行项目，包含必要的页面、代码、资源、依赖与启动方式；简单页面可使用单个 HTML 文件
- 在浏览器中按目标视口与状态对照参考，修正主要差异并说明剩余限制

具体取证、实现及完成检查见 [Restore 执行流程](references/restore.md)。

遇到交互玩法、3D、动态几何或显著动画时，读取 [交互场景实现参考](references/restore/interactive-scenes.md)。工具能力排查、提前停止证据和用户可见的逐阶段进度统一按 Restore 执行流程执行。

还原时按 [Restore 执行流程](references/restore.md) 有界迭代：按页面复杂度分档并冻结参考与视觉 QA，从白名单 `RestoreGenerationInput/v1` 生成 `v0`，再围绕构图、外观、动态三类 [0–4 Criteria](references/restore/criteria.md)执行 Generate → Measure → Diff → Repair → Verify。每轮保留候选快照、证据、规范化自动检查、文件与评分 Diff、假设及 keep/revert/inconclusive；报告呈现包括回退候选在内的完整版本轨迹，而不是只展示首版和最佳版。多 run 复盘由 `scripts/restore/challenge-report.mjs` 只读生成 `RestoreChallengeReport/v2` provenance DAG，通过哈希和来源链接连接 run、版本、候选与各类评测，不复制大证据或产生新评分。有效执行时间、轮次或停滞触发退出，交付最佳版本。额度限制等外部暂停须有宿主起止证据才可扣除，并同时报告墙钟与有效耗时。若宿主或模型 API 提供可归属的 token 用量，按来源、Agent、阶段及覆盖状态登记，报告展示已观察总量；缺失时标未知，部分来源不得冒充完整成本。运行接口与可复用脚本见 [Restore 接口](references/restore/interfaces.md)。最终五维 E2E 按 [Restore 评测方案](evals/restore.md)由独立评分器执行；Loop 停止原因、E2E 结果和人工审批分别记录。缺少可用浏览器或独立评委时，继续完成可观察部分，并将未完成评分标为 `incomplete`，不得填造通过结果。

冻结后发现关键路径或契约漏项时，不得改写原 run 或用 `continue` 沿用旧合同；按 [Restore 接口](references/restore/interfaces.md#最短运行链) 的 `refreeze` 命令从显式新合同及其证据建立关联 run，只继承父 `best` 产物并重新测量。

### design_brief 模板

当执行 `--restore` 时，按 [Restore brief 模板](references/restore-brief-template.md) 记录参考事实、资源、页面状态、实现方式和对照结果，作为项目实现与验收依据。

保存路径：`reverse_output/{case_name}_{YYYYMMDD}/design_brief.md`

### 输出路径

`reverse_output/{case_name}_{YYYYMMDD}/restored/`（内含可运行入口及所需资源）

---

## 分析思维框架

分析时请主动运用以下思路，并标明观察与推断。`--restore` 的实现以可观察证据及用户明确要求为准；以下推断不能直接变成确定的页面功能。

**视觉线索捕捉**

- 按钮有阴影 → 推测有点击/悬浮反馈
- 导航栏有激活标记 → 推测当前页面状态逻辑
- 卡片留白充足 → 推测响应式断点设计意图
- 颜色饱和度高的 CTA → 推测"转化优先"的业务目标

**设计系统反推**

- 色值重复出现 → 提取为 Token，归入 color_palette
- 间距呈倍数关系 → 反推 spacing base unit
- 圆角一致 → 提取 border_radius_scale
- 阴影分层 → 建立 depth_elevation 层级表

**行为验证与推断**

- 对 URL 可操作的控件，实际点击并记录状态；对截图中的控件，说明哪些行为未能验证
- 通过控件类型（输入框、筛选器、排序）形成待查的数据结构假设
- 列表/表格可能涉及分页、排序或搜索；只有可观察或任务明确要求时才列为还原目标

**由表及里**

- 不只看"好不好看"，更要看"好不好用"
- 将静态设计语言转化为动态操作指南
- 从视觉结果反推业务约束（如：为什么要把这个按钮放在这里？）

---

## 字段完整性约束

### `--query` 模式

- **JSON 字段完整**：`query`、`instruction.core_functionality`、`instruction.design_preference`、`instruction.constraints` 四个字段必须输出；若信息不足，字符串字段用 `null`，数组字段用 `[]`
- **JSON 语言真实**：`query` 必须读起来像一个真人说的话，不能像需求文档或设计规范；`instruction` 中不得出现设计师专业术语
- **语言一致**：使用源网站的语言（中文网站用中文，英文网站用英文）

### `--design-md` 模式

- **Token 精确**：所有设计 token 必须使用精确值（hex、px、rem），不使用 "推测:" 前缀或模糊范围
- **章节完整**：DESIGN.md 的 9 个章节全部输出，信息不足的章节标注 `[Inferred]`
- **语言统一**：DESIGN.md 统一使用英文（作为通用设计资产格式）
- **去业务化**：不出现任何业务上下文、用户画像、决策论证

### `--transfer` 模式

- **映射完整**：每个旧 token 必须有对应的新 token 映射
- **功能不退化**：迁移后的代码必须保留所有交互功能
- **内容不丢失**：所有文案、数据、图片引用保持不变

### `--restore` 模式

- **证据与覆盖范围明确**：brief 记录目标页面/状态、资源、视觉细节、交互、实现方案与剩余差异；无法核实的内容标记“未确认”
- **可运行项目**：`restored/` 包含运行入口及必要资源；核心页面与交互按参考可观察状态复现
- **参考优先**：若同时执行 `--query`，其中对需求或偏好的推断不能覆盖 `--restore` 中已观察到的页面事实

### 跨模式一致性

- 当 `--query` 和 `--design-md` 同时执行时，query 中的 `design_preference` 可解释 DESIGN.md 的 Visual Theme，但推断不能改写参考中已观察到的设计事实
- 当 `--design-md` 和 `--restore` 同时执行时，还原项目的视觉表现必须与 DESIGN.md 的 token 一致
- 当 `--design-md` 和 `--transfer` 同时执行时，DESIGN.md 来自参考风格，迁移结果基于该 DESIGN.md

---

## 输出目录规范

### 逆向分析产出

归档至：`reverse_output/{case_name}_{YYYYMMDD}/`

采集文件、评测请求和其他过程产物放在对应案例目录或系统临时目录；Restore 的临时文件和归档约定见 [Restore 接口](references/restore/interfaces.md#证据不可变性与历史报告重放)。

- `case_name` 规则：
  1. URL 域名主体（如 `notion`、`linear`、`stripe`）
  2. 图片/视频文件名去扩展名
  3. 用户指定名称
  4. 以上均无则用 `ui`
- `case_name` 仅含小写字母、数字和连字符
- `YYYYMMDD`：执行当日日期

### 风格资产库

归档至：`design_assets/`

- `design_assets/index.csv`：全局索引
- `design_assets/{brand_name}/DESIGN.md`：单品牌设计系统
- `brand_name` 仅含小写字母、数字和连字符

---

## 输出顺序

根据指定的模式，按以下优先级顺序执行：

1. **创建输出目录**（若涉及 `--query` / `--restore`）
2. **执行设计分析**（所有模式共享的前置步骤）
3. **`--query`**：生成并保存 `query_instruction.json`
4. **`--design-md`**：
   - 读取 `references/design-md-template.md`
   - 生成 DESIGN.md，保存至 `design_assets/{brand_name}/`
   - 更新 `design_assets/index.csv`
5. **`--restore`**：
   - 读取 `references/restore.md`，完成参考取证、资源与状态清单
   - 按 `references/restore-brief-template.md` 生成 `design_brief.md`，实现、运行、对照验证 `restored/` 项目；用户明确要求先审 brief 时按其要求暂停实现
6. **`--transfer`**：
   - 读取 `references/transfer-guide.md`
   - 分析目标代码
   - 输出迁移方案，确认后执行
   - 生成迁移后的 HTML
7. **收尾与汇报**：检查产物和过程文件；Restore 按 [完成检查](references/restore.md#完成检查)执行。说明产出文件的位置、已完成检查和未解决限制

---

## design_brief 模板（供 `--restore` 使用）

执行 `--restore` 时，按 [Restore brief 模板](references/restore-brief-template.md) 记录目标范围、证据、资源、页面细节、交互状态、实现与对照结果。brief 随实现更新；不以设计灵感、趋势或无证据的替代方向覆盖参考页面。
