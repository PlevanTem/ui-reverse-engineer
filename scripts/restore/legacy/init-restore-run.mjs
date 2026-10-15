#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const [directory, caseId, url] = process.argv.slice(2);
if (!directory || !/^UIR-\d{4}$/.test(caseId ?? '') || !/^https?:\/\//i.test(url ?? '')) {
  process.stderr.write('Usage: node evals/pipeline/init-restore-run.mjs <run-directory> <UIR-0000> <url>\n');
  process.exitCode = 2;
} else {
  try {
    const root = resolve(directory);
    await mkdir(join(root, 'docs'), { recursive: true });
    await mkdir(join(root, 'iterations'), { recursive: true });
    await mkdir(join(root, 'evidence'), { recursive: true });
    await mkdir(join(root, 'restored'), { recursive: true });
    const runId = root.split(/[\\/]/).slice(-2, -1)[0] || 'local-run';
    const now = new Date().toISOString();
    const docs = [
      ['T0','任务边界与冻结','T0-input.md','输入 URL、实际落地 URL、页面、状态、视口、动作、排除范围与验收义务。'],
      ['T1','参考取证','T1-evidence.md','记录观察时间、页面状态、截图/DOM/资源来源、可复现步骤、完整性和未知项。'],
      ['T2','第 0 轮基线','T2-baseline.md','记录首次可运行产物、启动与加载、逐状态红线、指标分母和初始偏差。'],
      ['T3','逐轮修复账本','T3-iterations.md','每轮一条可证伪假设；记录候选、前后证据、回归、keep/revert/inconclusive。失败轮保留。'],
      ['T4','最终复测与交付','T4-final.md','列出最终产物、全状态复测、指标、残差、未知、停止原因和评委可信度。']
    ];
    const index = docs.map(([stage,title,uri]) => ({ stage,title,uri:`docs/${uri}`,status:'partial',summary:'待填写',updated_at:now }));
    await fresh(join(root,'docs/index.json'),JSON.stringify(index,null,2)+'\n');
    for (const [stage,title,uri,hint] of docs) await fresh(join(root,'docs',uri),`# ${stage} ${title}\n\n> 填写指引：${hint}\n\n## 事实与证据\n\n待记录。\n\n## 判断、未知与下一步\n\n待记录。\n`);
    await fresh(join(root,'manifest.json'),JSON.stringify({run_id:runId,case_id:caseId,created_at:now,fixture_version:'0.1-draft',skill_version:'unrecorded',scorer_version:'unrecorded',environment:'unrecorded',round_limit:null},null,2)+'\n');
    await fresh(join(root,'fixture.json'),JSON.stringify({case_id:caseId,fixture_version:'0.1-draft',requested_url:url,observed_url:null,viewports:[],states:[],actions:[],reference_evidence:[],redlines:[]},null,2)+'\n');
    await fresh(join(root,'report-source.json'),JSON.stringify({
      schema_version:'restore-loop-report/v0.1',report_id:`${runId}-${caseId}`,demo:false,
      run:{run_id:runId,case_id:caseId,fixture_version:'0.1-draft',skill_version:'unrecorded',scorer_version:'unrecorded',environment:'unrecorded',started_at:now,stop_reason:'in_progress'},
      input:{task:`还原 ${url}`,requested_url:url,observed_url:url,pages:[],states:[],viewports:[],design_constraints:[],acceptance_criteria:[],out_of_scope:[],technology_stack:[],reference_evidence:[],resources:[],unknowns:['参考状态与视口尚未冻结']},
      output:{project_path:'restored/',start_command:'待填写',candidate_ref:'unbuilt',implemented_pages:[],implemented_states:[],technology_choices:[],deviations:[]},
      quality:{redlines:[{id:'RL-RUN',label:'可运行与可加载',status:'unknown',evidence:''}],metrics:[{id:'state_coverage',label:'状态覆盖率',category:'dynamic',baseline:null,final:null,delta:null,unit:'比例',method:'已复测状态 / 应复测状态',coverage:'未冻结',confidence:'unmeasured',evidence:''}],judge:{status:'unmeasured',kappa:null,sample_size:0,bias_result:'未校准'},findings:[]},
      iterations:[{round:0,at:now,hypothesis:'第 0 轮基线待采集',target:'待冻结',change_ref:'unbuilt',before:'未测',after:'未测',regressions:[],decision:'baseline',evidence:[]}],
      residuals:[],evidence_index:[]
    },null,2)+'\n');
    process.stdout.write(`Created restore run skeleton: ${root}\n`);
  } catch (error) {
    process.stderr.write(`Restore run init failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}

async function fresh(path, content) { await writeFile(path,content,{flag:'wx'}); }
