#!/usr/bin/env node
import {createTask} from './task-builder.mjs';
const args=process.argv.slice(2),options={};let output=null;
while(args.length){const key=args.shift(),value=args.shift();if(!value||value.startsWith('--'))throw new Error(`${key} requires a value`);if(key==='--url')options.url=value;else if(key==='--tier')options.tier=value;else if(key==='--output')output=value;else if(key==='--source-policy')options.sourcePolicy=value;else throw new Error(`Unknown argument: ${key}`);}
if(!output)throw new Error('--output NEW_DIR is required');
createTask(output,options).then(result=>console.log(JSON.stringify(result,null,2))).catch(error=>{console.error(error.message);process.exitCode=1;});
