# DESIGN.md Template

对齐 [awesome-design-md](https://github.com/VoltAgent/awesome-design-md) 的 Stitch DESIGN.md 格式。

本模板用于 `--design-md` 模式，将设计分析结果转化为纯设计系统资产。

## 转换规则

### 必须剥离（不出现在 DESIGN.md 中）

- Direction Decision（方向决策论证）
- 设计问题陈述（业务语境）
- 页面交互清单（实施 checklist）
- "推测:" 前缀标注
- 具体业务内容/用户画像引用
- 任何 case-specific 的上下文

### 必须保留并精确化

- 所有颜色使用 hex 值（不写"偏暖的蓝"，写 `#4285F4`）
- 所有尺寸使用 px/rem 值（不写"较大的间距"，写 `48px`）
- 所有字重使用数值（不写"粗体"，写 `700`）
- 所有缓动使用 cubic-bezier 或关键词（不写"平滑过渡"，写 `ease-out`）

### 语言

DESIGN.md 统一使用**英文**（作为通用设计资产格式，供任何 AI agent 消费）。

---

## 模板正文

以下为 DESIGN.md 的完整模板。`{placeholder}` 处填入从设计分析中提取的值。

```markdown
# {Brand Name} Design System

> Extracted from [{source_url_or_description}] on {YYYY-MM-DD}.
> This file captures the complete visual language for AI agents to generate consistent UI.

---

## 1. Visual Theme & Atmosphere

**Design Philosophy**: {One-sentence summary of the design's core identity}

**Mood**: {3-5 mood adjectives, e.g., "calm, professional, warm, approachable"}

**Visual Density**: {compact / comfortable / spacious}

**Visual Weight**: {light / medium / heavy}

**Genre**: {e.g., corporate-saas, indie-creative, luxury-editorial, neo-brutalist, playful-storybook}

**Key Characteristics:**
- {Characteristic 1 — e.g., "Illustration-first: custom character illustrations replace stock photography"}
- {Characteristic 2 — e.g., "Narrative scrolling: one idea per viewport, story-driven pacing"}
- {Characteristic 3 — e.g., "Chromatic boldness: full-saturation primaries at high intensity"}

---

## 2. Color Palette & Roles

### Primary
| Name | Hex | Role |
|------|-----|------|
| {Color Name} | `{#hex}` | {Primary brand color, hero backgrounds, main CTA} |

### Secondary
| Name | Hex | Role |
|------|-----|------|
| {Color Name} | `{#hex}` | {Secondary actions, supporting elements} |

### Accent
| Name | Hex | Role |
|------|-----|------|
| {Color Name} | `{#hex}` | {Highlights, badges, notifications} |

### Neutral Scale
| Token | Hex | Usage |
|-------|-----|-------|
| `--neutral-50` | `{#hex}` | {Lightest background} |
| `--neutral-100` | `{#hex}` | {Card background} |
| `--neutral-200` | `{#hex}` | {Borders, dividers} |
| `--neutral-300` | `{#hex}` | {Disabled text} |
| `--neutral-500` | `{#hex}` | {Placeholder text} |
| `--neutral-700` | `{#hex}` | {Secondary text} |
| `--neutral-900` | `{#hex}` | {Primary text} |

### Semantic
| Token | Hex | Usage |
|-------|-----|-------|
| `--success` | `{#hex}` | {Success states, confirmations} |
| `--warning` | `{#hex}` | {Warning states, cautions} |
| `--error` | `{#hex}` | {Error states, destructive actions} |
| `--info` | `{#hex}` | {Informational states} |

### Surface & Background
| Token | Hex | Usage |
|-------|-----|-------|
| `--surface-primary` | `{#hex}` | {Page background} |
| `--surface-card` | `{#hex}` | {Card/container background} |
| `--surface-elevated` | `{#hex}` | {Modals, dropdowns, floating panels} |

---

## 3. Typography Rules

### Font Families
- **Headings**: `{font-family}`, fallbacks: `{fallback-stack}`
- **Body**: `{font-family}`, fallbacks: `{fallback-stack}`
- **Mono**: `{font-family}`, fallbacks: `{fallback-stack}`
- **CDN**: `{Google Fonts or CDN URL}`

### Type Scale
| Role | Font | Size | Weight | Line Height | Letter Spacing | Notes |
|------|------|------|--------|-------------|----------------|-------|
| Display | {font} | {size} | {weight} | {line-height} | {tracking} | {notes} |
| H1 | {font} | {size} | {weight} | {line-height} | {tracking} | {notes} |
| H2 | {font} | {size} | {weight} | {line-height} | {tracking} | {notes} |
| H3 | {font} | {size} | {weight} | {line-height} | {tracking} | {notes} |
| Body | {font} | {size} | {weight} | {line-height} | {tracking} | {notes} |
| Body Small | {font} | {size} | {weight} | {line-height} | {tracking} | {notes} |
| Caption | {font} | {size} | {weight} | {line-height} | {tracking} | {notes} |
| Overline | {font} | {size} | {weight} | {line-height} | {tracking} | {notes} |

### Typography Principles
- {Principle 1 — e.g., "Headings use tight letter-spacing (-0.02em) for density"}
- {Principle 2 — e.g., "Body text never exceeds 65ch per line for readability"}
- {Principle 3}

---

## 4. Component Stylings

### Buttons
| Variant | Background | Text | Border | Radius | Padding | Hover | Active | Disabled |
|---------|-----------|------|--------|--------|---------|-------|--------|----------|
| Primary | `{#hex}` | `{#hex}` | {border} | {radius} | {padding} | {hover style} | {active style} | {disabled style} |
| Secondary | `{#hex}` | `{#hex}` | {border} | {radius} | {padding} | {hover style} | {active style} | {disabled style} |
| Ghost | `transparent` | `{#hex}` | {border} | {radius} | {padding} | {hover style} | {active style} | {disabled style} |

### Cards
- **Background**: `{#hex or token}`
- **Border**: `{border style}`
- **Border Radius**: `{radius}`
- **Shadow**: `{shadow value}`
- **Padding**: `{padding}`
- **Hover**: `{hover treatment}`

### Inputs
- **Background**: `{#hex}`
- **Border**: `{border style}`
- **Border Radius**: `{radius}`
- **Text Color**: `{#hex}`
- **Placeholder Color**: `{#hex}`
- **Focus**: `{focus ring/border style}`
- **Error**: `{error border/text style}`
- **Disabled**: `{disabled style}`

### Navigation
- **Pattern**: `{top-bar / sidebar / hamburger / tabs}`
- **Background**: `{#hex}`
- **Active Indicator**: `{underline / highlight / bold / border}`
- **Mobile Behavior**: `{collapse to hamburger / bottom tabs / drawer}`

### Image Treatment
- **Shape**: `{rounded / circle / square}`
- **Border Radius**: `{radius}`
- **Aspect Ratio**: `{ratio}`
- **Filter/Overlay**: `{treatment if any}`

---

## 5. Layout Principles

### Spacing System
- **Base Unit**: `{N}px`
- **Scale**: `{list of values, e.g., 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 96}`

### Grid
- **Type**: `{12-column / single-column / asymmetric}`
- **Max Width**: `{max-width}`
- **Columns**: `{count}`
- **Gutter**: `{gutter}`

### Whitespace Philosophy
{Description of how whitespace is used — generous, compact, narrative breathing, etc.}

### Border Radius Scale
| Token | Value | Usage |
|-------|-------|-------|
| `--radius-sm` | `{value}` | {Small elements: tags, badges} |
| `--radius-md` | `{value}` | {Medium elements: inputs, small cards} |
| `--radius-lg` | `{value}` | {Large elements: cards, containers} |
| `--radius-xl` | `{value}` | {Extra large: modals, hero sections} |
| `--radius-full` | `9999px` | {Pills: buttons, avatars} |

---

## 6. Depth & Elevation

| Level | Shadow Value | Usage |
|-------|-------------|-------|
| Level 0 (Flat) | `none` | {Flush elements} |
| Level 1 (Raised) | `{shadow CSS}` | {Cards, buttons} |
| Level 2 (Floating) | `{shadow CSS}` | {Dropdowns, tooltips} |
| Level 3 (Overlay) | `{shadow CSS}` | {Modals, dialogs} |

**Shadow Philosophy**: {e.g., "Soft diffused shadows create subtle depth without harsh edges" or "No CSS shadows — depth via illustration layering"}

---

## 7. Do's and Don'ts

### Do
- {Design practice to follow}
- {Design practice to follow}
- {Design practice to follow}

### Don't
- {Anti-pattern to avoid}
- {Anti-pattern to avoid}
- {Anti-pattern to avoid}

---

## 8. Responsive Behavior

### Breakpoints
| Name | Width | Key Changes |
|------|-------|-------------|
| Mobile | `{range}` | {Layout changes} |
| Tablet | `{range}` | {Layout changes} |
| Desktop | `{range}` | {Layout changes} |

### Touch Targets
- Minimum touch target: `{N}px`
- Button minimum height: `{N}px`

### Collapsing Strategy
- {How content adapts on smaller screens}

---

## 9. Motion & Effects

### Motion Tokens
| Speed | Duration | Usage | Easing |
|-------|----------|-------|--------|
| Micro | `{ms}` | Hover, focus, toggle | `{easing}` |
| Normal | `{ms}` | State changes, expand/collapse | `{easing}` |
| Macro | `{ms}` | Page transitions, entrance | `{easing}` |

### Effect Layer
- **Effect Intensity**: `{none / subtle-accent / moderate / heavy-immersive}`
- **Performance Tier**: `{lightweight / medium / heavy}`
- **Primary Technology**: `{CSS only / Canvas 2D / WebGL / GSAP / etc.}`
- **Effects**: {Description of background effects, particles, 3D, scroll effects, etc.}
- **Fallback**: `{What happens on low-end devices}`

---

### Ready-to-Use Prompts

**"Build a landing page in this style"**
Use {heading font} for headings at {display size}, {body font} for body at {body size}. Primary color is `{#hex}`, background is `{#hex}`. Cards use `{radius}` radius with `{shadow}`. Spacing follows `{base}px` grid. {Additional style-specific guidance}.

**"Create a dashboard in this style"**
{Style-specific dashboard guidance}

**"Design a form page in this style"**
{Style-specific form guidance}
```
