[NODE] [agent:chat] {
[NODE]   sessionId: 'b5c4cdf6-d773-457d-af0f-0e05a862cfe8',
[NODE]   contentPreview: 'what do you think about $rave token',
[NODE]   images: 0
[NODE] }
[NODE] [evaluateRouting] Orchestrator Plan (primary): {
[NODE]   "isSimpleChat": false,
[NODE]   "queryType": "research",
[NODE]   "capabilities": {
[NODE]     "analysis": {
[NODE]       "needed": false
[NODE]     },
[NODE]     "search": {
[NODE]       "needed": true,
[NODE]       "query": "RAVE token analysis",
[NODE]       "showXAccountProfile": false
[NODE]     },
[NODE]     "simulate": {
[NODE]       "needed": false
[NODE]     },
[NODE]     "web3": {
[NODE]       "needed": true,
[NODE]       "query": "RAVE token price market cap"
[NODE]     }
[NODE]   }
[NODE] }
[NODE] [agent:chat:timing] routing_s=5.176 total_s=5.176 sessionId=b5c4cdf6-d773-457d-af0f-0e05a862cfe8 digest_len=0
[NODE] [researchService] Starting deep research on: "RAVE token analysis"
[NODE] [agent:chat:timing] tool_dispatch_s=0.038 total_s=5.214 sessionId=b5c4cdf6-d773-457d-af0f-0e05a862cfe8 tools=2
[NODE] [researchService:inner] [TIMING] stage=main.preflight.config_load elapsed_s=0.001
[NODE] [researchService:inner] [TIMING] stage=main.preflight.bird_setup elapsed_s=0.000 first_run=True
[NODE] [researchService:inner] [TIMING] stage=main.preflight.x_source elapsed_s=0.079 source=bird method=env
[NODE] [researchService:inner] [TIMING] stage=main.preflight.capabilities_basic elapsed_s=0.076 youtube=False tiktok=True instagram=True bluesky=False truthsocial=False
[NODE] [researchService:inner] [TIMING] stage=main.preflight.available_sources elapsed_s=0.000 available=all
[NODE] [researchService:inner] [TIMING] stage=main.preflight.route_and_dates elapsed_s=0.000 query_type=breaking_news search=web|x
[NODE] [researchService:plan] [SourcePlan] query_type=breaking_news mode=x-web reddit_source=scrapecreators x_source=bird web_backend=exa scrapecreators=yes
[NODE] [researchService:plan] [SourcePlan] enabled reddit=False x=True web=True youtube=False(disabled_by_search_flag) tiktok=False(disabled_by_search_flag) instagram=False(disabled_by_search_flag) xiaohongshu=False(disabled_by_search_flag) bluesky=False(disabled_by_search_flag) truthsocial=False(disabled_by_search_flag) polymarket=False(disabled_by_search_flag)
[NODE] [researchService:bird] [Bird] Searching: rave token analysis since:2026-03-21
[NODE] [researchService:inner] [TIMING] stage=run_research.submit_futures elapsed_s=0.003 workers=3 do_reddit=False do_x=True run_youtube=False run_tiktok=False run_instagram=False run_xiaohongshu=False do_hackernews=False do_bluesky=False do_truthsocial=False do_polymarket=False web_backend=exa
[NODE] [researchService:web] [WebSearch] plan backend=exa depth=quick from=2026-03-21 to=2026-04-20 topic="RAVE token analysis"
[NODE] [researchService:web] [Exa] request depth=quick num_results=12 max_chars=1000 from=2026-03-21 to=2026-04-20 topic="RAVE token analysis"
[NODE] [researchService:web] [Exa] done elapsed_s=0.782 raw_results=12 normalized_results=12
[NODE] [researchService:web] [WebSearch] done backend=exa elapsed_s=0.782 results=12
[NODE] [PriceService] Updated 32 token prices from CoinGecko
[NODE] [web3Research] query="what do you think about $rave token ; RAVE token price market cap" intent=token_deep_dive asset_count=1 resolved_id=ravedao spot_usd=0.488685 via=rest resolver=coingecko-symbol
[NODE] [web3Research:logs] intent=token_deep_dive | resolved_id=ravedao | resolver=coingecko-symbol | history_days=7 | upgraded_from=token_quote
[NODE] [web3Research:assets] RaveDAO(rave)
[NODE] [researchService:bird] [BirdRaw] shape=list len=12
[NODE] [researchService:bird] [BirdRaw] first_item_keys=['id', 'text', 'createdAt', 'replyCount', 'retweetCount', 'likeCount', 'conversationId', 'author', 'authorId', 'media']
[NODE] [researchService:bird] [BirdPreview] normalized_items=12 showing_first=5
[NODE] [researchService:bird] [BirdPreview] [1] @AutorunSOL date=2026-04-20 id=X1
[NODE] [researchService:bird] [BirdPreview] [1] url=https://x.com/AutorunSOL/status/2046017102805418418
[NODE] [researchService:bird] [BirdPreview] [1] text='🆕 New token! Check the ANALYSIS! (Screenshot)  $RAVE 2qsFduJjCMekNmBLMEhj1W5kuKbJwpKUVaJET9Sqpump  🏆 I use Axiom Trade – https://t.co/03kGM6wZXi 📍 For more inf...'
[NODE] [researchService:bird] [BirdPreview] [2] @bornlesss date=2026-04-19 id=X2
[NODE] [researchService:bird] [BirdPreview] [2] url=https://x.com/bornlesss/status/2045987386895516052
[NODE] [researchService:bird] [BirdPreview] [2] text='@binance Asked for analysis of $RAVE token. Binance AI noted the ticker is ambiguous and gave a framework to analyze any token properly. Shows how to work with...'
[NODE] [researchService:bird] [BirdPreview] [3] @CryptoHe4dlines date=2026-04-19 id=X3
[NODE] [researchService:bird] [BirdPreview] [3] url=https://x.com/CryptoHe4dlines/status/2045729201051820287
[NODE] [researchService:bird] [BirdPreview] [3] text='⚡ 𝗟𝗮𝘀𝘁 𝟲𝟬 𝗺𝗶𝗻𝘂𝘁𝗲𝘀:  ❗️ Crypto / Markets: — 116,500 rsETH stolen from Kelp DAO using LayerZero $ZRO cross-chaiin vulnerability; analysis reveals that a single-si...'
[NODE] [researchService:bird] [BirdPreview] [4] @DeXChad_ date=2026-04-18 id=X4
[NODE] [researchService:bird] [BirdPreview] [4] url=https://x.com/DeXChad_/status/2045413791504953562
[NODE] [researchService:bird] [BirdPreview] [4] text="Since everyone wants a Bite from this $Rave token.  I'll be Sharing the Local Top here on X.  I'll do some On chain Cooking, Find some Fundamental gap and init..."
[NODE] [researchService:bird] [BirdPreview] [5] @blocknotify_com date=2026-04-17 id=X5
[NODE] [researchService:bird] [BirdPreview] [5] url=https://x.com/blocknotify_com/status/2045057179720245623
[NODE] [researchService:bird] [BirdPreview] [5] text='📰 RaveDAO (RAVE) Token Explodes 6,000%: Deep Dive Into On-Chain Metrics  RaveDAO (RAVE) exploded 6,000% in one week, hitting $4.1B market cap. Analysis of on-c...'
[NODE] [researchService:x] [XDiag] source=bird topic='RAVE token analysis' items=12 error=none bird_raw_list_len=12
[NODE] [researchService:inner] [TIMING] stage=run_research.wait_x elapsed_s=1.979 count=12 timeout_s=75
[NODE] [researchService:inner] [TIMING] stage=run_research.wait_web elapsed_s=0.000 count=12 timeout_s=75
[NODE] [researchService:inner] [TIMING] stage=run_research.top_stages elapsed_s=1.981 top=wait_x:1.979s, submit_futures:0.003s, wait_web:0.000s
[NODE] [researchService:inner] [TIMING] stage=run_research.total elapsed_s=1.982 topic=RAVE token analysis depth=quick
[NODE] [researchService:inner] [TIMING] stage=main.run_research elapsed_s=1.982 reddit=0 x=12 youtube=0 tiktok=0 instagram=0 hn=0 bluesky=0 truthsocial=0 polymarket=0 web=12
[NODE] [researchService:inner] [TIMING] stage=main.processing elapsed_s=0.013 deduped_total=23
[NODE] [researchService:inner] [TIMING] stage=main.write_outputs elapsed_s=0.005
[NODE] [researchService:inner] [TIMING] stage=main.output_result elapsed_s=0.000 emit=compact
[NODE] [researchService:inner] [TIMING] stage=main.total elapsed_s=2.946 topic=RAVE token analysis depth=quick
[NODE] [researchService:timing] python_run_s=3.612 total_s=3.612 topic="RAVE token analysis"
[NODE] [researchService:timing] python_run_breakdown tag=close topic="RAVE token analysis" spawn_boot_s=0.015 first_output_s=0.632 first_stdout_s=3.573 first_stderr_s=0.632 stream_window_s=2.942 quiet_tail_s=0.023 stdout_chunks=2 stdout_bytes=10121 stderr_chunks=18 stderr_bytes=7598 stderr_lines=66
[NODE] [researchService:timing] parse_output_s=0.000 total_s=3.613 topic="RAVE token analysis" sources=24 stdout_len=10023
[NODE] [researchService:sources] extraction_preview=x.com|Why $RAVE is up 🤩 #RaveDAO(RAVE) Crypto Token Analysis http|https://x.com/inucoinbase/status/2044035164435837155 || x.com|@binance Asked for analysis of $RAVE token. Binance AI noted|https://x.com/bornlesss/status/2045987386895516052 || x.com|RaveDAO (RAVE) exploded 6,000% in one week, hitting $4.1B ma|https://x.com/blocknotify_com/status/2045057179720245623
[NODE] [researchService:timing] finalize_summary_s=0.001 total_s=3.614 topic="RAVE token analysis" final_len=9281
[NODE] [sources] rawStdout length: 10023, has URLs: 31
[NODE] [sources] compact extraction: 20 sources, snippets: 3
[NODE] [sources] final extraction: raw_count=20 preferred_count=15 unique_domains=9 domains=x.com,t.co,dextools.io,investx.fr,bitrue.com,ainvest.com,zurvik.com,blockchainmagazine.net,cryptorobotics.ai
[NODE] [sources] final extraction preview: x.com|Why $RAVE is up 🤩 #RaveDAO(RAVE) Crypto Token Analysis http|https://x.com/inucoinbase/status/2044035164435837155 || x.com|@binance Asked for analysis of $RAVE token. Binance AI noted|https://x.com/bornlesss/status/2045987386895516052 || x.com|RaveDAO (RAVE) exploded 6,000% in one week, hitting $4.1B ma|https://x.com/blocknotify_com/status/2045057179720245623
[NODE] [web3Router] okx=ok news=ok bases=RAVE elapsed_ms=4435 intent=token_deep_dive market:RAVE(spot=na/funding=0.2791%/oiUsd=6M/depthUsd=na/candles=0) news:RAVE(news=4/sent=neutral)
[NODE] [web3Sources] injected=4 intent=token_deep_dive final_sources=19
[NODE] [agent:chat:timing] tools_parallel_wait_s=4.413 total_s=9.627 sessionId=b5c4cdf6-d773-457d-af0f-0e05a862cfe8
[NODE] [agent:chat] Promise.allSettled completed: ✅ SEARCH, ✅ WEB3
[NODE] [agent:chat] Starting synthesis stream (queryType=research), prompt length: 17447
[NODE] [AI chatStream] model=claude-sonnet-4-6, max_tokens=8192, messages=2, inputLen=25195
[NODE] [AI chatStream] Response OK, status=200
[NODE] [agent:chat] Synthesis stream obtained, reading...
[NODE] [PriceService] Updated 32 token prices from CoinGecko
[NODE] [agent:chat:sources] stream_done_sources_count=19 sessionId=b5c4cdf6-d773-457d-af0f-0e05a862cfe8
[NODE] [agent:chat:timing] synthesizer_total_s=63.172 end_to_end_s=72.799 ui_duration_s=68 sessionId=b5c4cdf6-d773-457d-af0f-0e05a862cfe8
[NODE] [PriceService] Updated 32 token prices from CoinGecko
