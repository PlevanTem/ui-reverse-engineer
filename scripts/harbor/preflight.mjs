#!/usr/bin/env node
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const exec=promisify(execFile),workspace=fileURLToPath(new URL('../../',import.meta.url)),windows=process.platform==='win32',python=join(workspace,'tools/harbor/.venv',windows?'Scripts/python.exe':'bin/python');
const args=process.argv.slice(2);let agent=null;while(args.length){const arg=args.shift();if(arg==='--agent')agent=args.shift();else throw new Error(`Unknown argument: ${arg}`);}if(!agent)throw new Error('Usage: node scripts/harbor/preflight.mjs --agent AGENT');
try{const result=await exec(python,[join(workspace,'tools/harbor/preflight_agent.py'),agent],{cwd:workspace,windowsHide:true,encoding:'utf8'});process.stdout.write(result.stdout);}catch(error){process.stderr.write(error.stdout||error.stderr||error.message);process.exitCode=1;}
