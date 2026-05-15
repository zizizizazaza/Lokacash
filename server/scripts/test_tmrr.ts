const baseUrl = 'https://trustmrr.com/api/v1';
const apiKey = 'tmrr_6e5b4f31c7ab84629e45ae54146862f4';

async function run() {
  const urls = [
    `${baseUrl}/startups?sort=revenue-desc&limit=1`,
    `${baseUrl}/startups?sort=revenue-desc&limit=1&onSale=true`,
    `${baseUrl}/startups?sort=revenue-desc&limit=1&isForSale=true`,
    `${baseUrl}/startups?sort=revenue-desc&limit=1&status=for_sale`,
    `${baseUrl}/startups?sort=revenue-desc&limit=1&for_sale=true`
  ];

  for (const u of urls) {
    const res = await fetch(u, { headers: { Authorization: `Bearer ${apiKey}` } });
    const json = await res.json();
    console.log(u, "->", json.meta?.total);
  }
}

run().catch(console.error);
