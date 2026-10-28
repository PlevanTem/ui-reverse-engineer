# 变更日志

### 2026-10-28 — ASCII 动效、案例生成状态与 GitHub Pages 发布

- **范围：** 首屏 ASCII 球体增加低帧率旋转与暂停/播放，离屏及后台停止；遵循减少动态偏好。按钮改为“观看示例”。卡片右上角及案例库筛选按已生成/待生成分类，仅 Tiny Skies 已生成；评测草稿状态独立保留。移除首页数据统计区，上手区顺延为 07。
- **部署：** 增加 GitHub Pages Actions 工作流，在 main 的网站相关变更或手动触发时构建 `website/dist` 并部署；相对路径支持 repo 子目录。双语 README 增加站点与设计系统链接。
- **验证：** 构建、JS 语法和 diff 检查通过。真实 Chromium 验证动效变化、暂停、减少动态、按钮文案、数据区移除、1 个已生成/10 个待生成及筛选、390px 无整页横向溢出。
- **推送：** 用户已授权推送与 Pages 部署，待发布后记录结果。

### 2026-10-28 — 首页 04 改为同类项目能力与机制矩阵

- **范围：** 将单项目证据成熟度清单替换为 UI Reverse Engineer / Screenshot to Code / Open Lovable 的 18 项机制对比，分视觉设计、交互 3D、工程验证三组；突出状态采集、keep/revert、产物与证据绑定。单元格链接官方来源，附核查日期和范围；未见说明不解释为不支持。同步 DESIGN.md、设计系统、双语 README。
- **依据：** 查阅两项目官方 README、Screenshot to Code Evaluation.md、Open Lovable 主页及 URL 采集接口；保留对方录屏、截图自检、人工评分与品牌扩展能力。不作未经同条件实测的效果排名。
- **验证：** 构建、JS 语法与 diff 空白检查通过；真实 Chromium 验证三组各 6 行/18 个证据链接、Tab 键盘切换、390px 手机表格容器内横向滚动且无整页溢出、0 页面脚本错误。桌面与手机截图保存在本地 QA 输出。
- **推送：** 未提交、未推送。

### 2026-10-28 — 项目展示站与可审计设计系统

- **范围与原因：** 先增加根目录 `DESIGN.md` 和共享 tokens，再实现本地 Technical Mono / Monochrome / ASCII 展示站，包含首页、可筛选案例库、11 个数据驱动详情、Tiny Skies 公开视频、上手页和设计系统组件预览。同步双语 README；案例事实从现有 YAML 白名单构建，附源哈希，不修改 Skill 运行时和评测契约。
- **边界：** 草稿案例、公开展示和 ready 状态分开展示；Tiny Skies 保留 source-assisted 与 README 展示结果 fail/provisional，不制造逐版本分数。官方媒体远程引用，不提交视频或用户产物。此轮仅交付本地网站，未发布。
- **验证：** 构建、JS 语法和 `git diff --check` 通过；真实 Chromium 验证 1440/390px 六类页面无整页溢出，11 个详情、案例搜索/筛选/重置、ready 空状态、任务深链接、复制、键盘 Tab 与移动菜单。视觉检查发现手机 Hero 缺 gutter 后修复。官方封面/视频加载为 1920×1080、88 秒；未重验全片解码或游戏 E2E。`skills-ref` 不可用；详细记录见 `website/AUDIT.md`。
- **推送：** 未提交、未推送。

### 2026-10-24 — 中英文 README 增加 Tiny Skies 横屏展示

- **范围与原因：** 用 Tiny Skies v1–v28 迭代视频替换双语 README 的展示占位；中英文分别链接对应横屏视频、封面和校验信息。仅展示媒体存放在非 Latest 的专用 Release，不把案例输出、游戏代码或视频二进制写入 Git 历史。
- **边界：** 明确 source-assisted、代码重建美术资产、未使用 3D 生成 MCP，以及最新评测 `fail / provisional`、未验证玩法和 Judge 未校准；不把展示改善冒充基准通过或 RL 训练结果。
- **验证：** 双语 README 的 31 个相对链接及语言/封面配对通过；两支视频均为 88 秒、1920×1080、H.264、30 fps，完整解码无错误；四份 Release 资产的服务端 SHA-256 与本地一致，公开链接全部 HTTP 200。`git diff --check` 通过；`skills-ref` 未安装。本次不修改运行时代码或依赖，未重跑游戏评测或完整运行时测试。
- **推送：** 本次通过独立 `codex/tiny-skies-bilingual-showcase` 分支提交 PR，不合并 `main`；仅包含两份 README 和本条记录，不带入原工作区的其他改动。

### 2026-10-23 — 标准报告窄屏页脚换行

- **原因：** Tiny Skies 独立复评报告在 390px 视口下，页脚完整 SHA-256 文本撑宽页面至 412px；定位到文本 Range，排除证据对比容器内部滚动。
- **范围：** 仅为标准报告模板页脚增加 `overflow-wrap:anywhere`，同步中英文 README 与报告呈现检查说明；不改候选游戏、冻结合同、评分或依赖。
- **验证：** 真实 Chromium 桌面 1440×900、手机 390×844 均无整页横向溢出、0 页面脚本错误，236 个唯一图片链接和 345 个本地链接均 HTTP 200；未请求的 lazy 图片单列。报告与控制器回归 33/33 通过（含新增页脚规则回归）。用户案例产物仅保留本地，不提交；未推送。

### 2026-10-23 — 统一报告升级为 provenance DAG，并修复 v28 candidate 证据显示

- **原因：** v1 统一报告只能并排汇总 run，无法机器追踪 parent、版本、candidate artifact 与评估产物之间的依赖；v28 单次报告还把从工作树继承的 candidate 标成普通 `v0 初始版本`，且 candidate 图片采用延迟加载，在长报告或内嵌预览中可能不稳定。
- **范围：** `RestoreChallengeReport/v2` 新增规范化 provenance 节点、边、root、issue 与统计，覆盖 run、版本、artifact、assessment、verification、diff、static-check 和 Final E2E；lineage 校验无父节点、循环和 legacy/invalid 关系，缺失状态增加 reason code、原因层、可恢复性、来源引用和受影响结论。生成器仍为本地无依赖、只读、确定性脚本，大证据只链接不复制。v28 单次报告将继承的工作树基线明确标为 `v0 继承候选 · 独立基线`，candidate 截图改为 eager load，参考截图仍保留 lazy load。
- **验证：** 定向 Node 回归测试 32/32 通过；`RestoreChallengeReport/v2` Schema 通过 Draft 2020-12 meta-schema 与实例校验。Tiny Skies 汇总 30 个 run、94 个版本、387 个节点、495 条边和 14 条跨 run lineage 边，并保留 2 条历史 lineage 问题。真实 Chromium 检查 v28 单次报告 23 张图片全部解码成功、0 张损坏、8 张 candidate 图为 eager load；统一报告无控制台或请求错误。报告 JSON / HTML SHA-256 以本次生成输出为准；未把浏览器导航导致的媒体请求主动取消误记为图片失败。
- **推送：** 未提交、未推送。

### 2026-10-23 — Restore 多 run 统一评测报告

- **原因：** Tiny Skies 连续 run 的单次报告可审计，但缺少一个不会混淆 Final E2E、Loop Assessment 与静态检查的统一视图；旧的手工 challenge HTML 也容易与事实源漂移。
- **范围：** 新增 `scripts/restore/challenge-report.mjs`，从显式 run 列表只读生成 `RestoreChallengeReport/v1` JSON 和单文件 HTML。报告包含版本轨迹、Final E2E 五维、最新 StaticCheckSuite、Go 后状态覆盖、unknown/finding 与生成政策；以 `contract_sha256 + rubric + scorer` 划分可比组，缺失报告标 `unavailable`。同步中英文 README 与 Restore 接口说明；无新增运行时依赖。
- **验证：** 新增 mixed complete/loop、missing report、unknown score 与 best-bound 静态套件回归测试；完整 Restore Node 测试 50 项中 46 通过、4 项真实浏览器集成按环境条件跳过、0 失败。`RestoreChallengeReport/v1` Schema 通过 Draft 2020-12 校验，最终 Tiny Skies 报告汇总 30 个 run；JSON / HTML SHA-256 分别为 `971d24a68ac23df1f590cf856ea980587563d0193cc6a142d105b3966fded278` / `28a286326074b4af4a2539f058dea29c36bf16c528487da479878dedcd5c72dc`。浏览器 UI 因安全策略拒绝 `file://`，未绕过；报告已在 Codex 本地文件面板排队打开，浏览器视觉验收如实保持未执行。
- **推送：** 未提交、未推送。

