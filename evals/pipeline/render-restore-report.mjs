import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderRestoreReport } from '../../scripts/restore/legacy/render-restore-report.mjs';
export { renderRestoreReport };
if(process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { const [input,output,option,approval]=process.argv.slice(2); if(!input||!output||(option&&option!=='--approval'))throw new Error('Expected input.json output.html [--approval approval.json]');await renderRestoreReport(input,output,approval); }
  catch(error){console.error(error.message);process.exitCode=1;}
}
