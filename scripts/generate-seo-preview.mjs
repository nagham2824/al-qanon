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
  const html = `<!doctype html><html lang="${lang}" dir="${dir}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="index,follow"><title>${escape(title)} | منصة القانون AQ</title><meta name="description" content="${escape(body.slice(0,155))}"><link rel="canonical" href="${canonical}"><meta property="og:type" content="article"><meta property="og:title" content="${escape(title)}"><style>
:root{--navy:#0b2033;--navy2:#102d43;--gold:#c89a50;--ivory:#f8f4e9;--ink:#193346}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:radial-gradient(ellipse at 50% 0%,#fffaf0 0%,#f5f0e3 62%,#efe8d9 100%);color:var(--ink);font:clamp(16px,1.3vw,18px)/1.95 system-ui,Tahoma,Arial,sans-serif}
a{color:inherit}header{position:relative;background:linear-gradient(115deg,#091d2f 0%,#133750 65%,#091d2f 100%);border-bottom:2px solid var(--gold);box-shadow:0 8px 24px #0719271f}
.nav{max-width:1100px;margin:auto;min-height:82px;padding:15px clamp(20px,4vw,44px);display:flex;align-items:center;justify-content:space-between;gap:20px}
.brand{display:flex;align-items:center;gap:13px;text-decoration:none;color:var(--ivory);font-weight:700;letter-spacing:.01em}
.brandmark{font-family:Georgia,serif;font-size:33px;line-height:1;color:var(--gold);border-inline-end:1px solid #d7b57966;padding-inline-end:13px}.brandmark span{color:var(--ivory)}
.brandname{display:flex;flex-direction:column;line-height:1.3;font-size:17px}.brandname small{font-size:10px;letter-spacing:.19em;color:#e9d7b5}
.back{font-size:13px;text-decoration:none;color:#f2d6a1;border:1px solid #d4ae716b;border-radius:30px;padding:7px 16px;white-space:nowrap}
.intro{max-width:1050px;margin:0 auto;padding:clamp(34px,6vw,75px) 22px 34px;text-align:center}
.eyebrow{font-size:11px;letter-spacing:.17em;color:#96723d;font-weight:800;margin:0 0 14px}.intro h1{font-size:clamp(30px,5vw,49px);line-height:1.5;max-width:850px;margin:0 auto;color:var(--navy);font-weight:750;text-wrap:balance}
.rule{height:2px;width:88px;background:linear-gradient(90deg,transparent,var(--gold),transparent);margin:25px auto 0}
main{max-width:1010px;margin:0 auto 75px;padding:0 clamp(14px,3vw,30px)}
article{position:relative;isolation:isolate;background:#fffdf8;border:1px solid #d9c49b;border-radius:22px;padding:clamp(26px,5vw,65px);box-shadow:0 14px 45px #172b3710,0 1px 0 #fff inset;overflow:hidden}
article:before{content:"";position:absolute;inset:10px;border:1px solid #d9bd8a55;border-radius:15px;pointer-events:none}
.meta{font-size:13px;color:#876c44;margin:0 0 28px;padding-bottom:20px;border-bottom:1px solid #e8dcc6}
section{overflow-wrap:anywhere;line-height:2.1;font-size:clamp(16px,2.5vw,19px)}
section p{margin:0 0 1.45em}section h2,section h3,section h4,section h5,section h6{font-size:clamp(19px,3vw,25px);color:#9b7138;line-height:1.6;margin:1.8em 0 .65em;font-weight:750}
footer{max-width:1010px;margin:0 auto 35px;padding:0 25px;text-align:center;color:#7b725f;font-size:12px}
@media(max-width:600px){.nav{min-height:72px;padding:13px 18px}.brandmark{font-size:29px}.brandname{font-size:14px}.brandname small{font-size:9px}.back{font-size:11px;padding:6px 10px}.intro{padding:35px 18px 26px}.intro h1{font-size:clamp(27px,7vw,37px)}main{padding:0 13px;margin-bottom:38px}article{padding:30px 25px;border-radius:19px}article:before{inset:7px}section{font-size:17px;line-height:2}section h2,section h3,section h4{font-size:20px}}
</style></head><body><header><nav class="nav"><a class="brand" href="/" aria-label="Al-Qanon"><span class="brandmark">A<span>Q</span></span><span class="brandname">منصة القانون<small>AL-QANON</small></span></a><a class="back" href="/">الصفحة الرئيسية</a></nav></header><div class="intro"><p class="eyebrow">AL-QANON · LEGAL ARTICLES</p><h1>${escape(title)}</h1><div class="rule" aria-hidden="true"></div></div><main><article><p class="meta">${escape(a.author_name || "منصة القانون AQ")}</p><section>${formattedBody}</section></article></main><footer>منصة القانون AQ · معلومات قانونية للتوعية والمعرفة</footer></body></html>`;
  await writeFile(out+path,html,'utf8');
  urls.push(canonical);
}
const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'+urls.map(u=>'  <url><loc>'+escape(u)+'</loc></url>').join('\n')+'\n</urlset>\n';
await writeFile(out+'/sitemap.xml',xml,'utf8');
console.log('Preview generated:',urls.length-4,'published article pages. Nothing deployed.');