### 2026-10-21 — Restore Loop 将 unknown→scored 计为证据改善

- **原因：** required unit 首次取得可验证长链证据时会从 `unknown` 变为 `scored`；旧决策器只在前后均为 scored 时计算数值 delta，因此该进步不能进入可审计改善，双向 pairwise 已确认的候选仍可能被判为 `inconclusive`。
- **范围：** unit Diff 新增 `status_change`，区分 `newly_scored`、`lost_score`、`unchanged` 与其他变化；`unknown → scored` 纳入 unit 改善但保持 `delta=null`，不把旧 `null` 当数值比较。`unknown → unknown` 不改善；required unit 的 `scored → unknown` 与 scored 分数下降仍回退。报告显式展示首次评分/失去评分；ArtifactDiff v1 Schema 以可选字段保持历史记录兼容。Criteria 更新唯一决策规则；中英文 README 已链接 Criteria，无需重复新规则。
- **验证：** 三条定向状态转换测试全部通过；`node --test scripts/restore/tests/*.test.mjs` 通过 45 项，4 项真实浏览器集成按环境条件跳过。新增用例分别覆盖 `unknown → scored` keep 且 `delta=null`、`unknown → unknown` inconclusive、`scored → unknown` revert；既有分数下降、pairwise 和回归守门继续通过。核心、报告与测试脚本语法、ArtifactDiff Schema JSON 解析、Skill quick validation、`git diff --check` 通过；`skills-ref` 当前不可用。首次沙箱执行 Node 测试因 `spawn EPERM` 无法创建 worker，在允许子进程的环境用相同命令重试后通过。
- **推送：** 未提交、未推送。

### 2026-10-21 — Restore Loop 将已解决 minor finding 计为可审计改善

- **原因：** 修复循环允许任意严重度的已观察 finding 成为目标，但决策器只把 blocking/obvious finding 的解决计入结构化改善，导致 minor 目标已消失、双向 pairwise 均选择 candidate、可见改善且无回归时仍被判为 `inconclusive` 并回退。
- **范围：** `record()` 将覆盖范围内已解决的 `minor` finding 纳入 `improvements.resolved_findings`。同 ID finding 未消失或同 obligation 仍有对应严重残差时不计解决；unit/gate 回归、新重大 finding、双向 pairwise、`visible_improvement`、产物哈希和预算门槛保持不变。唯一决策规则同步到 Criteria；中英文 README 只链接该规则，不复制判定细节。
- **验证：** `node --test scripts/restore/tests/*.test.mjs` 通过 42 项，4 项真实浏览器集成按环境条件跳过；定向 core 回归 27/27 通过。新增 resolved minor keep 与 unresolved minor inconclusive 两条测试，既有 gate 回归、pairwise 选择 best、无结构化改善等守门测试继续通过。`core.mjs` 与测试脚本语法、Skill quick validation、`git diff --check` 通过；`skills-ref` 当前不可用。首次沙箱执行 Node 测试因 `spawn EPERM` 无法创建 worker，在允许子进程的环境用相同命令重试后通过。
- **推送：** 未提交、未推送。

### 2026-10-21 — Restore 动态采集增加显式持久化会话

- **原因：** Tiny Skies 的 Carpet、Boat 与跨载具终局必须在真实前置进度后验证；旧采集器为每个 state 创建 fresh browser context，非空 steps 仍会从锁定载具开始，无法执行完整路径。
- **范围：** state 新增可选 `session_id`。默认逐 state 隔离不变；相同 ID 的 states 按合同顺序共享浏览器存储，但每段新开页面、单独导航和取证。共享会话禁止预载 `storage_state`，并要求固定视口与配色。定向 candidate 采集自动闭合所需 session 前缀；前段或清理失败后，该 session 的后段只记录 prerequisite 失败，不从空 context 继续。Node/Python 采集器记录会话 ID，并统一证据时间戳格式；接口 SOP、Skill 入口和中英文 README 同步。
- **验证：** Node capture 测试 15/15 通过，4 项真实浏览器集成按环境条件跳过；Python capture/clock 测试 7/7 通过。启用已安装 Python Playwright 后，采集聚焦测试 17/17 通过、2 项仅 Node Playwright 的集成按条件跳过，其中真实浏览器证明同 session 的第二段可见前段写入，而默认隔离 state 看不到该存储。共享会话计划、session 前缀闭包、预载存档拒绝、视口/配色漂移拒绝、非法 ID、setup/capture 故障诊断、page/context 双重清理、原始失败与 cleanup 失败合并保留及前置失效传播均有回归测试；Node/Python 语法通过。沙箱首次启动 Node 测试 worker 和 Python/Playwright 子进程时分别出现 `spawn EPERM` / `WinError 5`，用相同命令在允许子进程的环境重试后通过。
- **推送：** 未提交、未推送。

### 2026-10-20 — Restore 捕获动作增加同上下文 reload

- **原因：** Tiny Skies 的死亡后第二次 GO 与升级/解锁持久化要求跨 reload 验证；旧 CaptureStep 只能做输入和等待，合同只能描述 reload，不能执行它。
- **范围：** `CaptureStep/v1`、Node/Python 动作执行器增加 `reload`，在同一浏览器上下文内用 `domcontentloaded` 重载当前页面，保留 localStorage，并允许以 `ready_selector` 等待重载后的地标。唯一接口 SOP 同步说明。
- **验证：** Node 动作单测覆盖 reload 调用、重载后地标等待与采样；完整采集、Restore、Python 时钟隔离、Schema 和 Skill 校验在本轮后统一记录。
- **推送：** 未提交、未推送。

### 2026-10-20 — Restore 新增合同重新冻结 lineage

- **原因：** `continue` 只能原样继承旧冻结合同；冻结后发现关键路径或验收义务遗漏时，既有接口无法合法保留父 best provenance 并替换合同。
- **范围：** 新增 `refreeze OLD_RUN NEW_RUN CONTRACT_SOURCE [TIER]`。命令要求父 run 已冻结且有可校验 best，只复制父 best snapshot/restored，从显式已变更合同及其引用证据创建 `phase: prepare` 的新 run。`RestoreLineage/v1` 新增 `contract_refreeze`，绑定父冻结合同、父 best、新合同来源的 canonical/字节哈希、证据列表哈希和继承产物；最终 `freeze` 必须保持合同不同于父合同。参考证据只允许在 `evidence/` 或 `reference-source/`，创建与最终冻结共用同一门禁；按 Windows 等价语义规范化并拒绝尾随点/空格、NTFS 冒号数据流和保留设备名。报告分别显示 continuation 与 contract refreeze，并重放来源绑定。`continue` 语义保持不变，无新运行时依赖。同步唯一接口 SOP、Skill 入口和中英文 README。
- **验证：** Node 测试 36/36 通过，3 项需真实浏览器的集成测试按环境条件跳过；Python capture clock 测试 3/3 通过。覆盖成功创建、父未冻结/无 best 拒绝、旧/新/最终合同哈希分离、父 best 继承、新证据复制、评分不继承、继承快照与合同来源篡改拒绝、最终冻结前再次执行证据路径门禁、Windows 路径别名/尾随点空格/ADS/设备名拒绝、`reload` 动作、报告可读和 `continue` 回归。核心、CLI、报告和测试脚本语法通过；CaptureStep 与 Lineage Schema 通过 Draft 2020-12 meta-schema；Skill quick validation 与 `git diff --check` 通过。首次沙箱测试因 Windows `spawn EPERM` 无法创建 worker，按环境故障用同一命令在允许子进程的环境重试后通过。
- **推送：** 未提交、未推送。

### 2026-10-20 — 明确结构化记录与证据文件的两种 SHA-256 口径

