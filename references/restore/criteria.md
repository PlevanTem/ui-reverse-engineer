# Restore Loop Criteria v0.2

适用于一次 `--restore` 运行中的视觉自检。评估单元：页面 × 状态 × 视口 × 区域。`unknown`（缺证据）和 `not_applicable`（证实不适用）不是分数。目标等级为 3；4 不触发继续迭代。

| 等级 | C1 构图：结构、位置、比例、层级 | C2 外观：字体、配色、素材、材质 | C3 动态：轨迹、节奏、转场、视觉反馈 |
| ---: | --- | --- | --- |
| 0 | 主体缺失或完全错误 | 核心视觉对象缺失或整体冲突 | 应有动态未实现，或被静态图替代 |
| 1 | 零散局部相似，主区域明显错位 | 少量元素相似，主素材和风格错误 | 零散动作，触发或运动关系错误 |
| 2 | 主体可辨，比例、层级或密度明显偏差 | 大体可辨，关键字体、素材或质感不同 | 主要效果存在，轨迹、节奏或衔接明显不同 |
| 3 | 主要结构与比例忠实，仅次要偏差 | 主要素材、风格和细节忠实，仅次要偏差 | 关键动态与反馈忠实，仅次要偏差 |
| 4 | 关键及次要区域高度吻合 | 素材处理和视觉质感高度吻合 | 关键及次要动态稳定连贯、高度吻合 |

同一原因影响多个维度时，记录各自的可见后果，但只生成一个修复任务。资源、框架、引擎是实现依赖和归因标签；响应式是采样轴，不增加重复的第四维。没有三维加权综合分。

## 页面专属 Q&A

生成 `v0` 初始版本前冻结 `contract.json`。每项 obligation 写明 `criterion_id / state_id / region_id / expected / importance / reference_evidence / method / required / target=3 / applicability`。最多优先标记 5 个视觉锚点，但中段、页尾仍纳入覆盖。`importance` 为 `blocking`（主体或关键视觉状态缺失）、`obvious`（正常浏览可见且影响整体观感）、`minor`（次要局部）。在 `not_applicable` 和 `unknown` 下写明原因；C3 有分数时必须引用时间序列或视频。

## Measure → Verify

程序检查负责可运行、几何、资源、字体、状态和时序，并按 `StaticCheckSuite/v1` 绑定具体版本；截图差异用于定位，不单独决定通过。绝对 Judge 依据参考、页面 Q&A 和 0–4 rubric 评价当前质量；pairwise Judge 依据参考、最佳版和候选判断相对改善。修复器的自述不得作为 Judge 输入。每个候选必须记录相对上一最佳版本的 `ArtifactDiff/v1`，包括文件、unit 分数、gate 状态和 finding 增减。

候选决策使用增量语义。gate 顺序为 `fail < unknown < pass`：相对当前 best，`pass → unknown/fail` 和 `unknown → fail` 是回归；`fail → unknown/pass` 和 `unknown → pass` 是改善；原有 `fail` 保持 `fail` 不算新增回归。required unit 的 `scored → unknown` 或分数下降是回归；`unknown → scored` 是首次取得可验证证据，计为可审计改善，但其分数只记录为候选值，不与旧 `null` 做数值比较；`unknown → unknown` 不是改善。`keep` 必须同时满足：所有 required unit 均没有降分或失去分数；没有 gate 回归；没有新增 blocking/obvious finding；A/B 双顺序都选择 candidate；`visible_improvement=true`；产物哈希变化；仍有修复预算；并且至少有一项可审计改善——unit 分数上升或首次从 `unknown` 变为 `scored`、gate 改善，或覆盖范围内的既有 finding 已解决（包括 `minor`）。finding 只有在候选不再包含同一 ID，且同一 obligation 没有保留等价严重残差时才计为已解决：原 finding 为 `minor` 时，同 obligation 的任一残差都会阻止该改善；原 finding 为 `obvious` / `blocking` 时，同 obligation 仍有 `obvious` / `blocking` 残差会阻止该改善。只被 pairwise 偏好、但没有上述结构化改善的候选为 `inconclusive`；unit/gate 回归、新增重大 finding 或 pairwise 选择 best 时 `revert`。预先存在的失败门禁不阻止局部改善版本被 keep；但 `target_reached` 仍要求全部运行门禁通过、所有必需目标达标且没有 blocking/obvious 残差。2 分内部、首次取得评分或 minor finding 的可审计改善都可以保留。

Loop 达标：独立评估者覆盖每个必需单元；适用单元均 ≥3，不适用单元有事先冻结的理由；运行门禁全部通过；没有阻断或明显残差。缺失参考的 `unknown` 不算通过。局部候选被 keep 仅表示它优于上一 best，不表示 Loop 已达标。

玩法/3D 的 C3 证据须覆盖契约中的实际输入与可见状态转换，包括指定的路径、动作中段、终态及重复/复位要求；只证明 handler 存在或自行新增的计数变化不足以证明还原。空间旋转、命中或切割是核心要求时，平面变换或装饰动画的可见差异应记为行为残差，不因页面可点击而给到 3。采样的实际时间和迟到记录用于解释时序差异，不把配置中的目标时间当作已测事实。

持续交互系统的 C3 必须按冻结关键路径逐段判定。同名按钮、相似 HUD、候选侧计数变化或一次性演示状态，不足以证明核心循环闭合。画面声明 `x/N`、等级、生命、货币或解锁条件时，至少验证一个从真实入口到推进、完成/失败、重试/复位的可达轨迹；若 `N` 在候选中不可完成，相关义务最高为 1，`reachable` 门禁失败。持久化或解锁仅在目标已观察且候选经刷新、返回或下一局仍保持相同语义时计分。目标和候选没有相同语义状态的成对证据时，状态为 `unknown`，不得仅凭候选遥测评分。

最终五维评分及版本比较不在本文件定义，见 [Restore 最终 E2E](../../evals/restore.md)。
# Loop 视觉义务与最终 E2E 红线是两套判定

本文件定义 Restore 迭代期间的局部视觉义务和 finding 记录方式，用于决定是否修复候选页面。这里的 `blocking`、`obvious`、`minor` 是 Loop 诊断严重度，不是最终 E2E 红线严重度。最终交付验收的六类红线、S0–S3 影响锚点、证据要求和 grader 规则见 [Restore 最终 E2E](../../evals/restore.md#3-红线)。不得直接把 Loop finding 的严重度复制为最终红线 verdict。
