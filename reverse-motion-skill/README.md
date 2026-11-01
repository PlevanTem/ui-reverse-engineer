# Reverse Motion Skill

[English](README.en.md) · 简体中文

把网页、录屏或视频中的交互与动效，整理成**可实现、可追溯、可验收的规格**。适用于参考还原、界面重建和动效迁移。

> [!IMPORTANT]
> 这是供 AI Agent 使用的工作流与取证指南，**不是已实现的自动采集器**。结果取决于参考可访问性、执行环境、工具能力和实际采集范围；当前尚无真实案例的端到端验证。

## 解决什么问题

静态截图难以表达动作的触发条件、状态切换、时间关系和运动轨迹。Reverse Motion Skill 引导 Agent 在允许的范围内，结合运行时信息、真实交互和画面测量，梳理设计机制与证据，而不是仅凭单帧猜测。

优先探索用户主要路径、可见线索和显著动态区域，并分别报告已检查、不可达和未检查的范围。无法确认的信息标记为 `unknown`。

## 工作方式

1. **确定范围**：记录参考来源、视口、可操作路径和取证边界。
2. **按状态选择策略**：对未触发的动效尝试触发；对已结束的动效，能重现则提前采集后重放，不能重现则保留证据缺口。
3. **交叉取证**：按可用条件组合声明式动画、可访问的动画库、交互探测与画面测量；同一动效可以走多个分支。
4. **输出规格**：对齐证据，描述触发、状态、时序、空间、动力学和联动，列出未确认项及待执行验收。

查看 [完整工作流图](references/workflow.md)、[取证方法](references/capture.md) 和 [规格与验收](references/spec.md)。

## 输出

默认生成 `motion-spec.md`，每条交互或动效包括：

| 字段 | 内容 |
| --- | --- |
| 名称 | 稳定 ID 与组件、场景或动作 |
| 用途 | 观察到的作用；意图不明时标注为推断或未知 |
| 实现 | 触发、状态、时序、运动、联动、边界和可迁移实现建议 |
| 参考依据 | 证据类型、来源、操作步骤或时间戳，以及采集限制 |

规格同时包含覆盖清单、未确认项和验收方式。必要且可行时，证据保存在相邻的 `motion-evidence/` 目录。规格不是实际还原完成或验收通过的证明。

## 安装与使用

### 通过 npx 安装

需要 Node.js 22.20 或更高版本及网络连接。在目标项目目录执行，并按提示选择支持的 Agent：

```bash
npx skills add PlevanTem/reverse-motion-skill
```

默认安装到当前项目；添加 `-g` 可安装到用户范围。更多选项参见 [skills CLI](https://github.com/vercel-labs/skills)。

### 安装到 Claude Code

在目标项目目录执行：

```bash
npx skills add PlevanTem/reverse-motion-skill --skill reverse-motion-skill --agent claude-code --copy --yes
```

这会安装到当前项目的 `.claude/skills/reverse-motion-skill/`。添加 `--global` 可安装到用户范围；如果不使用 `--copy` 和 `--yes`，可按安装器提示选择安装方式。安装后在 Claude Code 会话中调用：

```text
/reverse-motion-skill 分析这个参考的交互和动效：<网页 URL 或视频文件路径>。
重点覆盖首页主要路径，输出可用于实现与验收的规格，并列出未确认项。
```

也可不使用 npx：将本仓库完整内容复制到项目的 `.claude/skills/reverse-motion-skill/`，或用户目录下的 `~/.claude/skills/reverse-motion-skill/`；保留 `SKILL.md` 和 `references/` 的相对位置。

### 安装到 Codex

通过安装器选择 Codex，或将本仓库完整内容复制到 `~/.codex/skills/reverse-motion-skill/`，然后在 Codex 中调用 `$reverse-motion-skill`。实际调用方式与技能发现取决于宿主环境；浏览器操作、视频抽帧等需要环境提供相应能力。只需规格时不要求修改目标页面。

## 适用范围与限制

- **网页**：可从授权范围内的运行时、规则、操作和画面取证。跨域、隔离上下文及未触发或已结束的动画可能不可读取。
- **视频 / 录屏**：可依据时间戳和画面测量；真实触发条件、内部状态和唯一的缓动曲线未必可知。
- **单张截图**：只能支持可见静态状态，不能验证完整动作过程。
- **输出质量**：视觉估计存在采样误差；无法获得证据时，报告缺口而非承诺完整或精准还原。

## 文件结构

```text
SKILL.md                 技能入口与决策规则
references/workflow.md   Mermaid 工作流图
references/capture.md    分层取证与状态处理
references/spec.md       规格格式与验收方法
```
