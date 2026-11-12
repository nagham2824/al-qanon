// Assemble a deployable static-assets directory for REVIEW ONLY.
// Does not run wrangler, change main, or deploy.
import { readdir, cp, mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
const output='seo-deploy-preview';
// Publish only browser-facing assets; never copy backend source, SQL, or build configs.
const skip=new Set(['.git','.github','node_modules','scripts','seo-preview-output','seo-deploy-preview','supabase','wrangler.jsonc','vercel.json','README.md','CNAME']);
await mkdir(output,{recursive:true});
for(const entry of await readdir('.',{withFileTypes:true})){
  if(skip.has(entry.name)||entry.name.startsWith('.')) continue;
  if(entry.isFile()||entry.isDirectory()) await cp(entry.name,join(output,entry.name),{recursive:true});
}
await mkdir(join(output,'articles'),{recursive:true});
for(const entry of await readdir('seo-preview-output/articles',{withFileTypes:true})){
  if(!entry.isFile()||!/^[0-9]+[.]html$/.test(entry.name)) throw Error('Unexpected generated article asset');
  await copyFile(join('seo-preview-output/articles',entry.name),join(output,'articles',entry.name));
}
// This release candidate must be indexable; keep the original _headers unchanged.
const headersPath=join(output,'_headers');
const originalHeaders=await readFile(headersPath,'utf8');
const indexableHeaders=originalHeaders.replace(/^\s*X-Robots-Tag:\s*noindex\s*\r?\n/gim,'');
if(indexableHeaders===originalHeaders)throw Error('Expected preview noindex header not found; inspect headers manually');
if(/X-Robots-Tag:\s*noindex/i.test(indexableHeaders))throw Error('Indexing still blocked in assembled headers');
await writeFile(headersPath,indexableHeaders);
await copyFile('seo-preview-output/sitemap.xml',join(output,'sitemap.xml'));
const sitemap=await readFile(join(output,'sitemap.xml'),'utf8');
if(!sitemap.includes('https://aq-law.nl/articles/')) throw Error('Missing article in assembled sitemap');
console.log('Static asset preview assembled in '+output+' (not deployed).');
