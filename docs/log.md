8|LokaCash  | [AI chatStream] Response OK, status=200
8|LokaCash  | [AI chatStream] Response OK, status=200
8|LokaCash  | [agent:chat] Synthesis stream obtained, reading...
8|LokaCash  | [PriceService] Updated 32 token prices from CoinGecko
8|LokaCash  | [agent:chat] {
8|LokaCash  |   sessionId: 'dc4fdc74-a6eb-436f-b975-b4ebea8db913',
8|LokaCash  |   contentPreview: 'btc现在值得开空还是开多',
8|LokaCash  |   images: 0
8|LokaCash  | }
8|LokaCash  | [agent:chat] Dedup: skipping duplicate message for session dc4fdc74-a6eb-436f-b975-b4ebea8db913
8|LokaCash  | [evaluateRouting] Orchestrator Plan (primary): {
8|LokaCash  |   "isSimpleChat": false,
8|LokaCash  |   "queryType": "investment-analysis",
8|LokaCash  |   "capabilities": {
8|LokaCash  |     "analysis": {
8|LokaCash  |       "needed": false
8|LokaCash  |     },
8|LokaCash  |     "search": {
8|LokaCash  |       "needed": true,
8|LokaCash  |       "query": "Bitcoin BTC long short sentiment analysis",
8|LokaCash  |       "showXAccountProfile": false
8|LokaCash  |     },
8|LokaCash  |     "simulate": {
8|LokaCash  |       "needed": false
8|LokaCash  |     },
8|LokaCash  |     "web3": {
8|LokaCash  |       "needed": true,
8|LokaCash  |       "query": "Bitcoin BTC price long short analysis"
8|LokaCash  |     }
8|LokaCash  |   }
8|LokaCash  | }
8|LokaCash  | [agent:chat:timing] routing_s=4.634 total_s=4.634 sessionId=dc4fdc74-a6eb-436f-b975-b4ebea8db913 digest_len=0
8|LokaCash  | [researchService] Starting deep research on: "Bitcoin BTC long short sentiment analysis"
8|LokaCash  | [agent:chat:timing] tool_dispatch_s=0.012 total_s=4.646 sessionId=dc4fdc74-a6eb-436f-b975-b4ebea8db913 tools=2
8|LokaCash  | [researchService:inner] [TIMING] stage=main.preflight.config_load elapsed_s=0.001
8|LokaCash  | [researchService:inner] [TIMING] stage=main.preflight.bird_setup elapsed_s=0.000 first_run=True
8|LokaCash  | [researchService:inner] [TIMING] stage=main.preflight.x_source elapsed_s=0.000 source=bird method=env
8|LokaCash  | [researchService:inner] [TIMING] stage=main.preflight.capabilities_basic elapsed_s=0.000 youtube=True tiktok=True instagram=True bluesky=False truthsocial=False
8|LokaCash  | [researchService:inner] [TIMING] stage=main.preflight.available_sources elapsed_s=0.000 available=all
8|LokaCash  | [researchService:inner] [TIMING] stage=main.preflight.route_and_dates elapsed_s=0.000 query_type=breaking_news search=web|x
8|LokaCash  | [researchService:plan] [SourcePlan] query_type=breaking_news mode=x-web reddit_source=scrapecreators x_source=bird web_backend=exa scrapecreators=yes
8|LokaCash  | [researchService:plan] [SourcePlan] enabled reddit=False x=True web=True youtube=False(disabled_by_search_flag) tiktok=False(disabled_by_search_flag) instagram=False(disabled_by_search_flag) xiaohongshu=False(disabled_by_search_flag) bluesky=False(disabled_by_search_flag) truthsocial=False(disabled_by_search_flag) polymarket=False(disabled_by_search_flag) 
8|LokaCash  | [researchService:bird] [Bird] Searching: bitcoin btc long short sentiment since:2026-03-18
8|LokaCash  | [researchService:inner] [TIMING] stage=run_research.submit_futures elapsed_s=0.007 workers=3 do_reddit=False do_x=True run_youtube=False run_tiktok=False run_instagram=False run_xiaohongshu=False do_hackernews=False do_bluesky=False do_truthsocial=False do_polymarket=False web_backend=exa
8|LokaCash  | [researchService:web] [WebSearch] plan backend=exa depth=quick from=2026-03-18 to=2026-04-17 topic="Bitcoin BTC long short sentiment analysis"
8|LokaCash  | [researchService:web] [Exa] request depth=quick num_results=12 max_chars=1000 from=2026-03-18 to=2026-04-17 topic="Bitcoin BTC long short sentiment analysis"
8|LokaCash  | [web3Research] query="btc现在值得开空还是开多 ; Bitcoin BTC price long short analysis" intent=token_quote asset_count=1 resolved_id=bitcoin spot_usd=74970 via=rest resolver=quick-map
8|LokaCash  | [web3Research:logs] intent=token_quote | resolved_id=bitcoin | resolver=quick-map
8|LokaCash  | [web3Research:assets] Bitcoin(btc)
8|LokaCash  | [web3Sources] injected=2 intent=token_quote final_sources=2
8|LokaCash  | [researchService:web] [Exa] done elapsed_s=1.049 raw_results=12 normalized_results=12
8|LokaCash  | [researchService:web] [WebSearch] done backend=exa elapsed_s=1.055 results=12  
8|LokaCash  | [researchService:bird] [BirdRaw] shape=list len=10
8|LokaCash  | [researchService:bird] [BirdRaw] first_item_keys=['id', 'text', 'createdAt', 'replyCount', 'retweetCount', 'likeCount', 'conversationId', 'author', 'authorId']
8|LokaCash  | [researchService:bird] [BirdPreview] normalized_items=10 showing_first=5       
8|LokaCash  | [researchService:bird] [BirdPreview] [1] @bpaynews date=2026-04-12 id=X1       
8|LokaCash  | [researchService:bird] [BirdPreview] [1] url=https://x.com/bpaynews/status/2043153548406309142
8|LokaCash  | [researchService:bird] [BirdPreview] [1] text='JUST IN: Bitcoin Buddy’s 13-game win streak ends as they liquidate a Bitcoin long, exiting with a $192,000 loss. Could fuel short-term volatility and risk sent…'
8|LokaCash  | [researchService:bird] [BirdPreview] [2] @NHASH_Official date=2026-04-10 id=X2 
8|LokaCash  | [researchService:bird] [BirdPreview] [2] url=https://x.com/NHASH_Official/status/2042447884189319376
8|LokaCash  | [researchService:bird] [BirdPreview] [2] text='📰 Crypto today: macro still in control  BTC hovering near key levels as geopolitics &amp; liquidity drive sentiment. Short-term noise continues — long-term dem…'
8|LokaCash  | [researchService:bird] [BirdPreview] [3] @ItsBitcoinWorld date=2026-04-09 id=X3
8|LokaCash  | [researchService:bird] [BirdPreview] [3] url=https://x.com/ItsBitcoinWorld/status/2042129298698416539
8|LokaCash  | [researchService:bird] [BirdPreview] [3] text="Global cryptocurrency traders closely monitor BTC perpetual futures long/short ratios on leading exchanges as a crucial sentiment gauge for Bitcoin's price dir…"
8|LokaCash  | [researchService:bird] [BirdPreview] [4] @DexCheck_io date=2026-04-08 id=X4    
8|LokaCash  | [researchService:bird] [BirdPreview] [4] url=https://x.com/DexCheck_io/status/2041834459343818805
8|LokaCash  | [researchService:bird] [BirdPreview] [4] text='Only about 47% of leveraged positions are long Bitcoin. Market sentiment remains predominantly negative despite talks of a ceasefire in the US-Iran conflict.  …'
8|LokaCash  | [researchService:bird] [BirdPreview] [5] @ItsBitcoinWorld date=2026-04-07 id=X5
8|LokaCash  | [researchService:bird] [BirdPreview] [5] url=https://x.com/ItsBitcoinWorld/status/2041401944946753597
8|LokaCash  | [researchService:bird] [BirdPreview] [5] text='In the dynamic world of cryptocurrency derivatives, the long/short ratio for BTC perpetual futures serves as a crucial barometer of market sentiment. #BITCOIN …'
8|LokaCash  | [researchService:x] [XDiag] source=bird topic='Bitcoin BTC long short sentiment analysis' items=10 error=none bird_raw_list_len=10
8|LokaCash  | [researchService:inner] [TIMING] stage=run_research.wait_x elapsed_s=2.488 count=10 timeout_s=75
8|LokaCash  | [researchService:inner] [TIMING] stage=run_research.wait_web elapsed_s=0.000 count=12 timeout_s=75
8|LokaCash  | [researchService:inner] [TIMING] stage=run_research.top_stages elapsed_s=2.495 top=wait_x:2.488s, submit_futures:0.007s, wait_web:0.000s
8|LokaCash  | [researchService:inner] [TIMING] stage=run_research.total elapsed_s=2.496 topic=Bitcoin BTC long short sentiment analysis depth=quick
8|LokaCash  | [researchService:inner] [TIMING] stage=main.run_research elapsed_s=2.496 reddit=0 x=10 youtube=0 tiktok=0 instagram=0 hn=0 bluesky=0 truthsocial=0 polymarket=0 web=12      
8|LokaCash  | [researchService:inner] [TIMING] stage=main.processing elapsed_s=0.022 deduped_total=22
8|LokaCash  | [researchService:inner] [TIMING] stage=main.write_outputs elapsed_s=0.003      
8|LokaCash  | [researchService:inner] [TIMING] stage=main.output_result elapsed_s=0.000 emit=compact
8|LokaCash  | [researchService:inner] [TIMING] stage=main.total elapsed_s=2.846 topic=Bitcoin BTC long short sentiment analysis depth=quick
8|LokaCash  | [researchService:timing] python_run_s=3.211 total_s=3.211 topic="Bitcoin BTC long short sentiment analysis"
8|LokaCash  | [researchService:timing] python_run_breakdown tag=close topic="Bitcoin BTC long short sentiment analysis" spawn_boot_s=0.005 first_output_s=0.308 first_stdout_s=3.153 first_stderr_s=0.308 stream_window_s=2.845 quiet_tail_s=0.054 stdout_chunks=1 stdout_bytes=9633 stderr_chunks=17 stderr_bytes=7620 stderr_lines=66
8|LokaCash  | [researchService:timing] parse_output_s=0.002 total_s=3.215 topic="Bitcoin BTC long short sentiment analysis" sources=23 stdout_len=9547
8|LokaCash  | [researchService:sources] extraction_preview=x.com|@GeniusGroupLtd_ isn’t just talking about the future anymore|https://x.com/yogev_ben/status/2039349806192103793 || x.com|The US market opens in a few hours with ...|https://x.com/DexCheck_io/status/2041834459343818805 || x.com|JUST IN: Bitcoin Buddy’s 13-game win streak ends as they liq|https://x.com/bpaynews/status/2043153548406309142
8|LokaCash  | [researchService:timing] finalize_summary_s=0.000 total_s=3.216 topic="Bitcoin BTC long short sentiment analysis" final_len=8910
8|LokaCash  | [sources] rawStdout length: 9547, has URLs: 27
8|LokaCash  | [sources] compact extraction: 20 sources, snippets: 1
8|LokaCash  | [sources] final extraction: raw_count=20 preferred_count=14 unique_domains=11 domains=coingecko.com,api.coingecko.com,t.c,bitcoinworld.co.in,perception.to,cryptorank.io,hipmediadesign.com,bydfi.com,coinmindai.com,exa.ai,x.com
8|LokaCash  | [sources] final extraction preview: coingecko.com|CoinGecko Market Data|https://www.coingecko.com/en/api/documentation || api.coingecko.com|CoinGecko REST API|https://www.coingecko.com/en/api/documentation || t.c|Catch up 👇|https://t.c
8|LokaCash  | [agent:chat:timing] tools_parallel_wait_s=3.208 total_s=7.855 sessionId=dc4fdc74-a6eb-436f-b975-b4ebea8db913
8|LokaCash  | [agent:chat] Promise.allSettled completed: ✅ SEARCH, ✅ WEB3
8|LokaCash  | [agent:chat:html] Starting PARALLEL HTML generation (queryType=investment-analysis), contextString length=11730
8|LokaCash  | [AI chatStream] model=deepseek-v3, max_tokens=16384, messages=2, inputLen=31960
8|LokaCash  | [agent:chat] Starting synthesis stream (queryType=investment-analysis), prompt length: 21218
8|LokaCash  | [AI chatStream] model=claude-sonnet-4-6, max_tokens=8192, messages=2, inputLen=28810
8|LokaCash  | [AI chatStream] Response OK, status=200
8|LokaCash  | [AI chatStream] Response OK, status=200
8|LokaCash  | [agent:chat] Synthesis stream obtained, reading...
8|LokaCash  | [agent:chat:sources] stream_done_sources_count=12 sessionId=f635abd8-cc5b-4f40-a554-1bde4e85180c
8|LokaCash  | [agent:chat:html] Starting SEQUENTIAL HTML generation (standard), input length=3600
8|LokaCash  | [AI chatStream] model=deepseek-v3, max_tokens=16384, messages=2, inputLen=23621
8|LokaCash  | [AI chatStream] Response OK, status=200
8|LokaCash  | [PriceService] Updated 32 token prices from CoinGecko