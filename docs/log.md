[NODE] [agent:chat] {
[NODE]   sessionId: 'e17d2c09-0c0f-41a4-b35d-ba11e204c3a8',
[NODE]   contentPreview: '分析一下推特的Minara AI这个项目',
[NODE]   images: 0
[NODE] }
[NODE] [PriceService] Updated 32 token prices from CoinGecko
[NODE] [evaluateRouting] Orchestrator Plan (primary): {
[NODE]   "isSimpleChat": false,
[NODE]   "queryType": "research",
[NODE]   "capabilities": {
[NODE]     "analysis": {
[NODE]       "needed": false
[NODE]     },
[NODE]     "search": {
[NODE]       "needed": true,
[NODE]       "query": "Twitter Minara AI project analysis"
[NODE]     },
[NODE]     "simulate": {
[NODE]       "needed": false
[NODE]     },
[NODE]     "web3": {
[NODE]       "needed": false
[NODE]     }
[NODE]   }
[NODE] }
[NODE] [agent:chat:timing] routing_s=4.672 total_s=4.672 sessionId=e17d2c09-0c0f-41a4-b35d-ba11e204c3a8 digest_len=0
[NODE] [researchService] Starting deep research on: "Twitter Minara AI project analysis"    
[NODE] [agent:chat:timing] tool_dispatch_s=0.021 total_s=4.693 sessionId=e17d2c09-0c0f-41a4-b35d-ba11e204c3a8 tools=1
[NODE] [researchService:inner] [TIMING] stage=main.preflight.config_load elapsed_s=0.001
[NODE] [researchService:inner] [TIMING] stage=main.preflight.bird_setup elapsed_s=0.000 first_run=True
[NODE] [researchService:inner] [TIMING] stage=main.preflight.x_source elapsed_s=0.085 source=bird method=env
[NODE] [researchService:inner] [TIMING] stage=main.preflight.capabilities_basic elapsed_s=0.086 youtube=False tiktok=True instagram=True bluesky=False truthsocial=False
[NODE] [researchService:inner] [TIMING] stage=main.preflight.available_sources elapsed_s=0.000 available=all
[NODE] [researchService:inner] [TIMING] stage=main.preflight.route_and_dates elapsed_s=0.000 query_type=breaking_news search=web|x
[NODE] [researchService:plan] [SourcePlan] query_type=breaking_news mode=x-web reddit_source=scrapecreators x_source=bird web_backend=exa scrapecreators=yes
[NODE] [researchService:plan] [SourcePlan] enabled reddit=False x=True web=True youtube=False(disabled_by_search_flag) tiktok=False(disabled_by_search_flag) instagram=False(disabled_by_search_flag) xiaohongshu=False(disabled_by_search_flag) bluesky=False(disabled_by_search_flag) truthsocial=False(disabled_by_search_flag) polymarket=False(disabled_by_search_flag)    
[NODE] [researchService:bird] [Bird] Searching: twitter minara ai project analysis since:2026-03-17
[NODE] [researchService:inner] [TIMING] stage=run_research.submit_futures elapsed_s=0.002 workers=3 do_reddit=False do_x=True run_youtube=False run_tiktok=False run_instagram=False run_xiaohongshu=False do_hackernews=False do_bluesky=False do_truthsocial=False do_polymarket=False web_backend=exa
[NODE] [researchService:web] [WebSearch] plan backend=exa depth=quick from=2026-03-17 to=2026-04-16 topic="Twitter Minara AI project analysis"
[NODE] [researchService:web] [Exa] request depth=quick num_results=12 max_chars=1000 from=2026-03-17 to=2026-04-16 topic="Twitter Minara AI project analysis"
[NODE] [researchService:bird] [BirdRaw] shape=list len=1
[NODE] [researchService:bird] [BirdRaw] first_item_keys=['id', 'text', 'createdAt', 'replyCount', 'retweetCount', 'likeCount', 'conversationId', 'author', 'authorId', 'media']
[NODE] [researchService:bird] [BirdPreview] normalized_items=1 showing_first=1
[NODE] [researchService:bird] [BirdPreview] [1] @lyen2607 date=2026-03-24 id=X1
[NODE] [researchService:bird] [BirdPreview] [1] url=https://x.com/lyen2607/status/2036492136976359764
[NODE] [researchService:bird] [BirdPreview] [1] text='Crypto Survival Alert - Risk Monitor with Minara Workflow  Overview: Cryptocurrency risk monitoring process and email alerts. Scenario: Tracks ETH price and al...'
[NODE] [researchService:x] [XDiag] source=bird topic='Twitter Minara AI project analysis' items=1 error=none bird_raw_list_len=1
[NODE] [researchService:inner] [TIMING] stage=run_research.wait_x elapsed_s=2.419 count=1 timeout_s=75
[NODE] [researchService:web] [Exa] done elapsed_s=3.811 raw_results=12 normalized_results=12
[NODE] [researchService:web] [WebSearch] done backend=exa elapsed_s=3.812 results=12        
[NODE] [researchService:inner] [TIMING] stage=run_research.wait_web elapsed_s=1.401 count=12 timeout_s=75
[NODE] [researchService:inner] [TIMING] stage=run_research.top_stages elapsed_s=3.822 top=wait_x:2.419s, wait_web:1.401s, submit_futures:0.002s
[NODE] [researchService:inner] [TIMING] stage=run_research.total elapsed_s=3.822 topic=Twitter Minara AI project analysis depth=quick
[NODE] [researchService:inner] [TIMING] stage=main.run_research elapsed_s=3.822 reddit=0 x=1 youtube=0 tiktok=0 instagram=0 hn=0 bluesky=0 truthsocial=0 polymarket=0 web=12
[NODE] [researchService:inner] [TIMING] stage=main.processing elapsed_s=0.002 deduped_total=13
[NODE] [researchService:inner] [TIMING] stage=main.write_outputs elapsed_s=0.004
[NODE] [researchService:inner] [TIMING] stage=main.output_result elapsed_s=0.000 emit=compact
[NODE] [researchService:inner] [TIMING] stage=main.total elapsed_s=4.472 topic=Twitter Minara AI project analysis depth=quick
[NODE] [researchService:timing] python_run_s=5.206 total_s=5.206 topic="Twitter Minara AI project analysis"
[NODE] [researchService:timing] python_run_breakdown tag=close topic="Twitter Minara AI project analysis" spawn_boot_s=0.020 first_output_s=0.695 first_stdout_s=5.160 first_stderr_s=0.695 stream_window_s=4.465 quiet_tail_s=0.026 stdout_chunks=1 stdout_bytes=5725 stderr_chunks=16 stderr_bytes=6232 stderr_lines=54
[NODE] [researchService:timing] parse_output_s=0.002 total_s=5.208 topic="Twitter Minara AI project analysis" sources=13 stdout_len=5685
[NODE] [researchService:sources] extraction_preview=x.com|Scenario: Tracks ETH price and alerts when the price falls b|https://x.com/lyen2607/status/2036492136976359764 || gparashar.com|(DAY 1145) Twitter is Ahead: Why X Dominates the AI, Open-So|https://www.gparashar.com/posts/2026-04-13.md/ || nyflashnews.com|NaraChain Expands Public Access With Gas-Free Onboarding, Tw|https://nyflashnews.com/narachain-expands-public-access-with-gas-free-onboarding-twitter-rewards-and-stake-free-pomi-access/
[NODE] [researchService:timing] finalize_summary_s=0.000 total_s=5.208 topic="Twitter Minara AI project analysis" final_len=5681
[NODE] [sources] rawStdout length: 5685, has URLs: 17
[NODE] [sources] compact extraction: 13 sources, snippets: 13
[NODE] [sources] final extraction: count=13 unique_domains=10 domains=x.com,gparashar.com,nyflashnews.com,github.com,panewslab.com,medium.com,dev.to,ai-navigate-news.com,tech-insider.org,madrona.com
[NODE] [sources] final extraction preview: x.com|Scenario: Tracks ETH price and alerts when the price falls b|https://x.com/lyen2607/status/2036492136976359764 || gparashar.com|(DAY 1145) Twitter is Ahead: Why X Dominates the AI, Open-So|https://www.gparashar.com/posts/2026-04-13.md/ || nyflashnews.com|NaraChain Expands Public Access With Gas-Free Onboarding, Tw|https://nyflashnews.com/narachain-expands-public-access-with-gas-free-onboarding-twitter-rewards-and-stake-free-pomi-access/
[NODE] [agent:chat:timing] tools_parallel_wait_s=5.189 total_s=9.882 sessionId=e17d2c09-0c0f-41a4-b35d-ba11e204c3a8
[NODE] [agent:chat] Promise.allSettled completed: ✅ SEARCH
[NODE] [agent:chat] Starting synthesis stream (queryType=research), prompt length: 11823    
[NODE] [AI chatStream] model=claude-sonnet-4-6, max_tokens=8192, messages=2, inputLen=19331 
[NODE] [AI chatStream] Response OK, status=200
[NODE] [agent:chat] Synthesis stream obtained, reading...
[NODE] [PriceService] Updated 32 token prices from CoinGecko
[NODE] [agent:chat:sources] stream_done_sources_count=13 sessionId=e17d2c09-0c0f-41a4-b35d-ba11e204c3a8
[NODE] [agent:chat:timing] synthesizer_total_s=71.060 end_to_end_s=80.960 ui_duration_s=76 sessionId=e17d2c09-0c0f-41a4-b35d-ba11e204c3a8
[NODE] [PriceService] Updated 32 token prices from CoinGecko
