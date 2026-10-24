# Restore 交互场景能力审计

日期：2026-10-16（Asia/Shanghai）。范围：Skill 入口、Restore SOP、采集/资源工具、Loop 控制与成对复核、报告及回归。用途：维护者离线优化，不构建新的 Agent 平台。

## 结论与原 run 纠正

上次停止不充分。原 run `96f02838-40fe-40af-b0bf-31d538b5c412` 记录的有效耗时为 232595 ms（约 3 分 52 秒），ordinary 总预算 30 分钟，修复轮数为 0；C1/C2/C3 全为 unknown。它记录了基线和一次提前 stop，没有执行候选修复、独立 measure、A/B 与 B/A verify、record 决策的完整链路。生成报告不表示还原完成。

这次重新访问 `https://screen.toys/firewood/`，浏览器能显示写实木桩/木段、草地、上部操作提示和底部链接。同一调用同时出现 `ab.chatgpt.com` / `oaistatsig.com` 的遥测 Cloudflare 错误；错误域名与目标站不同，不能支持“目标站被拦截”。上次超时后未继续检查实际标签，是执行失误；原 Skill 的技术栈 SOP 已要求区别第三方错误与主页面状态，但 Restore 的恢复/停止接口没有把这项判断变成具体证据要求。

当前 Python Playwright 与浏览器可用，Node 也能通过 `RESTORE_PLAYWRIGHT_MODULE` 使用已有安装的模块入口。本轮工作区同时出现了依赖安装说明与 `requirements-dev.txt`，故**当前可用不能证明上次已安装**；能够确认的是上次仅检查 Node 包后就概括环境能力，证据不足。最终 grader 当时确实未配置 Judge adapter，该缺口影响最终评分，但不能单独解释停止所有实现/取证工作。

上次 2D Canvas 的平面旋转、几何示意和局部分块与参考的空间相机、扫描素材及劈柴过程明显不同。“可运行且能点击”不足以满足本 case。旧冻结 run/报告不重写；本文件保留纠正说明，后续真实复刻应建立关联的新 run。

## 可重查的原站资源线索

本轮宿主浏览器的 `pageAssets.list()` 返回 51 个已观察资源。以下为实际清单中的例子，尚未作为正式 fixture 冻结；文件名只用于追踪，不能据名称断言每条动画和 shader 的用途：

- 第一方入口：`assets/index-C6RyM-i2.js` 与 `assets/index-6CV-pjIe.css`。
- 模型：`assets/ax_anim_v03_glb.glb`、`assets/ax_v01_reduced_compressed.glb`、`assets/stump_v02_mesh_warm_ktx2_2048.glb`、`assets/stump_v02_data.glb`。
- 纹理：`outsidebark.jpg` / `_n.jpg`、`top.jpg` / `_n.jpg`、`insidegrain.jpg` / `_n.jpg`。
- 动态/解码：`assets/gobo.mp4`、`basis/basis_transcoder.js`、`basis/basis_transcoder.wasm`。
- 音频：`assets/sounds/bg.mp3` 与多组 split / stack 音效。

这些线索说明应该先追踪资源与场景映射，再决定替代程度。本轮追加真实资源探针，下载并解析了 `ax_anim_v03_glb.glb`（4524 bytes）与 `stump_v02_data.glb`（11276 bytes）；前者含一个未命名 clip，translation/rotation 输入时间范围为 0–约 0.967 秒。该范围来自文件 metadata，不证明线上触发时机或播放速度。另两个选中模型下载超时；没有完成所有模型解析或整站重建，不能声称加载器、光照或切割算法已还原。

本地探针摘要位于忽略目录 `reverse_output/firewood-audit_20261016/probe-summary.json`，保留 Capture、模型检查与 SHA-256 索引。独立 Chromium 第一次出现导航超时及 `Loading assets 1/44` 遮罩拦截点击；第二次有界复查出现主请求 `ERR_CONNECTION_CLOSED`。这与宿主浏览器成功渲染并存，说明不同访问路径的状态不同，不能泛化成站点被 Cloudflare 拦截。探针是能力诊断，不是新 Restore 交付或 E2E 通过。

## 发现与修复

