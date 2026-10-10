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
| `--restore`         | 反向还原     | 根据参考资源反向生成网站代码         | `restored.html`                     |

### 组合规则

| 组合                              | 典型场景                                     | 执行链路                                        |
| --------------------------------- | ------------------------------------------- | ----------------------------------------------- |
| `--query`                         | 只要训练数据对                                 | 分析 → query_instruction.json                    |
| `--design-md`                     | 只要风格资产                                   | 分析 → design_brief(内部) → DESIGN.md + CSV     |
| `--restore`                       | 只要克隆代码                                   | 分析 → design_brief(内部) → restored.html        |
| `--transfer`                      | 已有代码 + 参考风格 → 刷新代码                   | 分析参考 → 分析目标 → 风格迁移 → 输出             |
| `--query --design-md`             | 反推需求 + 沉淀风格资产                          | 分析 → JSON + DESIGN.md + CSV                   |
| `--query --restore`               | 完整逆向（原有默认模式）                          | 分析 → JSON + design_brief → restored.html       |
| `--query --design-md --restore`   | 全流程                                        | 分析 → JSON + DESIGN.md + CSV + restored.html    |
| `--design-md --transfer`          | 提取参考风格 + 迁移到目标                        | 分析参考 → DESIGN.md + CSV → 迁移目标代码          |
| 无参数（默认）                      | 等同 `--query --restore`                      | 分析 → JSON + design_brief → restored.html       |

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

**分析策略**：使用 `cursor-ide-browser` MCP 工具进行实时视觉审查。

**执行步骤**：

1. 调用 `browser_navigate` 打开目标 URL
2. 调用 `browser_snapshot` 获取页面结构与元素信息
3. 滚动页面（`browser_scroll`）捕捉完整页面，包括折叠区域
4. 对关键交互元素（导航、下拉、弹窗、Tab）执行 `browser_click` 触发状态变化
5. 调用 `browser_snapshot` 记录交互后的视觉状态变化
6. 提取：布局结构、色彩系统、字体体系、间距规律、组件库风格、交互模式

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

### 类型 C — 源码 URL（结构与逻辑理解）

**识别条件**：用户提供 GitHub、GitLab、CodePen、StackBlitz 等代码托管链接，或指向 `.html`/`.css`/`.js` 的直接文件链接。

**分析策略**：通过读取源码，从实现层反推设计意图与需求逻辑。

**执行步骤**：

1. 使用 `WebFetch` 获取页面源码或代码文件内容
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

1. **优先级**：源码 URL > 网站 URL（实时） > 视频 > 截图
2. **交叉验证**：用多种来源互相印证，标注冲突之处
3. **信息融合**：将各来源的洞察合并进后续流程

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

使用 **HTML5 + Tailwind CSS + 原生 JavaScript** 完整还原输入所呈现的界面设计与交互逻辑。

### 执行前置

本模式依赖完整的设计分析。执行时会自动生成内部 `design_brief` 作为实现规范（若同时指定了 `--query`，会先完成 query 输出）。

### 实现要求

- 输出一个完整可运行的 `.html` 文件（单文件，内联 Tailwind via CDN）
- 严格依据设计分析结果中的设计系统规范实现
- 还原整体布局、色彩、排版、间距、组件样式
- 对于图片，用合理的占位符（`bg-gray-200` 色块 + 描述文字）代替真实资源
- 对视频或动效，用静态近似方案或 CSS 动画模拟关键效果
- 实现可感知的交互：悬浮态、点击态、下拉菜单、Tab 切换、侧边栏等
- 代码结构清晰

### design_brief 内部模板

当执行 `--restore` 时，内部生成的 design_brief 使用完整模板（含 Direction Decision、页面交互清单等实施细节），因为这些信息对代码还原是必要的。模板结构沿用 `design_brief.md` 的全部章节。

保存路径：`reverse_output/{case_name}_{YYYYMMDD}/design_brief.md`

### 输出路径

`reverse_output/{case_name}_{YYYYMMDD}/restored.html`

---

## 分析思维框架

分析时请主动运用以下思路，而不仅仅依赖表面元素：

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

**行为脑补**

- 问自己："如果我点击这里，用户期望发生什么？"
- 通过控件类型（输入框、筛选器、排序）推断背后的数据结构
- 通过列表/表格反推分页、排序、搜索等隐含功能

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

- **design_brief 完整**：每个章节必须输出，若信息不足，在对应位置注明"推测："前缀
- **方向一致**：若同时执行 `--query`，JSON `design_preference` 与 brief 的设计方案必须逻辑吻合

### 跨模式一致性

- 当 `--query` 和 `--design-md` 同时执行时，query 中的 `design_preference` 与 DESIGN.md 的 Visual Theme 必须吻合
- 当 `--design-md` 和 `--restore` 同时执行时，restored.html 的视觉表现必须与 DESIGN.md 的 token 一致
- 当 `--design-md` 和 `--transfer` 同时执行时，DESIGN.md 来自参考风格，迁移结果基于该 DESIGN.md

---

## 输出目录规范

### 逆向分析产出

归档至：`reverse_output/{case_name}_{YYYYMMDD}/`

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
   - 生成 `design_brief.md`（内部实施规范）
   - 询问用户是否需要生成 HTML，确认后生成 `restored.html`
