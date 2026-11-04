---
doc_id: CODEX-EVALUATION-INTERFACE
doc_version: "1.0.0"
doc_set: "restore-vnext-codex-2026.11.03"
status: current
created_at: "2026-11-03"
updated_at: "2026-11-03"
timezone: Asia/Shanghai
owner: project-maintainer
implementation_ref: d6e3b03202c66069cd0ff33fa0d58d0d3fef468c
review_baseline: d410f11f18a7fbcf253db1a912d717c6d327d08a
iteration_items: [IT-05, IT-06]
---

# Codex 开发评估闭环 v1

[项目审阅索引](../../docs/README.md) · [评测方案](../../docs/evaluation-plan.md)。doc_version 是文档版本，运行 Schema 的 v1 标识不变。

当前范围只覆盖 Codex；没有 Claude 适配、独立发布 SDK、平台服务或留出结果自动反馈。原 [Restore 接口](../restore/interfaces.md)、[最终 E2E](../../evals/restore.md)、[轨迹接口](../trajectory/interfaces.md)继续拥有各自语义。

## 入口与启用

运行需要 Node 24+。从项目根目录显式绑定一个已有 Restore run 和当前主会话；配置使用 [config Schema](config.schema.json)，初始 [示例](config.example.json)仅启用准备门禁与工程检查，不调用模型或上传。

```powershell
node scripts/evaluation/cli.mjs bind reverse_output/evaluation/MY_RUN RUN_DIR references/evaluation/config.example.json
node scripts/evaluation/cli.mjs doctor reverse_output/evaluation/MY_RUN
node scripts/evaluation/cli.mjs checkpoint reverse_output/evaluation/MY_RUN
node scripts/evaluation/cli.mjs drain reverse_output/evaluation/MY_RUN
node scripts/evaluation/cli.mjs status reverse_output/evaluation/MY_RUN
```

bind 默认读取 CODEX_THREAD_ID / CODEX_SESSION_ID，也可用最后一个参数指定已确认的主会话 ID。重复相同绑定不重置预算；同一 run/会话只接受原绑定，不能靠新目录或编辑配置重置额度。不同 run/会话使用显式新绑定。绑定状态与会话索引在忽略目录；源码、原 run、合同、原账本与旧评分不改写。