- **原因：** Tiny Skies Round 2 复核把 `run.static_checks[].sha256` 的 canonical JSON digest 与同一 JSON 文件作为 assessment evidence 时的字节 SHA-256 直接对比，将两个正确但不同的值误判为文件漂移。
- **范围：** 核验控制器与报告后确认现有逻辑正确，不改 `core.mjs`、历史 `run.json` 或 Tiny Skies 产物。接口唯一控制文档现明确：结构化 JSON pointer 使用 `digest(value)`，`evidence[].sha256` 使用 URI 文件字节 SHA-256；字段更名只能在后续版本化 Schema 迁移中进行。中英文 README 同步链接说明。
- **验证：** `node --test scripts/restore/tests/*.test.mjs` 通过 32 项，跳过 3 项真实浏览器集成；回归新增同一静态检查记录的 canonical digest、文件名和 evidence 字节哈希断言，用 pointer digest 冒充 evidence 字节哈希必须 fail-closed。测试脚本语法、StaticCheck Schema JSON、Skill quick validation 与 `git diff --check` 通过；首次沙箱内测试因 Windows `spawn EPERM` 无法创建 worker，获准在可启动子进程的环境重试后通过。
- **推送：** 未提交、未推送。

### 2026-10-20 — Restore Loop 改为增量门禁与可审计改善决策

- **原因：** 旧 `record()` 只要候选仍有任一失败 gate 就回滚，且 keep 强制所有 gate 为 pass；baseline 有多个既存失败时，任何只修复一部分的中间版本都无法保留，多轮迭代被逻辑上截断。
- **范围：** 候选改为相对 current best 比较 gate：`fail < unknown < pass`，仅状态下降回滚，既存 fail 不算新增回归。keep 仍要求无 required unit 回归、无 gate 回归、无新增 blocking/obvious finding、双向 pairwise 选 candidate、可见改善、产物变化和剩余预算，并新增至少一项结构化改善门槛（unit 升分、gate 改善或重大 finding 解决）。`target_reached` 的全 gate 通过要求不变。`ArtifactDiff/v1` 与 HTML/T2/T3 报告增加 gate changes。决策规则唯一维护在 Criteria，中英文 README 只链接说明。
- **验证：** `node --test scripts/restore/tests/*.test.mjs` 通过 32 项，跳过 3 项真实浏览器集成；新增多 fail 部分改善 keep、pass→fail revert、无结构化改善 inconclusive、全 pass 正常 keep 回归，并验证报告输出 gate changes。核心与报告脚本语法及 `git diff --check` 通过。
- **推送：** 未提交、未推送。

### 2026-10-20 — 修复跨版本证据路径碰撞导致历史报告不可生成

- **原因：** 不同版本可复用同一 `evidence/...` URI；后写文件覆盖前一版本后，运行时保存的 assessment 仍引用旧哈希与可变路径，导致报告重放严格校验时整体失败。
- **范围：** `initial-record` / `record` 在运行期严格校验后，将 assessment evidence 内容寻址归档到 `observations/evidence-archive/<sha256>/...`，持久化 assessment 改引归档副本。报告只读重放遇到历史证据缺失、绑定 snapshot 缺失或哈希漂移时输出 `integrity: degraded` 与逐项版本/ID/URI/expected/actual/error，隐藏失效媒体并撤销依赖结论及正向审批；运行期 measure/record 校验保持 fail-closed。历史 run 无需迁移。同步接口和中英文 README。
- **验证：** `node --test scripts/restore/tests/*.test.mjs` 通过 28 项、跳过 3 项真实浏览器集成；新增运行期漂移拒绝、历史同 URI 覆盖降级生成、新记录归档不受后续覆盖、绑定 snapshot 漂移/缺失降级回归。核心与报告脚本语法、`git diff --check` 通过；`skills-ref` 当前不可用。
- **推送：** 未提交、未推送。

### 2026-10-20 — 补齐持续交互系统的关键路径与目标可达性门禁

- **原因：** Tiny Skies 复盘发现旧契约把 GO 后体验压缩为首个飞行画面、单次升级与简化竞速；候选即使无法完成 HUD 声明的 `7` 个 Gremlin、`3` 个包裹和完整竞速，仍可因候选侧遥测而取得较高交互分。这证明“入口可点、状态存在”不等于核心玩法等价。
- **范围：** Restore SOP 要求入口后继续冻结到可重复核心循环、成功/失败、重试/复位及已观察的持久化/解锁/终局；发现关键漏项须新建重新冻结的 run，不能改写原契约。Criteria 新增同语义成对证据、目标分母可达性和持久化验证门禁；最终 E2E 将不可达目标与断裂关键路径列为 `interaction` S2。同步交互场景参考、brief、Skill 入口和中英文 README。
- **架构与依赖：** 不新增 Schema、服务层或运行时依赖；现有 `InteractiveScene/v1.transitions` 已能表达 precondition、feedback、terminal state、repeat/reset 和 evidence，本次收紧语义与验收规则，保持历史 run 可读。
- **验证：** 待完成文档链接、Schema、Skill quick validation、Restore 测试和 `git diff --check`；Tiny Skies 将在新冻结 run 中以完整 GO 后关键路径回归。
- **推送：** 未提交、未推送。

### 2026-10-20 — 修复版本化静态检查证据漂移

- **原因：** 历史 `StaticCheckSuite/v1` 可把 `restored/app.js` 作为源码证据，但报告重放时从当前工作树读取，后续 best 版本会使旧套件误报 `Evidence changed`。
- **范围：** 证据校验器支持 artifact 绑定；报告将套件中的 `restored/...` 解析到 `snapshots/<artifact_sha256>/...`，普通 run 相对证据保持原规则。读取文件前校验整份 snapshot 的树哈希，缺失或篡改时明确失败，不回退到当前工作树。同步接口和中英文 README。
- **验证：** Restore 控制/报告测试 14/14，通过“历史源码证据 + 后续新 best”回归；另覆盖绑定 snapshot 篡改与缺失拒绝。Tiny Skies v12 报告重生成成功，原 `r1-app` 阻断消失，结构化报告哈希为 `f05dd2721a84b67f646deb1c5c6b00089f4ac429a7c69ed3d072200e90f47059`。
- **推送：** 未提交、未推送。

### 2026-10-20 — Restore 关联延续 run

- **原因：** complex run 达到预算或轮数上限后，继续挑战不应篡改父 run 的开始时间、停止事实或事件账本，也不能丢失预算截止时尚未验证的当前工作树。
- **范围：** 新增 `continue OLD_RUN NEW_RUN [TIER]`。命令只读父 run，复制冻结 contract、reference evidence、生成策略和当前 `restored/`，创建新预算与 `run_id`；`RestoreLineage/v1` 记录父 run/账本/契约/最佳快照及继承产物哈希。父工作树偏离 `best` 时显式标为 `working_tree_unverified`，并要求在新 run 重新 `initial-record`。父 `design_brief.md` 复制为子 run 可写工作副本；父 brief 缺失时从冻结 contract 投影最小副本，lineage 记录父链接、来源和初始哈希，但不把可写副本锁死。lineage 总是预记确定性的父报告相对链接，报告尚未生成时不伪造内容哈希；子报告展示 lineage，不合并父轨迹。同步执行 SOP、接口和中英文 README。
- **依赖与兼容：** 无新增运行时依赖；沿用 `restore/v0.2` run 和报告版本，lineage 为可选 sidecar。`source_assisted` / `fixture_only` 策略原样继承，generation/evaluator 隔离规则不变。
- **验证：** Restore 控制/报告测试 15/15 通过，覆盖父 `run.json`/`events.jsonl` 字节不变、working tree 继承标记、冻结证据哈希、source-assisted 策略继承、新 `v0` 重测、父报告链接、父 brief 复制、缺失 brief 的 contract 投影、子 brief 独立可写、重复目录拒绝和 lineage 篡改拒绝；核心、CLI、报告及测试脚本语法通过。
- **推送：** 未提交、未推送。

### 2026-10-20 — 隔离 Restore 截图成本与页面时间

