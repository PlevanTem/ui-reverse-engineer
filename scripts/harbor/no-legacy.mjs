#!/usr/bin/env node
import {lstat,readFile,readdir} from 'node:fs/promises';
import {join,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url)),targets=['README.md','README.en.md','SKILL.md','docs','evals','references','scripts','website'],patterns=[/langfuse/i,/\botlp\b/i,/scripts[\\/]evaluation/i,/scripts[\\/]trajectory/i,/references[\\/]evaluation/i,/references[\\/]trajectory/i,/export-run\.mjs/i,/task-init\b/i,/afterRestoreCommand/i,/scripts[\\/]restore[\\/]cli\.mjs\s+(?:init|freeze|begin|next|continue|refreeze|eval|task-)/i,/\.codex[\\/]hooks\.json/i,/scripts[\\/]restore[\\/]hooks\.mjs/i];
const findings=[];
async function scan(path){const rel=relative(root,path).replaceAll('\\','/');if(/(?:^|\/)(?:dist|node_modules|\.venv)(?:\/|$)/.test(rel))return;const stat=await lstat(path);if(stat.isDirectory()){for(const item of await readdir(path))await scan(join(path,item));return;}if(rel==='scripts/harbor/no-legacy.mjs'||/\.test\.mjs$/i.test(rel))return;if(!/\.(?:md|mjs|js|json|toml|yaml|yml|html|svg)$/i.test(path))return;const text=await readFile(path,'utf8');for(const pattern of patterns){const match=text.match(pattern);if(match)findings.push({file:rel,pattern:String(pattern),match:match[0]});}}
for(const target of targets)await scan(join(root,target));if(findings.length){console.error(JSON.stringify({status:'failed',findings},null,2));process.exitCode=1;}else console.log(JSON.stringify({status:'passed',scope:targets,exception:'CHANGE_LOG.md historical facts only'}));
