# Firewood 自动链路验证

本协议验证轨迹、Judge 与 Langfuse 的连接，不重新声称页面还原通过。历史恢复批次与新网站生成批次分开，真实结果、项目链接、原始输入和运行产物仅写忽略的 `reverse_output/`。

## 前置与输入

选择已有冻结合同、明确 run ID、loop stop、独立 E2E 记录及宿主原始会话的 Firewood run。先保存原 `run.json`、`events.jsonl`、合同和产物绑定的摘要。连接配置和自动 opt-in 按[接口](../../references/trajectory/interfaces.md)准备，避免在命令行或聊天回显密钥。

若已有确定性源码核验，可将同一产物的审计事实放进输出目录 `facts.json`，包含产物 hash、核验时刻和 `post_hoc_audit` 范围。它只能说明代码来源，不能证明 Agent 当时知道什么。不得把旧 Judge、最终 E2E 分数或后来的总结加入新过程 Judge。

## 执行

1. 以当前宿主会话调用 `node scripts/restore/cli.mjs progress RUN`。这是只读入口；已授权的自动配置应启动或恢复该 run 的观察器。
2. 读取返回的 binding 路径。检查 `automatic-status.json`，确认走完自动采集、分批上报、四维 Codex、原生规则评分和回读。不能把 `worker_started` 当成功。
3. 核查 sessions、事件与 Span 数的不同口径；工具外层编排、内层执行和大内容分块不得混算成独立工具动作。列出每个会话的 parse、feedback、host truncation、unknown native types 与缺失上下文。
4. 对云端 observation 逐项核对身份、父子、时间、输入输出、来源和版本 metadata；对 Scores 核对 `source=EVAL`、subject、类型和值。维度 unknown 保持 null，总分按覆盖规则留空。
5. 重复 `progress`/`arm`，确认复用原 binding/capture/结果。需要恢复时使用 `resume`；比较远端观察数和评分数，不能新增重复模型判定或结果。
6. 比较原始 run/ledger 的字节 hash 以及冻结合同、best artifact 绑定；不得为了链路测试改变原站候选、停止点或历史验收。

## 验收条件与边界

| 项目 | 通过条件 |
| --- | --- |
| 采集 | 绑定明确的主/子会话、真实来源定位、限定任务窗；保护内容不导出；缺口可见 |
| 自动化 | 标准 Restore CLI 触发后台完成，有持久状态和结果；复触发不重复发/评 |
| Judge | 四个独立新 CLI 输入，Schema 和证据引用有效；旧评分不回流；失败记录保留 |
| Langfuse | 原生 evaluator/rule 存在且范围未漂移；真实数据逐字段读回一致 |
| unknown | 缺失约束、断言或覆盖不能捏造为通过；无全项目总分 |
| 不可变性 | 原 run、账本、冻结合同与候选绑定不变 |

首次模型别名不兼容、媒体引用清洗等调试批次必须保留，并与最终自动批次分开。原始媒体二进制、本地文件内容之外的模型上下文和确切模型标识缺失时须说明。历史 `context_inherited=false` 只表示未观察到继承字段，不能作为独立性证明。

判断语义是否可靠，还需按[四维方案](README.md#校准和验收)人工校准。本次不能推出新系统使页面还原速度、质量或模型训练效果提高；那需要相同预算、干净上下文、未见网站和成组对照实验。