- **原因：** 动态 WebGL 采集显示，PNG 序列化可能显著慢于输入动作。旧采集器在截图期间继续推进 `requestAnimationFrame`、游戏计时器和后续采样的宿主时钟，使同一冻结轨迹因机器截图成本不同而到达不同玩法状态。
- **范围：** Node/Python 采集器在导航前安装 Playwright page clock；每帧用 Chromium lifecycle + page clock 双重冻结，只排除截图区间，再恢复页面。页面当前时间的读取与暂停在同一页面任务内原子完成，避免长导航后公开 `pauseAt` 的协议竞态，也不使用会累计污染状态的固定 epsilon。动作执行器改用扣除截图耗时的 active timeline；`key_hold.capture_at_ms` 从 keydown 起算并在采样期间保持按下，到 `duration_ms` 才释放，其他动作继续使用输入完成后的采样语义。Node/Python 共用同一浏览器区域事实表达式，新增 `CaptureRegionFact/v1`，以自身/祖先 CSS 与属性、client rect 和视口交集计算 `visible`，避免把 opacity 0 或 aria-hidden overlay 误判为可见。证据新增 `clock_isolation`、`input_duration_ms`、`wall_elapsed_ms`、`excluded_capture_ms` 与区域可见性字段；CaptureStep Schema 增加跨字段语义说明。
- **依赖与限制：** 无新增包，继续使用固定的 Playwright 1.58.0/Chromium；Node adapter 要求等价 Clock API 和 Chromium CDP lifecycle。该机制隔离页面时间，但不承诺亚帧级渲染确定性。
- **验证：** 双实现单元测试通过；真实 Chromium 烟测确认冻结区额外 1 秒不推进 rAF、Date 或 performance，恢复后不补偿冻结耗时。回归覆盖导航前安装、导航与 readiness 等待、连续冻结截图、Python/Node 双适配器、key_hold 的前/中/末采样均保持按下且动作有效耗时不因采样翻倍，以及带文本和非零矩形的 opacity 0/aria-hidden 全屏层为 `visible:false`、解除两项隐藏条件后为 `visible:true`。完整测试与动态 Capture 集成结果见本次任务记录。
- **推送：** 未提交、未推送。

### 2026-10-18 — Restore 完整版本轨迹、生成数据隔离与静态检查 Schema

- **原因：** 旧流程把首个基线和最佳版作为报告主线，无法审阅 Generate → Measure → Diff → Repair → Verify 的全部自迭代过程；`cases.yaml` 的源码/技术栈证据也缺少生成侧硬隔离；“脚本语法通过”等结论没有统一检查项、绑定、覆盖率和汇总口径。
- **范围：** 报告新增 `trajectory[]`，保留 `v0` 和所有 keep/revert/inconclusive 候选；每轮生成 `ArtifactDiff/v1`，记录文件、义务分数和 finding 变化。新增 `RestoreGenerationInput/v1` 白名单投影与 `generation-input` 命令；评测 case 只允许 case ID/数据集哈希进入冻结合同，默认 `fixture_only` 过滤 source 证据和源码类资源。新增 `StaticCheckSuite/v1`、`static-check-record` 和自动汇总，在报告、T2/T4 与进度快照中展示。修复轮数上限改为 ordinary/refined/complex = 3/6/9。同步执行 SOP、接口架构图、Criteria、brief、中英文 README、评测说明、Case Schema、Case Manager 和跨 case 报告模板。
- **依赖：** 无新增运行时包；实现继续使用 Node 标准库。JSON Schema 仅定义交换契约，控制器在写入时执行对应语义与哈希校验。
- **验证：** Restore 控制/报告测试 12/12；采集与资源测试 6/6，真实浏览器集成 1 项因未设置 `RESTORE_CAPTURE_PYTHON` 跳过；Case Manager 生产构建通过，Sites 测试 4/4。13 份 JSON Schema 通过 Draft 2020-12 元 Schema 检查；核心脚本语法、全部 JSON 解析和 `git diff --check` 通过。Case Manager 首次在沙箱内因 Windows `spawn EPERM` 失败，按环境故障重试到允许子进程的执行环境后通过。`skills-ref` 当前不可用。
- **推送：** 未提交、未推送。

### 2026-10-16 — 审计并补强 Restore 交互场景、动态采集与提前停止

- **原因：** Firewood run 在约 3 分 52 秒、0 个修复轮次时结束；导航/遥测错误未按目标主体复查，本地能力检查不完整，文本摘要被用于冻结视觉任务。最终 Judge 缺失与 Loop 是否还能继续未区分。复查确认原站可见，并能列出第一方脚本、GLB、纹理、音效和解码资源。
- **范围：** 增加交互场景实现参考及 InteractiveScene/v1，贯通 measure/verify/E2E 和报告；两种采集器增加拖动、持续按键、wheel/fill/select、动画采样与失败诊断；共享哈希/预算 capture plan。新增 GLB/glTF 检查，资源下载兼容 pageAssets 清单及逐项大小上限。冻结视觉证据门禁、RestoreBlocker/v1、只读 progress 和用户可见阶段进度落地。修复 pairwise 跨顺序判词泄漏、候选输入预校验和报告覆盖玩法信息的问题。
- **兼容变化：** 新 freeze 要求 applicable C1/C2 引用截图、C3 引用序列/视频；`stop ... blocked` 新调用需提供 blocker.json。历史冻结 run 和停止记录保持原样，现有 v0.2 pairwise 协议仍保留，尚未升级为完全盲评。
- **验证：** Restore 控制/报告测试 9/9，采集与资源测试 7/7，共 16/16；真实浏览器在临时目录与 localhost 验证 Python/Node 输入、帧采样、冻结绑定、加载层就绪、下载和缓存。Case Manager build 与 Sites 测试 4/4 通过。Skill quick_validate、JSON Schema 检查、JS/Python 语法、文档本地链接与 diff 格式检查通过。C 盘已满后将测试临时目录定向到 D 盘项目忽略目录。`skills-ref` 不可用；未校准独立视觉 Judge，不把 fixture 通过称为 Firewood 还原 E2E 通过。
- **审计：** 见 `evals/audits/2026-10-16-restore-interactive-scenes.md`，包含历史结论纠正、证据边界及剩余能力验证。
- **真实目标补查：** 独立 Chromium 遭遇加载层/网络故障，诊断保留原始请求和失败原因；补入加载遮罩就绪条件及失败状态资源发现。原站四个已观察 GLB 中两个已下载/解析，确认一个约 0.967 秒的斧头动画 clip，其余两个下载超时。证据留在忽略目录，未宣称整站还原或视觉 E2E 已完成。
- **推送：** 未提交、未推送。

### 2026-10-15 — 声明并验证 Restore Playwright 采集环境

- **范围：** 新增 `requirements-dev.txt`，固定 Python Playwright 版本；中英文 README 增加 Chromium 安装、启动验证和 Node 可选采集器说明。
- **原因：** Restore 的页面状态、交互序列和运行时证据需要可复现的浏览器采集环境，不能假定宿主已经具备浏览器驱动。
- **验证：** 已安装 Python Playwright 1.58.0 与 Chromium；本机无头 Chromium 成功启动并渲染最小页面。Node 包安装因 npm 下载缓存损坏未完成，README 将其保留为可选路径。
- **推送：** 未推送。

### 2026-10-15 — 新增独立 Stack Audit 证据采集脚本

- **范围：** 新增 `scripts/stack-audit/`，包含 Playwright 页面/资源/Canvas 采集、已加载同主机 JS/CSS 的候选扫描、目标页地标确认、人工裁决与证据引用验证，以及独立用法说明。同步技术栈 SOP、SKILL 入口、中英文 README 和评测目录说明。
- **原因：** 把重复的浏览器证据采集和“不能只停在 Canvas”的完成门禁做成可复用、可检查的小工具，同时保留人工对技术归属的判断。
- **验证：** 三个脚本均通过 `node --check`；CLI 帮助输出正常；`git diff --check` 通过。未运行测试套件，也未执行真实网页采集；Playwright 运行环境需由调用方提供。
- **推送：** 本次按用户请求推送至 `main`

### 2026-10-15 — 为 Canvas/3D 技术识别增加强制证据门禁

- **范围：** 复核技术栈分析 SOP，增加 Canvas/WebGL/3D 页面必须完成的活动状态、渲染 API、第一方入口/bundle、模型资源、公开源码及线上页面映射核验步骤；明确只识别 Canvas 不能作为已完成分析的结论，并新增 Mermaid 流程图。同步中英文 README 与评测说明。修订 UIR-0008–0011：补入 Tiny Skies 的 Three.js/WebGL/TypeScript/Vite/Socket.IO Client、Henry Heffernan 的 Three.js/WebGL/CSS3DRenderer/GLSL/React、Firewood 的 Three.js；POLA 确认 Canvas/JavaScript/CSS，同时将图形 API 和动画库标为未知。
- **原因：** 前一轮对 3D 页面只登记 Canvas、对 POLA 留空，跳过了已可获得的第一方源码、作者技术说明和页面实际加载资源。SOP 虽然要求主动找源码，但缺少针对 Canvas/3D 场景的强制收尾门禁。
- **验证：** PyYAML 解析成功；11 条 case ID 唯一；新增 4 条均为 `restore` / `draft`；`git diff --check` 通过。未运行测试套件。
- **推送：** 本次按用户请求推送至 `main`

