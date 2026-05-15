const baseUrl = 'https://trustmrr.com/api/v1';
const apiKey = 'tmrr_6e5b4f31c7ab84629e45ae54146862f4';

async function fetchSort(sortParam: string) {
  const url = `${baseUrl}/startups?onSale=true&limit=5${sortParam}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
  const json = await res.json();
  console.log(`\n=== Sort: ${sortParam || 'DEFAULT'} ===`);
  json.data.forEach((s: any, i: number) => {
    console.log(`${i+1}. ${s.name} (Ask: ${s.askingPrice}, Mult: ${s.multiple}, Rev30d: ${s.revenue?.last30Days}, Rank: ${s.rank}, Growth: ${s.growth30d})`);
  });
}

async function run() {
  await fetchSort(''); // Default
  await fetchSort('&sort=asking-price-asc');
  await fetchSort('&sort=asking-price-desc');
  await fetchSort('&sort=multiple-asc');
  await fetchSort('&sort=revenue-desc');
}

run().catch(console.error);