6. **`--transfer`**：
   - 读取 `references/transfer-guide.md`
   - 分析目标代码
   - 输出迁移方案，确认后执行
   - 生成迁移后的 HTML
7. **汇报**：说明产出文件的存放位置，以及关键设计洞察

---

## design_brief 内部模板（供 `--restore` 使用）

当需要生成 design_brief 时（`--restore` 模式或默认模式），使用以下完整模板：

```markdown
# Design System Inspiration of [品牌名称 / 项目名]

## 设计问题陈述
[基于 query 字段展开，一段话描述：谁、在什么场景下、需要解决什么问题、期望达到什么效果]

## 1. Visual Theme & Atmosphere (视觉主题与氛围)
[描述品牌整体的设计感觉、核心设计理念、信息密度、视觉重量、基础色调和排版基调]

**Key Characteristics (核心特征):**
- [特征 1]
- [特征 2]
- [特征 3]

### Direction Decision (方向决策)
- **主方向**: [主方向名称] — [3-5 个关键词]
- **选择理由**: [为什么这个方向最适合本案]
- **Trend Signals**: [来自 WebSearch 的具体趋势证据]
- **Alternative Rejected 1**: [备选方向] — [为什么不选]
- **Alternative Rejected 2**: [备选方向] — [为什么不选]
- **Anti-Homogenization**: [为避免同质化，刻意规避了哪些套路]

## 2. Color Palette & Roles (色彩调色板与角色)
### Primary Brand (主品牌色)
- **[颜色名称]** (`[Hex值]`): [Token 名 / 用途说明]
### Premium Tiers / Secondary (高级 / 次要品牌色 - 可选)
- **[颜色名称]** (`[Hex值]`): [Token 名 / 用途说明]
### Text Scale (文本色阶)
- **[颜色名称]** (`[Hex值]`): [Token 名 / 用途说明]
### Interactive (交互色彩)
- **[颜色名称]** (`[Hex值]`): [Token 名 / 用途说明]
### Surface & Shadows (表面与阴影色彩)
- **[颜色名称]** (`[Hex值]`): [Token 名 / 用途说明]

## 3. Typography Rules (排版规则)
### Font Family (字体家族)
- **Primary**: `[主字体]`, fallbacks: `[备用字体]`
- **Secondary / Display**: `[展示字体]`, fallbacks: `[备用字体]`
- **CDN**: `[Google Fonts URL 或其他字体 CDN]`

### Hierarchy (层级结构)
| Role (角色) | Font (字体) | Size (字号) | Weight (字重) | Line Height (行高) | Letter Spacing (字间距) | Notes (备注) |
|------|------|------|--------|-------------|----------------|-------|
| [Hero Display] | [字体名] | [尺寸] | [字重] | [行高] | [间距] | [说明] |

### Principles (排版原则)
- [原则 1]
- [原则 2]

## 4. Component Stylings (组件样式)
### Buttons (按钮)
- [描述各按钮类型及状态]
### Cards & Containers (卡片与容器)
- [描述]
### Inputs (输入框)
- [描述]
### Navigation (导航)
- [描述]
### Image Treatment (图像处理)
- [描述]

### Core Components (核心组件逐项约束)
#### [组件名]
- **Role**: [作用]
- **Mood**: [外观气质]
- **States**: `default / hover / active / loading / empty / error`
- **Interaction Linkage**: [联动关系]

## 5. Layout Principles (布局原则)
### Spacing System (间距系统)
- Base unit: [基础单位]
- Scale: [间距比例尺]
### Grid & Container (网格与容器)
- [描述]
### Whitespace Philosophy (留白哲学)
- [描述]
### Border Radius Scale (圆角比例尺)
- [列出标准圆角大小]

## 6. Depth & Elevation (深度与层级)
| Level (层级) | Treatment (处理方式 / 阴影值) | Use (使用场景) |
|-------|-----------|-----|
| [层级名] | [阴影或边框策略] | [场景说明] |

**Shadow Philosophy (阴影哲学)**: [描述]

## 7. Do's and Don'ts (设计宜忌)
### Do (推荐做法)
- [推荐 1]
### Don't (避免做法)
- [避免 1]

## 8. Responsive Behavior (响应式行为)
### Breakpoints (断点)
| Name (名称) | Width (宽度) | Key Changes (关键变化) |
|------|-------|-------------|
| [名称] | [尺寸范围] | [布局变化] |

### Touch Targets (触控目标)
- [描述]
### Collapsing Strategy (折叠策略)
- [描述]
### Image Behavior (图像行为)
- [描述]

## 页面交互清单（Frontend 必须完整实现）
- [ ] [交互项 1]
- [ ] [交互项 2]

## 视觉特效方案
### 生成式视觉层（如适用）
- 技术：[Canvas 2D / p5.js / Three.js 等]
- 算法：[具体算法]
- 区域：[页面区块]
- 参数范围：[关键值]
- CDN：`[具体 CDN URL]`

### Motion Rhythm (动效节奏)
- 快速 (100-150ms): 微交互 hover/focus
- 正常 (250-350ms): 状态切换、展开/收起
- 慢速 (500-800ms): 页面入场、场景转场
- 缓动：[具体 cubic-bezier 或关键词]

### Motion Implementation (动效方案)
- 入场动画：[方式]
- 交互动效：[方式]
- 滚动联动：[方式]
```
