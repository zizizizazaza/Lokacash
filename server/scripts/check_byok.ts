const baseUrl = 'https://trustmrr.com/api/v1';
const apiKey = 'tmrr_6e5b4f31c7ab84629e45ae54146862f4';

async function run() {
  const url = `${baseUrl}/startups?sort=revenue-desc&limit=50&onSale=true`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
  const json = await res.json();
  
  const startups = json.data;
  // sort logic
  startups.sort((a: any, b: any) => (a.growth30d ?? -999) - (b.growth30d ?? -999));
  
  console.log(startups.map((s: any) => `${s.name} - growth: ${s.growth30d} - revenue: ${s.revenue?.last30Days}`).slice(0, 10));
}

run().catch(console.error);
