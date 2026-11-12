// Vercel preview build only. No production deployment.
process.env.SUPABASE_URL ||= 'https://vmrhohvvdapvebxxiilu.supabase.co';
process.env.SUPABASE_PUBLISHABLE_KEY ||= 'sb_publishable_00z1UqTfpp_24yZf3-_KKA_l2sa41-3';
await import('./generate-seo-preview.mjs');
await import('./apply-approved-article-logo.mjs');
await import('./verify-seo-preview.mjs');
await import('./assemble-seo-deploy-preview.mjs');
await import('./smoke-test-seo-preview.mjs');
