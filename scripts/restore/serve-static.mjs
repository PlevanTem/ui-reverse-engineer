#!/usr/bin/env node
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';

const root = process.argv[2] && resolve(process.argv[2]);
const port = Number(process.argv[3] ?? 4174);
if (!root || !Number.isInteger(port) || port < 1024 || port > 65535) {
  process.stderr.write('Usage: node evals/pipeline/serve-static.mjs <project-directory> [port]\n');
  process.exit(2);
}
const types = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.webp':'image/webp','.avif':'image/avif','.gif':'image/gif','.svg':'image/svg+xml','.woff':'font/woff','.woff2':'font/woff2','.ico':'image/x-icon','.mp4':'video/mp4','.webm':'video/webm','.glb':'model/gltf-binary','.gltf':'model/gltf+json','.wasm':'application/wasm','.bin':'application/octet-stream'};
createServer(async (req,res) => {
  try {
    const url = new URL(req.url,'http://localhost');
    let path = resolve(root,'.'+decodeURIComponent(url.pathname));
    if (path !== root && !path.startsWith(root + sep)) { res.writeHead(403).end(); return; }
    if ((await stat(path)).isDirectory()) path = resolve(path,'index.html');
    const body = await readFile(path);
    res.writeHead(200,{'content-type':types[extname(path)] ?? 'application/octet-stream','cache-control':'no-store'}).end(body);
  } catch { res.writeHead(404).end('Not found'); }
}).listen(port,'127.0.0.1',()=>process.stdout.write(`Serving ${root} at http://127.0.0.1:${port}/\n`));
