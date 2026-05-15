const url = 'https://trustmrr.com/api/acquire/startups';
const apiKey = 'tmrr_6e5b4f31c7ab84629e45ae54146862f4';

const payload = {
    "page": 1,
    "limit": 10,
    "sort": "growth-asc",
    "filters": {
        "categories": [],
        "minRevenue": "",
        "maxRevenue": "",
        "minMrr": "",
        "maxMrr": "",
        "minPrice": "",
        "maxPrice": "",
        "maxMultiple": "",
        "minProfitMargin": "",
        "maxProfitMargin": "",
        "minGrowth": "",
        "maxGrowth": "",
        "targetAudience": "",
        "mobileApp": "",
        "listedWithin": "",
        "minFoundedDate": "",
        "maxFoundedDate": ""
    }
};

async function run() {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(payload)
  });
  
  if (!res.ok) {
    console.error(`HTTP Error: ${res.status}`);
  }
  
  const text = await res.text();
  console.log("=== RAW JSON ===");
  try {
    const json = JSON.parse(text);
    json.data.forEach((s: any, i: number) => {
      console.log(`${i+1}. ${s.name} (Ask: ${s.askingPrice}, Mult: ${s.multiple}, Rev30d: ${s.revenue?.last30Days}, Growth: ${s.growth30d}, Created: ${s.createdAt}, Listed: ${s.firstListedForSaleAt})`);
    });
  } catch (e) {
    console.log(text.substring(0, 1500));
  }
}

run().catch(console.error);
