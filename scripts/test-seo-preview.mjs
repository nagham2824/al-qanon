// Run: node --test scripts/test-seo-preview.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
test('SEO generator emits only published articles and escaped crawlable HTML', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aq-seo-'));
  const fixture = join(dir, 'mock-fetch.mjs');
  const { writeFile } = await import('node:fs/promises');
  await writeFile(fixture, `globalThis.fetch = async (url) => {
    const u = new URL(url);
    if (u.searchParams.get('status') !== 'eq.published') throw Error('Missing published filter');
    return {ok:true,json:async()=>[{
      id:'11111111-1111-4111-8111-111111111111',
      title:'اختبار <script>alert(1)</script>',content:'نص قانوني تجريبي',language:'ar',author_name:'مؤلف'
    }]};
  };`);
  const script = new URL('./generate-seo-preview.mjs', import.meta.url).pathname;
  try {
    const child = spawn(process.execPath, ['--import', fixture, script], {
      cwd:dir, env:{...process.env,SUPABASE_URL:'https://example.supabase.co',SUPABASE_PUBLISHABLE_KEY:'test-key'}
    });
    let stderr='';
    child.stderr.on('data', d => stderr+=d);
    const exit = await new Promise(resolve => child.on('close',resolve));
    assert.equal(exit,0,stderr);
    const html = await readFile(join(dir,'seo-preview-output/articles/11111111-1111-4111-8111-111111111111.html'),'utf8');
    const sitemap = await readFile(join(dir,'seo-preview-output/sitemap.xml'),'utf8');
    assert.match(html,/نص قانوني تجريبي/);
    assert.match(html,/اختبار alert\\(1\\)/);\n    assert.doesNotMatch(html,/<script>/);
    assert.doesNotMatch(html,/<script>alert/);
    assert.match(html,/<meta name="robots" content="index,follow">/);
    assert.match(sitemap,/11111111-1111-4111-8111-111111111111.html/);
  } finally { await rm(dir,{recursive:true,force:true}); }
});
