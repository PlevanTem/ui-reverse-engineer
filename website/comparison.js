const own='https://github.com/PlevanTem/ui-reverse-engineer/blob/main/';
const shot='https://github.com/abi/screenshot-to-code/blob/main/';
const lovable='https://github.com/firecrawl/open-lovable/blob/main/';
const cell=(label,note,url)=>({label,note,url});
const ours=(label,note,path)=>cell(label,note,own+path);
const unknown=(url)=>cell('— 未见说明','所查公开资料未明确描述该机制',url);
export const comparison={
 design:{intro:'先比较输入与产物：三者都能服务参考生成，本项目还定义需求反推、设计资产和现有页面迁移的工作流。',rows:[
 ['截图 / 录屏参考',ours('✅ 输入工作流','截图分析；录屏依赖宿主视觉能力','SKILL.md'),cell('✅ 官方支持','截图、设计图与录屏生成',shot+'README.md'),unknown(lovable+'README.md')],
 ['URL → 页面重建',ours('✅ Restore','观察页面与允许资源后生成项目','references/restore.md'),unknown(shot+'README.md'),cell('✅ URL 克隆入口','Firecrawl 提供内容与截图',lovable+'app/api/scrape-url-enhanced/route.ts')],
 ['可复用设计规范',ours('✅ DESIGN.md 模式','输出视觉规范与 CSV 索引','references/design-md-template.md'),unknown(shot+'README.md'),cell('◐ 品牌风格扩展','页面提供品牌延展入口；非 DESIGN.md 契约',lovable+'app/page.tsx')],
 ['已有 HTML 风格迁移',ours('✅ Transfer 模式','保留约定内容与功能，先出迁移方案','references/transfer-guide.md'),unknown(shot+'README.md'),cell('◐ 风格扩展入口','按品牌风格生成；未据此确认保留既有 HTML',lovable+'app/page.tsx')],
 ['生成技术栈',ours('✅ 按任务选择','交付可运行项目，无统一框架锁定','references/restore.md'),cell('✅ 多种栈','HTML/CSS、Tailwind、React、Vue 等',shot+'README.md'),cell('✅ React 应用','README 的明确生成目标',lovable+'README.md')],
 ['快速图形化产品入口',ours('◐ Agent Skill','由宿主 Agent 执行，需具备相应工具','README.md'),cell('✅ 托管 / 自部署','提供可视化产品与本地应用',shot+'README.md'),cell('✅ Web 应用','聊天生成；Vercel / E2B 沙箱配置',lovable+'README.md')]
 ]},
 interaction:{intro:'复杂交互的差异在于如何观察与复核。下面对比机制覆盖，不据此推定任何项目能完整还原所有 3D 网站。',rows:[
 ['3D 重建公开示例',ours('◐ Tiny Skies','源码辅助展示；fail / provisional','README.md#效果展示'),unknown(shot+'README.md'),unknown(lovable+'README.md')],
 ['Canvas / renderer 归因',ours('✅ 技术取证 SOP','资源、运行时与可见区域交叉核验','references/technology-stack-analysis.md'),unknown(shot+'README.md'),unknown(lovable+'README.md')],
 ['多状态 / 动作序列采集',ours('✅ 冻结采集机制','动作、视口与前后状态按契约记录','references/restore/interfaces.md'),cell('◐ 录屏参考','录屏可生成原型；不等同冻结动作采集',shot+'README.md'),cell('◐ URL 页面采集','所查接口请求内容与截图',lovable+'app/api/scrape-url-enhanced/route.ts')],
 ['跨 reload / 共享会话',ours('✅ 显式会话机制','验证已观察的持久化和长程路径','references/restore/interfaces.md'),unknown(shot+'README.md'),unknown(lovable+'README.md')],
 ['截图耗时与动画时间隔离',ours('✅ 时钟隔离采集','减少截图开销推进页面状态的干扰','references/restore/interfaces.md'),unknown(shot+'README.md'),unknown(lovable+'README.md')],
 ['核心循环 / 成功失败 / 重试',ours('✅ 路径验收要求','检查目标可达；缺少终态证据保留未知','references/restore/interactive-scenes.md'),unknown(shot+'README.md'),unknown(lovable+'README.md')]
 ]},
 review:{intro:'本项目的主要差异集中在可审阅的迭代与验收：记录修改依据、产物版本和未完成项。机制存在，不代表每次运行均已通过。',rows:[
 ['浏览器视觉复核',ours('◐ 宿主条件支持','采集同状态证据，依赖可用浏览器','references/restore.md'),cell('✅ 可选截图自检','安装 Chromium 后可渲染生成页面自查',shot+'README.md'),unknown(lovable+'README.md')],
 ['评估输出的工具',ours('✅ 五维 E2E 契约','布局、样式、内容、交互、稳健性','evals/restore.md'),cell('✅ 评测与评分 UI','有模型/提示词评测及 1–4 人工评分',shot+'Evaluation.md'),unknown(lovable+'README.md')],
 ['有界修复 / keep / revert',ours('✅ Loop 决策机制','记录差异、改善、回归和停止原因','references/restore/criteria.md'),unknown(shot+'README.md'),unknown(lovable+'README.md')],
 ['最终产物与证据哈希绑定',ours('✅ 证据与快照机制','追溯版本；漂移时拒绝或显式降级','references/restore/interfaces.md'),unknown(shot+'README.md'),unknown(lovable+'README.md')],
 ['独立验收与红线',ours('◐ 依赖 evaluator','最终 E2E 分开；不可用时 incomplete','evals/restore.md'),cell('◐ 人工评分','所查评测说明提供输出评级',shot+'Evaluation.md'),unknown(lovable+'README.md')],
 ['多 run 轨迹与同条件比较',ours('✅ Challenge Report','按合同与评分版本分组，追溯已有记录','scripts/restore/challenge-report.mjs'),cell('◐ 模型 / 提示词评测','评测不同模型与提示词的输出',shot+'Evaluation.md'),unknown(lovable+'README.md')]
 ]}
};
const escape=s=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function renderComparison(key){const group=comparison[key];return `<p class="matrix-intro">${group.intro}</p><div class="table-wrap matrix-scroll" role="region" aria-label="项目能力对比，可横向滚动" tabindex="0"><table class="project-matrix"><thead><tr><th scope="col">能力 / 机制</th><th scope="col" class="ours-col">UI Reverse Engineer<span>本项目 / Agent Skill</span></th><th scope="col"><a href="https://github.com/abi/screenshot-to-code" target="_blank" rel="noopener">Screenshot to Code ↗</a><span>视觉参考 → 代码</span></th><th scope="col"><a href="https://github.com/firecrawl/open-lovable" target="_blank" rel="noopener">Open Lovable ↗</a><span>URL / 对话 → React</span></th></tr></thead><tbody>${group.rows.map(([name,...cells])=>`<tr><th scope="row">${name}</th>${cells.map((c,i)=>`<td ${i===0?'class="ours-col"':''}><a class="matrix-state" href="${c.url}" target="_blank" rel="noopener" aria-label="${escape(name+'，'+['本项目','Screenshot to Code','Open Lovable'][i]+'，'+c.label+'，查看依据')}">${c.label}</a><span class="matrix-note">${c.note}</span></td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="table-note">✅ 已公开机制 / 支持　 ◐ 部分覆盖或依赖条件　 — 所查资料未见说明，不能视为不支持。点击单元格查看官方依据。</p><details class="matrix-sources"><summary>对比口径与来源 · 2026-10-28</summary><p>范围：两项目官方 README、Screenshot to Code 的 Evaluation.md，以及 Open Lovable 的主页和 URL 采集接口；未穷尽代码与商业版本。比较机制覆盖，不是同预算效果实测，也不作速度、相似度或独占能力结论。本项目参照当前仓库 SOP、接口、Criteria 和 E2E 文档。Tiny Skies 仍有未验证项。</p><p><a href="https://github.com/abi/screenshot-to-code/blob/main/README.md">Screenshot to Code README</a> · <a href="https://github.com/abi/screenshot-to-code/blob/main/Evaluation.md">评测说明</a> · <a href="https://github.com/firecrawl/open-lovable/blob/main/README.md">Open Lovable README</a> · <a href="https://github.com/firecrawl/open-lovable/blob/main/app/api/scrape-url-enhanced/route.ts">URL 采集源码</a> · <a href="https://github.com/firecrawl/open-lovable/blob/main/app/page.tsx">风格扩展入口</a></p></details>`;}
