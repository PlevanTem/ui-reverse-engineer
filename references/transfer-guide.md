# Style Transfer Execution Guide

风格迁移模式（`--transfer`）的详细执行指南。

## 核心原则

风格迁移 ≠ 重写。目标是：**换皮不换骨**。

- 内容和功能是骨架，风格是皮肤
- 迁移后的代码必须保持所有原有功能
- 视觉风格必须完全切换到参考风格
- 当结构和风格冲突时，优先保持结构，适度调整风格适配

---

## 第一步：风格源分析

### 输入为 DESIGN.md

直接解析文件，提取所有 token：

```
→ 色彩 token（primary, secondary, accent, neutral scale, semantic, surface）
→ 排版 token（font families, type scale, weights, line heights）
→ 间距 token（base unit, scale）
→ 形状 token（border radius scale）
→ 深度 token（shadow levels）
→ 动效 token（duration scale, easing）
→ 组件风格（button, card, input, navigation 的视觉规范）
```

### 输入为 URL / 截图

执行设计分析（参见 SKILL.md 的参考资料类型识别），产出内部 token 集合。分析深度聚焦在可提取的 token 上，不需要反推业务逻辑。

---

## 第二步：目标代码分析

读取目标 HTML 文件，提取现有的设计系统：

### 2.1 提取现有 Token

```
← CSS 变量（:root 中的 --color-*, --font-*, --spacing-*, --radius-* 等）
← Tailwind 配置（tailwind.config 中的 theme.extend）
← 内联样式中的重复值
← class 名中的 Tailwind utility（bg-[#xxx], text-[#xxx], rounded-[Npx] 等）
```

### 2.2 分析结构

```
← DOM 层级与语义标签
← 组件划分（header, hero, sections, footer 等）
← 内容数据（文案、图片引用、链接）
← 交互逻辑（JS 事件绑定、状态管理、动画触发）
```

### 2.3 生成结构清单

输出一份清单，确认：

| 维度       | 现有值                | 是否迁移 |
| ---------- | -------------------- | ------- |
| 主色       | `#xxx`               | ✅ 替换  |
| 次色       | `#xxx`               | ✅ 替换  |
| 背景色     | `#xxx`               | ✅ 替换  |
| 文本色     | `#xxx`               | ✅ 替换  |
| 标题字体   | `Inter`              | ✅ 替换  |
| 正文字体   | `Inter`              | ✅ 替换  |
| 字号层级   | `48/36/24/18/16/14`  | ✅ 替换  |
| 间距基准   | `8px`                | ✅ 替换  |
| 圆角       | `8/12/16/full`       | ✅ 替换  |
| 阴影       | `0 2px 8px ...`      | ✅ 替换  |
| 按钮风格   | `rounded pill`       | ✅ 替换  |
| 导航结构   | `top-bar + hamburger` | ❌ 保留 |
| 内容文案   | `"Welcome to..."`    | ❌ 保留 |
| JS 交互    | `dropdown toggle`    | ❌ 保留 |
| DOM 结构   | `section > div > ...` | ❌ 保留 |

---

## 第三步：生成映射表

建立 `旧 token → 新 token` 的映射表。

### 映射策略

**色彩映射**：按语义角色映射，不按 hex 硬替换。

```
旧 primary (#4285F4)  → 新 primary (#5E6AD2)      // 按"主品牌色"角色映射
旧 surface (#FFFFFF)  → 新 surface (#0A0A0A)       // 按"背景"角色映射
旧 text (#1A1A1A)     → 新 text (#E5E5E5)          // 按"主文本"角色映射
```

不能这样映射：
```
❌ 所有 #4285F4 → #5E6AD2    // 不考虑语义，可能把链接色也改了
❌ 所有蓝色 → 紫色            // 太粗暴，有些蓝色可能是语义色
```

**排版映射**：按层级角色映射。

```
旧 Display (Fredoka, 72px, 900)  → 新 Display (Geist, 64px, 700)
旧 Body (DM Sans, 16px, 400)     → 新 Body (Inter, 16px, 400)
```

**间距映射**：按比例关系映射。

```
旧 base=8px, scale=[8,16,24,32,48,64]
新 base=4px, scale=[4,8,12,16,24,32,48]

→ 旧的 section gap (64px) 对应新的最大间距 (48px)
→ 旧的 card padding (24px) 对应新的中等间距 (16px)
```

**组件映射**：按功能角色映射。

```
旧 primary button: orange pill, large    → 新 primary button: purple rect, medium
旧 card: white bg, 24px radius, no shadow → 新 card: dark bg, 8px radius, soft shadow
```

