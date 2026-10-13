import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const apiNames=new Set(['iorb','nyfed','market','macro']);
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.json':'application/json','.webmanifest':'application/manifest+json'};
http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  res.status=n=>{res.statusCode=n;return res;};res.json=v=>res.end(JSON.stringify(v));res.send=v=>res.end(v);res.setHeader('Cache-Control','no-store');
  try{
    if(url.pathname.startsWith('/api/')){
      const name=url.pathname.slice(5);if(!apiNames.has(name)){res.status(404).end();return;}
      req.query=Object.fromEntries(url.searchParams);const {default:handler}=await import(`../api/${name}.js`);res.setHeader('Content-Type','application/json');await handler(req,res);return;
    }
    const file=path.resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
    if(!file.startsWith(root+path.sep)||file.includes('/.')||file.includes('/node_modules/')||!['.html','.js','.css','.svg','.json','.webmanifest','.txt'].includes(path.extname(file))){res.status(404).end();return;}
    const config=JSON.parse(await readFile(path.join(root,'vercel.json'),'utf8'));for(const h of config.headers[0].headers)res.setHeader(h.key,h.value);
    res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type',types[path.extname(file)]||'text/plain');res.end(await readFile(file));
  }catch(e){res.status(500).json({error:'Local request failed'});console.error(e.message);}
}).listen(4173,'127.0.0.1',()=>console.log('Dashboard: http://127.0.0.1:4173'));
