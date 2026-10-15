import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assert, budget, contract, readJSON, local, safeFile, treeHash, verifyEvidence, digest, sha, text, validateTokenUsage, writeJSON } from './core.mjs';

const templatePath=fileURLToPath(new URL('../../assets/restore/report.html',import.meta.url));
const escape=v=>String(v??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const table=(headers,rows)=>`<div class="scroll"><table><thead><tr>${headers.map(x=>`<th>${escape(x)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(v=>`<td>${escape(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
const mdCell=v=>String(v??'—').replaceAll('|','\\|').replace(/[\r\n]+/g,' ');
const mdTable=(headers,rows)=>`| ${headers.map(mdCell).join(' | ')} |\n| ${headers.map(()=> '---').join(' | ')} |\n${rows.map(row=>`| ${row.map(mdCell).join(' | ')} |`).join('\n')}\n`;
async function model(root,run) {
  const c=await contract(root,run);
  if(run.best) assert(await treeHash(local(root,'restored'))===run.best,'Delivered artifact differs from best snapshot');
  let e2e=null;
  if(run.e2e){e2e=await readJSON(local(root,run.e2e.uri));assert(digest(e2e)===run.e2e.sha256,'E2E result changed');if(e2e.evidence?.length)await verifyEvidence(root,e2e.evidence);}
  const base=run.baseline_assessment?await readJSON(local(root,run.baseline_assessment)):null;
  const best=run.best_assessment?await readJSON(local(root,run.best_assessment)):null;
  const rounds=[];
  for(const r of run.rounds){let assessment=null,verification=null;if(r.assessment){assessment=await readJSON(local(root,r.assessment));await verifyEvidence(root,assessment.evidence);}if(r.verification)verification=await readJSON(local(root,r.verification));rounds.push({...r,assessment,verification});}
  if(base)await verifyEvidence(root,base.evidence);if(best)await verifyEvidence(root,best.evidence);
  const stopBudget=run.stop?budget(run,Date.parse(run.stop.at)):null;
  const misclassified=run.stop?.reason==='budget_exhausted'&&stopBudget?.remaining_ms>0;
  const timeAccounting=stopBudget?{at:run.stop.at,wall_elapsed_ms:stopBudget.wall_elapsed_ms,excluded_ms:stopBudget.excluded_ms,active_elapsed_ms:stopBudget.elapsed_ms,remaining_ms:stopBudget.remaining_ms,exclusions:run.time_exclusions??[],budget_exhaustion_misclassified:misclassified,effective_stop_reason:misclassified?'external_interruption_after_pause':run.stop.reason}:null;
  let tokenUsage={schema_version:'TokenUsageSummary/v0.2',status:'unavailable',coverage:'unavailable',coverage_note:'No attributable model usage record was supplied.',observed_total_tokens:null,records:[]};
  if(run.token_usage){
    const raw=validateTokenUsage(await readJSON(await safeFile(root,run.token_usage.uri)));
    assert(digest(raw)===run.token_usage.sha256,'Token usage record changed');
    const sum=key=>raw.records.reduce((total,record)=>total+record.usage[key],0);
    tokenUsage={schema_version:'TokenUsageSummary/v0.2',status:'observed',coverage:raw.coverage,coverage_note:raw.coverage_note,observed_total_tokens:sum('total_tokens'),input_tokens:sum('input_tokens'),cached_input_tokens:sum('cached_input_tokens'),output_tokens:sum('output_tokens'),reasoning_output_tokens:sum('reasoning_output_tokens'),response_count:raw.records.reduce((total,record)=>total+record.response_count,0),records:raw.records,source_uri:run.token_usage.uri,source_sha256:run.token_usage.sha256};
  }
  const data={schema_version:'RestoreReport/v0.2',run_id:run.run_id,demo:c.demo===true,contract:c,contract_sha256:run.contract_sha256,tier:run.tier,started_at:run.started_at,enforcement:run.enforcement,stop:run.stop,time_accounting:timeAccounting,token_usage:tokenUsage,artifact_sha256:run.best,baseline:base,best,rounds,e2e};
  let supplements;
  try {supplements=await readJSON(local(root,'report-supplements.json'));}
  catch(error){if(error.code!=='ENOENT')throw error;}
  if(supplements){
    assert(supplements.schema_version==='RestoreReportSupplements/v0.2'&&supplements.run_id===run.run_id&&Array.isArray(supplements.audits),'Invalid report supplements');
    for(const audit of supplements.audits){
      assert(text(audit.id)&&text(audit.label)&&text(audit.status)&&text(audit.html_uri)&&text(audit.json_uri),'Invalid supplemental audit');
      assert(sha(await readFile(await safeFile(root,audit.html_uri)))===audit.html_sha256,'Supplemental HTML changed');
      assert(sha(await readFile(await safeFile(root,audit.json_uri)))===audit.json_sha256,'Supplemental JSON changed');
    }
    data.supplemental_audits=supplements.audits;
  }
  return data;
}
function eligible(m,decision){
  const r=m.e2e;
  return Boolean(!m.demo && m.stop && r && r.status!=='incomplete' && r.redlines?.length===6 && r.redlines.every(x=>['pass','not_applicable'].includes(x.status)) && (decision==='conditional_go'||r.status==='pass'));
}
async function material(root,run){const data=await model(root,run),template=await readFile(templatePath,'utf8');return {data,template,report_sha256:digest(data),template_sha256:sha(template)};}
export async function approve(root,run,a) {
  const m=await material(root,run);
  assert(a.report_sha256===m.report_sha256&&a.template_sha256===m.template_sha256,'Approval is stale');
  assert(['go','conditional_go','no_go'].includes(a.decision)&&text(a.reviewer)&&text(a.reason),'Approval decision/reviewer/reason required');
  if(a.decision!=='no_go') {assert(eligible(m.data,a.decision),'Positive approval blocked by E2E gates');assert(!m.data.e2e.provisional||a.manual_reviewed===true,'Provisional Judge requires manual review');}
  if(a.decision==='conditional_go')assert(text(a.conditions),'Conditional approval requires conditions');
  run.approval={...a,recorded_at:new Date().toISOString()};await writeJSON(join(root,'approval.json'),run.approval);await report(root,run);return run.approval;
}
async function evidenceView(root,e) {
  await safeFile(root,e.uri); const uri=e.uri.split(/[\\/]/).map(encodeURIComponent).join('/');
  return `<figure><figcaption>${escape(e.id)} · ${escape(e.kind)}</figcaption>${e.kind==='screenshot'?`<a href="${uri}" target="_blank" rel="noopener"><img loading="lazy" src="${uri}" alt="${escape(e.id)}"></a>`:e.kind==='video'?`<video controls preload="metadata" src="${uri}"></video>`:`<a href="${uri}" target="_blank" rel="noopener">查看证据</a>`}</figure>`;
}
export async function report(root,run) {
  const m=await material(root,run),d=m.data;
  const approval=run.approval&&run.approval.report_sha256===m.report_sha256&&run.approval.template_sha256===m.template_sha256?run.approval:null;
  const r=d.e2e, accounting=d.time_accounting;
  const stopLabels={target_reached:'视觉目标达成',plateau:'连续两轮无收益',cycle_detected:'重复或振荡',budget_exhausted:'预算或轮数耗尽',blocked:'参考或资源阻塞',failed:'未交付可运行产物'};
  const e2eLabels={pass:'通过（按当前提案）',fail:'未通过',incomplete:'未完成评分'};
  const duration=ms=>`${Math.floor(ms/3600000)?Math.floor(ms/3600000)+'h ':''}${Math.floor(ms%3600000/60000)}m ${Math.floor(ms%60000/1000)}s`;
  const elapsed=accounting?duration(accounting.active_elapsed_ms):'运行中';
  const stopLabel=accounting?.budget_exhaustion_misclassified?'外部暂停后收束（原预算误判）':stopLabels[d.stop?.reason]??d.stop?.reason??'运行中';
  const e2eReason=accounting?.budget_exhaustion_misclassified&&r?.reason==='E2E result received after deadline'?'原控制器以墙钟误判逾期；校正后仍无正式六维评分。':r?.reason??'分数来自独立 Eval；不复制 Loop 分数。';
  let body=`${d.demo?'<div class="demo-banner">合成演示数据 · 并非真实网站还原，不能用于正向审批</div>':''}<header><p>RESTORE / V0.2</p><h1>视觉还原交付报告</h1><p>${escape(d.contract.requested_url)}</p></header><section class="summary"><div><small>Loop 停止原因</small><strong>${escape(stopLabel)}</strong></div><div><small>独立 E2E</small><strong>${escape(e2eLabels[r?.status]??'待评')}</strong><small>${r?.provisional?'暂定结果 · 评分器未校准':'校准状态见明细'}</small></div><div><small>人工审批</small><strong>${escape(approval?.decision??'pending')}</strong></div><div><small>修复轮数 / 有效耗时</small><strong>${d.rounds.length} / ${escape(elapsed)}</strong></div></section>`;
  if(accounting?.excluded_ms){body+=`<section><h2>时间校正</h2><p>原停止事件仍保留为 ${escape(d.stop.reason)}；扣除已证明的外部暂停后，有效耗时 ${escape(duration(accounting.active_elapsed_ms))}，墙钟跨度 ${escape(duration(accounting.wall_elapsed_ms))}，排除等待 ${escape(duration(accounting.excluded_ms))}，停止时剩余 ${escape(duration(accounting.remaining_ms))}。${accounting.budget_exhaustion_misclassified?'原“预算耗尽”判定不成立；本次运行已收束，校正不自动重启 Loop。':''}</p>${table(['暂停开始','恢复','原因','证据来源'],accounting.exclusions.map(x=>[x.start_at,x.end_at,x.reason,x.source]))}</section>`;}
  const tokens=d.token_usage, formatTokens=value=>value==null?'未知':Number(value).toLocaleString('en-US');
  body+=`<section><h2>Token 消耗</h2><p>${tokens.status==='observed'?`已记录 ${escape(formatTokens(tokens.observed_total_tokens))} tokens；输入 ${escape(formatTokens(tokens.input_tokens))}（其中缓存输入 ${escape(formatTokens(tokens.cached_input_tokens))}），输出 ${escape(formatTokens(tokens.output_tokens))}（其中推理输出 ${escape(formatTokens(tokens.reasoning_output_tokens))}）。`:'无可归属的用量记录。'}覆盖：${escape(tokens.coverage)}。${escape(tokens.coverage_note)}</p>${tokens.records.length?table(['阶段','Agent','输入','缓存输入','输出','总量','来源'],tokens.records.map(x=>[x.stage,x.agent,formatTokens(x.usage.input_tokens),formatTokens(x.usage.cached_input_tokens),formatTokens(x.usage.output_tokens),formatTokens(x.usage.total_tokens),x.source_ref])):''}<p>缓存输入包含在输入中；推理输出包含在输出中。仅汇总有来源的模型用量，不推算缺失部分。</p></section>`;
  body+=`<section><h2>最终 E2E：六维验收</h2><p>${escape(e2eReason)} ${r?.total_100!=null?'加权 '+escape(r.total_100.toFixed(1))+'/100':''}</p>${r?.dimensions?.length?table(['维度','等级 / 4','权重','理由'],r.dimensions.map(x=>[x.id,x.status==='scored'?x.score:x.status,x.weight,x.reason])):'<p>六维评分尚未完成。</p>'}${r?.redlines?.length?table(['红线','状态','证据'],r.redlines.map(x=>[x.id,x.status,x.evidence.join(', ')])):''}</section>`;
  if(d.supplemental_audits?.length){
    body+='<section><h2>独立补充审计</h2><p>审计时间按已校正的有效耗时判断；暂评分不替代正式 E2E 状态，也不改变已冻结的 Loop 决策。</p><ul>';
    for(const audit of d.supplemental_audits){const uri=audit.html_uri.split(/[\\/]/).map(encodeURIComponent).join('/');body+=`<li><a href="${uri}">${escape(audit.label)}</a> · ${escape(audit.status)} · ${escape(audit.summary??'')}</li>`;}
    body+='</ul></section>';
  }
  body+=`<section><h2>最终交付与残差</h2><p>启动：<code>${escape(d.contract.start_command)}</code> · 项目：<code>restored/</code></p><p>最佳版本：<code>${escape(d.artifact_sha256)}</code></p>${table(['问题','程度','义务'],(d.best?.findings??[]).map(f=>[f.description,f.severity,f.obligation_id]))}<p>未知：${escape((d.contract.unknowns??[]).join('；')||'无契约未知项')}</p></section>`;
  body+=`<details open><summary>参考 / 基线 / 最佳版本：证据</summary><div class="evidence-columns">`;
  for(const [label,items] of [['参考',d.contract.reference_evidence],['基线',d.baseline?.evidence??[]],['最佳版本',d.best?.evidence??[]]]) {
    body+=`<div><h3>${label}</h3>`;for(const e of items)body+=await evidenceView(root,e);body+='</div>';
  }
  body+='</div></details>';
  body+=`<details><summary>Criteria：三类视觉 0–4 与页面 QA</summary>${table(['义务 / 维度','状态 / 区域','QA','基线','最佳','适用性'],d.contract.obligations.map(o=>{const b=d.baseline?.units.find(u=>u.obligation_id===o.id),f=d.best?.units.find(u=>u.obligation_id===o.id);return [o.id+' / '+o.criterion_id,o.state_id+' / '+o.region_id,o.expected,b?.score??b?.status,f?.score??f?.status,o.applicability];}))}<p>目标为 3；4 不作为继续迭代的要求。无三维加权总分。</p></details>`;
  body+=`<details><summary>逐轮 Measure → Learn → Iterate</summary>${table(['轮次','假设 / 方法','可见改善','决定','回归','耗时秒'],d.rounds.map(x=>[x.round,x.hypothesis+' / '+x.strategy,x.verification?.reason??x.reason,x.decision,(x.regressions??[]).join(', '),Math.round((Date.parse(x.at)-Date.parse(x.started_at))/1000)]))}</details>`;
  body+=`<details><summary>输入、环境、资源与结构化记录</summary><pre>${escape(JSON.stringify({contract:d.contract,stop:d.stop,enforcement:d.enforcement,calibration:r?.calibration},null,2))}</pre><a href="report.json">report.json</a> · <a href="events.jsonl">events.jsonl</a> · <a href="design_brief.md">design_brief.md</a></details>`;
  body+=`<section><h2>统一审批</h2><p>本页导出本地审批记录，不验证身份或提交服务器。审批导出后用 approve 命令导入归档。</p><p>${escape(approval?approval.decision+' · '+approval.reviewer+' · '+approval.reason:'待审')}</p><form id="approval"><label>结论<select name="decision"><option value="no_go">不批准</option><option value="conditional_go" ${eligible(d,'conditional_go')?'':'disabled'}>有条件批准</option><option value="go" ${eligible(d,'go')?'':'disabled'}>批准</option></select></label><label>审阅者<input name="reviewer" required></label><label>理由<textarea name="reason" required></textarea></label><label>后续条件<textarea name="conditions"></textarea></label><label><input type="checkbox" name="manual_reviewed"> 已人工对照视觉证据</label><button>导出审批 JSON</button><output id="message"></output></form></section>`;
  const context={report_sha256:m.report_sha256,template_sha256:m.template_sha256,run_id:run.run_id,provisional:r?.provisional??true};
  const html=m.template.replace('{{BODY}}',body).replace('{{CONTEXT}}',JSON.stringify(context).replaceAll('<','\\u003c'));
  await writeJSON(join(root,'report.json'),d);await writeFile(join(root,'report.html'),html);
  const qa=mdTable(['义务','维度','状态 / 区域','可观察目标','重要性','适用性'],d.contract.obligations.map(o=>[o.id,o.criterion_id,`${o.state_id} / ${o.region_id}`,o.expected,o.importance,o.applicability]));
  const stateTable=mdTable(['状态','页面','视口','路径','哨兵'],d.contract.states.map(s=>[s.id,s.page_id,`${s.viewport.width}×${s.viewport.height}`,s.path,s.sentinel?'是':'否']));
  const resources=mdTable(['资源','用途 / 区域','来源 / 状态'],(d.contract.resources??[]).map(x=>[x.id??x.name??x.url,x.role??x.region,x.url??x.status]));
  const findings=mdTable(['问题','严重度','视觉义务'],(d.best?.findings??[]).map(x=>[x.description,x.severity,x.obligation_id]));
  const files={
    'T0-input':`# T0 输入与任务边界\n\n参考：${d.contract.requested_url}\n\n实际页面：${d.contract.observed_url}\n\n环境：${JSON.stringify(d.contract.environment)}\n\n档位：${d.tier}\n\n## 页面状态\n\n${stateTable}\n## 页面专属视觉 QA\n\n${qa}\n`,
    'T1-evidence':`# T1 参考取证与资源\n\n${mdTable(['证据','类型','文件','SHA-256'],d.contract.reference_evidence.map(x=>[x.id,x.kind,x.uri,x.sha256]))}\n## 资源映射\n\n${resources}\n## 未知\n\n${(d.contract.unknowns??[]).map(x=>'- '+mdCell(x)).join('\n')||'无已登记未知项'}\n`,
    'T2-baseline':`# T2 第 0 轮基线\n\n快照：${d.baseline?.binding?.artifact_sha256??'未建立'}\n\n${mdTable(['视觉义务','状态','等级'],(d.baseline?.units??[]).map(x=>[x.obligation_id,x.status,x.score??'—']))}\n## 运行门禁\n\n${mdTable(['门禁','结果'],(d.baseline?.gates??[]).map(x=>[x.id,x.status]))}\n`,
    'T3-iterations':`# T3 逐轮修复\n\n${mdTable(['轮次','问题 / 假设','方法','判断','回归','候选快照'],d.rounds.map(x=>[x.round,`${x.issue_id}: ${x.hypothesis}`,x.strategy,x.decision,(x.regressions??[]).join(', '),x.candidate]))}\n每轮原始证据、评委与判断记录保存在 observations/，操作时序保存在 events.jsonl。\n`,
    'T4-final':`# T4 最终产物与验收\n\n停止原因原记录：${d.stop?.reason??'运行中'}${accounting?.budget_exhaustion_misclassified?'；时间校正后预算未耗尽':''}\n\n有效耗时：${accounting?duration(accounting.active_elapsed_ms):'运行中'}；外部暂停：${accounting?duration(accounting.excluded_ms):'0m 0s'}\n\nToken 记录：${tokens.observed_total_tokens??'未知'}；覆盖：${tokens.coverage}；${tokens.coverage_note}\n\n最佳快照：${d.artifact_sha256??'无'}\n\n启动：${d.contract.start_command}\n\n独立 E2E：${r?.status??'pending'}；${r?.total_100==null?'无可信总分':r.total_100+'/100'}；${r?.provisional?'暂定':'校准状态见报告'}\n\n${mdTable(['E2E 维度','等级','权重'],(r?.dimensions??[]).map(x=>[x.id,x.score??x.status,x.weight]))}\n## 剩余明显问题与未知\n\n${findings}\n${(d.contract.unknowns??[]).map(x=>'- '+mdCell(x)).join('\n')}\n`
  };
  for(const [name,content] of Object.entries(files))await writeFile(local(root,`docs/${name}.md`),content);
  await writeFile(join(root,'design_brief.md'),`# Restore brief\n\n参考：${d.contract.requested_url}\n\n实际页面：${d.contract.observed_url}\n\n交付：restored/；启动：${d.contract.start_command}\n\n## 范围与状态\n\n${stateTable}\n## 视觉目标与可见依据\n\n${qa}\n## 资源与实现依赖\n\n${resources}\n## 最终结果与残差\n\nLoop 原记录：${d.stop?.reason??'运行中'}${accounting?.budget_exhaustion_misclassified?'（时间校正后预算未耗尽）':''}；有效耗时：${accounting?duration(accounting.active_elapsed_ms):'运行中'}；E2E：${r?.status??'pending'}；最佳快照：${d.artifact_sha256??'无'}\n\n${findings}\n详细参考见 [T1](docs/T1-evidence.md)，逐轮判断见 [T3](docs/T3-iterations.md)，最终验收见 [T4](docs/T4-final.md)。\n\n本 brief 由结构化记录生成。\n`);
  return {report:join(root,'report.html'),report_sha256:m.report_sha256,template_sha256:m.template_sha256,approval:approval?.decision??'pending'};
}