---

## 第四步：执行迁移

### 4.1 CSS 变量替换

如果目标代码使用 CSS 变量，直接替换 `:root` 中的值：

```css
:root {
  /* 色彩 — 从映射表替换 */
  --color-primary: #5E6AD2;      /* 旧: #4285F4 */
  --color-surface: #0A0A0A;      /* 旧: #FFFFFF */
  --color-text: #E5E5E5;         /* 旧: #1A1A1A */
  
  /* 排版 — 从映射表替换 */
  --font-heading: 'Geist', sans-serif;
  --font-body: 'Inter', sans-serif;
  
  /* 间距 — 按新系统 */
  --space-base: 4px;
  
  /* 圆角 — 从映射表替换 */
  --radius-md: 8px;              /* 旧: 24px */
}
```

### 4.2 Tailwind 配置替换

如果使用 Tailwind，替换 `tailwind.config` 中的 `theme.extend`：

```javascript
tailwind.config = {
  theme: {
    extend: {
      colors: {
        primary: '#5E6AD2',    // 旧: '#4285F4'
        surface: '#0A0A0A',    // 旧: '#FFFFFF'
        // ...
      },
      fontFamily: {
        heading: ['Geist', 'sans-serif'],
        body: ['Inter', 'sans-serif'],
      },
      borderRadius: {
        card: '8px',           // 旧: '24px'
      }
    }
  }
}
```

### 4.3 Utility Class 替换

将 Tailwind utility 中的硬编码值替换为新值：

```
bg-[#4285F4]  → bg-[#5E6AD2]    或 bg-primary
text-[72px]   → text-[64px]
rounded-[24px] → rounded-[8px]
```

### 4.4 内联样式替换

搜索所有 `style="..."` 属性，按映射表替换值。

### 4.5 字体 CDN 替换

替换 Google Fonts 或其他字体 CDN 链接：

```html
<!-- 旧 -->
<link href="https://fonts.googleapis.com/css2?family=Fredoka+One&family=DM+Sans" rel="stylesheet">
<!-- 新 -->
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
```

### 4.6 保护区域

以下内容**不替换**：

- `<script>` 标签内的 JavaScript 逻辑（除了 Tailwind 配置）
- 文案内容（`<p>`, `<h1>`, `<span>` 等的 textContent）
- 图片路径（`src`, `href`）
- 数据属性（`data-*`）
- ARIA 属性
- ID 和功能性 class 名

---

## 第五步：验证

### 视觉验证

1. 在浏览器中打开迁移后的文件
2. 截图对比（`browser_take_screenshot`）
3. 确认：
   - [ ] 整体色调切换到新风格
   - [ ] 字体正确加载并应用
   - [ ] 间距和比例协调
   - [ ] 按钮、卡片等组件风格一致
   - [ ] 无残留旧风格元素（遗漏替换）

### 功能验证

1. 测试所有交互：
   - [ ] 导航点击正常
   - [ ] 下拉菜单/Tab 切换正常
   - [ ] 表单验证正常
   - [ ] 动画/过渡正常
   - [ ] 响应式布局正常
2. 确认无 JavaScript 报错

### 一致性验证

- [ ] 所有同一语义角色的颜色保持一致（不存在"部分按钮换了颜色、部分没换"的情况）
- [ ] 字体 fallback 正确配置
- [ ] 无样式冲突（旧 CSS 残留与新样式打架）

---

## 常见问题处理

### 深浅色模式切换

如果从浅色风格迁移到深色风格（或反向）：

- 文本色和背景色必须反转
- 阴影可能需要从 `rgba(0,0,0,0.1)` 变为 `rgba(255,255,255,0.05)` 或移除
- 边框颜色需要调整对比度
- 图片/插图可能需要调整（深色背景下的浅色 PNG 轮廓问题）

### 圆角体系差异大

如果旧风格是大圆角（24px+），新风格是小圆角（4-8px）：
- 注意按钮从 pill 变方形后的 padding 可能需要调整
- 卡片圆角变小后，内部内容的对齐可能需要微调

### 间距体系差异大

如果旧风格是 spacious（base 8px），新风格是 compact（base 4px）：
- 注意 section 间距缩小后内容不要挤在一起
- 可能需要适度保留一些旧的间距值来保持可读性

### 组件数量不对应

如果新风格没有定义某个旧组件的样式：
- 用新风格的基础 token（颜色、圆角、阴影）推导出合理的样式
- 保持与新风格的整体一致性
