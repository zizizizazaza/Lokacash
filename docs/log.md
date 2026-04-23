[NODE] [agent:chat] {
[NODE]   sessionId: 'e6b2f34c-46e9-4050-a438-77e6fa66cdad',
[NODE]   contentPreview: '帮我分析AAPL',
[NODE]   images: 0
[NODE] }
[NODE] [evaluateRouting] Orchestrator Plan (primary): {
[NODE]   "isSimpleChat": false,
[NODE]   "queryType": "investment-analysis",
[NODE]   "capabilities": {
[NODE]     "analysis": {
[NODE]       "needed": true,
[NODE]       "tickers": [
[NODE]         "AAPL"
[NODE]       ]
[NODE]     },
[NODE]     "search": {
[NODE]       "needed": true,
[NODE]       "query": "Apple AAPL stock buy sell analysis",
[NODE]       "showXAccountProfile": false
[NODE]     },
[NODE]     "simulate": {
[NODE]       "needed": false
[NODE]     },
[NODE]     "web3": {
[NODE]       "needed": false
[NODE]     }
[NODE]   }
[NODE] }
[NODE] [agent:chat:timing] routing_s=5.434 total_s=5.434 sessionId=e6b2f34c-46e9-4050-a438-77e6fa66cdad digest_len=0
[NODE] [researchService] Starting deep research on: "Apple AAPL stock buy sell analysis"
[NODE] [StockAnalysis] Starting stream analysis for: "Analyze: AAPL..."
[NODE] [StockAnalysis] Search config: tavily=true bocha=true serpapi=false searxPublic=false searxSelfHosted=0 disableSearxng=true disableSerpapi=true forceHeadless=false
[NODE] [agent:chat:timing] tool_dispatch_s=0.046 total_s=5.480 sessionId=e6b2f34c-46e9-4050-a438-77e6fa66cdad tools=2
[NODE] [researchService:inner] [TIMING] stage=main.preflight.config_load elapsed_s=0.002
[NODE] [researchService:inner] [TIMING] stage=main.preflight.bird_setup elapsed_s=0.000 first_run=True
[NODE] [researchService:inner] [TIMING] stage=main.preflight.x_source elapsed_s=0.089 source=bird method=env
[NODE] [researchService:inner] [TIMING] stage=main.preflight.capabilities_basic elapsed_s=0.102 youtube=False tiktok=True instagram=True bluesky=False truthsocial=False
[NODE] [researchService:inner] [TIMING] stage=main.preflight.available_sources elapsed_s=0.000 available=all
[NODE] [researchService:inner] [TIMING] stage=main.preflight.route_and_dates elapsed_s=0.000 query_type=product search=web|x    
[NODE] [researchService:plan] [SourcePlan] query_type=product mode=x-web reddit_source=scrapecreators x_source=bird web_backend=exa scrapecreators=yes
[NODE] [researchService:plan] [SourcePlan] enabled reddit=False x=True web=True youtube=False(disabled_by_search_flag) tiktok=False(disabled_by_search_flag) instagram=False(disabled_by_search_flag) xiaohongshu=False(disabled_by_search_flag) bluesky=False(disabled_by_search_flag) truthsocial=False(disabled_by_search_flag) polymarket=False(disabled_by_search_flag)
[NODE] [researchService:bird] [Bird] Searching: apple aapl stock buy sell since:2026-03-24
[NODE] [researchService:inner] [TIMING] stage=run_research.submit_futures elapsed_s=0.001 workers=3 do_reddit=False do_x=True run_youtube=False run_tiktok=False run_instagram=False run_xiaohongshu=False do_hackernews=False do_bluesky=False do_truthsocial=False do_polymarket=False web_backend=exa
[NODE] [researchService:web] [WebSearch] plan backend=exa depth=quick from=2026-03-24 to=2026-04-23 topic="Apple AAPL stock buy sell analysis"
[NODE] [researchService:web] [Exa] request depth=quick num_results=12 max_chars=1000 from=2026-03-24 to=2026-04-23 topic="Apple AAPL stock buy sell analysis"
[NODE] [researchService:web] [Exa] done elapsed_s=2.973 raw_results=12 normalized_results=12
[NODE] [researchService:web] [WebSearch] done backend=exa elapsed_s=2.973 results=12
[NODE] [researchService:bird] [BirdRaw] shape=list len=5
[NODE] [researchService:bird] [BirdRaw] first_item_keys=['id', 'text', 'createdAt', 'replyCount', 'retweetCount', 'likeCount', 'conversationId', 'inReplyToStatusId', 'author', 'authorId']
[NODE] [researchService:bird] [BirdPreview] normalized_items=5 showing_first=5
[NODE] [researchService:bird] [BirdPreview] [1] @levelsbycal date=2026-04-22 id=X1
[NODE] [researchService:bird] [BirdPreview] [1] url=https://x.com/levelsbycal/status/2046939953473708274
[NODE] [researchService:bird] [BirdPreview] [1] text='$AAPL level check. Catalyst: Ahead of Earnings, Is Apple Stock a Buy, a Sell, or Fairly Valued? - Morningstar Did your first setup hold? Reply with your invali...'
[NODE] [researchService:bird] [BirdPreview] [2] @levelsbycal date=2026-04-22 id=X2
[NODE] [researchService:bird] [BirdPreview] [2] url=https://x.com/levelsbycal/status/2046924749138444530
[NODE] [researchService:bird] [BirdPreview] [2] text='$AAPL is at the decision point after Ahead of Earnings, Is Apple Stock a Buy, a Sell, or Fairly Valued? - Morningstar. Above $270 opens momentum. Below $260 br...'
[NODE] [researchService:bird] [BirdPreview] [3] @levelsbycal date=2026-04-15 id=X3
[NODE] [researchService:bird] [BirdPreview] [3] url=https://x.com/levelsbycal/status/2044388160969564508
[NODE] [researchService:bird] [BirdPreview] [3] text='$AAPL is at the decision point after Apple (AAPL) Stock at $260: Buy, Sell or Hold? - 250/250 Wall St. Above $260 opens momentum. Below $250 breaks the setup. ...'
[NODE] [researchService:bird] [BirdPreview] [4] @DailyStockPick3 date=2026-03-25 id=X4
[NODE] [researchService:bird] [BirdPreview] [4] url=https://x.com/DailyStockPick3/status/2036762116347015615
[NODE] [researchService:bird] [BirdPreview] [4] text='If a Apple stores discounted all of their products by 25%, people would be sprinting to the store to buy. But if $AAPL stock or the market as a whole dropped 2...'
[NODE] [researchService:bird] [BirdPreview] [5] @CryptoPlanet247 date=2026-03-24 id=X5
[NODE] [researchService:bird] [BirdPreview] [5] url=https://x.com/CryptoPlanet247/status/2036308893421203510
[NODE] [researchService:bird] [BirdPreview] [5] text='Apple Stock: Buy, Sell or Hold After 9% Drop in 2026 &amp; New BofA Target? https://t.co/rr3VLiPCIX Loredana Harsana   Apple stock — buy, sell, or hold? That i...'
[NODE] [researchService:x] [XDiag] source=bird topic='Apple AAPL stock buy sell analysis' items=5 error=none bird_raw_list_len=5
[NODE] [researchService:inner] [TIMING] stage=run_research.wait_x elapsed_s=4.258 count=5 timeout_s=75
[NODE] [researchService:inner] [TIMING] stage=run_research.wait_web elapsed_s=0.000 count=12 timeout_s=75
[NODE] [researchService:inner] [TIMING] stage=run_research.top_stages elapsed_s=4.259 top=wait_x:4.258s, submit_futures:0.001s, wait_web:0.000s
[NODE] [researchService:inner] [TIMING] stage=run_research.total elapsed_s=4.259 topic=Apple AAPL stock buy sell analysis depth=quick
[NODE] [researchService:inner] [TIMING] stage=main.run_research elapsed_s=4.259 reddit=0 x=5 youtube=0 tiktok=0 instagram=0 hn=0 bluesky=0 truthsocial=0 polymarket=0 web=12
[NODE] [researchService:inner] [TIMING] stage=main.processing elapsed_s=0.008 deduped_total=17
[NODE] [researchService:inner] [TIMING] stage=main.write_outputs elapsed_s=0.007
[NODE] [researchService:inner] [TIMING] stage=main.output_result elapsed_s=0.000 emit=compact
[NODE] [researchService:inner] [TIMING] stage=main.total elapsed_s=9.114 topic=Apple AAPL stock buy sell analysis depth=quick   
[NODE] [researchService:timing] python_run_s=9.779 total_s=9.780 topic="Apple AAPL stock buy sell analysis"
[NODE] [researchService:timing] python_run_breakdown tag=close topic="Apple AAPL stock buy sell analysis" spawn_boot_s=0.027 first_output_s=0.600 first_stdout_s=9.710 first_stderr_s=0.600 stream_window_s=9.110 quiet_tail_s=0.043 stdout_chunks=1 stdout_bytes=7752 stderr_chunks=15 stderr_bytes=7634 stderr_lines=66
[NODE] [researchService:timing] parse_output_s=0.007 total_s=9.787 topic="Apple AAPL stock buy sell analysis" sources=17 stdout_len=7692
[NODE] [researchService:sources] extraction_preview=x.com|Let the setup prove itsel...|https://x.com/levelsbycal/status/2046924749138444530 || x.com|If the level fails, step as...|https://x.com/levelsbycal/status/2046939953473708274 || x.com|Trade the level, not the impulse. https:/...|https://x.com/levelsbycal/status/2044388160969564508
[NODE] [researchService:timing] finalize_summary_s=0.000 total_s=9.787 topic="Apple AAPL stock buy sell analysis" final_len=7428
[NODE] [sources] rawStdout length: 7692, has URLs: 22
[NODE] [sources] compact extraction: 17 sources, snippets: 4
[NODE] [sources] final extraction: raw_count=17 preferred_count=17 unique_domains=13 domains=x.com,barchart.com,americanbankingnews.com,morningstar.com,tickerreport.com,stocksanalyzer.app,ainvest.com,ca.finance.yahoo.com,247wallst.com,fool.com,stonqly.com,alcapitaladvisory.com,exa.ai
[NODE] [sources] final extraction preview: x.com|Let the setup prove itsel...|https://x.com/levelsbycal/status/2046924749138444530 || x.com|If the level fails, step as...|https://x.com/levelsbycal/status/2046939953473708274 || x.com|Trade the level, not the impulse. https:/...|https://x.com/levelsbycal/status/2044388160969564508
[NODE] [PriceService] Updated 32 token prices from CoinGecko
[NODE] [StockAnalysis Log] 2026-04-23 22:50:22 INFO src.agent.factory [AgentFactory] ToolRegistry cached (18 tools)
[NODE] [StockAnalysis Log] 2026-04-23 22:50:22 INFO src.agent.skills.base Loaded 11 built-in skills from E:\D\BlockChain\Hetu\lokacash\server\tools\stock-analysis\strategies
[NODE] [StockAnalysis Log] 2026-04-23 22:50:22 INFO src.agent.factory [AgentFactory] SkillManager prototype cached (11 skills)  
[NODE] [StockAnalysis Log] 2026-04-23 22:50:22 INFO src.agent.skills.base Activated skills: ['bull_trend']
[NODE] [StockAnalysis Log] 2026-04-23 22:50:22 INFO src.agent.factory [AgentFactory] Activated skills: ['bull_trend']
[NODE] [StockAnalysis Log] 2026-04-23 22:50:22 INFO src.agent.factory [AgentFactory] Resolved skill prompt state: skills=['bull_trend'] (arch=single, explicit=False, legacy_default_prompt=True)
[NODE] [StockAnalysis Log] Provider List: https://docs.litellm.ai/docs/providers
[NODE] [StockAnalysis Log] Provider List: https://docs.litellm.ai/docs/providers
[NODE] [StockAnalysis Log] Provider List: https://docs.litellm.ai/docs/providers
[NODE] [StockAnalysis Log] Provider List: https://docs.litellm.ai/docs/providers
[NODE] [StockAnalysis Log] 2026-04-23 22:50:22 INFO src.agent.llm_adapter Agent LLM: litellm initialized (model=openai/deepseek-v3)
[NODE] [StockAnalysis Log] 2026-04-23 22:50:22 INFO src.agent.conversation Created new conversation session: e6b2f34c-46e9-4050-a438-77e6fa66cdad:analysis_analysis_1776955809658
[NODE] [StockAnalysis Log] 2026-04-23 22:50:22 INFO src.storage 数据库初始化完成: sqlite:///E:\D\BlockChain\Hetu\lokacash\server\tools\stock-analysis\data\stock_analysis.db
[NODE] [StockAnalysis Log] 2026-04-23 22:50:22 INFO src.agent.runner Agent step 1/2
[NODE] [StockAnalysis Log] 22:50:22 - LiteLLM:INFO: utils.py:3995 -
[NODE] [StockAnalysis Log] LiteLLM completion() model= deepseek-v3; provider = openai
[NODE] [StockAnalysis Log] 2026-04-23 22:50:22 INFO LiteLLM
[NODE] [StockAnalysis Log] LiteLLM completion() model= deepseek-v3; provider = openai
[NODE] [StockAnalysis Log] 2026-04-23 22:50:28 INFO src.agent.runner [DEBUG] LLM response: tool_calls=2, content_len=0, provider=openai, model=openai/deepseek-v3, tools_sent=18
[NODE] [StockAnalysis Log] 2026-04-23 22:50:28 INFO src.agent.runner [DEBUG] Tool calls: ['get_realtime_quote', 'get_daily_history']
[NODE] [StockAnalysis Log] 2026-04-23 22:50:28 INFO src.agent.runner Agent requesting 2 tool call(s): ['get_realtime_quote', 'get_daily_history']
[NODE] [StockAnalysis Log] 2026-04-23 22:50:28 INFO data_provider.base TushareFetcher disabled by ENABLE_TUSHARE_FETCHER=false  
[NODE] [StockAnalysis Log] 2026-04-23 22:50:28 INFO data_provider.base PytdxFetcher disabled by ENABLE_PYTDX_FETCHER=false      
[NODE] [StockAnalysis Log] 2026-04-23 22:50:28 INFO data_provider.base 已初始化 6 个数据源（按优先级）: EfinanceFetcher(P0), AkshareFetcher(P1), BaostockFetcher(P3), FmpFetcher(P3), YfinanceFetcher(P4), LongbridgeFetcher(P5)
[NODE] [StockAnalysis Log] 2026-04-23 22:50:28 INFO data_provider.base [数据源能力] EfinanceFetcher=免费 | AkshareFetcher=免费 | BaostockFetcher=免费 | FmpFetcher=配置 | YfinanceFetcher=免费 | LongbridgeFetcher=可用
[NODE] [StockAnalysis Log] 2026-04-23 22:50:28 INFO data_provider.base [LongbridgeRoute][quote] market=美股 code=AAPL lb_available=True lb_reason=ok primary=FmpFetcher secondary=YfinanceFetcher
[NODE] [StockAnalysis Log] 2026-04-23 22:50:28 INFO data_provider.base [LongbridgeRoute][daily] market=美股 code=AAPL lb_available=True lb_reason=ok source_order=['FmpFetcher', 'YfinanceFetcher', 'LongbridgeFetcher']
[NODE] [StockAnalysis Log] 2026-04-23 22:50:28 INFO data_provider.base [数据源并发尝试 1/3] [FmpFetcher] 获取 AAPL...
[NODE] [StockAnalysis Log] 2026-04-23 22:50:28 INFO data_provider.base [数据源并发尝试 2/3] [YfinanceFetcher] 获取 AAPL...      
[NODE] [StockAnalysis Log] 2026-04-23 22:50:28 INFO data_provider.base [数据源并发尝试 3/3] [LongbridgeFetcher] 获取 AAPL...    
[NODE] [StockAnalysis Log] 2026-04-23 22:50:28 INFO data_provider.base [LongbridgeFetcher] 开始获取 AAPL 日线数据: 范围=2025-12-24 ~ 2026-04-23
[NODE] [StockAnalysis Log] 2026-04-23 22:50:28 INFO data_provider.longbridge_fetcher [Longbridge] Config.from_apikey_env() 成功
[NODE] [StockAnalysis Log] 2026-04-23 22:50:28 INFO data_provider.longbridge_fetcher [Longbridge] 配置: region=(auto), http=(default), quote_ws=(default)
[NODE] [StockAnalysis Log] 2026-04-23 22:50:28 INFO data_provider.longbridge_fetcher [Longbridge] QuoteContext 初始化成功       
[NODE] [StockAnalysis Log] 2026-04-23 22:50:30 INFO data_provider.base [LongbridgeFetcher] AAPL 获取成功: 范围=2025-12-24 ~ 2026-04-23, rows=82, elapsed=1.26s
[NODE] [StockAnalysis Log] 2026-04-23 22:50:30 INFO data_provider.base [数据源完成] AAPL 使用 [LongbridgeFetcher] 获取成功: rows=82, elapsed=1.27s, market=美股
[NODE] [StockAnalysis Log] 2026-04-23 22:50:31 INFO data_provider.fmp_fetcher [FMP] 获取美股 AAPL 实时行情成功: price=274.0
[NODE] [StockAnalysis Log] 2026-04-23 22:50:31 INFO data_provider.base [FmpFetcher] 开始获取 AAPL 日线数据: 范围=2025-12-24 ~ 2026-04-23
[NODE] [StockAnalysis Log] 2026-04-23 22:50:32 INFO data_provider.base [FmpFetcher] AAPL 获取成功: 范围=2025-12-24 ~ 2026-04-23, rows=82, elapsed=0.65s
[NODE] [StockAnalysis Log] 2026-04-23 22:50:36 INFO data_provider.yfinance_fetcher [Yfinance] 获取美股 AAPL 实时行情成功: 价格=274.0
[NODE] [StockAnalysis Log] 2026-04-23 22:50:36 INFO data_provider.base [YfinanceFetcher] 开始获取 AAPL 日线数据: 范围=2025-12-24 ~ 2026-04-23
[NODE] [StockAnalysis Log] 2026-04-23 22:50:36 INFO data_provider.base [源探测|美股] AAPL FmpFetcher=OK(2.87s) YfinanceFetcher=OK(7.79s) → 选用=FmpFetcher
[NODE] [StockAnalysis Log] 2026-04-23 22:50:36 INFO src.agent.runner Early stop triggered at step 1 reason=reached_fast_path_step_limit confidence=0.800 gain=0.700
[NODE] [StockAnalysis Log] 22:50:36 - LiteLLM:INFO: utils.py:3995 -
[NODE] [StockAnalysis Log] LiteLLM completion() model= deepseek-v3; provider = openai
[NODE] [StockAnalysis Log] 2026-04-23 22:50:36 INFO LiteLLM
[NODE] [StockAnalysis Log] LiteLLM completion() model= deepseek-v3; provider = openai
[NODE] [StockAnalysis Log] 2026-04-23 22:50:38 INFO data_provider.base [YfinanceFetcher] AAPL 获取成功: 范围=2025-12-24 ~ 2026-04-23, rows=81, elapsed=1.46s
[NODE] [agent:chat:timing] tools_parallel_wait_s=45.030 total_s=50.510 sessionId=e6b2f34c-46e9-4050-a438-77e6fa66cdad
[NODE] [agent:chat] Promise.allSettled completed: ✅ SEARCH, ✅ ANALYSIS
[NODE] [agent:chat:html] Starting REAL-PARALLEL HTML generation (queryType=investment-analysis, mode=roundtable), contextString length=12916
[NODE] [AI chatStream] model=deepseek-v3, max_tokens=8192, messages=2, inputLen=23366
[NODE] [agent:chat] Roundtable mode: skipping Phase 1 LLM synthesis (saves ~10-20s); consensus + deep-research will consume raw contextString directly (12916 chars)
[NODE] [agent:chat] roundtable consensus: analystIds=fundamental_specialist,valuation_specialist,macro_specialist,risk_specialist,allocation_specialist task_len=13342
[NODE] [Consensus] roster resolved: count=5 ids=fundamental_specialist,valuation_specialist,macro_specialist,risk_specialist,allocation_specialist
[NODE] [Consensus] Step 1: Creating group (mode=consensus)...
[AEGEAN] INFO:     127.0.0.1:51570 - "POST /api/v1/groups HTTP/1.1" 307 Temporary Redirect
[NODE] [StockAnalysis Timing] total_s=45.091 first_stdout_s=13.284 first_stderr_s=12.562 stdout_chunks=138 stdout_bytes=17174 stderr_chunks=43 stderr_bytes=5703 provider_list_logs=0 provider_list_suppressed=0 agent_rounds=2 agent_rounds_source=done.totalSteps exit_code=0
[NODE] [StockAnalysis Timing] tool_breakdown_top=get_realtime_quote:total=7.8s,calls=1 | get_daily_history:total=1.27s,calls=1  
[AEGEAN] INFO:     127.0.0.1:51574 - "POST /api/v1/groups/ HTTP/1.1" 201 Created
[NODE] [Consensus] Step 1 ✅ Group created: group-d77ada01
[NODE] [Consensus] Step 2: Adding 5 agents...
[AEGEAN] INFO:     127.0.0.1:51570 - "POST /api/v1/groups/group-d77ada01/members HTTP/1.1" 201 Created
[AEGEAN] INFO:     127.0.0.1:51574 - "POST /api/v1/groups/group-d77ada01/members HTTP/1.1" 201 Created
[AEGEAN] INFO:     127.0.0.1:51570 - "POST /api/v1/groups/group-d77ada01/members HTTP/1.1" 201 Created
[AEGEAN] INFO:     127.0.0.1:51574 - "POST /api/v1/groups/group-d77ada01/members HTTP/1.1" 201 Created
[AEGEAN] INFO:     127.0.0.1:51570 - "POST /api/v1/groups/group-d77ada01/members HTTP/1.1" 201 Created
[NODE] [Consensus] Step 3: Posting user message...
[AEGEAN] INFO:     127.0.0.1:51574 - "POST /api/v1/groups/group-d77ada01/messages HTTP/1.1" 201 Created
[NODE] [Consensus] Step 4: Executing consensus (threshold=0.6)...
[AEGEAN] 2026-04-23 22:50:54,783 INFO aegean.core.coordinator - Starting consensus 3f40ba8f-50c5-41d7-8a5f-583c55d6f106 for task: You are a senior investment analyst. Based on the ...
[AEGEAN] 2026-04-23 22:50:54,783 INFO aegean.core.coordinator - Leader elected: fundamental_specialist
[AEGEAN] 2026-04-23 22:50:54,784 INFO aegean.main - [llm] \u25b6 fundamental_specialist (deepseek-v3) complete() prompt_len=14109 sys_prompt=yes timeout=60.0s attempt=1
[AEGEAN] 2026-04-23 22:50:54,784 INFO aegean.main - [llm] \u25b6 valuation_specialist (deepseek-v3) complete() prompt_len=14109 sys_prompt=yes timeout=60.0s attempt=1
[AEGEAN] 2026-04-23 22:50:54,784 INFO aegean.main - [llm] \u25b6 macro_specialist (deepseek-v3) complete() prompt_len=14109 sys_prompt=yes timeout=60.0s attempt=1
[AEGEAN] 2026-04-23 22:50:54,784 INFO aegean.main - [llm] \u25b6 risk_specialist (deepseek-v3) complete() prompt_len=14109 sys_prompt=yes timeout=60.0s attempt=1
[AEGEAN] 2026-04-23 22:50:54,784 INFO aegean.main - [llm] \u25b6 allocation_specialist (deepseek-v3) complete() prompt_len=14109 sys_prompt=yes timeout=60.0s attempt=1
[NODE] [AI chatStream] Response OK, status=200
[AEGEAN] 2026-04-23 22:51:03,330 INFO httpx - HTTP Request: POST https://api.lingyaai.cn/v1/chat/completions "HTTP/1.1 200 OK"
[AEGEAN] 2026-04-23 22:51:03,337 INFO aegean.main - [llm] \u2713 risk_specialist (deepseek-v3) elapsed=8.55s answer_len=346     
[AEGEAN] 2026-04-23 22:51:03,634 INFO httpx - HTTP Request: POST https://api.lingyaai.cn/v1/chat/completions "HTTP/1.1 200 OK"
[AEGEAN] 2026-04-23 22:51:03,634 INFO aegean.main - [llm] \u2713 valuation_specialist (deepseek-v3) elapsed=8.85s answer_len=410
[AEGEAN] 2026-04-23 22:51:03,634 INFO aegean.core.coordinator - Quorum reached, cancelling 3 slow agents
[AEGEAN] 2026-04-23 22:51:03,636 INFO aegean.core.coordinator - Collected 2 initial solutions (quorum: 2)
[AEGEAN] 2026-04-23 22:51:03,636 INFO aegean.core.coordinator - Starting refinement round 1
[AEGEAN] 2026-04-23 22:51:03,636 INFO aegean.core.coordinator - Starting refinement round 2
[AEGEAN] 2026-04-23 22:51:03,636 INFO aegean.core.coordinator - Candidate: SIGNAL: bullish
[AEGEAN] CONFIDENCE: 0.75
[AEGEAN] KEY_EVIDENCE:
[AEGEAN] - ��������ֶ�ͷ���У�MA5 > MA10 > MA20�����Ҽ۸��ȶ���MA5�Ϸ�
[AEGEAN] - ������Ȥ������4/17�ɽ�������46%��
[AEGEAN] - �ؼ�֧��λ��ȷ��MA5 ~$271.3��MA10 ~$266.5��
[AEGEAN] RATIONALE: ��ǰ���ƺͳɽ���֧�ֿ��ǹ۵㣬���辯������ʹ��ߣ���ǰ�۸�$274�ѽӽ�5%������ֵ��������ȴ��ص���MA5��MA10ʱ�������֣��ϸ�����ֹ����MA    A20�·���
[AEGEAN] WOULD_CHANGE_MY_MIND: ���۸����MA20��$260.5��������ش���߻�������Ʊ�����Ԥ�ڡ���Ե���η�����������
[AEGEAN]
[AEGEAN] ��ע���������ڹ������ݣ�������Ͷ�ʽ��飩 (stability: 1/1)
[AEGEAN] 2026-04-23 22:51:03,637 INFO aegean.core.coordinator - Consensus reached after 2 rounds
[AEGEAN] 2026-04-23 22:51:03,637 INFO aegean.core.coordinator - Consensus completed: success=True, rounds=2, time=8.85s
[AEGEAN] INFO:     127.0.0.1:51570 - "POST /api/v1/groups/group-d77ada01/consensus HTTP/1.1" 201 Created
[NODE] [Consensus] Step 4 ✅ Consensus finished
[NODE] [agent:chat] Starting Deep Research second pass, prompt length: 26140
[NODE] [AI chatStream] model=claude-sonnet-4-6, max_tokens=8192, messages=2, inputLen=31805
[NODE] [AI chatStream] ERROR 502: <html>
[NODE] <head><title>502 Bad Gateway</title></head>
[NODE] <body>
[NODE] <center><h1>502 Bad Gateway</h1></center>
[NODE] <hr><center>openresty</center>
[NODE] </body>
[NODE] </html>
[NODE]
[NODE] [agent:chat:timing] roundtable_total_s=14.710 total_s=65.247 sessionId=e6b2f34c-46e9-4050-a438-77e6fa66cdad
[NODE] [agent:chat:html] ❌ Parallel HTML generation failed: terminated
[NODE] [agent:chat:sources] stream_done_sources_count=17 sessionId=e6b2f34c-46e9-4050-a438-77e6fa66cdad
[NODE] [agent:chat:html] Awaiting REAL-PARALLEL HTML result (started 14.723s ago)
[NODE] [agent:chat:html] ⚠️ Parallel HTML empty/short, falling back to sequential
[NODE] [agent:chat:html] Starting SEQUENTIAL fallback HTML generation (roundtable), input length=203
[NODE] [AI chatStream] model=deepseek-v3, max_tokens=8192, messages=2, inputLen=10146
[NODE] [AI chatStream] ERROR 502: <html>
[NODE] <head><title>502 Bad Gateway</title></head>
[NODE] <body>
[NODE] <center><h1>502 Bad Gateway</h1></center>
[NODE] <hr><center>openresty</center>
[NODE] </body>
[NODE] </html>
[NODE]
[NODE] [agent:chat:timing] html_emit_s=0.603 total_s=65.860 sessionId=e6b2f34c-46e9-4050-a438-77e6fa66cdad mode=roundtable      
[NODE] [agent:chat:timing] synthesizer_total_s=15.323 end_to_end_s=65.860 ui_duration_s=60 sessionId=e6b2f34c-46e9-4050-a438-77e6fa66cdad
[NODE] [agent:chat:html] ❌ Sequential fallback HTML failed (roundtable): AI API error (502): <html>
[NODE] <head><title>502 Bad Gateway</title></head>
[NODE] <body>
[NODE] <center><h1>502 Bad Gateway</h1></center>
[NODE] <hr><center>openresty</center>
[NODE] </body>
[NODE] </html>
[NODE]