import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Local executable adapter: stdin JSON -> stdout JSON, diagnostics on stderr.
// shell:false avoids interpreting request contents as shell commands.
export function invoke(script,input,timeoutMs,args=[]) {
  return new Promise((resolveResult,reject)=>{
    if(timeoutMs<=0) return reject(new Error('Adapter deadline exhausted'));
    const fallback=async()=>{
      const mod=await import(pathToFileURL(resolve(script)).href);
      if(typeof mod.evaluate!=='function')throw new Error('Adapter cannot spawn and has no evaluate(input,args) export');
      return mod.evaluate(input,args);
    };
    let child;
    try {child=spawn(process.execPath,[resolve(script),...args],{shell:false,windowsHide:true,stdio:['pipe','pipe','pipe']});}
    catch(error){if(error.code==='EPERM'){fallback().then(resolveResult,reject);return;}reject(error);return;}
    let output='',error='',settled=false;
    const finish=(err,value)=>{if(settled)return; settled=true; clearTimeout(timer); err?reject(err):resolveResult(value);};
    const timer=setTimeout(()=>{child.kill(); finish(new Error('Adapter deadline exceeded; cooperative cancellation of descendants required'));},timeoutMs);
    child.stdout.on('data',chunk=>{output+=chunk; if(output.length>4*1024*1024){child.kill();finish(new Error('Adapter output exceeds 4 MB'));}});
    child.stderr.on('data',chunk=>{error=(error+chunk).slice(-4000);});
    child.on('error',async e=>{
      if(e.code!=='EPERM')return finish(e);
      // Restricted hosts may disallow child processes. An exported evaluate()
      // runs cooperatively in-process; the deadline cannot terminate its work.
      try {finish(null,await fallback());} catch(error){finish(error);}
    }); child.stdin.on('error',e=>{if(e.code!=='EPIPE')finish(e);});
    child.on('close',code=>{if(code!==0) return finish(new Error(`Adapter exit ${code}: ${error}`));try{finish(null,JSON.parse(output));}catch{finish(new Error('Adapter stdout must contain one JSON value'));}});
    child.stdin.end(JSON.stringify(input));
  });
}
