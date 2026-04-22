[NODE] [agent:chat] {
[NODE]   sessionId: 'aab524de-87d9-49f8-805a-7b914079ac26',
[NODE]   contentPreview: '分析一下rave代币现在适合开多还是开空',
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
[NODE]       "query": "RAVE token long short sentiment analysis",
[NODE]       "showXAccountProfile": false
[NODE]     },
[NODE]     "simulate": {
[NODE]       "needed": false
[NODE]     },
[NODE]     "web3": {
[NODE]       "needed": true,
[NODE]       "query": "RAVE token current price and market sentiment for long short positions"
[NODE]     }
[NODE]   }
[NODE] }
[NODE] [agent:chat:timing] routing_s=5.673 total_s=5.673 sessionId=aab524de-87d9-49f8-805a-7b914079ac26 digest_len=0
[NODE] [agent:chat] Auto→fast (preferred) user=cmmn8oiqb022f0dky01c0ls1p remaining=6 queryType=investment-analysis
[NODE] [researchService] Starting deep research on: "RAVE token long short sentiment analysis"
[NODE] [agent:chat:timing] tool_dispatch_s=0.083 total_s=5.786 sessionId=aab524de-87d9-49f8-805a-7b914079ac26 tools=2
[NODE] [researchService:inner] [TIMING] stage=main.preflight.config_load elapsed_s=0.003
[NODE] [researchService:inner] [TIMING] stage=main.preflight.bird_setup elapsed_s=0.000 first_run=True
[NODE] [researchService:inner] [TIMING] stage=main.preflight.x_source elapsed_s=0.153 source=bird method=env
[NODE] [researchService:inner] [TIMING] stage=main.preflight.capabilities_basic elapsed_s=0.141 youtube=False tiktok=True instagram=True bluesky=False truthsocial=False
[NODE] [researchService:inner] [TIMING] stage=main.preflight.available_sources elapsed_s=0.000 available=all
[NODE] [researchService:inner] [TIMING] stage=main.preflight.route_and_dates elapsed_s=0.000 query_type=breaking_news search=web|x
[NODE] [researchService:plan] [SourcePlan] query_type=breaking_news mode=x-web reddit_source=scrapecreators x_source=bird web_backend=exa scrapecreators=yes
[NODE] [researchService:plan] [SourcePlan] enabled reddit=False x=True web=True youtube=False(disabled_by_search_flag) tiktok=False(disabled_by_search_flag) instagram=False(disabled_by_search_flag) xiaohongshu=False(disabled_by_search_flag) bluesky=False(disabled_by_search_flag) truthsocial=False(disabled_by_search_flag) polymarket=False(disabled_by_search_flag)
[NODE] [researchService:bird] [Bird] Searching: rave token long short sentiment since:2026-03-23
[NODE] [researchService:inner] [TIMING] stage=run_research.submit_futures elapsed_s=0.005 workers=3 do_reddit=False do_x=True run_youtube=False run_tiktok=False run_instagram=False run_xiaohongshu=False do_hackernews=False do_bluesky=False do_truthsocial=False do_polymarket=False web_backend=exa
[NODE] [researchService:web] [WebSearch] plan backend=exa depth=quick from=2026-03-23 to=2026-04-22 topic="RAVE token long short sentiment analysis"
[NODE] [researchService:web] [Exa] request depth=quick num_results=12 max_chars=1000 from=2026-03-23 to=2026-04-22 topic="RAVE token long short sentiment analysis"
[NODE] [researchService:web] [Exa] done elapsed_s=1.440 raw_results=12 normalized_results=12
[NODE] [researchService:web] [WebSearch] done backend=exa elapsed_s=1.440 results=12
[NODE] [researchService:bird] [Bird] 0 results for 'rave token long short sentiment', retrying with 'rave token'
[NODE] [researchService:bird] [BirdRaw] shape=list len=12
[NODE] [researchService:bird] [BirdRaw] first_item_keys=['id', 'text', 'createdAt', 'replyCount', 'retweetCount', 'likeCount', 'conversationId', 'author', 'authorId', 'media']
[NODE] [researchService:bird] [BirdPreview] normalized_items=12 showing_first=5
[NODE] [researchService:bird] [BirdPreview] [1] @KuCoinFutures date=2026-04-22 id=X1
[NODE] [researchService:bird] [BirdPreview] [1] url=https://x.com/KuCoinFutures/status/2046842741959930118
[NODE] [researchService:bird] [BirdPreview] [1] text='📊 Market Highlights RAVE and M surged again despite concentration concerns, meme token momentum returned, while policy support, IPO speculation, and new deriva...'
[NODE] [researchService:bird] [BirdPreview] [2] @cryptolyfexyz date=2026-04-22 id=X2
[NODE] [researchService:bird] [BirdPreview] [2] url=https://x.com/cryptolyfexyz/status/2046831365941874888
[NODE] [researchService:bird] [BirdPreview] [2] text='Token kripto $RAVE milik RaveDAO, protokol musik Web3, jatuh lebih dari -95% hari ini, 19 April 2026, dari puncak tertinggi $27,88 ke level $1,18 dalam hitunga...'
[NODE] [researchService:bird] [BirdPreview] [3] @cryptolyfexyz date=2026-04-22 id=X3
[NODE] [researchService:bird] [BirdPreview] [3] url=https://x.com/cryptolyfexyz/status/2046806195332354240
[NODE] [researchService:bird] [BirdPreview] [3] text='Ada yang kena liquidasi?  Token  $RAVE milik RaveDAO anjlok 54% dalam satu hari, setelah sempat menyentuh harga tertinggi $28,50. https://t.co/kMjkiiNTVx'
[NODE] [researchService:bird] [BirdPreview] [4] @chartexpt date=2026-04-22 id=X4
[NODE] [researchService:bird] [BirdPreview] [4] url=https://x.com/chartexpt/status/2046797235615375631
[NODE] [researchService:bird] [BirdPreview] [4] text='But most people here look for a $RAVE (hype) in every single token/chart idea setup.'
[NODE] [researchService:bird] [BirdPreview] [5] @snipethedip88 date=2026-04-22 id=X5
[NODE] [researchService:bird] [BirdPreview] [5] url=https://x.com/snipethedip88/status/2046791415590764969
[NODE] [researchService:bird] [BirdPreview] [5] text='@saitokatsuhisa1 @solotop999 Trước RAVE có hàng tỉ token bump/dump như thế.  và sau RAVE cũng lại sẽ có hàng tỷ con được thị trường chọn bump và dump như thế.....'
[NODE] [researchService:x] [XDiag] source=bird topic='RAVE token long short sentiment analysis' items=12 error=none bird_raw_list_len=12
[NODE] [researchService:inner] [TIMING] stage=run_research.wait_x elapsed_s=4.516 count=12 timeout_s=75
[NODE] [researchService:inner] [TIMING] stage=run_research.wait_web elapsed_s=0.000 count=12 timeout_s=75
[NODE] [researchService:inner] [TIMING] stage=run_research.top_stages elapsed_s=4.522 top=wait_x:4.516s, submit_futures:0.005s, wait_web:0.000s
[NODE] [researchService:inner] [TIMING] stage=run_research.total elapsed_s=4.522 topic=RAVE token long short sentiment analysis depth=quick
[NODE] [researchService:inner] [TIMING] stage=main.run_research elapsed_s=4.523 reddit=0 x=12 youtube=0 tiktok=0 instagram=0 hn=0 bluesky=0 truthsocial=0 polymarket=0 web=12
[NODE] [researchService:inner] [TIMING] stage=main.processing elapsed_s=0.005 deduped_total=12
[NODE] [researchService:inner] [TIMING] stage=main.write_outputs elapsed_s=0.011
[NODE] [researchService:inner] [TIMING] stage=main.output_result elapsed_s=0.000 emit=compact
[NODE] [researchService:inner] [TIMING] stage=main.total elapsed_s=6.153 topic=RAVE token long short sentiment analysis depth=quick
[NODE] [researchService:timing] python_run_s=10.037 total_s=10.037 topic="RAVE token long short sentiment analysis"
[NODE] [researchService:timing] python_run_breakdown tag=close topic="RAVE token long short sentiment analysis" spawn_boot_s=0.072 first_output_s=3.789 first_stdout_s=9.929 first_stderr_s=3.789 stream_window_s=6.140 quiet_tail_s=0.036 stdout_chunks=1 stdout_bytes=5518 stderr_chunks=19 stderr_bytes=7462 stderr_lines=67
[NODE] [researchService:timing] parse_output_s=0.005 total_s=10.042 topic="RAVE token long short sentiment analysis" sources=12 stdout_len=5502
[NODE] [researchService:sources] extraction_preview=ainvest.com|RAVE's 95% Collapse: A Flow Analysis of a Pump-and-Dump Unwi|https://www.ainvest.com/news/rave-95-collapse-flow-analysis-pump-dump-unwind-2604/ || phemex.com|RAVE Soars 6,000%: $43M Lost—What's Next for Investors?|https://phemex.com/blogs/rave-price-analysis-6000-pump-43m-liquidation-april-16 || ainvest.com|RAVE's 6,000% Surge: A Liquidity Trap or a Short Squeeze?|https://www.ainvest.com/news/rave-6-000-surge-liquidity-trap-short-squeeze-2604/
[NODE] [researchService:timing] finalize_summary_s=0.000 total_s=10.043 topic="RAVE token long short sentiment analysis" final_len=5498
[NODE] [sources] rawStdout length: 5502, has URLs: 13
[NODE] [sources] compact extraction: 12 sources, snippets: 0
[NODE] [sources] final extraction: raw_count=12 preferred_count=8 unique_domains=5 domains=ainvest.com,phemex.com,gate.com,cryptotimes.io,coinstats.app
[NODE] [sources] final extraction preview: ainvest.com|RAVE's 95% Collapse: A Flow Analysis of a Pump-and-Dump Unwi|https://www.ainvest.com/news/rave-95-collapse-flow-analysis-pump-dump-unwind-2604/ || phemex.com|RAVE Soars 6,000%: $43M Lost—What's Next for Investors?|https://phemex.com/blogs/rave-price-analysis-6000-pump-43m-liquidation-april-16 || ainvest.com|RAVE's 6,000% Surge: A Liquidity Trap or a Short Squeeze?|https://www.ainvest.com/news/rave-6-000-surge-liquidity-trap-short-squeeze-2604/
[NODE] [web3Research] query="分析一下rave代币现在适合开多还是开空 ; RAVE token current price and market sentiment for long short positions" intent=token_deep_dive asset_count=1 resolved_id=ravedao spot_usd=1.33 via=rest resolver=llm-agent
[NODE] [web3Research:logs] mode=agent | intent=token_deep_dive | tools=search_crypto_asset,get_token_price_and_market,get_token_detail | turns=3
[NODE] [web3Research:assets] RAVE DAO(rave)
[NODE] [web3Sources] injected=2 intent=token_deep_dive final_sources=10
[NODE] [agent:chat:timing] tools_parallel_wait_s=24.758 total_s=30.544 sessionId=aab524de-87d9-49f8-805a-7b914079ac26
[NODE] [agent:chat] Promise.allSettled completed: ✅ SEARCH, ✅ WEB3
[NODE] [agent:chat:html] Starting REAL-PARALLEL HTML generation (queryType=investment-analysis, mode=standard), contextString length=8605
[NODE] [AI chatStream] model=deepseek-v3, max_tokens=8192, messages=2, inputLen=26708
[NODE] [agent:chat] Starting synthesis stream (queryType=investment-analysis), prompt length: 18105
[NODE] [AI chatStream] model=claude-sonnet-4-6, max_tokens=8192, messages=2, inputLen=23563
[NODE] [AI chatStream] Response OK, status=200
[NODE] [AI chatStream] Response OK, status=200
[NODE] [agent:chat] Synthesis stream obtained, reading...
[NODE] [PriceService] Updated 32 token prices from CoinGecko
[NODE] [agent:chat:sources] stream_done_sources_count=10 sessionId=aab524de-87d9-49f8-805a-7b914079ac26
[NODE] [agent:chat:html] Awaiting REAL-PARALLEL HTML result (started 56.413s ago)
[NODE] [PriceService] Updated 32 token prices from CoinGecko