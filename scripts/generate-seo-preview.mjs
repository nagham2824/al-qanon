// Preview-only generator. Run locally with SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY.
// Writes to seo-preview-output/ only; does not modify production files.
import { mkdir, writeFile } from 'node:fs/promises';
const base = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_PUBLISHABLE_KEY;
if (!base || !key || !/^https:\/\//.test(base)) throw Error('Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY');
const escape = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const plain = s => String(s ?? '').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();

// Render basic article Markdown safely, retaining headings and paragraphs.
// Escape all source text before inserting HTML.
const renderArticle = source => String(source ?? '').replace(/\r\n?/g,'\n').split(/\n{2,}/).map(block => {
  const lines=block.split('\n');
  return lines.map(line => {
    const heading=line.match(/^\s*(#{1,6})\s+(.+)$/);
    if (heading) {
      const level=Math.min(heading[1].length+1,6);
      return '<h'+level+'>'+escape(heading[2].trim())+'</h'+level+'>';
    }
    return line.trim() ? '<p>'+escape(line.trim())+'</p>' : '';
  }).join('\n');
}).join('\n');
const langs = new Set(['ar','nl','en','tr']);
const out = 'seo-preview-output';
await mkdir(out + '/articles', { recursive:true });
let rows = [], offset = 0;
while (true) {
  const url = new URL('/rest/v1/articles',base);
  url.searchParams.set('select','id,title,content,language,author_name,updated_at');
  url.searchParams.set('status','eq.published');
  url.searchParams.set('order','id.asc');
  url.searchParams.set('limit','500');
  url.searchParams.set('offset',String(offset));
  const response = await fetch(url,{headers:{apikey:key,Accept:'application/json'}});
  if (!response.ok) throw Error('Supabase request failed: '+response.status);
  const page = await response.json();
  if (!Array.isArray(page)) throw Error('Unexpected response');
  rows.push(...page);
  if (page.length < 500) break;
  offset += page.length;
}
const urls = ['https://aq-law.nl/','https://aq-law.nl/privacy-policy.html','https://aq-law.nl/general-conditions.html','https://aq-law.nl/public-law.html'];
for (const a of rows) {
  if (!/^[1-9][0-9]*$/.test(String(a.id))) continue;
  const lang = langs.has(a.language) ? a.language : 'ar';
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  const title = plain(a.title) || 'مقال قانوني';
  const body = plain(a.content);
  const formattedBody = renderArticle(a.content);
  if (!body) continue;
  const path = '/articles/'+a.id+'.html';
  const canonical = 'https://aq-law.nl'+path;
  const html = `<!doctype html><html lang="${lang}" dir="${dir}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="index,follow"><title>${escape(title)} | منصة القانون AQ</title><meta name="description" content="${escape(body.slice(0,155))}"><link rel="canonical" href="${canonical}"><meta property="og:type" content="article"><meta property="og:title" content="${escape(title)}"><style>body{margin:0;background:#f6f4e9;color:#142e40;font:16px/2 system-ui,Tahoma,Arial,sans-serif}header{background:#0b2033;color:#f8edda;padding:20px 6%;border-bottom:2px solid #c9923e}header a{color:#f5d18b}main{max-width:940px;margin:32px auto;padding:0 18px}article{background:#fffdf8;border:1px solid #e4d6b9;border-radius:16px;padding:clamp(22px,5vw,54px)}h1{line-height:1.5}section{overflow-wrap:anywhere;line-height:2.15}section p{margin:0 0 1.1em}section h2,section h3,section h4,section h5,section h6{color:#a87830;line-height:1.55;margin:1.5em 0 .6em}</style></head><body><header><a href="/">AQ | منصة القانون</a></header><main><article><h1>${escape(title)}</h1><p>${escape(a.author_name || '')}</p><section>${formattedBody}</section></article></main></body></html>`;
  await writeFile(out+path,html,'utf8');
  urls.push(canonical);
}
const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+urls.map(u=>'  <url><loc>'+escape(u)+'</loc></url>').join('\n')+'\n</urlset>\n';
await writeFile(out+'/sitemap.xml',xml,'utf8');
console.log('Preview generated:',urls.length-4,'published article pages. Nothing deployed.');
