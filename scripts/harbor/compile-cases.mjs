#!/usr/bin/env node
import {compileCases} from './task-builder.mjs';
const args=process.argv.slice(2);let output=null,caseId=null;
while(args.length){const key=args.shift(),value=args.shift();if(!value||value.startsWith('--'))throw new Error(`${key} requires a value`);if(key==='--output')output=value;else if(key==='--case')caseId=value;else throw new Error(`Unknown argument: ${key}`);}
if(!output)throw new Error('--output NEW_DIR is required');
compileCases(output,{caseId}).then(result=>console.log(JSON.stringify({output:result.output,tasks:result.tasks.length},null,2))).catch(error=>{console.error(error.message);process.exitCode=1;});
