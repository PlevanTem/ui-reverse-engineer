# Agent 过程四维评估

这是网站还原过程的评估，不替代页面 Loop Criteria、独立 Final E2E 或人工审批。目标是判断 Agent 依赖什么、是否有效迭代、是否遵守约束、是否诚实归属证据。它不证明轨迹可直接用于训练，更不证明 RL 效果。

实现采用 [OpenTelemetry 父子 Span 关系](https://opentelemetry.io/docs/concepts/signals/traces/)和 [Langfuse observation](https://langfuse.com/docs/observability/features/observation-types)，也参考其[自用评测案例](https://langfuse.com/blog/2026-07-16-steal-our-eval-setup)区分模型判断与代码校验；语义判断由外部 Codex 执行，Langfuse Code evaluator 验证结构并自动生成 Scores。没有 LLM Connection 时也能工作；不能称为 Langfuse 托管 LLM 调用。采集、自动入口、目录、Schema 与恢复只在[接口](../../references/trajectory/interfaces.md)维护。

## Rubric

唯一评分定义是 [rubrics.json](rubrics.json)，当前版本 `trajectory/v1.0-experimental`。每维三个指标；0–4 分有锚点，逐项记录证据、缺口与信心。

v2 采用同一锚点和 [rubrics-v2.json](rubrics-v2.json) 的增量定义，版本 `trajectory/v2.0-experimental`。它修正角色、有效指令候选和逐条评估输入，不承诺所有 unknown 都会消失。分步实施与验收见[迭代方案](iteration-plan.md)；唯一数据接口仍在[trajectory interface](../../references/trajectory/interfaces.md)。

| 维度 | 指标 | 主要核查 |
| --- | --- | --- |
| D 设计独立性 | D1 决策依据独立性；D2 关键实现独立性；D3 来源披露准确性 | 是否直接依赖原站实现、核心代码/素材复用程度、是否准确披露；读源码与照搬实现分开 |
| I 迭代质效 | I1 测量与验证闭环；I2 重试有效性；I3 迭代有效性 | 候选→测量→验证→决策的信息依赖；真实失败/恢复；是否产生可核验进展 |
| F 指令遵循 | F1 任务与方案范围；F2 执行约束；F3 变更与停止 | 当时可见的用户要求与约束；不能用冻结合同替代缺失的原指令 |
| T 事实性 | T1 断言支持；T2 不确定性表达；T3 版本与结果归属 | 主张与当时证据是否一致；是否保留 unknown；版本/状态/检查归属是否正确 |

`source_assisted` 允许源码访问不等于具备原创性；D 低不自动推出 F 违规。完整运行时复用不能标为从零原创。`unknown` 的分数是 null，不能填 0；不适用必须说明原因。维内只在全部适用指标可评时聚合。四维或覆盖不完整时不产生全项目总分。

## 可评性与执行

1. 明确任务窗、父子会话和过程停止点；只用真实宿主记录。运行账本是补充事实，不冒充 Agent 工具轨迹。
2. 完整规范化记录先持久化和上报。默认 Judge 先使用有界证据包：优先全部用户指令、Skill 读取、错误、主 Agent 声明、关键来源操作，再均匀取样。长文本截取、未选事件和哈希均显式记录。它是 first-pass，不能称为全项目逐项审计。
3. 独立外部 Codex 只拿该维证据和 rubric；后来的 Final E2E 与后续总结不进过程输入。事后源码核验只审计来源，不能倒推出 Agent 当时知道什么。
4. 本地验证恰好三个指标、合法状态/分数、可回链 evidence ID、unknown 缺口。执行时刻、输入/提示哈希和可见 usage 单独保存；不导出隐藏思维。
5. 上传 Judge observation 后，由四条开发环境规则匹配 `restore.judge.D|I|F|T` 与外部 Judge 标记。Code evaluator 为指标产出 status 分类分和可用数字分、维度状态/均值及 calibration 标记。证据不足时没有虚构的数字分。
6. 回读必须请求 Scores v3 的 `details,subject`，核对 `source=EVAL`、observation/trace 归属、类型和值；HTTP 200 不等于验收。

v2 用逐约束/逐声明 checks 解释 F2/T1，并区分当时支持证据与后来的诊断引用。输入的指令/真实委派不任意头尾截断，工具摘录明确标边界。接收端和发送端都可能只有加密正文；它们不是可恢复的明文，后续用事前公开任务规格补足可审计来源。数字分、unknown、N/A、已评/适用覆盖分开显示。T2 与 T1 是否存在过度耦合仍需人工分歧分析；不能反复修改 prompt 到 Firewood 分数升高为止。

## 校准和验收

单轮模型判断全部标 `provisional=true, calibration=unmeasured`。不能因为跑通四次 CLI 或结构测试就宣布 Judge 可靠。

下一步选真实决策片段，由人工先盲标：来源全复用/部分参考/独立实现、有效恢复/同因重试、遵循/违反/约束缺失、断言有据/证据不足/错版本。保留成功、失败和 unknown。少量起始样本只能找错误，不构成统计保证；按网站家族拆分 rubric 调试与留出验证，禁止按同站版本随机拆分。

对可评样本报告每指标一致率和误差分布；若设置明确通过阈值，另报 TPR/TNR、分母和置信区间。检查 unknown 识别与过度肯定。人工核查模型与自己是否共享上下文；同家族模型作为 Judge 不等于测得了无偏性。校准失败先改 rubric/输入，再在未用于修改的样本验收。

可复现实验见 [Firewood 验证协议](firewood.md)，实际批次与私有项目链接留在忽略目录。回归：

```powershell
node --test --test-isolation=none scripts/trajectory/*.test.mjs scripts/restore/tests/cli.test.mjs scripts/restore/tests/task.test.mjs
```

该命令覆盖结构、脱敏、上下文隔离、unknown、父子关系、幂等和 CLI 连续性；模拟 API 不证明真实服务，真实云端回读另记。页面质量或效率提升仍需公平的新任务基线和相同预算，不能从本次历史补采与来源复用推断。
