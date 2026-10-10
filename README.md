# UI Reverse Engineer

中文 | [English](README.en.md)

**把界面参考转成可执行的需求、设计规范或 HTML 页面。** 提供网页、截图、录屏、源码或现有页面，选择你要的结果；证据不足处会保留推断，不把猜测写成事实。

## 什么时候用

- **手上只有一个参考页面，想做出类似页面**：`--restore` 生成单文件 HTML，并先给设计 brief。
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
| `--restore` | 如何从参考页面做出可运行的页面稿？ | `design_brief.md`、确认后生成 `restored.html` |

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
根据这个页面截图先给我设计 brief，确认后再生成单文件 HTML。
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
| 网站 URL | 检查结构、布局、视觉状态、响应式和主要交互 | 实时浏览流程依赖 `cursor-ide-browser` MCP；仅给 URL 不代表已完成页面审查 |
| 截图 / Figma | 提取布局、颜色、字体、间距和组件风格 | 静态图看不到的交互需标为推断 |
| 视频 / 录屏 | 从关键帧整理操作顺序、状态变化和动效 | 需要客户端支持视频/视觉输入；快速变化的细节可能只能推测 |
| 源码 URL / HTML、CSS、JS | 从结构与实现推断信息架构、token 和状态逻辑 | 读到源码不等于核实了页面的实时外观 |
| 本地 HTML | 作为 `--transfer` 的迁移目标 | `--transfer` 需要本地 HTML 目标 |
| `DESIGN.md` | 作为 `--transfer` 的风格来源 | 使用文件内定义的设计 token |

安装 Skill 不会自动安装浏览器 MCP，也不会增加客户端原本没有的视频理解或本地文件访问能力。`--transfer` 会先给出迁移方案，确认后再改页面；`--restore` 会先生成设计 brief，再询问是否继续生成 HTML。

## 效果展示

当前暂无可核对的“逆向目标 + 结果”样例，先留出占位；后续补充时同时提供参考、产物与验证方式。

| 场景 | 逆向目标 / 参考 | 结果 | 验证方式 |
| --- | --- | --- | --- |
| 页面还原 | 待补充 | 待补充 | 待补充 |
| 设计资产提取 | 待补充 | 待补充 | 待补充 |
| 既有页面风格迁移 | 待补充 | 待补充 | 待补充 |

## 进一步阅读

- [技能完整说明](SKILL.md)
- [DESIGN.md 资产模板](references/design-md-template.md)
- [风格迁移指南](references/transfer-guide.md)

中文 README 为默认入口；英文版见 [README.en.md](README.en.md)。



