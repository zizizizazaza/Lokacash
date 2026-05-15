const fs = require('fs');
const baseUrl = 'https://trustmrr.com/api/v1';
const apiKey = 'tmrr_6e5b4f31c7ab84629e45ae54146862f4';

async function fetchSort(sortParam) {
  const url = `${baseUrl}/startups?onSale=true&limit=10${sortParam}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
  const json = await res.json();
  let out = `\n=== Sort: ${sortParam || 'DEFAULT'} ===\n`;
  json.data.forEach((s, i) => {
    out += `${i+1}. ${s.name} (Ask: ${s.askingPrice}, Mult: ${s.multiple}, Rev30d: ${s.revenue?.last30Days}, Rank: ${s.rank}, Growth: ${s.growth30d})\n`;
  });
  return out;
}

async function run() {
  let finalOut = '';
  finalOut += await fetchSort(''); // Default
  finalOut += await fetchSort('&sort=asking-price-asc');
  finalOut += await fetchSort('&sort=asking-price-desc');
  finalOut += await fetchSort('&sort=multiple-asc');
  finalOut += await fetchSort('&sort=growth-asc');
  
  fs.writeFileSync('output.txt', finalOut);
  console.log('Done writing to output.txt');
}

run().catch(console.error);