完成绑定后，Restore CLI 在成功命令之后发出匹配 triggers 的信号；continue/refreeze 的子 run 需要显式新绑定，不把父结果继承为子结果。已有项目 hook 的 SessionStart/Stop/压缩事件信号唤起限时 worker，Interrupt 写独立暂停标记。项目 hook 的信任与真实激活仍以[验收协议](../../evals/vnext-acceptance.md#continuity-activation)为准，doctor 固定报告 unverified，不从文件存在推断激活。

需要网站目标持续推进时，先按原接口配置 task-init/task-arm。已有任务 Stop 续跑提示会附带 evaluation status 检查入口；评估层本身不无限创建模型轮次。没有必要评估绑定时保持原行为；直接库调用不自动启动 worker。

## 数据与执行

coordinator.mjs 提供 initEvaluation、checkpointEvaluation、drainEvaluation、evaluationStatus、pauseEvaluation、resumeEvaluation；codex.mjs 提供绑定/CLI/生命周期桥接；runners.mjs 复用原评估器；delivery.mjs 提供平台交付。所有函数可作为本地 ESM 导入，import 不自动执行模型或网络请求。

检查点按产物树、合同、冻结状态、声明环境/Node/选择器、评估实现与配置、公开轨迹窗口寻址，保存独立 artifact/contract/source。工程检查验证的是 Skill/harness 本身；它不能给候选页面的视觉和玩法质量背书。文件哈希与传输完整性不证明实际浏览器服务来自该产物，真实 E2E 适配器还须提供相应运行证据。

Job key 按 suite 的依赖寻址，包含独立评审适配器的文件摘要。新目标/配置/实现不复用旧结果。已开始没有明确结论的任务转 uncertain，保留原调用记录，不自动重跑。Job completed 仅表示执行结束；result 中的 unknown/incomplete/unavailable 仍是原状态。新封装见 [records Schema](records.schema.json)。

max_jobs、max_wall_ms 在绑定内累计；max_judge_calls 是预留执行额度，不是测得 token/费用或对自定义适配器内部模型调用的计量。一次外部 E2E 适配调用预留一次，轨迹每维预留一次；失败仍保留额度。max_job_ms 限制外部进程/工程步骤；受限环境的现有 invoke 内进程 fallback 仅协作取消，不能视为 OS 强制隔离。网页 Task 另有原预算，不能从本层单独推导完整还原成本。

并发 worker/交付有独立锁；不自动移除未知锁。崩溃后核对 PID、任务状态和已有回执，再显式处理过期锁。已完成结果与交付保持不可变；失败或 uncertain 的 Judge 不能通过直接修改 job JSON 改回 queued 重试。需要合理重评时创建显式新绑定/目标，保留旧记录。

## 评估器与模型调用

检查点按整组新 Job 预检额度；不足时不复制产物或留下部分入队任务。摘要用于发现文件漂移，不构成对可改写本地文件的 Agent 的安全隔离；独立最终验收仍需独立证据与权限边界。

- engineering：调用现有 local/full 工程检查。缺依赖/跳过维持 incomplete，不作页面质量分。
- preparation：复用 checkPreparation，检查当前合同/缓存，不改写它们。
- development_e2e：必须已冻结合同并配置独立 adapter，缺配置为 unavailable，缺红线 profile 等前提为 incomplete。复用 core.finalRequest 的同一投影与 scoreFinal，评估允许在 run.complete 前执行；不写 run.e2e、不改变网站验收状态。
- trajectory：显式配置 source.from、source.session_directories 和 dimensions 后，采集绑定主/子会话的公开记录，复用 views/evidence 和外部 Codex Judge。可用 source.delegation_root 读取已持久化公开委派规格；隐藏内容不恢复。检查点结果明确为 checkpoint_window_not_full_task，不与既有结束后完整过程评分混用。

开发 E2E adapter 是项目内相对路径，stdio 接收 CodexDevelopmentE2EInput/v1：request 是既有 FinalEvalRequest/v0.2；paths.source_run 是只读参考根，paths.artifact 是不可变候选，paths.output 是本次独立观察输出目录。返回原始独立 Judge 判断给 scoreFinal；evidence URI 相对 paths.output，附实际字节哈希和正确 artifact 身份。评审期间修改候选会失败；不得把编造遥测或 synthetic fixture 当真实站点证据。

默认不启用模型 suite。配置路径和维度示例是字段说明，不是已安装的评审脚本：

```json
{"id":"dev-e2e","runner":"development_e2e","adapter":"path/to/independent-adapter.mjs","triggers":["checkpoint"],"feedback":"developer"}
```

## 反馈与暂停恢复

暂停阻止后台执行和显式新建检查点；恢复保留开始时间与累计额度。

```powershell
node scripts/evaluation/cli.mjs pause STORE
node scripts/evaluation/cli.mjs resume STORE
node scripts/evaluation/cli.mjs status STORE
```

status 校验会话归属、结果摘要及当前目标，过滤过期/暂停结果。SessionStart 注入的是执行 status 的提示，不未经核对回注旧分数；真实反馈在 status 返回后进入当前 Codex 工具上下文。已有 task 续跑依旧控制目标与停止。后台 worker 完成不会自行唤醒停止的应用；下一会话或显式 drain 恢复队列。

## Langfuse

仅在已授权的配置中添加 langfuse_config（项目内相对路径，如 reverse_output/langfuse/.env.local）才上报；凭据不放配置 JSON。drain 在本地评估完成后交付，也可以显式调用：

```powershell
node scripts/evaluation/cli.mjs deliver STORE
```

检查点 observations 使用 restore.codex-checkpoint.*，role=evaluator、scope=development；直接 API Scores 使用 restore.checkpoint.*，保留实际 source（API），不冒充原生 EVAL 或完整任务四维评分。unknown 只有类别状态，没有填造的数字零。既有任务结束后的 Langfuse 原生规则与命名空间保持不变。

observations/Scores 分别回读核对。写入不明时先查询，不重复发送；deliver 不能重评 Judge。平台失败只影响交付状态，本地语义结果保留。当前自动交付覆盖 completed Job；失败/uncertain 的详细诊断保留本地，原完整轨迹的失败上报仍走既有轨迹接口。

## 验收边界

确认完整交付后保存绑定目的地、payload 与结果摘要的 confirmed.json；重复交付复用该次确认，不反复请求平台。平台写入不明的条目继续查询，不把本地回执当作实时重查或自动重发依据。

复用统一 full 工程检查，新测试覆盖 checkpoint 失效、任务归属、并发交付、重复绑定、暂停/预算、修改的输出/配置/适配器、公开窗口、开发 E2E 与原 run 隔离。合成 E2E 只证明调用真实 grader 与接口链路。Firewood 的历史 run 只读 smoke 不构成新网站质量/效率对比，也不替代真实原生 hook 激活。