### 2026-10-15 — 新增四个 Restore 评测草稿案例

- **范围：** 新增 UIR-0008 Tiny Skies、UIR-0009 POLA 母亲节故事页、UIR-0010 Henry Heffernan 和 UIR-0011 Firewood Splitting Simulator。四条均为 `restore` / `draft`；同步 Case Manager 案例数及中英文 README。
- **原因：** 扩展 Restore 样本，覆盖 3D 游戏、素材与文字同步动画、复古 3D 桌面多页面交互，以及单场景点击/拖动玩法。
- **证据与限制：** 2026-10-15 通过浏览器观察页面主体、Canvas 和可见交互；确认 Tiny Skies 的开始页与星球场景、POLA 滚动时插画和文案状态变化、Henry 的启动流程与作品集桌面、Firewood 的旋转提示及劈柴反馈。对尚未确认的引擎/图形 API 不作推断。未冻结视口、截图、交互序列及素材，所有新增 case 保持 `draft`。
- **验证：** 浏览器逐页核对四个 URL 的主体状态与可见交互；元数据检查确认 case 总数 11、ID 唯一、类型引用有效、新增项均为 `restore` / `draft`；`git diff --check` 通过。未冻结 fixture，因此未运行正式评测。
- **推送：** 本次按用户请求推送至 `main`

### 2026-10-15 — 复核 UIR-0003 与 UIR-0006 技术栈并隔离历史证据

- **范围：** 以当前浏览器 DOM、运行时资源、28K 开发者历史陈述和 Three.js 官方仓库为证据，更新 UIR-0003 与 UIR-0006。28K 当前栈记录为 Nuxt、Vue.js、Storyblok 和 HTML Video；2023 年 Vanilla WebGL/GLSL 证据保留为历史版本，不归入现站。Three.js 首页记录为 Vanilla JavaScript 与 HTML Image；r186、WebGL/WebGPU、TSL、ES Modules 和 SVG/CSS3D addons 明确归类为产品能力/仓库证据，不冒充首页实现。同步技术栈 SOP、中英文 README 与评测说明。
- **原因：** 用户提供的深挖结果混合了旧站证据、当前页面事实和被介绍产品的能力。若直接复制到 `technology_stack`，会把已改版的 28K 旧实现当成现状，并把 Three.js 的产品能力误判成官网首页实现。
- **验证：** YAML/Schema 契约检查通过，共 7 个 case，ID 与类型引用有效；Case Manager 生产构建通过，Sites 测试 4/4 通过；本地 UI 已确认 UIR-0003 显示 Nuxt/Vue.js/Storyblok/HTML Video，UIR-0006 显示 Vanilla JavaScript/HTML Image，详情中的证据与限制可见。`git diff --check` 通过。`skills-ref` 当前环境不可用；两个 case 继续保持 `draft`，未冻结 fixture。

### 2026-10-15 — 收敛 Restore 文档并改为五维 E2E

- **类型：** 行为变化 / 大量迭代 / 推送
- **原因：** 该项目服务于个人 Skill 优化，不需要生产级评测观测平台。既有 Restore PRD、执行说明、评测 spec 和 rubric 职责重叠，增加维护成本。
- **范围：** 以 `references/restore.md`、`references/restore/interfaces.md`、`references/restore/criteria.md`、`evals/restore.md` 分别作为执行 SOP、接口、局部 Loop 准则和最终评测的唯一控制文件；删除被替代的 v0.1/v0.2 规划、历史报告说明、分离 spec/rubric 和重复 release inventory。最终 E2E 改为 `layout/style/content/interaction/robustness` 五维等权；`fidelity` 移出总分，事实越界继续由 `fabrication` 红线处理。移除与“各适用维度 ≥3”数学重复的 75 分通过门槛，历史报告不重算。
- **验证：** `node scripts/restore/tests/restore.test.mjs` 6/6 通过；Case Manager build、站点数据测试、链接与格式检查见本次工作记录。未校准 Judge，不把当前阈值称为经验有效结论。
- **推送：** PR #3 已 squash 合入 `main`，合并提交 `ca4936d`。

### 2026-10-15 — 结构化 UI 红线 criteria 与 grader

- **范围：** 将六条最终 E2E 红线写成 UI 触发/不触发条件、证据要求、影响类别和 S0–S3 严重度映射；新增 `RedlineProfile/v1`（case 范围）和 `E2ERedlineAssessment/v1`（单条结果）Schema 与模板。grader 检查状态/严重度/影响一致、case state/region 范围和外部写入必须为 S3。将 `score-final.mjs` 迁移为 `grader.mjs`，更新 CLI、核心版本默认、报告、README、接口与测试引用。Loop finding 的严重度与最终 E2E 红线明确分开。UIR-0007 按历史 v1.0 保留，不回填 profile、不重评分；人工裁决新增 S1 和影响范围。
- **验证：** `node --test scripts/restore/tests/restore.test.mjs` 6/6 通过；全部新增 JSON Schema/模板/裁决侧车可解析；报告重新生成；`git diff --check` 通过（仅仓库既有 CRLF 转换提示）。

### 2026-10-15 — 记录 UIR-0007 人工红线裁决与维度说明

- **范围：** 将 UIR-0007 的 `obstruction` 从 Judge fail 裁决为人工 pass，依据是 Logo 仅需轻微左移且“We”存在，不需修复；报告保留原始 Judge fail。新增可选 `dimension_notes`，修正最终互动维度理由但不改分数。文档明确六类红线 ID 跨 case 固定，适用性和严重度依 case 冻结要求判断；结构化 `redline_profile` 仍待实现。
- **验证：** 重生成报告；确认最终 E2E pass、总分 75/100、6/6 红线通过，原始 Judge 结果仍为 fail；`node --check`、JSON 解析与 `git diff --check` 通过。

### 2026-10-15 — 对齐 E2E 维度中文名与 Schema ID

- **范围：** 在 E2E 评分细则、评测方案、Restore 接口说明和中英文 README 中补充六个维度的稳定英文 ID 映射；报告、Schema 与文档术语保持一致。
- **验证：** 核对六个 ID 与 `score-final.mjs` 中的维度定义及权重一致。

### 2026-10-15 — 补齐 UIR-0007 style 盲评与完整 E2E 总分

- **范围：** 以隔离的新评估上下文补评 style，未向评估者提供既有报告或评分。style 得分 3/4（中置信度）；六维均为 3/4，完整加权总分更新为 75/100。遮挡红线仍失败，因此最终 E2E 状态仍为 fail。评估视口低于契约桌面目标，该限制保留在记录中。
- **验证：** 报告渲染通过；核对六维分数、总分、红线、评估哈希和最终产物树哈希。`node --check` 与 `git diff --check` 通过。

### 2026-10-15 — 允许浏览器控制的最终 E2E 复评

- **原因：** 最终产物 E2E 的 `interaction` 与 `robustness` 需要允许 evaluator 直接用浏览器控制检查实际交互和响应式行为。
- **范围：** 明确浏览器控制评测规则；支持哈希审阅记录的追加修订并保留历史指针；为 UIR-0007 补充浏览器交互、双视口与遮挡检查记录，Judge 模型标为 `GPT-6 Luna High`。报告显示最终 E2E 失败，原因是 sticky logo 遮挡 hero 首词。style 未评时完整总分保持空值，同时报告按已评分权重显示折算分及覆盖率。移除会显示另一套 70/100 暂评分的旧补充 E2E 审计入口，避免与唯一最终结果冲突。
- **验证：** 重生成 UIR-0007 `report.json` 与 `report.html`；核对报告哈希引用、六维字段、遮挡失败红线及部分分计算。未检查浏览器控制台，也未保存本次检查截图。

### 2026-10-15 — 将报告统一为最终产物 E2E

- **类型：** E2E 数据流与报告口径调整
- **范围：** 报告仅展示一份最终产物 E2E；存在哈希绑定的最终评测时，报告和审批优先使用该结果；移除“运行内 E2E / 运行后复评”并列模块。评测元数据去掉评委角色和标识，保留 Judge 提供方/模型、评测时间、Rubric/Scorer、环境和局限。同步 E2E Schema、接口文档、中英文 README 和报告生成的 T4/brief。
- **原因：** 当前 E2E 只用于判断最终交付质量；并列展示运行时尝试与最终评测会给出两个质量口径，也会让审批错误读取旧结果。
- **验证：** 已重生成 UIR-0007 的 `report.html`、`report.json` 与 T0–T4；检查确认只保留一份 `incomplete` 最终 E2E、Judge 模型状态为 `not_exposed`、旧双模块标题和评委角色/ID字段已移除，sidecar SHA-256 与 `run.json` 一致。`node --check` 与 `git diff --check` 通过；未运行完整测试套件。
- **推送：** 未推送

