import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const cli=fileURLToPath(new URL('../cli.mjs',import.meta.url));
test('Restore CLI exposes only low-level domain tools',async()=>{const source=await readFile(cli,'utf8');for(const command of ['contract-validate','artifact-hash','artifact-diff','assessment-input','pairwise-verify','final-eval-input','report'])assert.match(source,new RegExp(command));for(const removed of ['task-init','task-arm','afterRestoreCommand','afterCodexCommand',"case 'next'","case 'begin'","case 'record'","case 'stop'"])assert.doesNotMatch(source,new RegExp(removed.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));});
