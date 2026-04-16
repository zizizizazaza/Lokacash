[NODE] [agent:chat] {
[NODE]   sessionId: '90a8db6d-037c-4e6b-9d16-28f6e1b1ad7d',
[NODE]   contentPreview: '查找crypto市值超过5亿美元且过去24小时内涨幅至少达到15%的热门币种',
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
[NODE]       "query": "cryptocurrencies with market cap over $500 million and 24h price increase over 15%",
[NODE]       "showXAccountProfile": false
[NODE]     },
[NODE]     "simulate": {
[NODE]       "needed": false
[NODE]     },
[NODE]     "web3": {
[NODE]       "needed": true,
[NODE]       "query": "cryptocurrencies with market cap over $500 million and 24h price increase over 15%"
[NODE]     }
[NODE]   }
[NODE] }
[NODE] [agent:chat:timing] routing_s=5.998 total_s=5.998 sessionId=90a8db6d-037c-4e6b-9d16-28f6e1b1ad7d digest_len=0
[NODE] [researchService] Starting deep research on: "cryptocurrencies with market cap over $500 million and 24h price increase over 15%"      
[NODE] [agent:chat:timing] tool_dispatch_s=0.047 total_s=6.045 sessionId=90a8db6d-037c-4e6b-9d16-28f6e1b1ad7d tools=2
[NODE] [researchService:inner] [TIMING] stage=main.preflight.config_load elapsed_s=0.002
[NODE] [researchService:inner] [TIMING] stage=main.preflight.bird_setup elapsed_s=0.000 first_run=True
[NODE] [researchService:inner] [TIMING] stage=main.preflight.x_source elapsed_s=0.126 source=bird method=env
[NODE] [researchService:inner] [TIMING] stage=main.preflight.capabilities_basic elapsed_s=0.141 youtube=False tiktok=True instagram=True bluesky=False truthsocial=False
[NODE] [researchService:inner] [TIMING] stage=main.preflight.available_sources elapsed_s=0.000 available=all
[NODE] [researchService:inner] [TIMING] stage=main.preflight.route_and_dates elapsed_s=0.000 query_type=product search=web|x
[NODE] [researchService:plan] [SourcePlan] query_type=product mode=x-web reddit_source=scrapecreators x_source=bird web_backend=exa scrapecreators=yes
[NODE] [researchService:plan] [SourcePlan] enabled reddit=False x=True web=True youtube=False(disabled_by_search_flag) tiktok=False(disabled_by_search_flag) instagram=False(disabled_by_search_flag) xiaohongshu=False(disabled_by_search_flag) bluesky=False(disabled_by_search_flag) truthsocial=False(disabled_by_search_flag) polymarket=False(disabled_by_search_flag)
[NODE] [researchService:bird] [Bird] Searching: cryptocurrencies market cap over $500 since:2026-03-17
[NODE] [researchService:inner] [TIMING] stage=run_research.submit_futures elapsed_s=0.005 workers=3 do_reddit=False do_x=True run_youtube=False run_tiktok=False run_instagram=False run_xiaohongshu=False do_hackernews=False do_bluesky=False do_truthsocial=False do_polymarket=False web_backend=exa
[NODE] [researchService:web] [WebSearch] plan backend=exa depth=quick from=2026-03-17 to=2026-04-16 topic="cryptocurrencies with market cap over $500 million and 24h price increase over 15%"
[NODE] [researchService:web] [Exa] request depth=quick num_results=12 max_chars=1000 from=2026-03-17 to=2026-04-16 topic="cryptocurrencies with market cap over $500 million and 24h price increase ove..."
[NODE] [web3Research] query="查找crypto市值超过5亿美元且过去24小时内涨 幅至少达到15%的热门币种 ; cryptocurrencies with market cap over $500 million and 24h price increase over 15%" intent=market_scan asset_count=2 resolved_id=ravedao spot_usd=15.16 via=rest resolver=coins_markets_scan
[NODE] [web3Research:logs] intent=market_scan | filters.min_market_cap=500000000 | filters.min_24h_change=15 | filters.sort=price_change_percentage_24h_desc | source=coins_markets scanned=250
[NODE] [web3Research:assets] RaveDAO(rave), Siren(siren)
[NODE] [web3Sources] injected=2 intent=market_scan final_sources=2     
[NODE] [researchService:web] [Exa] done elapsed_s=1.636 raw_results=12 normalized_results=12
[NODE] [researchService:web] [WebSearch] done backend=exa elapsed_s=1.636 results=12
[NODE] [researchService:bird] [BirdRaw] shape=list len=12
[NODE] [researchService:bird] [BirdRaw] first_item_keys=['id', 'text', 'createdAt', 'replyCount', 'retweetCount', 'likeCount', 'conversationId', 'author', 'authorId']
[NODE] [researchService:bird] [BirdPreview] normalized_items=12 showing_first=5
[NODE] [researchService:bird] [BirdPreview] [1] @investingwithMG date=2026-04-01 id=X1
[NODE] [researchService:bird] [BirdPreview] [1] url=https://x.com/investingwithMG/status/2039388854034051539
[NODE] [researchService:bird] [BirdPreview] [1] text='Quantum eMotion Corp $QNC  My second deep-dive, this time into a company that is developing a full-stack quantum security platform to protect against future th...'
[NODE] [researchService:bird] [BirdPreview] [2] @whiskey_lima729 date=2026-04-01 id=X2
[NODE] [researchService:bird] [BirdPreview] [2] url=https://x.com/whiskey_lima729/status/2039310757729333732
[NODE] [researchService:bird] [BirdPreview] [2] text='Good morning ☕️  🇺🇸🦀 Here’s a snapshot of the global financial markets as of April 1, , 2026 (data reflects closing levels from March 31 where markets have closed,...'
[NODE] [researchService:bird] [BirdPreview] [3] @venturesintern date=2026-03-31 id=X3
[NODE] [researchService:bird] [BirdPreview] [3] url=https://x.com/venturesintern/status/2038830083922956636
[NODE] [researchService:bird] [BirdPreview] [3] text='Trend 🔥 •The Iran-Israel-U.S. conflict continues to escalate, pushing crude oil prices above 115 dollars per barrel. •Global uncertainty has reached an all-tim...'
[NODE] [researchService:bird] [BirdPreview] [4] @swapincom date=2026-03-30 id=X4
[NODE] [researchService:bird] [BirdPreview] [4] url=https://x.com/swapincom/status/2038540829900316711
[NODE] [researchService:bird] [BirdPreview] [4] text='Weekly Crypto & Blockchain Update: March 23 - 29  Market Movements - Bitcoin is down 1.2% over the last 7 days, currently at $67,728 - Ethereum is sitting at $...'
[NODE] [researchService:bird] [BirdPreview] [5] @mediamanint date=2026-03-30 id=X5
[NODE] [researchService:bird] [BirdPreview] [5] url=https://x.com/mediamanint/status/2038408607419834408
[NODE] [researchService:bird] [BirdPreview] [5] text='Markets, Cryptos and Culture  March 30, 2026  Monday Down Under  Sydney, Australia to Wall Street, New York, and beyond the Blackstump and Internet Matrix Of T...'
[NODE] [researchService:x] [XDiag] source=bird topic='cryptocurrencies with market cap over $500 million and 24h price increase over 15%' items=12 error=none bird_raw_list_len=12
[NODE] [researchService:inner] [TIMING] stage=run_research.wait_x elapsed_s=1.926 count=12 timeout_s=75
[NODE] [researchService:inner] [TIMING] stage=run_research.wait_web elapsed_s=0.000 count=12 timeout_s=75
[NODE] [researchService:inner] [TIMING] stage=run_research.top_stages elapsed_s=1.932 top=wait_x:1.926s, submit_futures:0.005s, wait_web:0.000s
[NODE] [researchService:inner] [TIMING] stage=run_research.total elapsed_s=1.932 topic=cryptocurrencies with market cap over $500 million and 24h price increase over 15% depth=quick
[NODE] [researchService:inner] [TIMING] stage=main.run_research elapsed_s=1.932 reddit=0 x=12 youtube=0 tiktok=0 instagram=0 hn=0 bluesky=0 truthsocial=0 polymarket=0 web=12
[NODE] [researchService:inner] [TIMING] stage=main.processing elapsed_s=0.018 deduped_total=20
[NODE] [researchService:inner] [TIMING] stage=main.write_outputs elapsed_s=0.019
[NODE] [researchService:inner] [TIMING] stage=main.output_result elapsed_s=0.000 emit=compact
[NODE] [researchService:inner] [TIMING] stage=main.total elapsed_s=3.092 topic=cryptocurrencies with market cap over $500 million and 24h price increase over 15% depth=quick
[NODE] [researchService:timing] python_run_s=3.870 total_s=3.870 topic="cryptocurrencies with market cap over $500 million and 24h price increase over 15%"
[NODE] [researchService:timing] python_run_breakdown tag=close topic="cryptocurrencies with market cap over $500 million and 24h price increase over 15%" spawn_boot_s=0.021 first_output_s=0.712 first_stdout_s=3.798 first_stderr_s=0.712 stream_window_s=3.086 quiet_tail_s=0.051 stdout_chunks=1 stdout_bytes=8659 stderr_chunks=20 stderr_bytes=7939 stderr_lines=66
[NODE] [researchService:timing] parse_output_s=0.007 total_s=3.877 topic="cryptocurrencies with market cap over $500 million and 24h price increase over 15%" sources=20 stdout_len=8617
[NODE] [researchService:sources] extraction_preview=x.com|"Mercy, Mercy...|https://x.com/mediamanint/status/2038408607419834408 || x.com|Pop...|https://x.com/mediamanint/status/2037335113844048376 || x.com|Ethereum is sitting at $2,070 with a 0.6% increase from the |https://x.com/swapincom/status/2038540829900316711
[NODE] [researchService:timing] finalize_summary_s=0.000 total_s=3.877 topic="cryptocurrencies with market cap over $500 million and 24h price increase over 15%" final_len=8170
[NODE] [sources] rawStdout length: 8617, has URLs: 29
[NODE] [sources] compact extraction: 20 sources, snippets: 4
[NODE] [sources] final extraction: raw_count=20 preferred_count=15 unique_domains=10 domains=coingecko.com,api.coingecko.com,coindesk.com,coinmarketcap.com,blockchain.coinmarketcap.com,conference.coinmarketcap.com,coinmindai.com,blockchainmagazine.net,coincodex.com,x.com
[NODE] [sources] final extraction preview: coingecko.com|CoinGecko Market Scanner|https://www.coingecko.com/en/api/documentation || api.coingecko.com|CoinGecko REST API|https://www.coingecko.com/en/api/documentation || coindesk.com|DOGE price: Dogecoin jumps 4.5% to nearly 10-cents, outperfo|https://www.coindesk.com/markets/2026/04/16/dogecoin-jumps-4-5-to-nearly-10-cents-outperforming-bitcoin-and-ether
[NODE] [agent:chat:timing] tools_parallel_wait_s=3.835 total_s=9.880 sessionId=90a8db6d-037c-4e6b-9d16-28f6e1b1ad7d
[NODE] [agent:chat] Promise.allSettled completed: ✅ SEARCH, ✅ WEB3   
[NODE] [agent:chat] Starting synthesis stream (queryType=research), prompt length: 14726
[NODE] [AI chatStream] model=claude-sonnet-4-6, max_tokens=8192, messages=2, inputLen=22466
[NODE] [AI chatStream] Response OK, status=200
[NODE] [agent:chat] Synthesis stream obtained, reading...
[NODE] [PriceService] Updated 32 token prices from CoinGecko
[NODE] [agent:chat:sources] stream_done_sources_count=15 sessionId=90a8db6d-037c-4e6b-9d16-28f6e1b1ad7d
[NODE] [agent:chat:timing] synthesizer_total_s=84.737 end_to_end_s=94.649 ui_duration_s=89 sessionId=90a8db6d-037c-4e6b-9d16-28f6e1b1ad7d     
[NODE] [PriceService] Updated 32 token prices from CoinGecko
[NODE] [agent:chat] {
[NODE]   sessionId: 'd7c9fd77-738b-4c72-bcd0-084c58ad2de6',
[NODE]   contentPreview: '对比 BTC ETH SOL 的价格、市值和24小时涨跌',  
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
[NODE]       "query": "Bitcoin BTC Ethereum ETH Solana SOL price market cap 24h change",
[NODE]       "showXAccountProfile": false
[NODE]     },
[NODE]     "simulate": {
[NODE]       "needed": false
[NODE]     },
[NODE]     "web3": {
[NODE]       "needed": true,
[NODE]       "query": "Bitcoin BTC Ethereum ETH Solana SOL price market cap 24h change"
[NODE]     }
[NODE]   }
[NODE] }
[NODE] [agent:chat:timing] routing_s=5.026 total_s=5.026 sessionId=d7c9fd77-738b-4c72-bcd0-084c58ad2de6 digest_len=0
[NODE] [researchService] Starting deep research on: "Bitcoin BTC Ethereum ETH Solana SOL price market cap 24h change"
[NODE] [agent:chat:timing] tool_dispatch_s=0.042 total_s=5.068 sessionId=d7c9fd77-738b-4c72-bcd0-084c58ad2de6 tools=2
[NODE] [researchService:inner] [TIMING] stage=main.preflight.config_load elapsed_s=0.002
[NODE] [researchService:inner] [TIMING] stage=main.preflight.bird_setup elapsed_s=0.000 first_run=True
[NODE] [researchService:inner] [TIMING] stage=main.preflight.x_source elapsed_s=0.106 source=bird method=env
[NODE] [researchService:inner] [TIMING] stage=main.preflight.capabilities_basic elapsed_s=0.097 youtube=False tiktok=True instagram=True bluesky=False truthsocial=False
[NODE] [researchService:inner] [TIMING] stage=main.preflight.available_sources elapsed_s=0.000 available=all
[NODE] [researchService:inner] [TIMING] stage=main.preflight.route_and_dates elapsed_s=0.000 query_type=product search=web|x
[NODE] [researchService:plan] [SourcePlan] query_type=product mode=x-web reddit_source=scrapecreators x_source=bird web_backend=exa scrapecreators=yes
[NODE] [researchService:plan] [SourcePlan] enabled reddit=False x=True web=True youtube=False(disabled_by_search_flag) tiktok=False(disabled_by_search_flag) instagram=False(disabled_by_search_flag) xiaohongshu=False(disabled_by_search_flag) bluesky=False(disabled_by_search_flag) truthsocial=False(disabled_by_search_flag) polymarket=False(disabled_by_search_flag)
[NODE] [researchService:bird] [Bird] Searching: bitcoin btc ethereum eth solana since:2026-03-17
[NODE] [researchService:inner] [TIMING] stage=run_research.submit_futures elapsed_s=0.002 workers=3 do_reddit=False do_x=True run_youtube=False run_tiktok=False run_instagram=False run_xiaohongshu=False do_hackernews=False do_bluesky=False do_truthsocial=False do_polymarket=False web_backend=exa
[NODE] [researchService:web] [WebSearch] plan backend=exa depth=quick from=2026-03-17 to=2026-04-16 topic="Bitcoin BTC Ethereum ETH Solana SOL price market cap 24h change"
[NODE] [researchService:web] [Exa] request depth=quick num_results=12 max_chars=1000 from=2026-03-17 to=2026-04-16 topic="Bitcoin BTC Ethereum ETH Solana SOL price market cap 24h change"
[NODE] [researchService:web] [Exa] done elapsed_s=1.949 raw_results=12 normalized_results=12
[NODE] [researchService:web] [WebSearch] done backend=exa elapsed_s=1.949 results=12
[NODE] [researchService:bird] [BirdRaw] shape=list len=12
[NODE] [researchService:bird] [BirdRaw] first_item_keys=['id', 'text', 'createdAt', 'replyCount', 'retweetCount', 'likeCount', 'conversationId', 'author', 'authorId']
[NODE] [researchService:bird] [BirdPreview] normalized_items=12 showing_first=5
[NODE] [researchService:bird] [BirdPreview] [1] @DaedalusofCrete date=2026-04-16 id=X1
[NODE] [researchService:bird] [BirdPreview] [1] url=https://x.com/DaedalusofCrete/status/2044751138918973552
[NODE] [researchService:bird] [BirdPreview] [1] text='💰 Current Cryptocurrency Prices:  🌽 Bitcoin (BTC): $74,760 ➖ % Δ 0.5% 🔷 Ethereum (ETH): $2,343.91 ➖ % Δ 0.4% 👻 Solana (SOL): $85.34 ➖ % Δ 0.2% 🐸 Pepe (PEPE: $3...'
[NODE] [researchService:bird] [BirdPreview] [2] @0xCryptoPrice date=2026-04-16 id=X2
[NODE] [researchService:bird] [BirdPreview] [2] url=https://x.com/0xCryptoPrice/status/2044747657281700309
[NODE] [researchService:bird] [BirdPreview] [2] text='🚀 Crypto Prices Update 🚀 🟧 #Bitcoin (BTC):       $74,574.79 ⬛ #Ethereum (ETH):  $2,335.68 🟩 #Solana (SOL):       $85.070 🟨 #Binance (BNB):    $620.95 🟥 #Monero...'
[NODE] [researchService:bird] [BirdPreview] [3] @FluxnaxF65630 date=2026-04-16 id=X3
[NODE] [researchService:bird] [BirdPreview] [3] url=https://x.com/FluxnaxF65630/status/2044739017262997849
[NODE] [researchService:bird] [BirdPreview] [3] text='Fear &amp; Greed Index: 23 - Extreme Fear  BTC $74.3K (+0.4%) - ETH $2.33K (+0.2%) - SOL $85.0 (+2.1%) MCap $2.60T (+0.6%) - BTC Dom 57.1%  Trending: ORDI, BAS...'
[NODE] [researchService:bird] [BirdPreview] [4] @desota date=2026-04-16 id=X4
[NODE] [researchService:bird] [BirdPreview] [4] url=https://x.com/desota/status/2044732599302504457
[NODE] [researchService:bird] [BirdPreview] [4] text='Crypto prices | 7:00 AM | 4/16/26 - Bitcoin, Solana, Ethereum, Tether, Cardano, USDC, Tron, Dogecoin, Zcash, Chainlink, Stellar, Monero - $BTC, $ETH, $XRP http...'
[NODE] [researchService:bird] [BirdPreview] [5] @DaedalusofCrete date=2026-04-16 id=X5
[NODE] [researchService:bird] [BirdPreview] [5] url=https://x.com/DaedalusofCrete/status/2044728489698292035
[NODE] [researchService:bird] [BirdPreview] [5] text='💰 Current Cryptocurrency Prices:  🌽 Bitcoin (BTC): $74,412 ➖ % Δ -0.4% 🔷 Ethereum (ETH): $2,334.02 ➖ % Δ -0.4% 👻 Solana (SOL): $85.15 ➖ % Δ 0.0% 🐸 Pepe (PEPE: ...'
[NODE] [researchService:x] [XDiag] source=bird topic='Bitcoin BTC Ethereum ETH Solana SOL price market cap 24h change' items=12 error=none bird_raw_list_len=12
[NODE] [researchService:inner] [TIMING] stage=run_research.wait_x elapsed_s=2.440 count=12 timeout_s=75
[NODE] [researchService:inner] [TIMING] stage=run_research.wait_web elapsed_s=0.000 count=12 timeout_s=75
[NODE] [researchService:inner] [TIMING] stage=run_research.top_stages elapsed_s=2.442 top=wait_x:2.440s, submit_futures:0.002s, wait_web:0.000s
[NODE] [researchService:inner] [TIMING] stage=run_research.total elapsed_s=2.442 topic=Bitcoin BTC Ethereum ETH Solana SOL price market cap 24h change depth=quick
[NODE] [researchService:inner] [TIMING] stage=main.run_research elapsed_s=2.443 reddit=0 x=12 youtube=0 tiktok=0 instagram=0 hn=0 bluesky=0 truthsocial=0 polymarket=0 web=12
[NODE] [researchService:inner] [TIMING] stage=main.processing elapsed_s=0.020 deduped_total=24
[NODE] [researchService:inner] [TIMING] stage=main.write_outputs elapsed_s=0.009
[NODE] [researchService:inner] [TIMING] stage=main.output_result elapsed_s=0.000 emit=compact
[NODE] [researchService:inner] [TIMING] stage=main.total elapsed_s=3.580 topic=Bitcoin BTC Ethereum ETH Solana SOL price market cap 24h change depth=quick
[NODE] [researchService:timing] python_run_s=4.354 total_s=4.354 topic="Bitcoin BTC Ethereum ETH Solana SOL price market cap 24h change"      
[NODE] [researchService:timing] python_run_breakdown tag=close topic="Bitcoin BTC Ethereum ETH Solana SOL price market cap 24h change" spawn_boot_s=0.021 first_output_s=0.723 first_stdout_s=4.296 first_stderr_s=0.723 stream_window_s=3.574 quiet_tail_s=0.036 stdout_chunks=2 stdout_bytes=10325 stderr_chunks=18 stderr_bytes=7955 stderr_lines=66
[NODE] [researchService:timing] parse_output_s=0.002 total_s=4.356 topic="Bitcoin BTC Ethereum ETH Solana SOL price market cap 24h change" sources=24 stdout_len=10111
[NODE] [researchService:sources] extraction_preview=x.com|BTC holds $74K, SOL leads recove...|https://x.com/FluxnaxF65630/status/2044739017262997849 || x.com|Solana ETFs:...|https://x.com/DSatoshislayer/status/2044727258305216839 || x.com|😹 MOG (MOG): $1.401...|https://x.com/DaedalusofCrete/status/2044728489698292035
[NODE] [researchService:timing] finalize_summary_s=0.000 total_s=4.356 topic="Bitcoin BTC Ethereum ETH Solana SOL price market cap 24h change" final_len=9605
[NODE] [sources] rawStdout length: 10111, has URLs: 33
[NODE] [sources] compact extraction: 20 sources, snippets: 10
[NODE] [sources] final extraction: raw_count=20 preferred_count=14 unique_domains=4 domains=coinmarketcap.com,blockchain.coinmarketcap.com,x.com,exa.ai
[NODE] [sources] final extraction preview: coinmarketcap.com|Cryptocurrency Prices, Charts And Market Capitalizations | C|https://coinmarketcap.com/2/ || coinmarketcap.com|Cryptocurrency Prices, Charts And Market Capitalizations | C|https://www.coinmarketcap.com/ || coinmarketcap.com|Cryptocurrency Prices, Charts And Market Capitalizations | C|https://coinmarketcap.com/en/
[NODE] [web3Research] query="对比 BTC ETH SOL 的价格、市值和24小时涨跌 ; Bitcoin BTC Ethereum ETH Solana SOL price market cap 24h change" intent=multi_asset_compare asset_count=3 resolved_id=bitcoin spot_usd=74723 via=rest resolver=coingecko-search
[NODE] [web3Research:logs] intent=multi_asset_compare | resolved_assets=bitcoin,ethereum,solana
[NODE] [web3Research:assets] Bitcoin(btc), Ethereum(eth), Solana(sol)  
[NODE] [web3Sources] injected=2 intent=multi_asset_compare final_sources=10
[NODE] [agent:chat:timing] tools_parallel_wait_s=5.009 total_s=10.078 sessionId=d7c9fd77-738b-4c72-bcd0-084c58ad2de6
[NODE] [agent:chat] Promise.allSettled completed: ✅ SEARCH, ✅ WEB3   
[NODE] [agent:chat:html] Starting PARALLEL HTML generation (queryType=investment-analysis), contextString length=11610
[NODE] [AI chatStream] model=deepseek-v3, max_tokens=16384, messages=2, inputLen=32208
[NODE] [agent:chat] Starting synthesis stream (queryType=investment-analysis), prompt length: 20734
[NODE] [AI chatStream] model=claude-sonnet-4-6, max_tokens=8192, messages=2, inputLen=28675
[NODE] [AI chatStream] Response OK, status=200
[NODE] [AI chatStream] Response OK, status=200
[NODE] [agent:chat] Synthesis stream obtained, reading...
[NODE] [PriceService] Updated 32 token prices from CoinGecko
[NODE] [agent:chat:sources] stream_done_sources_count=10 sessionId=d7c9fd77-738b-4c72-bcd0-084c58ad2de6
[NODE] [agent:chat:html] Starting SEQUENTIAL HTML generation (standard), input length=3403
[NODE] [AI chatStream] model=deepseek-v3, max_tokens=16384, messages=2, inputLen=23417
[NODE] [AI chatStream] Response OK, status=200
[NODE] [PriceService] Updated 32 token prices from CoinGecko
[NODE] [agent:chat:html] Stream finished. chunks=1105, htmlLength=16920