### 2026-10-15 — 修正证据矩阵的继承项重复与截图状态归类

- **类型：** 报告渲染缺陷修复
- **范围：** `scripts/restore/report.mjs` 跨版本按 evidence ID 去重；缺失 `state_id` 的截图可从采集序列清单 URI 与状态键恢复关联。同步 Restore 接口说明及中英文 README。重新生成 UIR-0007 报告。
- **原因：** 最佳评估会继承基线 evidence；旧渲染器只在单列内去重，导致基线截图再次出现在候选列。部分手工采集截图也未直接写入 `state_id`，被放入未关联行。
- **验证：** UIR-0007 浏览器报告确认基线截图各显示一次，移动端第二帧落入 `mobile-hero` 状态行；`report.html` 中截图链接均指向现有文件。
- **推送：** 未推送

### 2026-10-15 — 合并单次 Restore 报告并退役 v0.1 渲染链

- **类型：** 报告结构与目录边界调整
- **范围：** 以 v0.1 的目录导航和分区审阅为骨架，将 v0.2 的独立六维 E2E、Loop 义务、T0–T4、红线、证据残差、时间/token 与审批整合到唯一单次报告；移除未引用的重复模板、v0.1 Schema/样例和旧命令包装器。保留跨 case E2E 评分器、版本报告模板与静态历史 HTML。同步接口、评测说明、中英文 README 和历史归档说明。
- **原因：** 单次报告过去存在重复 HTML 模板和两套并行渲染结构，信息口径容易分叉；运行事实应只有一条生成链，跨 case 报告与单次 run 审批则继续分开。
- **验证：** 使用现有合成 v0.2 run 重新生成 `report.json` 和 `report.html`，并在浏览器中查看首屏、目录、六维结果区、T0–T4 链接、证据和审批表单。未运行测试套件。
- **推送：** 未推送

### 2026-10-15 — 将证据截图改为按状态与版本横向对照

- **类型：** 报告信息展示调整
- **范围：** 证据区改为按页面状态分行、按参考/基线/各轮候选版本分列；最佳快照在对应版本列标记，独立 E2E 证据归入最终最佳版本。非截图检查证据保留为可展开条目；按 `state_id` 和 obligation 引用关联，无法确认状态时单列显示。
- **原因：** 原按“参考/基线/最佳”分组纵向堆叠，难以逐状态横向比较；同时隐藏了证据缺少状态关联时的歧义。
- **验证：** 用现有合成 run 重新生成报告，在浏览器确认参考与基线同一状态并排、不同状态分行、最佳版本标记显示。未运行测试套件。
- **推送：** 未推送

### 2026-10-15 — 整理 Restore v0.2 合入清单并同步 UIR-0007

- **类型：** 发布整理与评测集同步
- **范围：** 增加 `references/restore-release-20261015.md`，列明代码、规范、案例、报告和已知限制；把另一工作目录已核查的 UIR-0007 草稿案例同步到当前 worktree，并更新中英文 README、评测入口和 Case Manager 的案例数量。
- **原因：** 当前 worktree 的案例仍停留在六个，与 UIR-0007 Restore 试运行不一致；合入前需要可审阅的文件和验证清单。
- **验证：** Skill 快速校验通过；Restore 现有测试 5/5、Case Manager 生产构建和 Sites 测试 4/4 通过；七个案例按 Schema v1.2 验证，ID 唯一；TokenUsage 实例通过 Schema；`git diff --check` 通过。UIR-0007 仍为 `draft`，两个试运行的正式 E2E 均为 `incomplete`。
- **推送：** 已推送 `feat/restore-v02-self-inspect`；PR #1 已创建，待合入 `main`。

### 2026-10-15 — Restore 报告增加 Token 用量

- **类型：** 报告与数据接口变化
- **范围：** 新增 `TokenUsage/v0.2` Schema、`usage-record` 固化命令及 Codex 宿主日志抽取脚本；报告按阶段、Agent、输入、缓存输入、输出和总量展示来源与覆盖状态。同步 Skill、指南、接口文档及中英文 README。UIR-0007 补录 Restore 子代理与独立盲评子代理的可归属用量，覆盖状态为 partial。
- **原因：** 原报告只有时间和质量结果，缺少可审计的模型资源消耗；完整性不明的数字容易被误认作全系统总成本。
- **验证：** UIR-0007 从 219 条宿主逐响应记录抽取 26,616,090 tokens（其中缓存输入 26,137,984）；带哈希记录已写入 run，HTML 和 `report.json` 重生成功，HTTP 200，`git diff --check` 无空白错误。父线程协调、后续时间校正和其他无法归属用量未计入，完整测试套件本次未运行。
- **推送：** 未推送

### 2026-10-15 — Restore 外部暂停时间校正

- **类型：** 行为变化与运行记录纠正
- **范围：** 控制器预算改用有效执行时间；新增有证据的 `time-exclude` 区间登记，保留原墙钟与停止事件；报告展示墙钟、暂停、有效耗时和校正后的停止判断。同步 Skill、指南、中英文 README 与接口文档。UIR-0007 排除经宿主记录确认的额度暂停 9 小时 45 分 43 秒，原“预算耗尽”判定标为误判，正式 E2E 仍因证据未齐为 incomplete。
- **原因：** 额度限制后等待用户恢复被旧控制器错误计入执行预算，导致耗时、退出和 E2E 逾期解释失真。
- **验证：** UIR-0007 的 `time-exclude` 接受了宿主失败/恢复时间；运行停止点重算为墙钟 10h22m14s、排除 9h45m43s、有效 36m31s、剩余 1h23m28s。结构化报告重生成功，主报告和补充审计 HTML 均返回 HTTP 200；完整测试套件本次未运行。
- **推送：** 未推送

### 2026-10-14 — Restore v0.2 视觉自检控制器与独立 E2E 接口

- **类型：** 行为变化与大量迭代
- **范围：** 新增三维 0–4 Criteria、页面 QA、三档时间和轮数预算、快照/回退/停滞控制器、证据绑定、浏览器采集适配器、独立六维 E2E 评分接口和结构化 HTML 审批报告；旧 v0.1 命令保留兼容入口。同步 Skill、还原指南、中英文 README 与评测说明。
- **原因：** 区分运行时修复与系统评测；以可见改善为迭代信号，限制无收益循环，统一结构化过程记录。
- **验证：** `node scripts/restore/tests/restore.test.mjs` 5 项通过，覆盖 0–4 评分证据、同等级可见改善、双顺序 pairwise、回退、预算退出、参考哈希篡改、动态证据、E2E 单次独立记录和受限宿主 adapter；`python -X utf8 .../quick_validate.py .` 通过，`git diff --check` 通过。v0.1 演示 JSON 经兼容渲染器成功生成 HTML；v0.2 合成 run 报告在浏览器中检查了首页、视觉 Criteria 和审批禁用状态，并已显著标明演示。Python Playwright 采集器在本地合成报告页实跑成功：HTTP 200、800×600 截图、3 条证据、重复静态截图稳定；宿主沙箱拒绝驱动进程，实跑使用了经批准的本地环境权限。Judge 模型尚未接入，未配置时 E2E 显示 incomplete。
- **推送：** 未推送

记录重要的技能行为变化、项目内容的大量修改迭代，以及推送事件。每条记录尽量说明日期、改动范围、原因、验证结果和推送状态。不要把未经验证的推断写成事实。

## 记录模板

### YYYY-MM-DD — 简短标题

- **类型：** 行为变化 / 大量迭代 / 推送
- **范围：**
- **原因：**
- **验证：**
- **推送：** 未推送 / 已推送（分支或提交）

### 2026-10-14 — Restore 单 case 试运行与 HTML 审批汇编

