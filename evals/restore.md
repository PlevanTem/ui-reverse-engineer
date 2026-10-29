# Restore 最终 E2E 评测

版本：`site-restore-v1.2-draft`  
范围：`--restore` 最终交付产物  
状态：评分结构已固化；Judge 校准结果未建立

本文件是 Restore 最终 E2E 的唯一评测方案，负责定义评测对象、五个维度、红线、判定和版本报告要求。字段与命令见 [`references/restore/interfaces.md`](../references/restore/interfaces.md)；运行中的局部视觉诊断见 [`references/restore/criteria.md`](../references/restore/criteria.md)。两者不得改写本文件的最终评测口径。

## 1. 评测对象

评测单元是一个 case 在冻结参考、页面状态、视口和交互要求下生成的最终 `restored/` 项目。只评价实际呈现和可观察行为，不按文件数、框架、代码长度或生成过程加分。

进入可比较评测的 case 必须有：

- 稳定 case ID、任务描述和数据集版本；
- 冻结的参考证据、目标状态、视口、关键区域、交互步骤和事实边界；
- fixture 与最终产物的 SHA-256；
- 可复现的启动方式和评测环境；
- 脱敏的 run manifest。

`cases.yaml` 可保存草稿 case；未冻结必要证据的 case 不能进入正式比较。其中源码与技术栈证据只用于数据集分析、分层和事后归因，不得传入生成上下文；生成输入隔离是否违规属于运行完整性检查，不进入五维视觉分。样本数量由校准或比较目标决定，不以固定三个 fixture 代替代表性检查。

## 2. 五维评分

五个维度各占 20%，按 0–4 评分。`unknown` 表示证据不足，`not_applicable` 表示冻结契约已证明不适用；两者都不能伪装成 0 分或通过。

| 分数 | 通用锚点 |
| ---: | --- |
| 0 | 缺失、不可用，或与参考/任务根本不符 |
| 1 | 只有少量局部相似，主要结构或行为明显错误 |
| 2 | 核心意图可辨认，但有显著偏差、缺失或不稳定 |
| 3 | 主要要求忠实且可用，仅有次要差异 |
| 4 | 关键与次要部分均高度忠实、完整、稳定 |

### 2.1 视觉结构与布局（`layout`）

检查区域顺序、层级、对齐、留白、尺寸、密度、首屏构图和滚动分区。

| 分数 | 维度锚点 |
| ---: | --- |
| 0 | 主体结构不存在或页面用途无法辨认 |
| 2 | 主要区域存在，但比例、顺序或对齐有明显偏差 |
| 3 | 主要结构、层级和比例接近，只有次要偏差 |
| 4 | 关键区域、比例、对齐和构图均高度吻合 |

### 2.2 视觉样式与细节（`style`）

检查颜色、字体层级、边框、圆角、阴影、图标、图像裁切、媒体和控件外观。

| 分数 | 维度锚点 |
| ---: | --- |
| 0 | 样式系统缺失或整体视觉方向相反 |
| 2 | 风格可辨，但关键字体、素材或细节明显不符 |
| 3 | 主要视觉语言和素材处理接近，存在次要差异 |
| 4 | 关键与次要视觉细节均高度吻合 |

### 2.3 内容与组件完整性（`content`）

检查冻结的关键文案、区域、组件、媒体和信息层级是否完整。无来源事实若实质改变页面含义，另触发 `fabrication` 红线。

| 分数 | 维度锚点 |
| ---: | --- |
| 0 | 关键内容或组件大面积缺失，页面含义被改变 |
| 2 | 核心内容可辨，但有明显遗漏、替代或层级错误 |
| 3 | 关键内容完整，只有次要遗漏或文字差异 |
| 4 | 冻结内容、组件和信息层级均完整准确 |

### 2.4 交互与状态（`interaction`）

检查契约指定的按钮、菜单、表单、标签、滚动或动画触发能否操作，并产生可观察的正确反馈。

若入口进入持续交互系统，还检查冻结关键路径是否闭合：核心目标可推进和完成，失败后可按参考重试或复位，已观察的进度、奖励、持久化和解锁具有相同语义。候选自行声明的目标、计数或遥测不能替代目标/候选同状态成对证据。

| 分数 | 维度锚点 |
| ---: | --- |
| 0 | 核心动作不可完成或状态完全错误 |
| 2 | 主要动作存在，但多个状态、反馈或顺序明显有误 |
| 3 | 核心动作和状态可用，仅有次要反馈差异 |
| 4 | 指定交互、状态转换和反馈均稳定且高度吻合 |

### 2.5 响应式与运行稳健性（`robustness`）

检查目标视口下的加载、溢出、遮挡、资源、控制台错误和声明支持的响应式行为。

| 分数 | 维度锚点 |
| ---: | --- |
| 0 | 无法加载、崩溃或目标视口基本不可用 |
| 2 | 可运行，但有明显溢出、资源失败或视口退化 |
| 3 | 目标环境稳定可用，仅有次要问题 |
| 4 | 所有指定视口与状态均稳定，无可见运行缺陷 |

