[NODE] [agent:chat] {
[NODE]   sessionId: 'bc565ff7-b0e7-4101-b8e7-4429d7629432',
[NODE]   contentPreview: '分析一下rave代币现在能追多嘛',
[NODE]   images: 0
[NODE] }
[NODE] GET /api/chat/history?sessionId=eadfd618-bf4e-4ef9-968a-fbbf2c2007cc 304 4.426 ms - -
[NODE] GET /api/chat/history?sessionId=bc565ff7-b0e7-4101-b8e7-4429d7629432 200 3.921 ms - 269
[NODE] [evaluateRouting] Orchestrator Plan (primary): {
[NODE]   "isSimpleChat": false,
[NODE]   "queryType": "investment-analysis",
[NODE]   "capabilities": {
[NODE]     "analysis": {
[NODE]       "needed": false
[NODE]     },
[NODE]     "search": {
[NODE]       "needed": true,
[NODE]       "query": "RAVE token current price sentiment analysis",
[NODE]       "showXAccountProfile": false
[NODE]     },
[NODE]     "simulate": {
[NODE]       "needed": false
[NODE]     },
[NODE]     "web3": {
[NODE]       "needed": true,
[NODE]       "query": "RAVE token current price market cap risk reward"
[NODE]     }
[NODE]   }
[NODE] }
[NODE] [agent:chat:timing] routing_s=4.619 total_s=4.619 sessionId=bc565ff7-b0e7-4101-b8e7-4429d7629432 digest_len=0
[NODE] [researchService] Starting deep research on: "RAVE token current price sentiment analysis"
[NODE] [agent:chat:timing] tool_dispatch_s=0.072 total_s=4.692 sessionId=bc565ff7-b0e7-4101-b8e7-4429d7629432 tools=2
[NODE] [researchService:inner] [TIMING] stage=main.preflight.config_load elapsed_s=0.002
[NODE] [researchService:inner] [TIMING] stage=main.preflight.bird_setup elapsed_s=0.000 first_run=True
[NODE] [researchService:inner] [TIMING] stage=main.preflight.x_source elapsed_s=0.106 source=bird method=env
[NODE] [researchService:inner] [TIMING] stage=main.preflight.capabilities_basic elapsed_s=0.104 youtube=False tiktok=True instagram=True bluesky=False truthsocial=False
[NODE] [researchService:inner] [TIMING] stage=main.preflight.available_sources elapsed_s=0.000 available=all
[NODE] [researchService:inner] [TIMING] stage=main.preflight.route_and_dates elapsed_s=0.000 query_type=product search=web|x
[NODE] [researchService:plan] [SourcePlan] query_type=product mode=x-web reddit_source=scrapecreators x_source=bird web_backend=exa scrapecreators=yes
[NODE] [researchService:plan] [SourcePlan] enabled reddit=False x=True web=True youtube=False(disabled_by_search_flag) tiktok=False(disabled_by_search_flag) instagram=False(disabled_by_search_flag) xiaohongshu=False(disabled_by_search_flag) bluesky=False(disabled_by_search_flag) truthsocial=False(disabled_by_search_flag) polymarket=False(disabled_by_search_flag)
[NODE] [researchService:bird] [Bird] Searching: rave token current price sentiment since:2026-03-22
[NODE] [researchService:inner] [TIMING] stage=run_research.submit_futures elapsed_s=0.003 workers=3 do_reddit=False do_x=True run_youtube=False run_tiktok=False run_instagram=False run_xiaohongshu=False do_hackernews=False do_bluesky=False do_truthsocial=False do_polymarket=False web_backend=exa
[NODE] [researchService:web] [WebSearch] plan backend=exa depth=quick from=2026-03-22 to=2026-04-21 topic="RAVE token current price sentiment analysis"
[NODE] [researchService:web] [Exa] request depth=quick num_results=12 max_chars=1000 from=2026-03-22 to=2026-04-21 topic="RAVE token current price sentiment analysis"
[NODE] [web3Research] query="分析一下rave代币现在能追多嘛 ; RAVE token current price market cap risk reward" intent=token_deep_dive asset_count=1 resolved_id=ravedao spot_usd=1.89 via=rest resolver=quick-map-explicit
[NODE] [web3Research:logs] intent=token_deep_dive | resolved_id=ravedao | resolver=quick-map-explicit | history_days=7 | upgraded_from=token_quote
[NODE] [web3Research:assets] RaveDAO(rave)
[NODE] [web3Router] okx=ok news=ok bases=RAVE (prewarm=RAVE) elapsed_ms=3737 intent=token_deep_dive market:RAVE(spot=na/funding=0.1431%/oiUsd=23M/depthUsd=na/candles=0) news:RAVE(news=3/sent=neutral)
[NODE] [web3Sources] injected=4 intent=token_deep_dive final_sources=4
[NODE] [researchService:web] [Exa] done elapsed_s=1.567 raw_results=12 normalized_results=12
[NODE] [researchService:web] [WebSearch] done backend=exa elapsed_s=1.568 results=12
[NODE] [researchService:bird] [Bird] 0 results for 'rave token current price sentiment', retrying with 'rave token'
[NODE] [researchService:bird] [BirdRaw] shape=list len=12
[NODE] [researchService:bird] [BirdRaw] first_item_keys=['id', 'text', 'createdAt', 'replyCount', 'retweetCount', 'likeCount', 'conversationId', 'author', 'authorId', 'media']
[NODE] [researchService:bird] [BirdPreview] normalized_items=12 showing_first=5
[NODE] [researchService:bird] [BirdPreview] [1] @YUBIT_DE date=2026-04-21 id=X1
[NODE] [researchService:bird] [BirdPreview] [1] url=https://x.com/YUBIT_DE/status/2046503581956882768
[NODE] [researchService:bird] [BirdPreview] [1] text='🔥 Top 5 Tagesgewinner auf YUBIT — 21. Apr 2026  🎵 $RAVE +300,87 % 🥇 🤖 $UAI +49,57 % 🥈 🎶 $ARIA +44,46 % 🥉 🎮 $GUN +25,16 % 🌀 $PORTAL +17,95 %  $RAVE macht 3x an ...'
[NODE] [researchService:bird] [BirdPreview] [2] @inaayaa77 date=2026-04-21 id=X2
[NODE] [researchService:bird] [BirdPreview] [2] url=https://x.com/inaayaa77/status/2046503189881712655
[NODE] [researchService:bird] [BirdPreview] [2] text='any another RAVE token?'
[NODE] [researchService:bird] [BirdPreview] [3] @blocknotify_com date=2026-04-21 id=X3
[NODE] [researchService:bird] [BirdPreview] [3] url=https://x.com/blocknotify_com/status/2046503110642700543
[NODE] [researchService:bird] [BirdPreview] [3] text="📰 RaveDAO (RAVE) Token Plunges 90% After Meteoric Rise: ZachXBT Points to Team Knowledge  RaveDAO's RAVE token crashed 90% after surging to $6B market cap. Zac..."
[NODE] [researchService:bird] [BirdPreview] [4] @SchoolGr1lBy date=2026-04-21 id=X4
[NODE] [researchService:bird] [BirdPreview] [4] url=https://x.com/SchoolGr1lBy/status/2046498734121599070
[NODE] [researchService:bird] [BirdPreview] [4] text='@chartexpt Sir Please help me analyze the $RAVE token.'
[NODE] [researchService:bird] [BirdPreview] [5] @ZeroProtocoll date=2026-04-21 id=X5
[NODE] [researchService:bird] [BirdPreview] [5] url=https://x.com/ZeroProtocoll/status/2046491910341329389
[NODE] [researchService:bird] [BirdPreview] [5] text='@Luongson94 $Recall might be next crime pump token like $Rave .'
[NODE] [researchService:x] [XDiag] source=bird topic='RAVE token current price sentiment analysis' items=12 error=none bird_raw_list_len=12
[NODE] [researchService:inner] [TIMING] stage=run_research.wait_x elapsed_s=3.473 count=12 timeout_s=75
[NODE] [researchService:inner] [TIMING] stage=run_research.wait_web elapsed_s=0.000 count=12 timeout_s=75
[NODE] [researchService:inner] [TIMING] stage=run_research.top_stages elapsed_s=3.476 top=wait_x:3.473s, submit_futures:0.003s, wait_web:0.000s
[NODE] [researchService:inner] [TIMING] stage=run_research.total elapsed_s=3.476 topic=RAVE token current price sentiment analysis depth=quick
[NODE] [researchService:inner] [TIMING] stage=main.run_research elapsed_s=3.477 reddit=0 x=12 youtube=0 tiktok=0 instagram=0 hn=0 bluesky=0 truthsocial=0 polymarket=0 web=12
[NODE] [researchService:inner] [TIMING] stage=main.processing elapsed_s=0.004 deduped_total=12
[NODE] [researchService:inner] [TIMING] stage=main.write_outputs elapsed_s=0.009
[NODE] [researchService:inner] [TIMING] stage=main.output_result elapsed_s=0.000 emit=compact
[NODE] [researchService:inner] [TIMING] stage=main.total elapsed_s=5.176 topic=RAVE token current price sentiment analysis depth=quick
[NODE] [researchService:timing] python_run_s=6.746 total_s=6.746 topic="RAVE token current price sentiment analysis"
[NODE] [researchService:timing] python_run_breakdown tag=close topic="RAVE token current price sentiment analysis" spawn_boot_s=0.067 first_output_s=1.456 first_stdout_s=6.626 first_stderr_s=1.456 stream_window_s=5.170 quiet_tail_s=0.053 stdout_chunks=1 stdout_bytes=5337 stderr_chunks=16 stderr_bytes=7328 stderr_lines=67  
[NODE] [researchService:timing] parse_output_s=0.005 total_s=6.751 topic="RAVE token current price sentiment analysis" sources=12 stdout_len=5309
[NODE] [researchService:sources] extraction_preview=exa.ai|exa.ai|https://exa.ai/library/markets/crypto/RAVE?date=2026-04-21&t=69e74196654a07a98ab855bf || theinsightpost.com|RAVE Token Faces Another 50% Crash Amid Price Manipulation C|https://theinsightpost.com/rave-token-faces-another-50-crash-amid-price-manipulation-claims/ || blockchainmagazine.net|RaveDAO (RAVE) Drops 39.5%: Volume Anomaly Signals Trouble|https://blockchainmagazine.net/ravedao-crashes-395-as-volume-surges-216-above-market-cap/
[NODE] [researchService:timing] finalize_summary_s=0.000 total_s=6.751 topic="RAVE token current price sentiment analysis" final_len=5305
[NODE] [sources] rawStdout length: 5309, has URLs: 14
[NODE] [sources] compact extraction: 12 sources, snippets: 0
[NODE] [sources] final extraction: raw_count=12 preferred_count=16 unique_domains=12 domains=coingecko.com,api.coingecko.com,okx.com,theinsightpost.com,blockchainmagazine.net,bitrue.com,zurvik.com,coinstats.app,cryptonews.net,hexn.io,simplywall.st,exa.ai
[NODE] [sources] final extraction preview: coingecko.com|CoinGecko Asset Data|https://www.coingecko.com/en/api/documentation || api.coingecko.com|CoinGecko REST API|https://www.coingecko.com/en/api/documentation || okx.com|OKX Market Data|https://www.okx.com/docs-v5/
[NODE] [agent:chat:timing] tools_parallel_wait_s=6.684 total_s=11.376 sessionId=bc565ff7-b0e7-4101-b8e7-4429d7629432
[NODE] [agent:chat] Promise.allSettled completed: ✅ SEARCH, ✅ WEB3
[NODE] [agent:chat:html] Starting REAL-PARALLEL HTML generation (queryType=investment-analysis, mode=standard), contextString length=9349
[NODE] [AI chatStream] model=deepseek-v3, max_tokens=8192, messages=2, inputLen=29710
[NODE] [agent:chat] Starting synthesis stream (queryType=investment-analysis), prompt length: 18843
[NODE] [AI chatStream] model=claude-sonnet-4-6, max_tokens=8192, messages=2, inputLen=26563
[NODE] [AI chatStream] Response OK, status=200
[NODE] [AI chatStream] Response OK, status=200
[NODE] [agent:chat] Synthesis stream obtained, reading...