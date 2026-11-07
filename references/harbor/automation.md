# 自动 Restore → Data Factory

当前自动入口使用本地 Docker：Node.js 24+、uv、Python 3.12/3.13，以及已启动 Linux engine 的 Docker Desktop。`docker version` 应能显示 Server。入口未提供云 sandbox 选择参数，不会安装 Docker或创建模型订阅。使用已授权的本机 Codex 登录文件或显式配置的模型认证；不要把凭据写入仓库。该环境仍只有 exploratory URL 实跑证据，正式 case 的状态由人工维护。

## 依赖与安装边界

| 用途 | 固定版本与事实源 | 安装/使用边界 |
| --- | --- | --- |
| 宿主工程脚本 | Node.js 24+；统一 check runner 校验主版本 | 与 Harbor 容器内官方 Codex 安装脚本使用的 Node 分开，不替换用户系统环境 |
| Harbor 执行、Viewer、validator、regrade | Python 3.12/3.13、harbor==0.25.0；[pyproject.toml](../../tools/harbor/pyproject.toml) / [uv.lock](../../tools/harbor/uv.lock) | `uv sync --project tools/harbor --locked`；独立 .venv，不写 requirements-dev.txt |
| Harbor 浏览器 SDK | playwright-core 1.58.0；[package.json](../../tools/browser/package.json) / [package-lock.json](../../tools/browser/package-lock.json) | `npm ci --prefix tools/browser --ignore-scripts --no-audit --no-fund`；由 launcher 执行，随 runtime Skill 注入 |
| 浏览器与系统镜像 | digest 固定在 [task-builder.mjs](../../scripts/harbor/task-builder.mjs) | 镜像自带匹配的浏览器；安装 SDK 不等于安装 Docker 或宿主浏览器 |
| Restore Agent | Codex CLI 0.153.0；[restore.mjs](../../scripts/harbor/restore.mjs) 与 [RestoreCodex](../../tools/harbor/restore_codex.py) | 在 Harbor 环境内安装；认证由文件路径传递，密钥值不写入仓库或日志 |
| 可选宿主 Python capture | playwright==1.58.0；[requirements-dev.txt](../../requirements-dev.txt) | 仅独立使用 capture.py 时需要，不是默认 Harbor 入口的安装步骤 |
| 独立视觉评估执行器 | 尚未接入；[下一阶段](../../docs/evaluation-plan.md#下一阶段harbor-接评估执行链) | 不新增未验证的 SDK、模型网络或训练包；先落实 adapter、隔离与认证通路 |

本轮沿用固定版本，不做无关升级。`uv.lock`、SDK lock 和镜像 digest 的升级须与对应兼容检查一起提交。

## 自动执行

```powershell
node scripts/harbor/restore.mjs --case READY_CASE_ID
node scripts/harbor/restore.mjs --url https://example.com
node scripts/harbor/restore.mjs --recover reverse_output/restore-RUN
```

可选 `--tier ordinary|refined|complex`、`--output NEW_DIR`、`--plan`（只生成任务）、`--source-policy source_assisted`（仅明确允许时）。`--case` 专用于人工准备的 ready fixture，draft/retired 失败关闭，不自动转路由；通用网站走 `--url`，不要求 case 或用户先写任务描述。两者不可混用。

URL prepare 按唯一 [提示词](../restore/url-task-prompt.md)观察网站，自动推导场景、用户目标与还原描述，保存为 `contract.task_description`。状态、验收、资源、未知项各用合同原字段；brief 与 Data Factory task 字段均为投影，不新增第二份任务事实。推断标为 inferred，不能扩展实作范围。Harbor task.toml 在观察前只定义执行框架；网站专属任务在 prepare 后才形成，不把模板当成已经完成的分析。

模型默认依次读取显式 --model、RESTORE_MODEL、本机 Codex config.toml 的 model。恢复只补采集，不重新执行 Agent；相同 trial result 和 exporter 哈希复用已有包。导出器变化时生成带摘要后缀的新包，保留旧包；同版导出器遇到 trial result 变化则报错，不覆盖历史。

顺序：依赖同步 → 精简 Skill（不含案例元数据、历史产物、.git、.venv）→ capability/lint/dry-run → Harbor trial → 自动 export-trial。Harbor 控制 step 和停止。运行时仅加载 Harbor worker 入口，按需读领域参考。固定 Playwright Core 1.58.0 随 Skill 注入，与固定镜像浏览器配套；prepare 观察与合同冻结使用领域工具，后续采集读取 contract-lock.json，无需启动旧本地 loop。

Windows 自动补充 Docker Desktop CLI 路径、启用 UTF-8；Codex 固定 0.153.0，认证优先 CODEX_AUTH_JSON_PATH，其次本机 .codex/auth.json。`RestoreCodex` 继承 Harbor 官方 Codex，仅在每步启动前恢复专用 `/logs/agent` 目录为 agent 用户所有，修复多步 staging 后日志不可写的问题；会话恢复和 ATIF 转换仍使用官方实现，不另造轨迹。

运行记录在 `reverse_output/restore-*/launch.json`，关联 task、Skill digest、adapter 摘要、case、模型、job exit code、运行验收状态与 packages。每个 trial 对应一个 Episode，导出器修订可保留多个版本的包。正常退出、Agent 失败/超时均自动导出；宿主被强制结束/断电无法保证 finally 执行，可用 `--recover` 补采集。未产生 trial 的启动失败只有 launch 记录，不合成 ATIF。退出码区分执行/导出失败与质量未验收；训练用途查看包内 eligibility，不能从退出码推断。

Harbor 0.25.0 Codex producer 输出 ATIF-v1.7；模型与 validator 支持 v1.8。保留真实 schema_version 并官方校验，禁止改标签伪升级。canonical ATIF 保留媒体附件；失败/缺 verifier 的 trial 不进入 SFT/Preference/RL。

prepare 分配总预算 1/6，其余给 baseline 与 3/6/9 轮；每步在 deadline 前写 evaluations/<step>.json。独立 verifier 是结构门禁，不等于视觉 Judge；缺少独立视觉评分时正式质量 reward 保持 incomplete。

实跑验收（2026-11-07，POLA 直接 URL / refined）：`reverse_output/pola-url-e2e-v5-20261107` 的 trial `542f5c8d-66cc-412d-8966-b61ba3fd9c47` 完成 prepare、baseline 和六轮修复，共八步，异常数 0。自动推导 task、brief 投影、四状态浏览器采集、同 session 续接、separate verifier、artifact transfer、原生 ATIF 和 Data Factory Snapshot 均有真实证据。停止原因为现有 `budget_exhausted`（六轮用尽），全部修复决定仍为 inconclusive。

原生及规范副本共 16 文件通过官方校验和 Pydantic 往返；续接的 435 个重复上下文 step 标注来源，训练视图过滤后保留 107 个 ATIF step。Snapshot 为 1 episode / 8 step 轨迹 / 0 SFT / 0 Preference / 0 RL。核查 1,349 个产物字节摘要、80 次参考证据与 280 次候选证据绑定。首次自动包保留；运行期间修复导出器后，通过 `--recover` 生成带版本摘要的新包，没有改写原生轨迹。

真实 regrade 完成八步 verifier，异常数 0、reward 变化 0；复用原 Agent 执行区间，八份原生轨迹哈希不变。最终独立视觉 E2E 仍 incomplete、正式 reward 为 null；完整结尾未观察。POLA case 保持 draft，没有 ready-case trial；提前停止尚未实跑。以上证明执行与数据链路，不构成设计质量通过或 fully operational 声明。逐步核查见本地 `chain-audit.json`、`official-atif-roundtrip.json` 和 Snapshot manifest。

## 轨迹前台预览

Harbor Viewer 随锁定环境提供。它读取原始 jobs 目录，支持按 step 查看 ATIF、工具调用、观察、媒体和 verifier；Data Factory 包的 trajectories/index.json 是项目索引，不是单份 ATIF。

```powershell
uv run --project tools/harbor --locked harbor view reverse_output/restore-RUN/jobs --host 127.0.0.1 --port 8080 --no-build
```

启动后在本机浏览器打开 http://127.0.0.1:8080，选择 job 和 trial。Viewer 不重新执行 Agent。导出包单步查看可使用支持标准 ATIF 与相对媒体路径的查看器，直接选 trajectories/STEP/trajectory.json，并保留相邻 images/。用途资格与 Restore 决策需要读取 episode.json、steps.jsonl；标准 ATIF 查看器不会自动聚合这些治理字段。
