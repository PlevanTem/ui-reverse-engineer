import test from 'node:test';import assert from 'node:assert/strict';import {execFile} from 'node:child_process';import {promisify} from 'node:util';import {mkdtemp,readFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {fileURLToPath} from 'node:url';
const execute=promisify(execFile),cli=fileURLToPath(new URL('../cli.mjs',import.meta.url));
test('real CLI starts vNext preparation but rejects the intentionally incomplete template',async t=>{
 const root=await mkdtemp(join(tmpdir(),'restore-cli-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const initialized=await execute(process.execPath,[cli,'init-vnext',root,'https://example.com']);assert.equal(JSON.parse(initialized.stdout).optimization,'RestoreOptimization/v1');
 const c=JSON.parse(await readFile(join(root,'contract.json'),'utf8'));assert.equal(c.optimization.verification.protocol,'blind/v1');
 await assert.rejects(()=>execute(process.execPath,[cli,'prepare-check',root]),e=>e.code===1&&/coverage/i.test(e.stderr));
 assert.equal(JSON.parse(await readFile(join(root,'run.json'),'utf8')).phase,'prepare');
});
