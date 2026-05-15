const fs = require('fs');
const baseUrl = 'https://trustmrr.com/api/v1';
const apiKey = 'tmrr_6e5b4f31c7ab84629e45ae54146862f4';

async function fetchStartup(slug) {
  const url = `${baseUrl}/startups/${slug}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
  const json = await res.json();
  const s = json.data;
  console.log(`${s.name} - createdAt: ${s.createdAt} | firstListedForSaleAt: ${s.firstListedForSaleAt}`);
}

async function run() {
  await fetchStartup('byokchat');
  await fetchStartup('ailliot');
  await fetchStartup('auditmyvibes');
  await fetchStartup('piqoai');
  await fetchStartup('formzen');
}

run().catch(console.error);