| 优先级 | 可验证发现 | 影响 | 本次改动 |
| --- | --- | --- | --- |
| P1 | 超时/遥测报错后未检查最终页面；缺 Node 包被概括为缺浏览器能力 | 错误阻塞、跳过资源与视觉证据 | SOP 增加能力分项探测、实际标签复查及有界替代路径 |
| P1 | freeze 接受 checks 作为 applicable 视觉义务的唯一依据 | 文本摘要被包装成冻结的视觉任务 | C1/C2 要求截图引用，C3 要求序列/视频；unknown 保持未知 |
| P1 | Node/Python 输入只支持 click/hover/key/scroll/wait | 无法重放拖动、持续输入及动作中段 | 增加归一化轨迹、按键持续、wheel/fill/select 和延时采样，保留实际时间及失败诊断 |
| P1 | Canvas 可见不等于模型已加载；真实探针的加载层拦截了输入 | 容易把加载画面当作基线，或误判交互不可用 | 增加 ready_checks 与共享的有界 ready_timeout_ms；按实际加载遮罩条件采集，失败诊断里的 2xx 资源仍可核验后获取 |
| P1 | Python 不校验冻结契约哈希，缺 candidate binding，预算忽略 time exclusions | 两种采集器的证据绑定和截止口径不同 | 共享 capture-plan，统一环境 OS 标识、状态范围、哈希与预算 |
| P1 | `stop blocked` 只需一段字符串；最终 Judge 缺失和 Loop 缺评委未分开 | 过早收束而没有剩余工作审计 | 新增 RestoreBlocker/v1、阶段 scope 和证据哈希引用；拒绝 final_e2e 作为 Loop 阻塞范围 |
| P1 | pairwise 第二次调用可收到第一次判词；请求缺完整状态/义务 | 顺序复核互相污染，玩法约束不足 | 两次使用同一原始证据集，过滤已存判词，调用前核对候选 binding，传入状态/义务/玩法契约 |
| P2 | 资源工具只接受本地 Capture，默认 20 MiB 上限，无模型依赖检查 | 宿主浏览器资源清单和较大模型难以复用 | 支持原始 pageAssets inventory、逐项 max_bytes 与 GLB/glTF 元数据/依赖检查 |
| P2 | renderer 覆盖手写 brief；没有结构化玩法输入 | 状态、反馈及渲染观察丢失 | 可选 InteractiveScene/v1 入冻结契约，传递给 measure/verify/E2E，生成 brief/HTML |
| P2 | 没有只读进度快照和明确用户沟通节点 | 用户无法区分正在测量、修改或提前停止 | 新增 progress CLI；SOP 明确阶段更新、每 60 秒内有内容的更新和零轮次说明 |

控制器门禁检查结构、引用与哈希，不能证明执行者的自然语言原因真实。SOP 和报告仍须清楚区分观察、推断与未检查项。

## 实现思路与一手参考

- Robert Nystrom：[State](https://gameprogrammingpatterns.com/state.html) 与 [Game Loop](https://gameprogrammingpatterns.com/game-loop.html)，用于分开建模输入、状态更新、渲染和重复/复位行为。
- Three.js 官方：[GLTFLoader](https://threejs.org/docs/pages/GLTFLoader)、[Animation System](https://threejs.org/manual/pages/animation-system.html)、[Raycaster](https://threejs.org/docs/pages/Raycaster.html)，用于理解模型、压缩依赖、动画 clip 和空间命中；不把技术文档当成目标站具体实现的证据。
- Playwright 官方 [Mouse](https://playwright.dev/docs/api/class-mouse)，用于重放按下、移动、释放的输入轨迹。

执行细节只在 [SOP](../../references/restore.md) 和 [交互实现参考](../../references/restore/interactive-scenes.md) 维护；字段与命令只在 [接口](../../references/restore/interfaces.md) 及对应 Schema 维护。

## 回归场景与验证

1. 原始素材能获取而 Node 包缺失：检查宿主/已有 Python，不能仅据缺包停止。
2. 目标主体正常但遥测服务报错：按页面主体判定，不用第三方响应覆盖目标状态。
3. Canvas 拖动和点击：按实际轨迹区分输入，确认拖动不触发一次劈柴；采集动作中段、动作后关键时刻及终态。
4. Model/decoder/texture：检查 GLB 动画轨道、压缩扩展和外部 URI，随后在实际场景中验证加载与视觉映射。
5. 缺最终 Judge 但实现仍可继续：最终 E2E 标 incomplete，继续可做的 Restore 工作；若缺的是 Loop 复核能力，给出对应阶段的证据。
6. 一轮修改后：独立绝对测量、A/B 与 B/A、keep/revert/inconclusive、最佳快照和剩余预算必须可追溯。

自动检查由 `scripts/restore/tests/restore.test.mjs` 与 `capture.test.mjs` 覆盖；真实浏览器集成使用隔离临时目录和 localhost，覆盖两个采集器及资源下载。最终验证结果在本次变更日志中记录。

最终回归：控制/报告 9/9，采集/资源 7/7，共 16/16；包括真实浏览器集成，未跳过。Skill quick_validate、JSON Schema、JS/Python 语法与文档本地链接检查通过。`skills-ref` 当前不可用。C 盘满导致的最初 ENOSPC 不计为功能验证通过；将本次进程的临时目录定向到 D 盘后完整重跑通过，未清理其他用户文件。

Case Manager 生产构建通过，Sites 测试 4/4 通过；没有修改其 src/、worker 或托管入口。

## 尚未证明的能力

- 本轮自动测试证明采集、绑定、门禁与报告链路可运行；实际站点探针证明部分生产模型/动画可获取并解析，不证明 Firewood 的写实外观、动态切割、UV、物理堆叠和音画同步已经还原。
- 双顺序复核请求仍保留 v0.2 的 best/candidate 与 order 字段；过滤跨调用判词修复了直接污染，但没有建立完全盲评协议。若要用于方案优劣结论，需迁移盲化 A/B 输入并验证顺序偏差，不能用当前合成测试宣称 Judge 已校准。
- 未配置和校准独立视觉 Judge；无法自动生成可信五维分数。行为型回归 1/2 的本轮证据是原站浏览器复查，不是一次新的全自主 Agent 实验。
- 采样截图有耗时和迟到；普通 Playwright screenshot 不保证精确中间帧，严格动画比较需要合适的录屏/时钟控制。
- UIR-0011 仍为 draft。真实站点复刻与最终独立 E2E 必须使用新冻结证据，不把本次 localhost fixture 当作生产案例通过。
