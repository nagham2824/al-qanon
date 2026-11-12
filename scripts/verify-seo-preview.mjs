// Validate generated preview before any manual deployment.
import { readdir, readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const dir='seo-preview-output';
const names=(await readdir(dir+'/articles')).filter(x=>x.endsWith('.html'));
const sitemap=await readFile(dir+'/sitemap.xml','utf8');
assert.ok(sitemap.startsWith('<?xml version="1.0"'));
const entries=[...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>m[1]);
assert.equal(new Set(entries).size,entries.length,'Duplicate sitemap URLs');
for(const name of names){
  assert.match(name,/^[1-9][0-9]*\.html$/,'Unexpected article ID');
  const url='https://aq-law.nl/articles/'+name;
  assert.ok(entries.includes(url),'Article missing from sitemap: '+name);
  const html=await readFile(dir+'/articles/'+name,'utf8');
  assert.ok(html.includes('<link rel="canonical" href="'+url+'">'),'Missing canonical');
  assert.ok(html.includes('<meta name="robots" content="index,follow">'),'Not indexable');
  assert.match(html,/<h1>[^<]+<\/h1>/,'Missing article heading');
  assert.match(html,/<section>[\s\S]*?<p>[^<]+<\/p>[\s\S]*?<\/section>/,'Missing article content');
}
const articleEntries=entries.filter(x=>x.startsWith('https://aq-law.nl/articles/'));
assert.equal(articleEntries.length,names.length,'Sitemap contains article URLs without pages');
console.log('Validated '+names.length+' article pages and matching sitemap URLs (preview only).');
