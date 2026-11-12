// HTTP smoke test of assembled static assets. No Cloudflare deployment.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import assert from 'node:assert/strict';
const root=resolve('seo-deploy-preview');
const headers=await readFile(resolve(root,'_headers'),'utf8');
assert.doesNotMatch(headers,/X-Robots-Tag:\s*noindex/i,'Release preview must not block indexing');
const server=createServer(async (req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname;
  const file=resolve(root,'.'+decodeURIComponent(path==='/'?'/index.html':path));
  if(!file.startsWith(root+sep)){res.writeHead(403).end();return;}
  try{
    const body=await readFile(file);
    res.writeHead(200,{'content-type':file.endsWith('.xml')?'application/xml':'text/html; charset=utf-8'});
    res.end(body);
  }catch{res.writeHead(404).end('Not found');}
});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
try{
  const origin='http://127.0.0.1:'+server.address().port;
  for(const path of ['/','/sitemap.xml','/articles/16.html']){
    const response=await fetch(origin+path);
    assert.equal(response.status,200,path+' must return HTTP 200');
    const body=await response.text();
    assert.ok(body.length>100,path+' must not be empty');
    if(path.endsWith('16.html')) {
      assert.match(body,/<h1>[^<]+<\/h1>/);
      assert.match(body,/<meta name="robots" content="index,follow">/);
    }
  }
  console.log('Local HTTP smoke test passed for home, sitemap and article 16. No deployment.');
}finally{server.close();}