- **类型：** 大量迭代（可运行试点和报告管线）
- **范围：** 以 UIR-0006 官网首页为输入，冻结三状态 fixture，保留基线和一轮图标修复；新增 run 初始化、配对截图诊断、T0–T4 文档汇编、证据/产物哈希与标准 HTML 审批页面。同步报告 Schema、契约、还原指南、PRD、评测目录及中英文 README。生成的参考与还原素材放在 Git 忽略目录。
- **原因：** 原报告模板仅有演示数据，不能证明过程文档、证据、指标和审批门禁能接入一次真实还原。
- **验证：** 三状态参考/候选截图均可配对；最终 MAE 0.229、1.233、0.129/255，244/244 卡片映射及菜单/滚动关键动作通过，卡片 hover 实测缩放到 1.08；浏览器中九张对照图均正常加载，5/5 红线、9/9 诊断指标和六维实现者自评可见。真实报告与演示报告通过 JSON Schema 检查，哈希篡改探针会阻断正向审批，前端未勾选人工复核也会阻断导出。`skills-ref` 在当前环境不可用；已检查模块语法、文档链接及 `git diff --check`。无改动基线复拍揭示手机整屏 MAE 波动，LLM Judge 未校准，正式 Go 留给人工审批。本次为源码辅助试点，不构成盲生成或跨 case 版本结论。
- **推送：** 未推送

### 2026-10-13 — 提出 Restore 自迭代方案与运行契约

- **类型：** 大量迭代（文档提案）
- **范围：** 新增 `references/restore-iteration-prd.md` 和 `evals/specs/restore-loop-contract-v0.1.md`，描述 REA、TDD 与实验循环可迁移部分、两层迭代、任务 fixture、静态/动态/个性化诊断、回归与停止条件、分阶段实施。同步中英文 README、还原指南和评测入口。
- **原因：** 现行还原流程只有原则性浏览器对照，评测案例尚未冻结、管线尚未实现；先规定可检查的任务与实验边界，避免直接增加循环造成评分投机。
- **验证：** 两份新文档的 Markdown 围栏成对、相对链接均可解析；`git diff --check` 未发现空白错误。未实施控制器、修改 Skill 运行行为或运行评测。
- **推送：** 未推送

### 2026-10-13 — 增加 Restore Loop HTML 审批报告

- **类型：** 大量迭代（报告模板与局部渲染器）
- **范围：** 新增单次 restore 的 T0–T5 过程与审批报告契约、自包含 HTML 模板、演示数据及离线 JSON→HTML 渲染器；审批 JSON 绑定报告数据和模板哈希。同步评测入口、管线说明、PRD、中英文 README 与版本报告定位。
- **原因：** 将输入范围、取证、最终产物、静态/动态/个性化指标、各轮 keep/revert 和残差汇集为可统一审阅的单页报告，同时与跨 case 版本评测区分。
- **验证：** 演示 JSON 经渲染器生成自包含 HTML；报告/审批 Schema 与示例 JSON 均可解析，模板占位符已填充，新增文档相对链接与代码围栏可解析，`git diff --check` 未发现空白错误。浏览器安全策略拒绝本地 `file:` 页面，因此未做浏览器视觉检查；取证、评分和循环控制器尚未实现，审批导出不验证身份或对外提交。
- **推送：** 未推送

### 2026-10-11 — 建立 HTML Restore E2E 评测文档

- **类型：** 大量迭代
- **范围：** 新增 HTML 还原评测 spec、Rubrics、报告模板和管线设计说明；同步更新评测目录说明与中英文 README。
- **原因：** 建立对比不同生成方案的可复用评测口径，并明确自动门禁、Judge 与人工校准的边界。
- **验证：** 检查 Markdown 代码围栏；核对六项权重合计 100；评测集保持空集，κ 与偏差测试标记为未测。未实现或运行自动化管线，等待 spec 确认。
- **推送：** 未推送

### 2026-10-11 — 建立评测样本库与双类型目录

- **类型：** 大量迭代
- **范围：** 新增评测集 schema v1.1、空的 `cases.yaml` 类型目录和本地 Case Manager；case 同时引用 UI 页面类型与 UI 逆向任务类型，并支持录入、筛选、详情、类型维护和统计。同步更新评测说明、中英文 README。
- **原因：** 让样本的页面形态与所执行的任务模式可分别维护和统计；未知 URL 留空，未核实技术栈为空列表。
- **验证：** 生产构建通过；浏览器检查双类型录入、详情、统计、类型增删和删除确认。临时验证数据已从浏览器草稿移除；正式 `cases.yaml` 仍为空。评测运行管线未实施。
- **推送：** 未推送

### 2026-10-11 — 简化 Case 难度录入

- **类型：** 行为变化
- **范围：** Case Manager 移除逐项难度依据输入和详情展示，在三档难度选择旁增加悬浮分级指引；评测集 Schema 从 v1.1 升至 v1.2，导入旧数据时保留总难度并丢弃逐项因子。同步更新评测说明与中英文 README。
- **原因：** 用多维口径帮助判断最终难度，避免要求维护者重复录入中间评分。
- **验证：** 生产构建通过；浏览器确认难度悬浮信息可通过键盘聚焦显示，三档口径可读，逐项字段已从录入和详情中移除。旧 YAML 导入路径会规范化到 v1.2 并移除旧因子，空样本集解析正常。
- **推送：** 未推送

### 2026-10-11 — 从网站来源建立页面还原草稿集

- **类型：** 大量迭代
- **范围：** 将用户提供的 6 个网站整理为 Schema v1.2 case，全部标记为 `restore` / `draft`；按可观察的页面形态补充描述、关键词、UI 类型、难度和有证据的技术栈。同步评测说明、Case Manager 说明和中英文 README。
- **原因：** 为 HTML 还原评测准备可筛选、可复用的候选页面样本，并在缺少固定输入素材时明确其未达到可运行评测的条件。
- **验证：** 逐项检查 case 必填字段、UI/task 类型引用、技术栈证据字段及草稿状态；在 Case Manager 导入数据集并确认 6 条记录、类型、难度、技术栈和状态可见。Mosby's Files 当时返回空白错误状态；对应限制已写入案例备注。目标截图、视口和交互 fixture 尚未冻结。
- **推送：** 未推送

### 2026-10-11 — 修复样本库首次打开为空

- **类型：** 行为变化
- **范围：** Case Manager 将 `evals/cases.yaml` 作为首次打开的内置数据集；保留已有非空本地草稿和明确保存的空集。更新页面标题及使用说明。
- **原因：** 之前只在当前浏览器会话中手动导入案例，新的浏览器会话仍从空数据启动，无法直接看到评测样本。
- **验证：** 生产构建后清除浏览器草稿并重新加载，确认 6 个内置案例、类型筛选和统计可见；保留本地草稿的重新加载行为正常。
- **推送：** 未推送

### 2026-10-11 — 补充 Amano Artifact 源码分析结果

- **类型：** 行为变化
- **范围：** 为 UIR-0001 增补分类技术栈列表、实现关键词和逐项证据；区分高/中置信观察、低置信推断及启发式 bundle 分界。
- **原因：** 用户提供了 Claude Code 对 Artifact 单文件 bundle 的源码分析，支持比页面 DOM 观察更细的还原任务分层。
- **验证：** 数据保持 Schema v1.2 结构，技术栈以字符串列表保存；所有源码结论注明来自用户提供的分析，本任务未独立读取 bundle；低置信打包工具与预算表推断不录作已确认技术。
- **推送：** 未推送

### 2026-10-11 — 将技术栈标签提升为架构模块

- **类型：** 行为变化
- **范围：** 将 Amano case 的技术栈从实现清单归并为交付、UI、Canvas、引擎、渲染 API、Shader、几何、后处理、场景生成、交互和性能等模块；关键词同步收敛；更新中英文 README 与录入说明。
- **原因：** 评测集需要可比较、可复用的技术层级，不应把函数名、数值参数、单个资源和作者模块清单当作技术栈标签。
- **验证：** 校验 Schema v1.2 与类型引用；确认技术栈为 11 个高层模块标签，证据保留来源和方法限制，未知的样式库与构建工具未填入。
- **推送：** 未推送

### 2026-10-12 — 精简 Amano 技术栈标签

- **类型：** 行为变化
- **范围：** UIR-0001 技术栈改为纯名词列表，移除类别前缀、版本说明和实现性描述；证据仅保留来源标记。
- **原因：** 样本库技术栈字段用于快速识别使用的技术，不承担实现说明。
- **验证：** Schema v1.2 校验通过，所有技术项为无解释前缀的字符串。
- **推送：** 未推送

