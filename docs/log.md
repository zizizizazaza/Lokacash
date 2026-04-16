[NODE] [agent:chat] {
[NODE]   sessionId: '00d449a3-906a-4062-8a30-b239862aa8ac',
[NODE]   contentPreview: '分析一下推特的@cfldotfun项目',
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
[NODE]       "query": "@cfldotfun Twitter project analysis",
[NODE]       "showXAccountProfile": true
[NODE]     },
[NODE]     "simulate": {
[NODE]       "needed": false
[NODE]     },
[NODE]     "web3": {
[NODE]       "needed": false
[NODE]     }
[NODE]   }
[NODE] }
[NODE] [agent:chat:timing] routing_s=4.921 total_s=4.921 sessionId=00d449a3-906a-4062-8a30-b239862aa8ac digest_len=0
[NODE] [researchService] Starting deep research on: "@cfldotfun Twitter project analysis"
[NODE] [agent:chat:timing] tool_dispatch_s=0.017 total_s=4.938 sessionId=00d449a3-906a-4062-8a30-b239862aa8ac tools=1
[NODE] [researchService:inner] [TIMING] stage=main.preflight.config_load elapsed_s=0.001
[NODE] [researchService:inner] [TIMING] stage=main.preflight.bird_setup elapsed_s=0.000 first_run=True
[NODE] [researchService:inner] [TIMING] stage=main.preflight.x_source elapsed_s=0.067 source=bird method=env
[NODE] [researchService:inner] [TIMING] stage=main.preflight.capabilities_basic elapsed_s=0.065 youtube=False tiktok=True instagram=True bluesky=False truthsocial=False
[NODE] [researchService:inner] [TIMING] stage=main.preflight.available_sources elapsed_s=0.000 available=all
[NODE] [researchService:inner] [TIMING] stage=main.preflight.route_and_dates elapsed_s=0.000 query_type=breaking_news search=web|x
[NODE] [researchService:plan] [SourcePlan] query_type=breaking_news mode=x-web reddit_source=scrapecreators x_source=bird web_backend=exa scrapecreators=yes
[NODE] [researchService:plan] [SourcePlan] enabled reddit=False x=True web=True youtube=False(disabled_by_search_flag) tiktok=False(disabled_by_search_flag) instagram=False(disabled_by_search_flag) xiaohongshu=False(disabled_by_search_flag) bluesky=False(disabled_by_search_flag) truthsocial=False(disabled_by_search_flag) polymarket=False(disabled_by_search_flag) 
[NODE] [researchService:bird] [Bird] Single-handle topic: timeline query from:cfldotfun since:2026-03-17
[NODE] [researchService:inner] [TIMING] stage=run_research.submit_futures elapsed_s=0.002 workers=3 do_reddit=False do_x=True run_youtube=False run_tiktok=False run_instagram=False run_xiaohongshu=False do_hackernews=False do_bluesky=False do_truthsocial=False do_polymarket=False web_backend=exa
[NODE] [researchService:web] [WebSearch] plan backend=exa depth=quick from=2026-03-17 to=2026-04-16 topic="@cfldotfun Twitter project analysis"   
[NODE] [researchService:web] [Exa] request depth=quick num_results=12 max_chars=1000 from=2026-03-17 to=2026-04-16 topic="@cfldotfun Twitter project analysis"
[NODE] [researchService:bird] [BirdRaw] shape=list len=12
[NODE] [researchService:bird] [BirdRaw] first_item_keys=['id', 'text', 'createdAt', 'replyCount', 'retweetCount', 'likeCount', 'conversationId', 'inReplyToStatusId', 'author', 'authorId']
[NODE] [researchService:bird] [BirdPreview] normalized_items=12 showing_first=5
[NODE] [researchService:bird] [BirdPreview] [1] @cfldotfun date=2026-04-16 id=X1
[NODE] [researchService:bird] [BirdPreview] [1] url=https://x.com/cfldotfun/status/2044675655221338164
[NODE] [researchService:bird] [BirdPreview] [1] text='@luminaries LFG'   
[NODE] [researchService:bird] [BirdPreview] [2] @cfldotfun date=2026-04-16 id=X2
[NODE] [researchService:bird] [BirdPreview] [2] url=https://x.com/cfldotfun/status/2044675570848739422
[NODE] [researchService:bird] [BirdPreview] [2] text='@BiconomyCom Good morning☀️'
[NODE] [researchService:bird] [BirdPreview] [3] @cfldotfun date=2026-04-16 id=X3
[NODE] [researchService:bird] [BirdPreview] [3] url=https://x.com/cfldotfun/status/2044675520349266053
[NODE] [researchService:bird] [BirdPreview] [3] text='@LaunchMyNFT Gm fam💚'
[NODE] [researchService:bird] [BirdPreview] [4] @cfldotfun date=2026-04-16 id=X4
[NODE] [researchService:bird] [BirdPreview] [4] url=https://x.com/cfldotfun/status/2044671639603015695
[NODE] [researchService:bird] [BirdPreview] [4] text='@Xiznft its easy'  
[NODE] [researchService:bird] [BirdPreview] [5] @cfldotfun date=2026-04-16 id=X5
[NODE] [researchService:bird] [BirdPreview] [5] url=https://x.com/cfldotfun/status/2044671371327017354
[NODE] [researchService:bird] [BirdPreview] [5] text='@0xkangsai social proof everyone'
[NODE] [researchService:x] [XDiag] source=bird topic='@cfldotfun Twitter project analysis' items=12 error=none bird_raw_list_len=12
[NODE] [researchService:inner] [TIMING] stage=run_research.wait_x elapsed_s=1.573 count=12 timeout_s=75
[NODE] [researchService:web] [Exa] done elapsed_s=1.908 raw_results=12 normalized_results=12
[NODE] [researchService:web] [WebSearch] done backend=exa elapsed_s=1.908 results=12
[NODE] [researchService:inner] [TIMING] stage=run_research.wait_web elapsed_s=0.341 count=12 timeout_s=75
[NODE] [researchService:inner] [TIMING] stage=run_research.top_stages elapsed_s=1.915 top=wait_x:1.573s, wait_web:0.341s, submit_futures:0.002s   
[NODE] [researchService:inner] [TIMING] stage=run_research.total elapsed_s=1.915 topic=@cfldotfun Twitter project analysis depth=quick
[NODE] [researchService:inner] [TIMING] stage=main.run_research elapsed_s=1.915 reddit=0 x=12 youtube=0 tiktok=0 instagram=0 hn=0 bluesky=0 truthsocial=0 polymarket=0 web=12
[NODE] [researchService:inner] [TIMING] stage=main.processing elapsed_s=0.005 deduped_total=15
[NODE] [researchService:inner] [TIMING] stage=main.write_outputs elapsed_s=0.003
[NODE] [researchService:inner] [TIMING] stage=main.output_result elapsed_s=0.000 emit=compact
[NODE] [researchService:inner] [TIMING] stage=main.total elapsed_s=2.805 topic=@cfldotfun Twitter project analysis depth=quick
[NODE] [researchService:timing] python_run_s=3.348 total_s=3.348 topic="@cfldotfun Twitter project analysis"
[NODE] [researchService:timing] python_run_breakdown tag=close topic="@cfldotfun Twitter project analysis" spawn_boot_s=0.016 first_output_s=0.506 first_stdout_s=3.307 first_stderr_s=0.506 stream_window_s=2.801 quiet_tail_s=0.025 stdout_chunks=1 stdout_bytes=6135 stderr_chunks=19 stderr_bytes=6497 stderr_lines=67
[NODE] [researchService:timing] parse_output_s=0.002 total_s=3.350 topic="@cfldotfun Twitter project analysis" sources=15 stdout_len=6101
[NODE] [researchService:sources] extraction_preview=x.com|@LaunchMyNFT Gm fam💚...|https://x.com/cfldotfun/status/2044675520349266053 || x.com|@OlricOnlyfornft love you...|https://x.com/cfldotfun/status/2044670141800329715 || x.com|@Onchain_Pilot dope...|https://x.com/cfldotfun/status/2044670119486566812
[NODE] [researchService:timing] finalize_summary_s=0.000 total_s=3.351 topic="@cfldotfun Twitter project analysis" final_len=5975
[NODE] [sources] rawStdout length: 6101, has URLs: 21
[NODE] [sources] compact extraction: 15 sources, snippets: 15
[NODE] [sources] final extraction: count=15 unique_domains=12 domains=x.com,policylayer.com,gist.github.com,xanguard.tech,randalolson.com,alterlab.io,medium.com,commentgrid.com,github.com,codexgalactic.com,soufan.medium.com,frenflow.com
[NODE] [sources] final extraction preview: x.com|@LaunchMyNFT Gm fam💚...|https://x.com/cfldotfun/status/2044675520349266053 || x.com|@OlricOnlyfornft love you...|https://x.com/cfldotfun/status/2044670141800329715 || x.com|@Onchain_Pilot dope...|https://x.com/cfldotfun/status/2044670119486566812
[NODE] [x_profile] selected handle=@cfldotfun followers=14893 following=85 query="分析一下推特的@cfldotfun项目"
[NODE] [agent:chat:timing] tools_parallel_wait_s=3.336 total_s=8.275 sessionId=00d449a3-906a-4062-8a30-b239862aa8ac
[NODE] [agent:chat] Promise.allSettled completed: ✅ SEARCH
[NODE] [agent:chat] Starting synthesis stream (queryType=research), prompt length: 12334
[NODE] [AI chatStream] model=claude-sonnet-4-6, max_tokens=8192, messages=2, inputLen=19821
[NODE] [AI chatStream] Response OK, status=200
[NODE] [agent:chat] Synthesis stream obtained, reading...
[NODE] [PriceService] Updated 32 token prices from CoinGecko
[NODE] [agent:chat:sources] stream_done_sources_count=15 sessionId=00d449a3-906a-4062-8a30-b239862aa8ac
[NODE] [agent:chat:timing] synthesizer_total_s=74.954 end_to_end_s=83.247 ui_duration_s=78 sessionId=00d449a3-906a-4062-8a30-b239862aa8ac
[NODE] [PriceService] Updated 32 token prices from CoinGecko
[NODE] [PriceService] Updated 32 token prices from CoinGecko
[NODE] [agent:chat] {
[NODE]   sessionId: '45b90581-b2c4-4a84-a736-1ff951459a2a',
[NODE]   contentPreview: "Let's analyze the @cfldotfun project on Twitter",
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
[NODE]       "query": "cfldotfun Twitter project analysis",
[NODE]       "showXAccountProfile": true
[NODE]     },
[NODE]     "simulate": {
[NODE]       "needed": false
[NODE]     },
[NODE]     "web3": {
[NODE]       "needed": false
[NODE]     }
[NODE]   }
[NODE] }
[NODE] [agent:chat:timing] routing_s=4.763 total_s=4.764 sessionId=45b90581-b2c4-4a84-a736-1ff951459a2a digest_len=0
[NODE] [researchService] Starting deep research on: "cfldotfun Twitter project analysis"
[NODE] [agent:chat:timing] tool_dispatch_s=0.019 total_s=4.783 sessionId=45b90581-b2c4-4a84-a736-1ff951459a2a tools=1
[NODE] [researchService:inner] [TIMING] stage=main.preflight.config_load elapsed_s=0.002
[NODE] [researchService:inner] [TIMING] stage=main.preflight.bird_setup elapsed_s=0.000 first_run=True
[NODE] [researchService:inner] [TIMING] stage=main.preflight.x_source elapsed_s=0.098 source=bird method=env
[NODE] [researchService:inner] [TIMING] stage=main.preflight.capabilities_basic elapsed_s=0.083 youtube=False tiktok=True instagram=True bluesky=False truthsocial=False
[NODE] [researchService:inner] [TIMING] stage=main.preflight.available_sources elapsed_s=0.000 available=all
[NODE] [researchService:inner] [TIMING] stage=main.preflight.route_and_dates elapsed_s=0.000 query_type=breaking_news search=web|x
[NODE] [researchService:plan] [SourcePlan] query_type=breaking_news mode=x-web reddit_source=scrapecreators x_source=bird web_backend=exa scrapecreators=yes
[NODE] [researchService:plan] [SourcePlan] enabled reddit=False x=True web=True youtube=False(disabled_by_search_flag) tiktok=False(disabled_by_search_flag) instagram=False(disabled_by_search_flag) xiaohongshu=False(disabled_by_search_flag) bluesky=False(disabled_by_search_flag) truthsocial=False(disabled_by_search_flag) polymarket=False(disabled_by_search_flag) 
[NODE] [researchService:bird] [Bird] Searching: cfldotfun twitter project analysis since:2026-03-17
[NODE] [researchService:inner] [TIMING] stage=run_research.submit_futures elapsed_s=0.001 workers=3 do_reddit=False do_x=True run_youtube=False run_tiktok=False run_instagram=False run_xiaohongshu=False do_hackernews=False do_bluesky=False do_truthsocial=False do_polymarket=False web_backend=exa
[NODE] [researchService:web] [WebSearch] plan backend=exa depth=quick from=2026-03-17 to=2026-04-16 topic="cfldotfun Twitter project analysis"    
[NODE] [researchService:web] [Exa] request depth=quick num_results=12 max_chars=1000 from=2026-03-17 to=2026-04-16 topic="cfldotfun Twitter project analysis"
[NODE] [researchService:bird] [Bird] 0 results for 'cfldotfun twitter project analysis', retrying with 'cfldotfun twitter'
[NODE] [researchService:web] [Exa] done elapsed_s=1.324 raw_results=12 normalized_results=12
[NODE] [researchService:web] [WebSearch] done backend=exa elapsed_s=1.325 results=12
[NODE] [researchService:bird] [BirdRaw] shape=list len=9
[NODE] [researchService:bird] [BirdRaw] first_item_keys=['id', 'text', 'createdAt', 'replyCount', 'retweetCount', 'likeCount', 'conversationId', 'inReplyToStatusId', 'author', 'authorId', 'media']
[NODE] [researchService:bird] [BirdPreview] normalized_items=9 showing_first=5
[NODE] [researchService:bird] [BirdPreview] [1] @DingusUSA date=2026-04-09 id=X1
[NODE] [researchService:bird] [BirdPreview] [1] url=https://x.com/DingusUSA/status/2042132460570292234
[NODE] [researchService:bird] [BirdPreview] [1] text='@cfldotfun https://t.co/G6K3M47kus'
[NODE] [researchService:bird] [BirdPreview] [2] @KK2930wolf date=2026-04-08 id=X2
[NODE] [researchService:bird] [BirdPreview] [2] url=https://x.com/KK2930wolf/status/2042015188128559217
[NODE] [researchService:bird] [BirdPreview] [2] text='@cfldotfun https://t.co/U3VOhGZark'
[NODE] [researchService:bird] [BirdPreview] [3] @liquiffy212 date=2026-03-20 id=X3
[NODE] [researchService:bird] [BirdPreview] [3] url=https://x.com/liquiffy212/status/2035086127657304316
[NODE] [researchService:bird] [BirdPreview] [3] text="@Ostand66438 @gibdotmeme @solanamobile @cfldotfun @App_ChessKing @cherrydotfun You only need 50 now bro. Search 'follow back' on twitter and follow some of the..."  
[NODE] [researchService:bird] [BirdPreview] [4] @Ostand66438 date=2026-03-20 id=X4
[NODE] [researchService:bird] [BirdPreview] [4] url=https://x.com/Ostand66438/status/2034904623287263458
[NODE] [researchService:bird] [BirdPreview] [4] text="@cfldotfun @MikaelGirard @lrhttc @onni_skr @OnthRise @HeavyD_sol @0xkangsai @Mr_blzs @Marcoai2026 Hi,  🚨CFL leaderboard requires 50 followers on X 🙄 i'm not in..."
[NODE] [researchService:bird] [BirdPreview] [5] @cfldotfun date=2026-04-08 id=X5
[NODE] [researchService:bird] [BirdPreview] [5] url=https://x.com/cfldotfun/status/2041911935227330767
[NODE] [researchService:bird] [BirdPreview] [5] text='@OO_RAX same vibe https://t.co/XPa9OpPNpa'
[NODE] [researchService:x] [XDiag] source=bird topic='cfldotfun Twitter project analysis' items=9 error=none bird_raw_list_len=9
[NODE] [researchService:inner] [TIMING] stage=run_research.wait_x elapsed_s=2.919 count=9 timeout_s=75
[NODE] [researchService:inner] [TIMING] stage=run_research.wait_web elapsed_s=0.000 count=12 timeout_s=75
[NODE] [researchService:inner] [TIMING] stage=run_research.top_stages elapsed_s=2.920 top=wait_x:2.919s, submit_futures:0.001s, wait_web:0.000s   
[NODE] [researchService:inner] [TIMING] stage=run_research.total elapsed_s=2.920 topic=cfldotfun Twitter project analysis depth=quick
[NODE] [researchService:inner] [TIMING] stage=main.run_research elapsed_s=2.920 reddit=0 x=9 youtube=0 tiktok=0 instagram=0 hn=0 bluesky=0 truthsocial=0 polymarket=0 web=12
[NODE] [researchService:inner] [TIMING] stage=main.processing elapsed_s=0.005 deduped_total=14
[NODE] [researchService:inner] [TIMING] stage=main.write_outputs elapsed_s=0.005
[NODE] [researchService:inner] [TIMING] stage=main.output_result elapsed_s=0.000 emit=compact
[NODE] [researchService:inner] [TIMING] stage=main.total elapsed_s=3.604 topic=cfldotfun Twitter project analysis depth=quick
[NODE] [researchService:timing] python_run_s=4.238 total_s=4.238 topic="cfldotfun Twitter project analysis"
[NODE] [researchService:timing] python_run_breakdown tag=close topic="cfldotfun Twitter project analysis" spawn_boot_s=0.018 first_output_s=0.577 first_stdout_s=4.176 first_stderr_s=0.577 stream_window_s=3.599 quiet_tail_s=0.044 stdout_chunks=1 stdout_bytes=6435 stderr_chunks=17 stderr_bytes=7333 stderr_lines=67
[NODE] [researchService:timing] parse_output_s=0.001 total_s=4.239 topic="cfldotfun Twitter project analysis" sources=14 stdout_len=6385
[NODE] [researchService:sources] extraction_preview=x.com|@Ostand66438 @gibdotmeme @solanamobile @cfldotfun @App_Chess|https://x.com/liquiffy212/status/2035086127657304316 || x.com|🚨CFL leaderboard requires 50 followers on X 🙄 i'm not infl|https://x.com/Ostand66438/status/2034904623287263458 || cybernoz.com|Botnet Exposed: Hackers Leave Worker Access and Root Passwor|https://cybernoz.com/botnet-exposed-hackers-leave-worker-access-and-root-passwords-wide-open/
[NODE] [researchService:timing] finalize_summary_s=0.000 total_s=4.240 topic="cpic="cfldotfun Twitter project analysis" final_len=6198
[NODE] [sources] rawStdout length: 6385, has URLs: 17
[NODE] [sources] compact extraction: 14 sources, snippets: 14
[NODE] [sources] final extraction: count=14 unique_domains=12 domains=x.com,cybernoz.com,xanguard.tech,bitcoinethereumnews.com,bulbapp.io,news.dropstab.com,nulltx.com,alterlab.io,gfmreview.com,crypto.news,github.com,news.hodlfm.io       
[NODE] [sources] final extraction preview: x.com|@Ostand66438 @gibdotmeme @solanamobile @cfldotfun @App_Chess|https://x.com/liquiffy212/status/2035086127657304316 || x.com|🚨CFL leaderboard requires 50 followers on X 🙄 i'm not infl|https://x.com/Ostand66438/status/2034904623287263458 || cybernoz.com|Botnet Exposed: Hackers Leave Worker Access and Root Passwor|https://cybernoz.com/botnet-exposed-hackers-leave-worker-access-and-root-passwords-wide-open/
[NODE] [x_profile] skipped: no high-confidence profile match for query="Let's analyze the @cfldotfun project on Twitter" profiles=2
[NODE] [agent:chat:timing] tools_parallel_wait_s=4.223 total_s=9.006 sessionId=45b90581-b2c4-4a84-a736-1ff951459a2a
[NODE] [agent:chat] Promise.allSettled completed: ✅ SEARCH
[NODE] [agent:chat] Starting synthesis stream (queryType=research), prompt length: 12729
[NODE] [AI chatStream] model=claude-sonnet-4-6, max_tokens=8192, messages=2, inputLen=20241
[NODE] [AI chatStream] Response OK, status=200
[NODE] [agent:chat] Synthesis stream obtained, reading...
[NODE] [PriceService] Updated 32 token prices from CoinGecko
[NODE] [PriceService] Updated 32 token prices from CoinGecko
[NODE] [PriceService] Updated 32 token prices from CoinGecko
[NODE] [agent:chat:sources] stream_done_sources_count=14 sessionId=45b90581-b2c4-4a84-a736-1ff951459a2a
[NODE] [agent:chat:timing] synthesizer_total_s=146.310 end_to_end_s=155.316 ui_duration_s=150 sessionId=45b90581-b2c4-4a84-a736-1ff951459a2a
[NODE] [PriceService] Updated 32 token prices from CoinGecko
