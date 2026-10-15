# Restore Loop v0.1 历史运行契约与测量细则

v0.2 运行时契约见 [接口文档](../../references/restore/interfaces.md) 和 [Criteria](../../references/restore/criteria.md)；本文件保留旧试点口径，不能与 v0.2 控制器混用。

状态：**提案，未实现/未校准**。版本：0.1。上层产品决策见[PRD 与执行方案](../../references/restore-iteration-prd.md)；最终版本 Go/No-Go 沿用[站点 E2E 评测](site-restore-v1.md)及其 [Rubric](../rubrics/site-restore-v1.md)。本契约服务于单 case 修复诊断，不新增一套可随轮次更改的最终总分。

## 1. 责任边界

- `cases.yaml` 继续保存可筛选的 case 元数据；场景、参考证据和评分锚点放在版本化 fixture，不在 case 记录中嵌入大文件。
- `ingest` 检查契约和哈希；`capture` 采集参考及本地状态；`compare` 产生原始差异；`diagnose` 汇总偏差簇；`controller` 提议修改并决定保留/回退；`report` 输出可审计结果。评分器不改参考证据、契约或阈值。
- REA、Playwright/CDP 或其他浏览器能力都只作为可替换的采集适配器；记录工具版本、观察范围和缺口。REA 的附着观察、浏览器场景和独立 PNG 比较不能混写成一种能力。[REA 网站观察](https://github.com/morluto/rea/blob/main/docs/browser-observation.md)、[场景契约](https://github.com/morluto/rea/blob/main/docs/browser-scenario-contract.md)。

## 2. Case fixture：建议结构

以下是接口示意，**不是已部署的 Schema**。路径、动作、状态 ID 和期望结果在首轮执行前冻结；任何金图更新均升 `fixture_version`。

```yaml
case_id: CASE-EXAMPLE
fixture_version: 0.1.0
source:
  requested_url: https://example.org/
  observed_url: https://example.org/
  captured_at: 2026-10-13T00:00:00+08:00
  evidence_state: observed # observed | inferred | unknown | blocked
environment:
  browser: chromium
  viewport: { width: 1440, height: 900 }
  device_scale_factor: 1
  locale: zh-CN
  timezone: Asia/Shanghai
  color_scheme: light
  reduced_motion: no-preference
  storage_seed_ref: null
  data_seed_ref: null
states:
  - state_id: home-initial
    path: /
    ready_when: { kind: visible, locator: main }
    scroll: { kind: pixels, y: 0 }
    capture: [screenshot, dom, accessibility, console, network]
    reference:
      screenshot: evidence/home-initial.png
      sha256: TO_BE_FILLED_AFTER_CAPTURE
    regions:
      - region_id: hero
        importance: critical # critical | major | minor
        locator: main > section:first-child
        evidence: [{ kind: screenshot, ref: evidence/home-initial.png }]
    unknowns: []
  - state_id: menu-open
    from: home-initial
    actions:
      - { step_id: open-menu, kind: click, locator: button[aria-label='Menu'] }
    ready_when: { kind: visible, locator: nav[aria-expanded='true'] }
    capture: [screenshot, dom, accessibility, console]
    expected:
      - { kind: visible, locator: nav, critical: true }
      - { kind: url, value: https://example.org/, critical: false }
    reference: { screenshot: evidence/menu-open.png, sha256: TO_BE_FILLED_AFTER_CAPTURE }
```

实际 Schema 应校验：case/fixture 唯一 ID、唯一 `step_id`、资源哈希、起始状态引用、动作顺序、允许的证据状态、关键行为的观察来源。`observed_url` 必须指向实际落地页；平台资料页与它链接的工作室官网是不同目标。对登录、验证、区域限制或错误页，应分别记录实际可观察状态和目标不可观察状态。

## 3. Run manifest 与逐轮产物

运行前记录 `case_id`、fixture/Skill/评分器版本及哈希、模型和 effort、浏览器/操作系统/字体、启动命令、允许网络范围、实验臂、随机种子、轮次/时间/资源上限。没有完整 manifest 的结果只能用于探索，不能做跨版本决策。

```text
results/<run_id>/<case_id>/
  manifest.yaml
  reference-capture/             # 固定来源或受限本地引用
  baseline/                      # 第 0 轮完整产物与检查
  iterations/<round_id>/
    hypothesis.yaml              # 目标偏差、证据与预期改善
    candidate-ref.txt            # 候选提交或快照标识
    capture/                     # 按 state_id/step_id 的本地证据
    checks.json                  # 确定性检查与完整性
    diagnostics.json             # 区域/状态差异与置信
    decision.json                # keep | revert | inconclusive，理由
  residuals.json                 # 未修复、未知与不可复现项
  report.json                    # 完整输入、输出、指标、过程记录
  report.html                    # 离线审批页面；见 restore-loop-report-v0.1.md
  approval.json                  # 审批时导出，归档后才生效
```

每个检查结果都含 `status: pass | fail | unknown | not_applicable`、证据路径、采集完整性、影响区域/状态、严重度和检查器版本。`not_requested`、`truncated`、参考缺失以及动作未达到就绪条件不能被程序折算为 `pass`。失败是观察到的差异；未知是证据不足，两者单列。

## 4. 测量矩阵：静态、动态、个性化

| 层 | 程序化事实/诊断 | 评委介入点 | 主要误判与控制 |
| --- | --- | --- | --- |
| 静态内容与结构 | 关键区域/文本/资源出现率；元素边界与对齐差、遮挡/溢出；计算样式中的字号、字重、颜色、间距；区域化截图差异 | 图片/图标替代是否忠实、层次和质感、复杂 Canvas/3D 构图 | 像素受字体/抗锯齿影响；固定环境，保留差异图；图像相似度不单独判通过 |
| 动态状态与路径 | 每个动作的可执行性、等待条件、可见反馈、URL/DOM/可访问性状态、控制台/网络异常；关键帧截图和时序 | 运动节奏、手势反馈、3D 交互与过渡完整性 | 单个终态可能掩盖过程错误；按 `step_id` 对齐并采集中间状态 |
| 响应式/环境/个性化 | 对每个冻结的视口、语言、Cookie/登录/数据种子分别执行；检查预期变体和各变体的红线 | 无法固定的内容差异是否影响核心视觉/功能 | 不同初态不得直接比较；动态区域必须有事先定义的遮罩或语义期望 |
| 资源与运行 | 关键资源匹配及加载成功、页面可启动、主要错误与缺失素材、项目入口 | 可用替代是否足以承担原视觉角色 | 只发现同名资源不代表已用于目标区域；来源和页面用途须对应 |

实现时可将几何误差按视口尺寸归一化，对区域截图输出像素差及感知相似度作为**排序证据**；先检查渲染稳定性，再计算差异。是否采用 SSIM、LPIPS 或其他感知指标，要用本项目样本和人工判断比较后决定，不能在没有校准数据时选择一个为唯一指标。Playwright 官方也说明截图受操作系统、浏览器、硬件和字体影响；基准与候选必须在同类环境产生。[Playwright 视觉比较](https://playwright.dev/docs/test-snapshots)。

对 Canvas/WebGL、视频和生成式 3D：如果可控，固定相机、时间、随机种子和画质档；如果不可控，记录该限制，用对象/区域组成、交互状态及多个关键帧的人工或校准评委比较。动态画面不因某一帧像素不同即判失败，也不因某一帧相似即判成功。

### 可程序化的首版诊断口径

这些量用于定位和比较，不是未经校准的发布通过线；分母只包含**有参考证据且本次要求采集**的义务，未知项另报数量和原因。

| 指标 | 首版计算或判定 | 输出粒度 |
| --- | --- | --- |
| 状态覆盖率 | 已按契约完成采集的状态数 / 应采集状态数；就绪超时单列为失败，参考缺失单列为未知 | case、视口、变体 |
| 关键区域覆盖率 | 有对应实现且可见的关键区域数 / 已观察到的关键区域数；“存在”不代表“相似” | 页面、状态 |
| 关键资源可用率 | 已实际用于目标区域且成功加载的关键资源数 / 已证实可用的关键资源数；替代资源另报 | 页面、资源类 |
| 布局偏差 | 对匹配区域的边界框中心、宽、高和相邻间距分别求绝对差，除以视口宽/高；保存逐区域值及分位数 | 页面、状态、区域 |
| 文本/样式偏差 | 对冻结的关键文本判缺漏；对可匹配元素记录字体、字号、颜色等计算样式差；不对未知原样式补值 | 区域、元素 |
| 视觉差异 | 同环境、同状态、同尺寸截图按固定视口坐标对应，对预先定义区域输出像素差/候选感知指标和差异图；遮罩面积占比单列。不得事后平移画面掩盖布局错位 | 状态、区域、关键帧 |
| 动作成功率 | 观察到预期反馈的关键动作数 / 有观察真值且已执行的关键动作数；失败、未执行、未知分列 | 路径、步骤 |
| 回归数 | 本轮前通过、而本轮失败的冻结义务数；关键与非关键分开，不与改善项抵消 | 轮次、状态 |

**个性化口径**指每个网站另有少量事先冻结的关键义务：例如资讯站重视信息层级，编辑器重视状态切换，3D 展示重视场景与操控。它们作为现有六个 E2E 维度的证据和关键性标记，不在运行中临时改动全局权重；同一 case 的所有方案共用相同义务。对网站真实存在的语言、登录或数据变体，另按环境矩阵分别重放，不拿不同变体的截图互评。

## 5. 差异账本与优先级

诊断项建议字段：`issue_id`、`state_id`、`region_id`、`observed_delta`、`reference_evidence`、`local_evidence`、`confidence`、`severity`、`failure_class`、`suggested_hypothesis`、`dependency`、`resolution_status`。一项偏差可关联多个状态；每轮先合并同因错误，避免对每张截图重复修同一 CSS 根因。

优先级采用字典序，而非把不相干目标硬压成单一分数：

1. 阻断运行、核心页面、关键内容或关键交互的红线。
2. 用户可见面积大、出现频次高且参考证据强的偏差。
3. 影响多个页面/状态的共因，例如字体、全局栅格、素材或场景初始化。
4. 局部装饰差异。若修复成本或回归风险过高，在报告中保留并解释。

视觉“重大改善”要先在开发样本上标定最小可辨差；未标定前只报告原始差、方向和重复性。修复器不得自行上调遮罩范围、修改金图、放宽等待条件或给失败状态改成不适用。

## 6. 控制器状态机与保留规则

```text
PREPARE → BASELINE → DIAGNOSE → PATCH → VERIFY → DECIDE
                            ↑                    │
                            └── keep/revert ──────┘
VERIFY → STOP_SUCCESS | STOP_BUDGET | STOP_PLATEAU | STOP_BLOCKED
```

- `BASELINE` 必须在任何自主修复前完成，且检查器须能发现一项已知或人工植入的错误；否则先修检查器。
- `PATCH` 写一条可证伪假设：“修改 X 后，状态 S 的区域 R 预计改善，状态 T 不退化”。保存候选快照；不得顺手改评测器。
- `VERIFY` 重放全部冻结状态，并对本轮目标至少重复采集以识别偶然波动；一次采集失败只可重试同一契约，不可换条件直至通过。
- `DECIDE`：新增红线或关键回归即 `revert`；证据缺失/噪声大于预期改善为 `inconclusive`；目标改善稳定且无关键回归才 `keep`。非关键维度之间的取舍需在预先约定的任务权重和人工复核下决定。
- 成功停止须满足所有适用红线与质量门槛，并披露残差；预算/平台阻塞停止不得标成成功。连续两轮无可信收益可作为首版 plateau 提案，试点中再校准。

## 7. 评分器可信度与反投机

复用现有 E2E spec 对 LLM Judge 的盲化、人工校准、加权 κ 和顺序偏差检查。修复循环中的评委输出同时包含偏差位置、对应证据、置信和不能判断的项目；不得只给总分。开发时可见的诊断集与用于版本决策的封存集隔离。

最小反投机检查：单张首屏高分但关键路径失败、截图遮罩过大、隐藏或删除难实现区域、静态图片冒充有交互的 3D 场景、只在一个视口生效、把第三方验证页当目标、通过修改测试规约获取“进步”。这些情况由确定性检查、跨状态抽查或人工复核触发，归因须记录具体 case。

## 8. 最小试点和待决参数

先在三类异质 case 上做 P0/P1，分别选静态内容、交互丰富、3D/动效页面；从现有六个草稿中筛选可访问且证据允许冻结的目标。若某案例无法稳定访问，保留草稿状态并替换试点，不把受阻页面当作正常通过样本。

实施前必须决定并写入 manifest：具体试点、合法/可存的参考证据、目标浏览器环境、每个状态的就绪条件、轮次和资源预算、各诊断指标的适用范围与阈值、人工校准样本、REA 试点的评价条件。现有 75/100 等 E2E 通过线是草案，不自动转换成每轮 keep 阈值。

**完成标准**：独立执行者能从 fixture 重放全部目标状态；参考/候选证据有相同环境与完整性说明；每个保留决策可用保存的检查结果复核；失败、未知、未请求被正确区分；报告能指出实际改善、回归及仍未覆盖范围。此文档只规定未来标准，当前没有跑分或校准结果。
