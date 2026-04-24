[NODE] [agent:chat] {
[NODE]   sessionId: 'aa14f981-9f4b-4565-bdc7-03384619507f',
[NODE]   contentPreview: "What's driving Dogecoin (DOGE) today?",
[NODE]   images: 0
[NODE] }
[NODE] [evaluateRouting] Orchestrator Plan (primary): {
[NODE]   "isSimpleChat": false,
[NODE]   "queryType": "market-brief",
[NODE]   "capabilities": {
[NODE]     "analysis": {
[NODE]       "needed": false
[NODE]     },
[NODE]     "search": {
[NODE]       "needed": true,
[NODE]       "query": "Dogecoin DOGE price drivers today",
[NODE]       "showXAccountProfile": false
[NODE]     },
[NODE]     "simulate": {
[NODE]       "needed": false
[NODE]     },
[NODE]     "web3": {
[NODE]       "needed": true,
[NODE]       "query": "Dogecoin DOGE current price market cap"
[NODE]     }
[NODE]   }
[NODE] }
[NODE] [agent:chat:timing] routing_s=6.097 total_s=6.098 sessionId=aa14f981-9f4b-4565-bdc7-03384619507f digest_len=0
[NODE] [agent:chat] Auto→fast (preferred) user=cmmn8oiqb022f0dky01c0ls1p remaining=781 queryType=market-brief
[NODE] [researchService] Starting deep research on: "Dogecoin DOGE price drivers today"
[NODE] [agent:chat:timing] tool_dispatch_s=0.033 total_s=6.138 sessionId=aa14f981-9f4b-4565-bdc7-03384619507f tools=2
[NODE] [researchService:inner] [TIMING] stage=main.preflight.config_load elapsed_s=0.002
[NODE] [researchService:inner] [TIMING] stage=main.preflight.bird_setup elapsed_s=0.000 first_run=True
[NODE] [researchService:inner] [TIMING] stage=main.preflight.x_source elapsed_s=0.093 source=bird method=env
[NODE] [researchService:inner] [TIMING] stage=main.preflight.capabilities_basic elapsed_s=0.094 youtube=False tiktok=True instagram=True bluesky=False truthsocial=False
[NODE] [researchService:inner] [TIMING] stage=main.preflight.available_sources elapsed_s=0.000 available=all
[NODE] [researchService:inner] [TIMING] stage=main.preflight.route_and_dates elapsed_s=0.000 query_type=product search=web|x
[NODE] [researchService:plan] [SourcePlan] query_type=product mode=x-web reddit_source=scrapecreators x_source=bird web_backend=exa scrapecreators=yes
[NODE] [researchService:plan] [SourcePlan] enabled reddit=False x=True web=True youtube=False(disabled_by_search_flag) tiktok=False(disabled_by_search_flag) instagram=False(disabled_by_search_flag) xiaohongshu=False(disabled_by_search_flag) bluesky=False(disabled_by_search_flag) truthsocial=False(disabled_by_search_flag) polymarket=False(disabled_by_search_flag)
[NODE] [researchService:bird] [Bird] Searching: dogecoin doge price drivers today since:2026-03-25
[NODE] [researchService:inner] [TIMING] stage=run_research.submit_futures elapsed_s=0.002 workers=3 do_reddit=False do_x=True run_youtube=False run_tiktok=False run_instagram=False run_xiaohongshu=False do_hackernews=False do_bluesky=False do_truthsocial=False do_polymarket=False web_backend=exa
[NODE] [researchService:web] [WebSearch] plan backend=exa depth=quick from=2026-03-25 to=2026-04-24 topic="Dogecoin DOGE price drivers today"
[NODE] [researchService:web] [Exa] request depth=quick num_results=12 max_chars=1000 from=2026-03-25 to=2026-04-24 topic="Dogecoin DOGE price drivers today"
[NODE] [researchService:bird] [Bird] 0 results for 'dogecoin doge price drivers today', retrying with 'dogecoin doge'
[NODE] [researchService:web] [Exa] done elapsed_s=1.607 raw_results=12 normalized_results=12
[NODE] [researchService:web] [WebSearch] done backend=exa elapsed_s=1.608 results=12
[NODE] [researchService:bird] [BirdRaw] shape=list len=12
[NODE] [researchService:bird] [BirdRaw] first_item_keys=['id', 'text', 'createdAt', 'replyCount', 'retweetCount', 'likeCount', 'conversationId', 'author', 'authorId', 'media']
[NODE] [researchService:bird] [BirdPreview] normalized_items=12 showing_first=5
[NODE] [researchService:bird] [BirdPreview] [1] @KoinBX date=2026-04-24 id=X1
[NODE] [researchService:bird] [BirdPreview] [1] url=https://x.com/KoinBX/status/2047556737486741522
[NODE] [researchService:bird] [BirdPreview] [1] text='The crypto market is red today!  Trade Now 👉 https://t.co/wPbUwnFVuS  #KoinBX #MarketUpdate #Bitcoin #Crypto #cryptoindia #XRP #C98 #Ethereum #ETH #BTC #crypto...'
[NODE] [researchService:bird] [BirdPreview] [2] @TheCurrencyA date=2026-04-24 id=X2
[NODE] [researchService:bird] [BirdPreview] [2] url=https://x.com/TheCurrencyA/status/2047556627184734326
[NODE] [researchService:bird] [BirdPreview] [2] text='Dogecoin Bulls Fight to Hold $0.0950 Support as $0.10 Break Looms - https://t.co/4Pyc7wIr8r - #alltimehigh #doge https://t.co/Bb2RnVU7gC'
[NODE] [researchService:bird] [BirdPreview] [3] @NicolasSims_ date=2026-04-24 id=X3
[NODE] [researchService:bird] [BirdPreview] [3] url=https://x.com/NicolasSims_/status/2047551200590221728
[NODE] [researchService:bird] [BirdPreview] [3] text='Top 50 MEME Crypto Coins Today  1. Dogecoin $DOGE 2. Shiba Inu $SHIB 3. MemeCore $M 4. Pepe $PEPE 5. Official Trump $TRUMP 6. Floki $FLOKI 7. Bonk $BONK 8. Dog...'
[NODE] [researchService:bird] [BirdPreview] [4] @thecryptobasic date=2026-04-24 id=X4
[NODE] [researchService:bird] [BirdPreview] [4] url=https://x.com/thecryptobasic/status/2047547972930486747
[NODE] [researchService:bird] [BirdPreview] [4] text='🌐 Daily Crypto Prices Update 🌐  Bitcoin (BTC): $77,590.63  Ethereum (ETH): $2,303.21  XRP (XRP): $1.4272  BNB (BNB): $632.54  Solana (SOL): $85.30  TRON (TRX):...'
[NODE] [researchService:bird] [BirdPreview] [5] @CryptoPlanet247 date=2026-04-24 id=X5
[NODE] [researchService:bird] [BirdPreview] [5] url=https://x.com/CryptoPlanet247/status/2047545203364438019
[NODE] [researchService:bird] [BirdPreview] [5] text='Dogecoin (DOGE) Turns Attractive—Bulls Aim Key Upside Break And Gains https://t.co/NCDWjqQeus Aayush Jindal  Dogecoin corrected some gains from the $0.0985 zon...'
[NODE] [researchService:x] [XDiag] source=bird topic='Dogecoin DOGE price drivers today' items=12 error=none bird_raw_list_len=12
[NODE] [researchService:inner] [TIMING] stage=run_research.wait_x elapsed_s=3.252 count=12 timeout_s=75
[NODE] [researchService:inner] [TIMING] stage=run_research.wait_web elapsed_s=0.000 count=12 timeout_s=75
[NODE] [researchService:inner] [TIMING] stage=run_research.top_stages elapsed_s=3.254 top=wait_x:3.252s, submit_futures:0.002s, wait_web:0.000s
[NODE] [researchService:inner] [TIMING] stage=run_research.total elapsed_s=3.254 topic=Dogecoin DOGE price drivers today depth=quick
[NODE] [researchService:inner] [TIMING] stage=main.run_research elapsed_s=3.254 reddit=0 x=12 youtube=0 tiktok=0 instagram=0 hn=0 bluesky=0 truthsocial=0 polymarket=0 web=12
[NODE] [researchService:inner] [TIMING] stage=main.processing elapsed_s=0.015 deduped_total=24
[NODE] [researchService:inner] [TIMING] stage=main.write_outputs elapsed_s=0.008
[NODE] [researchService:inner] [TIMING] stage=main.output_result elapsed_s=0.000 emit=compact
[NODE] [researchService:inner] [TIMING] stage=main.total elapsed_s=4.687 topic=Dogecoin DOGE price drivers today depth=quick
[NODE] [researchService:timing] python_run_s=5.624 total_s=5.624 topic="Dogecoin DOGE price drivers today"
[NODE] [researchService:timing] python_run_breakdown tag=close topic="Dogecoin DOGE price drivers today" spawn_boot_s=0.030 first_output_s=0.873 first_stdout_s=5.553 first_stderr_s=0.873 stream_window_s=4.681 quiet_tail_s=0.040 stdout_chunks=2 stdout_bytes=10881 stderr_chunks=16 stderr_bytes=7736 stderr_lines=67
[NODE] [researchService:timing] parse_output_s=0.006 total_s=5.630 topic="Dogecoin DOGE price drivers today" sources=24 stdout_len=10777
[NODE] [researchService:sources] extraction_preview=x.com|It’s time the creator of all meme creators gets credit for t|https://x.com/Ken0_369/status/2047527833249960179 || x.com|GoodMorning #Gm #Dogecoin https://t.co/21bAu7g2NS...|https://x.com/DogeDotMeme/status/2047543521083589064 || x.com|10. ...|https://x.com/NicolasSims_/status/2047551200590221728
[NODE] [researchService:timing] finalize_summary_s=0.000 total_s=5.631 topic="Dogecoin DOGE price drivers today" final_len=9943
[NODE] [sources] rawStdout length: 10777, has URLs: 30
[NODE] [sources] compact extraction: 20 sources, snippets: 5
[NODE] [sources] final extraction: raw_count=20 preferred_count=14 unique_domains=9 domains=coindesk.com,x.com,blockchain.news,bitcoinethereumnews.com,analyticsinsight.net,brazencrypto.com,phemex.com,coincentral.com,exa.ai
[NODE] [sources] final extraction preview: coindesk.com|DOGE price: Dogecoin jumps 4.5% to nearly 10-cents, outperfo|http://www.coindesk.com/markets/2026/04/16/dogecoin-jumps-4-5-to-nearly-10-cents-outperforming-bitcoin-and-ether || x.com|It’s time the creator of all meme creators gets credit for t|https://x.com/Ken0_369/status/2047527833249960179 || x.com|GoodMorning #Gm #Dogecoin https://t.co/21bAu7g2NS...|https://x.com/DogeDotMeme/status/2047543521083589064
[NODE] [web3Research] query="What's driving Dogecoin (DOGE) today? ; Dogecoin DOGE current price market cap" intent=token_deep_dive asset_count=1 resolved_id=dogecoin spot_usd=0.097087 via=rest resolver=llm-agent
[NODE] [web3Research:logs] mode=agent | intent=token_deep_dive | tools=search_crypto_asset,get_token_price_and_market,get_token_detail,get_price_history | turns=4
[NODE] [web3Research:assets] Dogecoin(DOGE)
[NODE] [web3Router] okx=ok news=ok bases=DOGE (prewarm=DOGE) elapsed_ms=23128 intent=token_deep_dive market:DOGE(spot=0.0970/funding=0.0018%/oiUsd=110M/depthUsd=404K/candles=30) news:DOGE(news=0/sent=neutral)
[NODE] [web3Sources] injected=4 intent=token_deep_dive final_sources=18
[NODE] [agent:chat:timing] tools_parallel_wait_s=23.129 total_s=29.267 sessionId=aa14f981-9f4b-4565-bdc7-03384619507f
ews=0/sent=neutral)
[NODE] [web3Sources] injected=4 intent=token_deep_dive final_sources=18
[NODE] [agent:chat:timing] tools_parallel_wait_s=23.129 total_s=29.267 sessionId=aa14f981-9f4b-4565-bdc7-03384619507f
[NODE] [web3Sources] injected=4 intent=token_deep_dive final_sources=18
[NODE] [agent:chat:timing] tools_parallel_wait_s=23.129 total_s=29.267 sessionId=aa14f981-9f4b-4565-bdc7-03384619507f
[NODE] [agent:chat:timing] tools_parallel_wait_s=23.129 total_s=29.267 sessionId=aa14f981-9f4b-4565-bdc7-03384619507f
[NODE] [agent:chat] Promise.allSettled completed: ✅ SEARCH, ✅ WEB3
[NODE] [agent:chat] Starting synthesis stream (queryType=market-brief), prompt length: 16138
[NODE] [AI chatStream] model=claude-sonnet-4-6, max_tokens=4096, messages=2, inputLen=22293
[NODE] [AI chatStream] Response OK, status=200
[NODE] [agent:chat] Synthesis stream obtained, reading...
[NODE] [PriceService] Updated 32 token prices from CoinGecko
[NODE] [agent:chat:sources] stream_done_sources_count=18 sessionId=aa14f981-9f4b-4565-bdc7-03384619507f
[NODE] [agent:chat:timing] synthesizer_total_s=27.834 end_to_end_s=57.111 ui_duration_s=51 sessionId=aa14f981-9f4b-4565-bdc7-03384619507f