### 2026-10-12 — 补全其余候选页的已知技术名词

- **类型：** 行为变化
- **范围：** 补充 Formula 的 Astro / HTML Canvas / WebGL 证据，补充 28K Studio 的 HTML Canvas 证据；Mosby’s Files 记录 Nuxt / Vue.js。Awwwards 资料页与 Three.js 官网实现栈继续留空。
- **原因：** 只把此前页面检查能支持的名称写入技术栈，避免把站点主题或视觉表现当作实现技术。
- **验证：** YAML 解析及类型引用检查通过；剩余两例保持空列表，未推断框架或样式库。源码级依赖清单仍未获得。
- **推送：** 未推送

### 2026-10-12 — 统一剩余 Case 的技术栈名词

- **类型：** 行为变化
- **范围：** UIR-0002 增加 HTML Canvas；Formula、28K Studio、Mosby’s Files 的技术栈仅保留 Astro、HTML Canvas、WebGL、Nuxt 等已确认名词，并清除详细说明。Awwwards 与 Three.js 官网继续保持技术栈空列表。
- **原因：** 统一样本库的技术栈展示口径，只显示技术名词，不展开实现解释。
- **验证：** 确认 5 条剩余 Case 的技术栈均为列表；未知项为空列表；YAML 可解析，类型引用有效。
- **推送：** 未推送

### 2026-10-13 — 逐站运行时技术栈核验

- **类型：** 大量迭代
- **范围：** 在正常浏览器运行状态逐站核验 5 个公开页面。Formula 补充 Three.js、GLSL Shader、Rapier、OrbitControls；Mosby's Files 补充 Storyblok；Awwwards 资料页补充 Video.js、Google reCAPTCHA、Google Fonts。28K 继续只记录 HTML Canvas；Three.js 官网继续留空。
- **原因：** 将技术栈从浅层 URL 或 DOM 线索推进到运行时资源、控制台与页面可见内容的可验证证据，同时避免把页面主题、工作室过往项目或通用视觉效果误写为当前页面依赖。
- **验证：** Formula 控制台确认 Astro、Rapier、Three.js WebGL shader 编译与 OrbitControls；Mosby's Files 确认 Nuxt hydration 与 Storyblok 图片域名；Awwwards 确认 Video.js、reCAPTCHA、Roboto 字体。本次检查截图未纳入评测集。
- **推送：** 未推送

### 2026-10-13 — 固化网站技术栈分析 SOP 与 Three.js 复盘

- **类型：** 流程改进
- **范围：** 新增源码/运行时与视觉证据并行的技术栈分析 SOP，包含页面状态确认、区域映射、归因规则、停止门槛和防复发清单；在 Skill 入口、中英文 README 与评测集说明中加入链接和空列表语义；修订 UIR-0004 的验证码门页判断及 UIR-0006 的缩略图载体/未完成状态说明。
- **原因：** 既有流程把“避免从 Three.js 站点名称推断实现”落实成空技术栈，却没有继续核查页面自身实现，也没有区分未知与未完成；相似情况可能在动态展示页或被第三方验证资源干扰的页面重现。
- **验证：** 对照 Skill 的 URL/源码输入流程、评测 schema 与 6 个案例核对链接和字段语义；技术栈结论保持未确认，未补入无证据标签。待执行 Markdown/Schema 静态检查。
- **推送：** 未推送

### 2026-10-13 — 普通网站 URL 主动发现源码

- **类型：** 流程改进
- **范围：** 将类型 A 网站 URL 流程改为视觉审查与主动源码发现并行；明确类型 C 仅表示用户额外提供源码，不再作为网页技术分析的入口条件；在 SOP 中补充 HTML/DOM、网络资源、第一方 bundle、公开 source map/manifest 与运行时核验的逐级路线，并同步中英文 README。
- **原因：** 原说明把源码分析限定为用户提供代码托管链接，导致普通网站 URL 的分析停留在视觉层，未主动沿页面公开加载资源追查实现证据。
- **验证：** Skill 快速校验通过；YAML/Schema 契约覆盖 6 个案例通过；`git diff --check` 通过。文档明确资源可访问性限制，不要求用户提供额外源码，也不建议绕过访问控制。
- **推送：** 未推送

### 2026-10-13 — 将 `--restore` 改为完整网站逆向还原

- **类型：** 行为变化
- **范围：** 移除固定 HTML5/Tailwind/原生 JS、单文件、图片占位和静态动效替代要求；`--restore` 改为依据证据复现页面、素材、响应式、动效及交互，交付可运行的 `restored/` 项目。新增还原指南和证据型 brief 模板，明确执行 `--restore` 不需再次询问是否生成。同步中英文 README、评测方案、Rubrics、报告模板与管线契约；评测 spec/rubric 改名为 site-restore-v1。
- **原因：** 原路径把实现方案当成目标，易遗漏真实资源和动态行为；单文件交付限制复杂网站的还原质量，也与用户已经授权执行 `--restore` 的意图冲突。
- **验证：** Skill 快速校验通过；9 份相关文档的相对链接检查通过；旧 `restored.html`/单文件强制表述已清除，`git diff --check` 通过。本次未运行模型评测，未产生还原案例结果。
- **推送：** 未推送
### 2026-10-15 — 明确通用红线边界并记录 UIR-0007 人工裁决

- **范围：** 为报告增加 `HumanAdjudicationSet/v1` 侧车，独立保留 Judge 原结果与人工最终口径；将 UIR-0007 的 `obstruction` 从 Judge `fail` 裁决为 `pass`。总分保持 75/100、六维分不变。修订 bbox 图说明：首词 “We” 仍可辨识，logo 位置仅需左移少许，无需修复。更新红线定义、严重度边界、人工裁决接口和中英文 README。
- **原因：** 当前红线规范只应把阻断关键内容或操作的严重遮挡列为失败；原 Judge 将轻微位置偏差按硬红线处理，超过规范严重度。
- **验证：** 报告显示最终 E2E `pass`、6/6 红线通过，同时展示 Judge 原始 `fail` 与人工 `pass`；原 `PostRunE2EReview/v1` 未改写。截图、标注图哈希验证通过；报告在浏览器预览中显示新版标注和裁决理由。`node --check scripts/restore/report.mjs`、Schema JSON 解析和 `git diff --check` 通过。未运行测试套件。
- **推送：** 未推送

### 2026-10-15 — 在最终质量报告中展示失败红线 bbox 标注

- **范围：** `scripts/restore/report.mjs` 支持可选 `VisualAnnotationSet/v1` sidecar，校验原截图与标注图 SHA-256，并在最终质量区显示对应状态、视口、bbox 和截图链接。UIR-0007 的 `obstruction` 红线现链接到 `candidate1c-desktop-settings-default`（1440×900）证据，红框标出 sticky logo 遮住首词 “We” 的区域。
- **原因：** 报告原先只有文字结论和通用证据 ID，审阅者无法直接定位被遮挡内容。
- **验证：** sidecar hash 校验通过；报告重新生成并在 4189 浏览器预览中确认标注图、来源截图链接和 bbox 坐标可见；`node --check scripts/restore/report.mjs` 与 `git diff --check` 通过。未运行测试套件。
- **推送：** 未推送

### 2026-10-15 — 运行后独立 E2E 复评记录与报告字段

- **范围：** 为运行后补充复评增加 `PostRunE2EReview/v1` Schema、`run.json` 独立引用和最终质量展示；新增评委/判官模型可用性、评测时间及时区、评分版本、校准状态、产物绑定和局限字段。同步中英文 README、E2E 目录说明、跨 case 报告模板与 Restore 接口文档。
- **原因：** UIR-0007 原运行 E2E 为 `incomplete`，补充评测不能覆盖既有运行状态或混淆停止时间；报告需能展示可追溯的后续复评。
- **验证：** UIR-0007 原运行 E2E 记录仍为 `incomplete`；独立 subagent 于 2026-10-15 04:43:40–04:49:53 UTC 复评，Judge 精确模型 ID 未暴露，六维复评因样式/交互/稳健性证据未知而保持 `incomplete`、不生成总分。复评通过官方 `score-final.mjs` 评分后，经新 CLI 命令写入哈希侧车和 `events.jsonl`；报告、T4、brief 已重生。报告通过 4175 的浏览器可访问性树检查，候选站 4188 返回 HTTP 200；Python Playwright 子进程因沙箱 WinError 5 无法启动，未取得新截图。未运行测试套件。
