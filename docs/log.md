[NODE] [agent:chat] {
[NODE]   sessionId: '1be6aa96-635a-4d79-9089-6b91b175b302',
[NODE]   contentPreview: 'CHIP 代币现在值不值得进场',
[NODE]   images: 0
[NODE] }
[NODE] [evaluateRouting] Orchestrator Plan (primary): {
[NODE]   "isSimpleChat": false,
[NODE]   "queryType": "investment-analysis",
[NODE]   "capabilities": {
[NODE]     "analysis": {
[NODE]       "needed": false
[NODE]     },
[NODE]     "search": {
[NODE]       "needed": true,
[NODE]       "query": "CHIP token current price analysis and sentiment",
[NODE]       "showXAccountProfile": false
[NODE]     },
[NODE]     "simulate": {
[NODE]       "needed": false
[NODE]     },
[NODE]     "web3": {
[NODE]       "needed": true,
[NODE]       "query": "CHIP token current price and market analysis"
[NODE]     }
[NODE]   }
[NODE] }
[NODE] [agent:chat:timing] routing_s=4.590 total_s=4.590 sessionId=1be6aa96-635a-4d79-9089-6b91b175b302 digest_len=0
[NODE] [agent:chat] Auto→simple (both buckets exhausted) user=cmmn8oiqb022f0dky01c0ls1p primary_reset=2026-04-28T02:32:02.156Z fallback_reset=2026-04-28T02:32:02.156Z     
[NODE] [AI chatStream] model=deepseek-v3, max_tokens=2560, messages=2, inputLen=4838
[NODE] [AI chatStream] Response OK, status=200
[NODE] [PriceService] Updated 32 token prices from CoinGecko
