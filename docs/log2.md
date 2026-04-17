8|LokaCash  | [agent:chat] {
8|LokaCash  |   sessionId: '3f0310ed-025a-4d61-b3c6-86e16bcb1444',
8|LokaCash  |   contentPreview: '现在sol适合开多还是开空',
8|LokaCash  |   images: 0
8|LokaCash  | }
8|LokaCash  | [agent:chat] Dedup: skipping duplicate message for session 3f0310ed-025a-4d61-b3c6-86e16bcb1444
8|LokaCash  | [evaluateRouting] Orchestrator Plan (primary): {
8|LokaCash  |   "isSimpleChat": false,
8|LokaCash  |   "queryType": "investment-analysis",
8|LokaCash  |   "capabilities": {
8|LokaCash  |     "analysis": {
8|LokaCash  |       "needed": false
8|LokaCash  |     },
8|LokaCash  |     "search": {
8|LokaCash  |       "needed": true,
8|LokaCash  |       "query": "Solana SOL perpetual long short sentiment funding",
8|LokaCash  |       "showXAccountProfile": false
8|LokaCash  |     },
8|LokaCash  |     "simulate": {
8|LokaCash  |       "needed": false
8|LokaCash  |     },
8|LokaCash  |     "web3": {
8|LokaCash  |       "needed": true,
8|LokaCash  |       "query": "Solana SOL token price funding rate"
8|LokaCash  |     }
8|LokaCash  |   }
8|LokaCash  | }
8|LokaCash  | [agent:chat:timing] routing_s=4.517 total_s=4.517 sessionId=3f0310ed-025a-4d61-b3c6-86e16bcb1444 digest_len=0
8|LokaCash  | [researchService] Starting deep research on: "Solana SOL perpetual long short sentiment funding"
8|LokaCash  | [agent:chat:timing] tool_dispatch_s=0.013 total_s=4.531 sessionId=3f0310ed-025a-4d61-b3c6-86e16bcb1444 tools=2
8|LokaCash  | [researchService:inner] [TIMING] stage=main.preflight.config_load elapsed_s=0.001
8|LokaCash  | [researchService:inner] [TIMING] stage=main.preflight.bird_setup elapsed_s=0.000 first_run=True
8|LokaCash  | [researchService:inner] [TIMING] stage=main.preflight.x_source elapsed_s=0.000 source=bird method=env
8|LokaCash  | [researchService:inner] [TIMING] stage=main.preflight.capabilities_basic elapsed_s=0.000 youtube=True tiktok=True instagram=True bluesky=False truthsocial=False
8|LokaCash  | [researchService:inner] [TIMING] stage=main.preflight.available_sources elapsed_s=0.000 available=all
8|LokaCash  | [researchService:inner] [TIMING] stage=main.preflight.route_and_dates elapsed_s=0.000 query_type=breaking_news search=web|x
8|LokaCash  | [researchService:plan] [SourcePlan] query_type=breaking_news mode=x-web reddit_source=scrapecreators x_source=bird web_backend=exa scrapecreators=yes
8|LokaCash  | [researchService:plan] [SourcePlan] enabled reddit=False x=True web=True youtube=False(disabled_by_search_flag) tiktok=False(disabled_by_search_flag) instagram=False(disabled_by_search_flag) xiaohongshu=False(disabled_by_search_flag) bluesky=False(disabled_by_search_flag) truthsocial=False(disabled_by_search_flag) polymarket=False(disabled_by_search_flag) 
8|LokaCash  | [researchService:bird] [Bird] Searching: solana sol perpetual long short since:2026-03-18
8|LokaCash  | [researchService:inner] [TIMING] stage=run_research.submit_futures elapsed_s=0.005 workers=3 do_reddit=False do_x=True run_youtube=False run_tiktok=False run_instagram=False run_xiaohongshu=False do_hackernews=False do_bluesky=False do_truthsocial=False do_polymarket=False web_backend=exa
8|LokaCash  | [researchService:web] [WebSearch] plan backend=exa depth=quick from=2026-03-18 to=2026-04-17 topic="Solana SOL perpetual long short sentiment funding"
8|LokaCash  | [researchService:web] [Exa] request depth=quick num_results=12 max_chars=1000 from=2026-03-18 to=2026-04-17 topic="Solana SOL perpetual long short sentiment funding"       
8|LokaCash  | [researchService:web] [Exa] done elapsed_s=0.915 raw_results=12 normalized_results=12
8|LokaCash  | [researchService:web] [WebSearch] done backend=exa elapsed_s=0.916 results=12  
8|LokaCash  | [researchService:bird] [BirdRaw] shape=list len=12
8|LokaCash  | [researchService:bird] [BirdRaw] first_item_keys=['id', 'text', 'createdAt', 'replyCount', 'retweetCount', 'likeCount', 'conversationId', 'author', 'authorId']
8|LokaCash  | [researchService:bird] [BirdPreview] normalized_items=12 showing_first=5       
8|LokaCash  | [researchService:bird] [BirdPreview] [1] @gintnil date=2026-03-31 id=X1        
8|LokaCash  | [researchService:bird] [BirdPreview] [1] url=https://x.com/gintnil/status/2038877173231341767
8|LokaCash  | [researchService:bird] [BirdPreview] [1] text='Daily Crypto Market Summary 31 Mar 2026  Bitcoin (BTC) Thematic Headline: BTC Reclaims $68,000 Benchmark Amid Unprecedented Corporate Treasury Adoption  Bitcoi…'
8|LokaCash  | [researchService:bird] [BirdPreview] [2] @iwa_of_web3 date=2026-03-30 id=X2    
8|LokaCash  | [researchService:bird] [BirdPreview] [2] url=https://x.com/iwa_of_web3/status/2038598795097719020
8|LokaCash  | [researchService:bird] [BirdPreview] [2] text='Have you ever wondered how those tiny “funding rates” on perpetual futures actually work?    @solsticefi dropped a solid explainer a few days ago, and it got m…'
8|LokaCash  | [researchService:bird] [BirdPreview] [3] @MeshClans date=2026-03-29 id=X3      
8|LokaCash  | [researchService:bird] [BirdPreview] [3] url=https://x.com/MeshClans/status/2038149256654016618
8|LokaCash  | [researchService:bird] [BirdPreview] [3] text="Boros just crossed $10M TVL. Here's what the charts actually show.  The protocol hit the milestone, but the real story is in open interest, specifically RWA ex…"
8|LokaCash  | [researchService:bird] [BirdPreview] [4] @gintnil date=2026-03-27 id=X4        
8|LokaCash  | [researchService:bird] [BirdPreview] [4] url=https://x.com/gintnil/status/2037417355572052384
8|LokaCash  | [researchService:bird] [BirdPreview] [4] text='Daily Crypto Market Summary 27 Mar 2026  The cryptocurrency market is currently navigating a period of heightened volatility, with significant price correction…'
8|LokaCash  | [researchService:bird] [BirdPreview] [5] @miiportable_btc date=2026-03-27 id=X5
8|LokaCash  | [researchService:bird] [BirdPreview] [5] url=https://x.com/miiportable_btc/status/2037402906152837449
8|LokaCash  | [researchService:bird] [BirdPreview] [5] text='Mini Tutorial: Open your first perpetual trade on Drift Protocol in under 5 minutes  ➡️Getting started is easier than you thiink  ➡️Step 1: Connect your wallet …'
8|LokaCash  | [researchService:x] [XDiag] source=bird topic='Solana SOL perpetual long short sentiment funding' items=12 error=none bird_raw_list_len=12
8|LokaCash  | [researchService:inner] [TIMING] stage=run_research.wait_x elapsed_s=1.529 count=12 timeout_s=75
8|LokaCash  | [researchService:inner] [TIMING] stage=run_research.wait_web elapsed_s=0.000 count=12 timeout_s=75
8|LokaCash  | [researchService:inner] [TIMING] stage=run_research.top_stages elapsed_s=1.535 top=wait_x:1.529s, submit_futures:0.005s, wait_web:0.000s
8|LokaCash  | [researchService:inner] [TIMING] stage=run_research.total elapsed_s=1.535 topic=Solana SOL perpetual long short sentiment funding depth=quick
8|LokaCash  | [researchService:inner] [TIMING] stage=main.run_research elapsed_s=1.535 reddit=0 x=12 youtube=0 tiktok=0 instagram=0 hn=0 bluesky=0 truthsocial=0 polymarket=0 web=12      
8|LokaCash  | [researchService:inner] [TIMING] stage=main.processing elapsed_s=0.024 deduped_total=23
8|LokaCash  | [researchService:inner] [TIMING] stage=main.write_outputs elapsed_s=0.004      
8|LokaCash  | [researchService:inner] [TIMING] stage=main.output_result elapsed_s=0.000 emit=compact
8|LokaCash  | [researchService:inner] [TIMING] stage=main.total elapsed_s=1.875 topic=Solana SOL perpetual long short sentiment funding depth=quick
8|LokaCash  | [researchService:timing] python_run_s=2.254 total_s=2.254 topic="Solana SOL perpetual long short sentiment funding"
8|LokaCash  | [researchService:timing] python_run_breakdown tag=close topic="Solana SOL perpetual long short sentiment funding" spawn_boot_s=0.006 first_output_s=0.313 first_stdout_s=2.188 first_stderr_s=0.313 stream_window_s=1.875 quiet_tail_s=0.060 stdout_chunks=1 stdout_bytes=9362 stderr_chunks=17 stderr_bytes=7499 stderr_lines=66
8|LokaCash  | [researchService:timing] parse_output_s=0.002 total_s=2.256 topic="Solana SOL perpetual long short sentiment funding" sources=23 stdout_len=9286
8|LokaCash  | [researchService:sources] extraction_preview=x.com|🔸 RWA open interest jumped rough...|https://x.com/MeshClans/status/2038149256654016618 || x.com|Go to https://t.co/H6KEdT3tyL and connect...|https://x.com/miiportable_btc/status/2037402906152837449 || x.com|┃ ┣ 📁 Split SY into two tradable tokens with fixed exp...|https://x.com/0xPhoenix77/status/2037050435505447411
8|LokaCash  | [researchService:timing] finalize_summary_s=0.000 total_s=2.257 topic="Solana SOL perpetual long short sentiment funding" final_len=8777
8|LokaCash  | [sources] rawStdout length: 9286, has URLs: 29
8|LokaCash  | [sources] compact extraction: 20 sources, snippets: 4
8|LokaCash  | [sources] final extraction: raw_count=20 preferred_count=15 unique_domains=9 domains=x.com,pandabull.io,ca.investing.com,eventlogik.com,aped.ai,xt.com,longbridge.com,settled.pro,exa.ai
8|LokaCash  | [sources] final extraction preview: x.com|🔸 RWA open interest jumped rough...|https://x.com/MeshClans/status/2038149256654016618 || x.com|Go to https://t.co/H6KEdT3tyL and connect...|https://x.com/miiportable_btc/status/2037402906152837449 || x.com|┃ ┣ 📁 Split SY into two tradable tokens with fixed exp...|https://x.com/0xPhoenix77/status/2037050435505447411
8|LokaCash  | [agent:chat:timing] tools_parallel_wait_s=2.247 total_s=6.778 sessionId=3f0310ed-025a-4d61-b3c6-86e16bcb1444
8|LokaCash  | [agent:chat] Promise.allSettled completed: ✅ SEARCH, ✅ WEB3
8|LokaCash  | [agent:chat:html] Starting PARALLEL HTML generation (queryType=investment-analysis), contextString length=11598
8|LokaCash  | [AI chatStream] model=deepseek-v3, max_tokens=16384, messages=2, inputLen=31827
8|LokaCash  | [agent:chat] Starting synthesis stream (queryType=investment-analysis), prompt length: 21086
8|LokaCash  | [AI chatStream] model=claude-sonnet-4-6, max_tokens=8192, messages=2, inputLen=28677
8|LokaCash  | [AI chatStream] Response OK, status=200
8|LokaCash  | [AI chatStream] Response OK, status=200
8|LokaCash  | [agent:chat] Synthesis stream obtained, reading...
8|LokaCash  | [PriceService] Updated 32 token prices from CoinGecko
8|LokaCash  | [agent:chat:html] Stream finished. chunks=1114, htmlLength=15525
8|LokaCash  | [agent:chat:html] msgCount=2, msgIdx=1
8|LokaCash  | [agent:chat:html] DB updated with htmlReport
8|LokaCash  | [agent:chat:html] ✅ HTML report emitted for session fe9885ce-5592-4a31-8e14-63dd18df6d12, msgIdx=1, length=15446
8|LokaCash  | [agent:chat:timing] html_sequential_s=146.099 total_s=212.754 sessionId=fe9885ce-5592-4a31-8e14-63dd18df6d12 mode=standard
8|LokaCash  | [agent:chat:timing] synthesizer_total_s=204.510 end_to_end_s=212.754 ui_duration_s=61 sessionId=fe9885ce-5592-4a31-8e14-63dd18df6d12
8|LokaCash  | [agent:chat:sources] stream_done_sources_count=15 sessionId=3f0310ed-025a-4d61-b3c6-86e16bcb1444
8|LokaCash  | [agent:chat:html] Starting SEQUENTIAL HTML generation (standard), input length=4420
8|LokaCash  | [AI chatStream] model=deepseek-v3, max_tokens=16384, messages=2, inputLen=24459
8|LokaCash  | [PriceService] Updated 32 token prices from CoinGecko
8|LokaCash  | [AI chatStream] Response OK, status=200