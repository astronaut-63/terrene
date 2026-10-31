import { readFile } from 'node:fs/promises';
const config = JSON.parse(await readFile(new URL('../config/launch.json', import.meta.url), 'utf8'));
const blockers = [];
let origin;
try {
  const url = new URL(config.customDomain);
  if (url.protocol !== 'https:' || url.hostname === 'localhost' || /^[0-9.]+$/.test(url.hostname) || !url.hostname.includes('.') || url.pathname !== '/' || url.username || url.password || url.search || url.hash) throw new Error();
  origin = url.origin;
} catch { blockers.push('Connect a custom HTTPS domain and set customDomain in config/launch.json.'); }
for (const key of ['privacyReviewed', 'termsReviewed', 'providerTermsReviewed', 'primaryWorkflowsVerified', 'productionDataPracticesConfirmed']) {
  if (config[key] !== true) blockers.push(key + ' is not confirmed.');
}
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
if (!html.includes('/favicon.svg')) blockers.push('Install the application favicon.');
const legal = await readFile(new URL('../src/LegalPage.tsx', import.meta.url), 'utf8');
if (legal.includes('Publication draft') || legal.includes('not a completed agreement')) blockers.push('Complete and publish the reviewed legal pages; the current pages are drafts.');
const source = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
if (/made with (ai|al)/i.test(source + html)) blockers.push('Remove AI builder branding.');
if (blockers.length) { console.error('Launch blocked:\n' + blockers.map(b => '- ' + b).join('\n')); process.exitCode = 1; }
else {
  for (const path of ['/', '/favicon.svg', '/privacy', '/terms', '/api/v1/ready']) {
    try {
      const response = await fetch(origin + path, { signal: AbortSignal.timeout(15000), redirect: 'error' });
      if (!response.ok) throw new Error();
      if (path === '/api/v1/ready') {
        const body = await response.json(); if (body.service !== 'terrene-api' || body.routing_provider?.configured !== true) throw new Error();
      } else if (path === '/favicon.svg') {
        if (!(response.headers.get('content-type') ?? '').includes('image/svg+xml')) throw new Error();
      } else {
        const page = await response.text(); if (!page.includes('Terrene')) throw new Error();
      }
    } catch { blockers.push('Verify HTTPS and the production response for ' + path + '.'); }
  }
  if (blockers.length) { console.error('Launch blocked:\n' + blockers.map(b => '- ' + b).join('\n')); process.exitCode = 1; }
  else console.log('Configured launch checks passed. This command does not deploy.');
}