`fidelity` 不再是第六个分数。事实边界由冻结契约约束，越界事实由 `fabrication` 红线拦截；推断和未知项仍须在证据记录中明确标注。

## 3. 红线

每个 case 使用六个稳定 ID。适用性按冻结契约决定；证据不足为 `unknown`，没有对应要求为 `not_applicable`。

| ID | 失败条件 |
| --- | --- |
| `runnable` | 约定页面或必需状态无法打开，页面空白或崩溃 |
| `structure` | 关键区域缺失，或层级错乱使核心用途无法辨认 |
| `interaction` | 冻结的核心动作不能完成、可见目标总量不可达、关键路径无法进入成功/失败/重试状态，或没有必需的可见反馈 |
| `obstruction` | 必需内容或操作因遮挡、裁切、溢出而不可理解或不可用 |
| `fabrication` | 无来源内容被当作事实，并实质改变页面含义 |
| `external_writes` | 发生契约不允许的提交、消息或其他外部状态变更 |

严重度按任务后果判定：

| 级别 | 影响 | 红线状态 |
| --- | --- | --- |
| S0 | 无缺陷 | `pass` |
| S1 | 局部质量下降，但要求仍可见、可理解、可完成 | `pass`，同时进入维度残差 |
| S2 | 必需状态、内容或核心动作不可用，或重要事实被实质误述 | `fail` |
| S3 | 主要任务不可完成、核心含义被改变，或发生未授权外部写入 | `fail` |

画面声明的 `x/N` 目标总量不可达时，`interaction` 红线至少为 S2；Loop 的 `reachable` 门禁判定见 [Loop Criteria](../references/restore/criteria.md#measure--verify)。

具体结构由 [`E2ERedlineAssessment/v1`](../references/restore/e2e-redline.schema.json) 和 [`RedlineProfile/v1`](../references/restore/redline-profile.schema.json) 约束。Loop 的 `blocking / obvious / minor` 是修复优先级，不能复制为最终红线严重度。

## 4. 计算与判定

加权总分用于描述质量和比较版本：

`100 × Σ(weight_i × score_i / 4) / Σ(applicable weight_i)`

单 case 状态按以下顺序决定：

1. 任一适用红线为 `fail`，结果为 `fail`。
2. 任一适用维度低于 3，结果为 `fail`。
3. 任一适用维度或红线为 `unknown`，结果为 `incomplete`。
4. 其余结果为 `pass`。

不再另设 75 分通过线。五维等权且每项必须至少 3 时，总分自然不低于 75；重复门槛不提供额外判别力。Judge 未完成校准时，结果标记为 `provisional`，但不改变上述结构判定。

## 5. 校准与比较

- Judge 必须看冻结参考、状态、事实边界和最终产物，不得看到方案身份或修复者自述。
- 首次稳定使用前，用人工成对判断检查评分一致性、顺序偏差和主要错误类型；校准结果不足时只报告探索性结果。
- 当前 grader 将“已校准”限定为 quadratic weighted Cohen's κ ≥0.60、至少 30 个成对判断且偏差检查通过。该条件是工具门禁，不是已取得的项目事实。
- 跨方案比较以同一 case 配对；报告 case 数、均值、差值、不确定性、红线率和代表性回归，不把小样本点估计写成确定胜负。
- 历史 v1.0/v1.1 六维报告保持原样，不回填 `fidelity`、不重算，也不与 v1.2 五维结果混合聚合。

## 6. 输出要求

一次正式评测至少保存：

- 脱敏 manifest：dataset/case 版本、fixture 哈希、Skill commit、模型与 effort、环境、视口、运行设置；
- 每个 case 的最终产物哈希、`v0 → vN` 完整版本轨迹、ArtifactDiff、规范化静态检查、Judge 原始结果和人工裁决；
- 五维分数、六类红线、证据引用、限制和校准状态；
- 使用 [`templates/report.md`](templates/report.md) 生成的跨 case 报告。
- 同一 case 的连续 Restore run 复盘使用 [`challenge-report.mjs`](../scripts/restore/challenge-report.mjs)；它输出 [`RestoreChallengeReport/v2`](../references/restore/challenge-report.schema.json) provenance DAG，连接 run、版本、candidate、assessment、verification、diff、static-check 与 Final E2E。Final E2E、Loop Assessment 与 StaticCheckSuite 分开显示，跨合同组不得解释为同口径提升。

运行中事实以 `contract.json`、`run.json`、`events.jsonl` 和 observation 文件为准；`report.json` 与 HTML 是这些事实的呈现，不是第二套可手工维护的评分源。

## 7. 错误分类

版本复盘使用多标签 taxonomy：`layout-hierarchy`、`spacing-sizing`、`typography-color`、`asset-media`、`content-omission`、`interaction-state`、`responsive-overflow`、`runtime-resource`、`fabricated-fact`、`evidence-gap`。分类用于归因，不参与总分。
