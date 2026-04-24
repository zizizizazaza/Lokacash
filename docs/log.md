[NODE] [StockAnalysis] Cleaned up buffer for session 59512ad0-dda2-4b05-86d8-b2daf3bcee3f:analysis
[NODE] [agent:chat] {
[NODE]   sessionId: '2d51fa6e-c2e3-4094-bc81-2685964f45ac',
[NODE]   contentPreview: '帮我分析博世科股票',
[NODE]   images: 0
[NODE] }
[NODE] [evaluateRouting] Orchestrator Plan (primary): {
[NODE]   "isSimpleChat": false,
[NODE]   "queryType": "investment-analysis",
[NODE]   "capabilities": {
[NODE]     "analysis": {
[NODE]       "needed": true,
[NODE]       "tickers": [
[NODE]         "博世科"
[NODE]       ]
[NODE]     },
[NODE]     "search": {
[NODE]       "needed": true,
[NODE]       "query": "博世科 stock analysis",
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
[NODE] [agent:chat:timing] routing_s=4.559 total_s=4.560 sessionId=2d51fa6e-c2e3-4094-bc81-2685964f45ac digest_len=0 
[NODE] [agent:chat] Auto→fast (preferred) user=cmmn8oiqb022f0dky01c0ls1p remaining=486 queryType=investment-analysis
[NODE] [researchService] Starting deep research on: "博世科 stock analysis"
[NODE] [StockAnalysis] Starting stream analysis for: "Analyze: 博世科..."
[NODE] [StockAnalysis] Search config: tavily=true bocha=true serpapi=false searxPublic=false searxSelfHosted=0 disableSearxng=true disableSerpapi=true forceHeadless=false
[NODE] [agent:chat:timing] tool_dispatch_s=2.152 total_s=6.851 sessionId=2d51fa6e-c2e3-4094-bc81-2685964f45ac tools=2
[NODE] [researchService:inner] [TIMING] stage=main.preflight.config_load elapsed_s=0.005
[NODE] [researchService:inner] [TIMING] stage=main.preflight.bird_setup elapsed_s=0.000 first_run=True
[NODE] [researchService:inner] [TIMING] stage=main.preflight.x_source elapsed_s=0.140 source=bird method=env
[NODE] [researchService:inner] [TIMING] stage=main.preflight.capabilities_basic elapsed_s=0.129 youtube=False tiktok=True instagram=True bluesky=False truthsocial=False
[NODE] [researchService:inner] [TIMING] stage=main.preflight.available_sources elapsed_s=0.000 available=all
[NODE] [researchService:inner] [TIMING] stage=main.preflight.route_and_dates elapsed_s=0.001 query_type=breaking_news search=web|x
[NODE] [researchService:plan] [SourcePlan] query_type=breaking_news mode=x-web reddit_source=scrapecreators x_source=bird web_backend=exa scrapecreators=yes
[NODE] [researchService:plan] [SourcePlan] enabled reddit=False x=True web=True youtube=False(disabled_by_search_flag) tiktok=False(disabled_by_search_flag) instagram=False(disabled_by_search_flag) xiaohongshu=False(disabled_by_search_flag) bluesky=False(disabled_by_search_flag) truthsocial=False(disabled_by_search_flag) polymarket=False(disabled_by_search_flag)
[NODE] [researchService:bird] [Bird] Searching: 博世科 stock analysis since:2026-03-25
[NODE] [researchService:inner] [TIMING] stage=run_research.submit_futures elapsed_s=0.002 workers=3 do_reddit=False do_x=True run_youtube=False run_tiktok=False run_instagram=False run_xiaohongshu=False do_hackernews=False do_bluesky=False do_truthsocial=False do_polymarket=False web_backend=exa
[NODE] [researchService:web] [WebSearch] plan backend=exa depth=quick from=2026-03-25 to=2026-04-24 topic="博世科 stock analysis"
[NODE] [researchService:web] [Exa] request depth=quick num_results=12 max_chars=1000 from=2026-03-25 to=2026-04-24 topic="博世科 stock analysis"
[NODE] [researchService:web] [Exa] done elapsed_s=1.827 raw_results=12 normalized_results=12
[NODE] [researchService:web] [WebSearch] done backend=exa elapsed_s=1.827 results=12
[NODE] [researchService:bird] [Bird] 0 results for '博世科 stock analysis', retrying with '博世科 stock'
[NODE] [researchService:bird] [Bird] 0 results for '博世科 stock analysis', retrying with strongest token 'analysis'
[NODE] [researchService:bird] [BirdRaw] shape=list len=12
[NODE] [researchService:bird] [BirdRaw] first_item_keys=['id', 'text', 'createdAt', 'replyCount', 'retweetCount', 'likeCount', 'conversationId', 'inReplyToStatusId', 'author', 'authorId']
[NODE] [researchService:bird] [BirdPreview] normalized_items=12 showing_first=5
[NODE] [researchService:bird] [BirdPreview] [1] @Readyandwill date=2026-04-24 id=X1
[NODE] [researchService:bird] [BirdPreview] [1] url=https://x.com/Readyandwill/status/2047505626738180096
[NODE] [researchService:bird] [BirdPreview] [1] text='@JJWatt Great analysis.  What makes you a HOF.'
[NODE] [researchService:bird] [BirdPreview] [2] @aleahwarren_ date=2026-04-24 id=X2
[NODE] [researchService:bird] [BirdPreview] [2] url=https://x.com/aleahwarren_/status/2047505618148512154
[NODE] [researchService:bird] [BirdPreview] [2] text='If you currently hold any of the following stocks:  $DHR  $BITF $HUT $BTBT $HIVE  👇 @ShaleyKidwellTV 👆 He recommends 3-5 potential stocks daily. You should def...'
[NODE] [researchService:bird] [BirdPreview] [3] @4nitrogencookie date=2026-04-24 id=X3
[NODE] [researchService:bird] [BirdPreview] [3] url=https://x.com/4nitrogencookie/status/2047505614147137945
[NODE] [researchService:bird] [BirdPreview] [3] text='Can I say how much I love this analysis system???? Its giving Ace Attorney vibesss https://t.co/gvFk8IT91c'
[NODE] [researchService:bird] [BirdPreview] [4] @86slomo date=2026-04-24 id=X4
[NODE] [researchService:bird] [BirdPreview] [4] url=https://x.com/86slomo/status/2047505611374637111
[NODE] [researchService:bird] [BirdPreview] [4] text='If you currently hold any of the following stocks:  $ISRG  $IBIT $ARKB $BITO $IBOT  👇 @ShaleyKidwellTV 👆 He recommends 3-5 potential stocks daily. You should d...'
[NODE] [researchService:bird] [BirdPreview] [5] @grok date=2026-04-24 id=X5
[NODE] [researchService:bird] [BirdPreview] [5] url=https://x.com/grok/status/2047505609688301996
[NODE] [researchService:bird] [BirdPreview] [5] text='Yes, scientific studies (including reviews of 17+ papers on semen analysis) consistently show that longer abstinence increases ejaculate volume.   After 1 mont...'
[NODE] [researchService:x] [XDiag] source=bird topic='博世科 stock analysis' items=12 error=none bird_raw_list_len=12
[NODE] [researchService:inner] [TIMING] stage=run_research.wait_x elapsed_s=5.994 count=12 timeout_s=75
[NODE] [researchService:inner] [TIMING] stage=run_research.wait_web elapsed_s=0.000 count=12 timeout_s=75
[NODE] [researchService:inner] [TIMING] stage=run_research.top_stages elapsed_s=5.997 top=wait_x:5.994s, submit_futures:0.002s, wait_web:0.000s
[NODE] [researchService:inner] [TIMING] stage=run_research.total elapsed_s=5.997 topic=博世科 stock analysis depth=quick
[NODE] [researchService:inner] [TIMING] stage=main.run_research elapsed_s=5.997 reddit=0 x=12 youtube=0 tiktok=0 instagram=0 hn=0 bluesky=0 truthsocial=0 polymarket=0 web=12
[NODE] [researchService:inner] [TIMING] stage=main.processing elapsed_s=0.005 deduped_total=12
[NODE] [researchService:inner] [TIMING] stage=main.write_outputs elapsed_s=0.008
[NODE] [researchService:inner] [TIMING] stage=main.output_result elapsed_s=0.000 emit=compact
[NODE] [researchService:inner] [TIMING] stage=main.total elapsed_s=7.476 topic=博世科 stock analysis depth=quick     
[NODE] [researchService:timing] python_run_s=8.776 total_s=8.778 topic="博世科 stock analysis"
[NODE] [researchService:timing] python_run_breakdown tag=close topic="博世科 stock analysis" spawn_boot_s=0.111 first_output_s=2.042 first_stdout_s=8.616 first_stderr_s=2.042 stream_window_s=6.574 quiet_tail_s=0.051 stdout_chunks=1 stdout_bytes=7852 stderr_chunks=15 stderr_bytes=7333 stderr_lines=68
[NODE] [researchService:timing] parse_output_s=0.003 total_s=8.781 topic="博世科 stock analysis" sources=12 stdout_len=5126
[NODE] [researchService:sources] extraction_preview=finance.sina.com.cn|博世科A股股东户数减少1245户降幅6.51%,流通A股 户均持股2.86万股增幅6.97%,户均持股市值14.14万元增|https://finance.sina.com.cn/stock/aiassist/gdhs/2026-04-23/doc-inhvnxny5344063.shtml || finance.sina.com.cn|博苑股份2026年一季报解读:经营现金流大增110.53% 研发费用同比降20.31%|https://finance.sina.com.cn/stock/aigc/stockfs/2026-04-24/doc-inhvpkaq4800364.shtml || finance.sina.com.cn|北京博科测试系统股份有限公司2025年年度报告摘要_新浪财经_新浪网|https://finance.sina.com.cn/roll/2026-04-21/doc-inhvfcps7134459.shtml   
[NODE] [researchService:timing] finalize_summary_s=0.001 total_s=8.782 topic="博世科 stock analysis" final_len=5122  
[NODE] [sources] rawStdout length: 5126, has URLs: 13
[NODE] [sources] compact extraction: 12 sources, snippets: 0
[NODE] [sources] final extraction: raw_count=12 preferred_count=6 unique_domains=3 domains=finance.sina.com.cn,sc.stock.cnfol.com,36kr.com
[NODE] [sources] final extraction preview: finance.sina.com.cn|博世科A股股东户数减少1245户降幅6.51%,流通A股户均持股2.86万股增幅6.97%,户均持股市值14.14万元增|https://finance.sina.com.cn/stock/aiassist/gdhs/2026-04-23/doc-inhvnxny5344063.shtml || finance.sina.com.cn|博苑股份2026年一季报解读:经营现金流大增110.53% 研发费用同比降20.31%|https://finance.sina.com.cn/stock/aigc/stockfs/2026-04-24/doc-inhvpkaq4800364.shtml || finance.sina.com.cn|北京博科测试系统股份有限公司2025年年度报告摘要_新浪财经_新浪网|https://finance.sina.com.cn/roll/2026-04-21/doc-inhvfcps7134459.shtml
[NODE] [PriceService] Updated 32 token prices from CoinGecko
[NODE] [StockAnalysis Log] 2026-04-24 10:39:37 INFO src.agent.factory [AgentFactory] ToolRegistry cached (18 tools)
[NODE] [StockAnalysis Log] 2026-04-24 10:39:37 INFO src.agent.skills.base Loaded 11 built-in skills from E:\D\BlockChain\Hetu\lokacash\server\tools\stock-analysis\strategies
[NODE] [StockAnalysis Log] 2026-04-24 10:39:37 INFO src.agent.factory [AgentFactory] SkillManager prototype cached (11 skills)
[NODE] [StockAnalysis Log] 2026-04-24 10:39:37 INFO src.agent.skills.base Activated skills: ['bull_trend']
[NODE] [StockAnalysis Log] 2026-04-24 10:39:37 INFO src.agent.factory [AgentFactory] Activated skills: ['bull_trend']
[NODE] [StockAnalysis Log] 2026-04-24 10:39:37 INFO src.agent.factory [AgentFactory] Resolved skill prompt state: skills=['bull_trend'] (arch=single, explicit=False, legacy_default_prompt=True)
[NODE] [StockAnalysis Log] Provider List: https://docs.litellm.ai/docs/providers
[NODE] [StockAnalysis Log] Provider List: https://docs.litellm.ai/docs/providers
[NODE] [StockAnalysis Log] Provider List: https://docs.litellm.ai/docs/providers
[NODE] [StockAnalysis Log] Provider List: https://docs.litellm.ai/docs/providers
[NODE] [StockAnalysis Log] 2026-04-24 10:39:37 INFO src.agent.llm_adapter Agent LLM: litellm initialized (model=openai/deepseek-v3)
[NODE] [StockAnalysis Log] 2026-04-24 10:39:38 INFO src.agent.conversation Created new conversation session: 2d51fa6e-c2e3-4094-bc81-2685964f45ac:analysis_analysis_1776998359514
[NODE] [StockAnalysis Log] 2026-04-24 10:39:38 INFO src.storage 数据库初始化完成: sqlite:///E:\D\BlockChain\Hetu\lokacash\server\tools\stock-analysis\data\stock_analysis.db
[NODE] [StockAnalysis Log] 2026-04-24 10:39:38 INFO src.agent.runner Agent step 1/2
[NODE] [StockAnalysis Log] 10:39:38 - LiteLLM:INFO: utils.py:3995 -
[NODE] [StockAnalysis Log] LiteLLM completion() model= deepseek-v3; provider = openai
[NODE] [StockAnalysis Log] 2026-04-24 10:39:38 INFO LiteLLM
[NODE] [StockAnalysis Log] LiteLLM completion() model= deepseek-v3; provider = openai
[NODE] [StockAnalysis Log] 2026-04-24 10:39:42 INFO src.agent.runner [DEBUG] LLM response: tool_calls=2, content_len=0, provider=openai, model=openai/deepseek-v3, tools_sent=18
[NODE] [StockAnalysis Log] 2026-04-24 10:39:42 INFO src.agent.runner [DEBUG] Tool calls: ['get_realtime_quote', 'get_daily_history']
[NODE] [StockAnalysis Log] 2026-04-24 10:39:42 INFO src.agent.runner Agent requesting 2 tool call(s): ['get_realtime_quote', 'get_daily_history']
[NODE] [StockAnalysis Log] 2026-04-24 10:39:42 INFO data_provider.base TushareFetcher disabled by ENABLE_TUSHARE_FETCHER=false
[NODE] [StockAnalysis Log] 2026-04-24 10:39:42 INFO data_provider.base PytdxFetcher disabled by ENABLE_PYTDX_FETCHER=false
[NODE] [StockAnalysis Log] 2026-04-24 10:39:42 INFO data_provider.base 已初始化 6 个数据源（按优先级）: EfinanceFetcher(P0), AkshareFetcher(P1), BaostockFetcher(P3), FmpFetcher(P3), YfinanceFetcher(P4), LongbridgeFetcher(P5)
[NODE] [StockAnalysis Log] 2026-04-24 10:39:42 INFO data_provider.base [数据源能力] EfinanceFetcher=免费 | AkshareFetcher=免费 | BaostockFetcher=免费 | FmpFetcher=配置 | YfinanceFetcher=免费 | LongbridgeFetcher=可用
[NODE] [StockAnalysis Log] 2026-04-24 10:39:42 INFO data_provider.akshare_fetcher [API调用] 腾讯财经接口获取 300422  实时行情: endpoint=qt.gtimg.cn/q, symbol=sz300422
[NODE] [StockAnalysis Log] 2026-04-24 10:39:42 INFO data_provider.base [数据源并发尝试 1/6] [EfinanceFetcher] 获取 300422...
[NODE] [StockAnalysis Log] 2026-04-24 10:39:42 INFO data_provider.base [数据源并发尝试 2/6] [AkshareFetcher] 获取 300422...
[NODE] [StockAnalysis Log] 2026-04-24 10:39:42 INFO data_provider.base [数据源并发尝试 3/6] [BaostockFetcher] 获取 300422...
[NODE] [StockAnalysis Log] 2026-04-24 10:39:42 INFO data_provider.base [BaostockFetcher] 开始获取 300422 日线数据: 范围=2025-12-25 ~ 2026-04-24
[NODE] [StockAnalysis Log] 2026-04-24 10:39:42 INFO data_provider.base [数据源并发尝试 4/6] [FmpFetcher] 获取 300422...
[NODE] [StockAnalysis Log] 2026-04-24 10:39:42 INFO data_provider.base [FmpFetcher] 开始获取 300422 日线数据: 范围=2025-12-25 ~ 2026-04-24
[NODE] [StockAnalysis Log] 2026-04-24 10:39:42 ERROR data_provider.base [FmpFetcher] 300422 获取失败: 范围=2025-12-25 ~ 2026-04-24, error_type=DataFetchError, elapsed=0.00s, reason=[FMP] 仅支持美股，跳过 300422
[NODE] [StockAnalysis Log] 2026-04-24 10:39:42 INFO data_provider.base [数据源并发尝试 5/6] [YfinanceFetcher] 获取 300422...
[NODE] [StockAnalysis Log] 2026-04-24 10:39:42 WARNING data_provider.base [数据源失败] [FmpFetcher] 300422: (DataFetchError) [FmpFetcher] 300422: [FMP] 仅支持美股，跳过 300422
[NODE] [StockAnalysis Log] 2026-04-24 10:39:42 INFO data_provider.base [数据源并发尝试 6/6] [LongbridgeFetcher] 获取 300422...
[NODE] [StockAnalysis Log] 2026-04-24 10:39:42 INFO data_provider.base [YfinanceFetcher] 开始获取 300422 日线数据: 范围=2025-12-25 ~ 2026-04-24
[NODE] [StockAnalysis Log] 2026-04-24 10:39:42 INFO data_provider.base [LongbridgeFetcher] 开始获取 300422 日线数据: 范围=2025-12-25 ~ 2026-04-24
[NODE] [StockAnalysis Log] 2026-04-24 10:39:42 ERROR data_provider.base [LongbridgeFetcher] 300422 获取失败: 范围=2025-12-25 ~ 2026-04-24, error_type=ValueError, elapsed=0.00s, reason=Cannot convert 300422 to Longbridge symbol        
[NODE] [StockAnalysis Log] 2026-04-24 10:39:42 WARNING data_provider.base [数据源失败] [LongbridgeFetcher] 300422: (ValueError) [LongbridgeFetcher] 300422: Cannot convert 300422 to Longbridge symbol
[NODE] [StockAnalysis Log] 2026-04-24 10:39:43 INFO data_provider.efinance_fetcher [缓存未命中] 触发全量刷新 实时行情(efinance)
[NODE] [StockAnalysis Log] login success!
[NODE] [StockAnalysis Log] logout success!
[NODE] [StockAnalysis Log] 2026-04-24 10:39:44 INFO data_provider.base [BaostockFetcher] 300422 获取成功: 范围=2025-12-25 ~ 2026-04-24, rows=77, elapsed=1.36s
[NODE] [StockAnalysis Log] 2026-04-24 10:39:44 INFO data_provider.base [数据源完成] 300422 使用 [BaostockFetcher] 获 取成功: rows=77, elapsed=1.37s, market=A股
[NODE] [StockAnalysis Log] 2026-04-24 10:39:45 INFO data_provider.akshare_fetcher [实时行情-腾讯] 300422 博世科: endpoint=qt.gtimg.cn/q, 价格=5.56, 涨跌=20.09%, 量比=12.94, 换手率=5.19%, elapsed=2.69s
[NODE] [StockAnalysis Log] 2026-04-24 10:39:45 INFO data_provider.akshare_fetcher [API调用] 新浪财经接口获取 300422  实时行情: endpoint=hq.sinajs.cn/list, symbol=sz300422
[NODE] [StockAnalysis Log] 2026-04-24 10:39:45 INFO data_provider.efinance_fetcher [API调用] ef.stock.get_realtime_quotes() 获取实时行情...
[NODE] [StockAnalysis Log] 2026-04-24 10:39:46 INFO data_provider.base [YfinanceFetcher] 300422 获取成功: 范围=2025-12-25 ~ 2026-04-24, rows=77, elapsed=4.01s
[NODE] [StockAnalysis Log] 2026-04-24 10:39:48 INFO data_provider.base [源探测|CN] 300422 tencent=OK(2.69s) efinance=SKIP(skipped:主源已成功,超过grace) akshare_sina=SKIP(skipped:主源已成功,超过grace) → 选用=tencent
[NODE] [StockAnalysis Log] 2026-04-24 10:39:48 INFO src.agent.runner Early stop triggered at step 1 reason=reached_fast_path_step_limit confidence=0.800 gain=0.700
[NODE] [StockAnalysis Log] 10:39:48 - LiteLLM:INFO: utils.py:3995 -
[NODE] [StockAnalysis Log] LiteLLM completion() model= deepseek-v3; provider = openai
[NODE] [StockAnalysis Log] 2026-04-24 10:39:48 INFO LiteLLM
[NODE] [StockAnalysis Log] LiteLLM completion() model= deepseek-v3; provider = openai
[NODE] [StockAnalysis Log] 2026-04-24 10:39:50 INFO data_provider.akshare_fetcher [实时行情-新浪] 300422 博世科: endpoint=hq.sinajs.cn/list, 价格=5.56, 涨跌=20.08639308855291, 成交量=26831012, elapsed=5.04s
[NODE] [StockAnalysis Log] 2026-04-24 10:39:50 INFO data_provider.base [AkshareFetcher] 开始获取 300422 日线数据: 范 围=2025-12-25 ~ 2026-04-24
[NODE] [StockAnalysis Log] 2026-04-24 10:39:50 INFO data_provider.akshare_fetcher [数据源] 尝试使用 东方财富 获取 300422...
[NODE] [StockAnalysis Log] 2026-04-24 10:39:54 INFO data_provider.akshare_fetcher [API调用] ak.stock_zh_a_hist(symbol=300422, ...)
[NODE] [StockAnalysis Log] 2026-04-24 10:39:57 INFO data_provider.akshare_fetcher [API返回] ak.stock_zh_a_hist 成功: 78 行, 耗时 3.46s
[NODE] [StockAnalysis Log] 2026-04-24 10:39:57 INFO data_provider.akshare_fetcher [数据源] 东方财富 获取成功
[NODE] [StockAnalysis Log] 2026-04-24 10:39:57 INFO data_provider.base [AkshareFetcher] 300422 获取成功: 范围=2025-12-25 ~ 2026-04-24, rows=78, elapsed=7.42s
[NODE] [StockAnalysis Log] 2026-04-24 10:40:01 INFO data_provider.efinance_fetcher [API错误] 获取 300422 实时行情(efinance)失败: HTTPConnectionPool(host='push2.eastmoney.com', port=80): Max retries exceeded with url: /api/qt/clist/get?pn=38&pz=100&po=1&np=1&fltt=2&invt=2&fid=f12&fs=m%3A0+t%3A6%2Cm%3A0+t%3A80%2Cm%3A1+t%3A2%2Cm%3A1+t%3A23%2Cm%3A0+t%3A81+s%3A2048&fields=f12%2Cf14%2Cf3%2Cf2%2Cf15%2Cf16%2Cf17%2Cf4%2Cf8%2Cf10%2Cf9%2Cf5%2Cf6%2Cf18%2Cf20%2Cf21%2Cf13%2Cf124%2Cf297 (Caused by ProtocolError('Connection aborted.', RemoteDisconnected('Remote end closed connection without response')))
[NODE] [StockAnalysis Log] 2026-04-24 10:40:01 INFO data_provider.base [EfinanceFetcher] 开始获取 300422 日线数据: 范围=2025-12-25 ~ 2026-04-24
[NODE] [StockAnalysis Log] 2026-04-24 10:40:02 INFO data_provider.efinance_fetcher [API调用] ef.stock.get_quote_history(stock_codes=300422, beg=20251225, end=20260424, klt=101, fqt=1)
[NODE] [StockAnalysis Log] 2026-04-24 10:40:05 INFO data_provider.efinance_fetcher [API返回] Eastmoney 历史K线成功: endpoint=push2his.eastmoney.com/api/qt/stock/kline/get, stock_code=300422, range=20251225~20260424, rows=78, elapsed=2.11s
[NODE] [StockAnalysis Log] 2026-04-24 10:40:05 INFO data_provider.efinance_fetcher [API返回] 列名: ['股票名称', '股票代码', '日期', '开盘', '收盘', '最高', '最低', '成交量', '成交额', '振幅', '涨跌幅', '涨跌额', '换手率']
[NODE] [StockAnalysis Log] 2026-04-24 10:40:05 INFO data_provider.efinance_fetcher [API返回] 日期范围: 2025-12-25 ~ 2026-04-24
[NODE] [StockAnalysis Log] 2026-04-24 10:40:05 INFO data_provider.base [EfinanceFetcher] 300422 获取成功: 范围=2025-12-25 ~ 2026-04-24, rows=78, elapsed=3.64s
[NODE] [agent:chat:timing] tools_parallel_wait_s=45.712 total_s=52.563 sessionId=2d51fa6e-c2e3-4094-bc81-2685964f45ac
[NODE] [agent:chat] Promise.allSettled completed: ✅ SEARCH, ✅ ANALYSIS
[NODE] [agent:chat:html] Starting REAL-PARALLEL HTML generation (queryType=investment-analysis, mode=standard), contextString length=7225
[NODE] [AI chatStream] model=deepseek-v3, max_tokens=8192, messages=2, inputLen=17624
[NODE] [agent:chat] Starting synthesis stream (queryType=investment-analysis), prompt length: 16711
[NODE] [AI chatStream] model=claude-sonnet-4-6, max_tokens=8192, messages=2, inputLen=22223
[NODE] [StockAnalysis Timing] total_s=47.940 first_stdout_s=18.867 first_stderr_s=17.928 stdout_chunks=119 stdout_bytes=14640 stderr_chunks=60 stderr_bytes=9168 provider_list_logs=0 provider_list_suppressed=0 agent_rounds=2 agent_rounds_source=done.totalSteps exit_code=0
[NODE] [StockAnalysis Timing] tool_breakdown_top=get_realtime_quote:total=5.7s,calls=1 | get_daily_history:total=1.4s,calls=1
[NODE] [AI chatStream] Response OK, status=200
[NODE] [agent:chat] Synthesis stream obtained, reading...
[NODE] [AI chatStream] Response OK, status=200
[NODE] [PriceService] Updated 32 token prices from CoinGecko
[NODE] [agent:chat:html] Stream finished. chunks=428, htmlLength=6239
[NODE] [agent:chat:sources] stream_done_sources_count=6 sessionId=2d51fa6e-c2e3-4094-bc81-2685964f45ac
[NODE] [agent:chat:html] Awaiting REAL-PARALLEL HTML result (started 66.341s ago)
[NODE] [agent:chat:html] ✅ Using PARALLEL HTML result, length=15231
[NODE] [agent:chat:html] msgCount=2, msgIdx=1
[NODE] [agent:chat:html] DB updated with htmlReport
[NODE] [agent:chat:html] ✅ HTML report emitted for session 2d51fa6e-c2e3-4094-bc81-2685964f45ac, msgIdx=1, length=15231
[NODE] [agent:chat:timing] html_emit_s=0.031 total_s=118.989 sessionId=2d51fa6e-c2e3-4094-bc81-2685964f45ac mode=standard
[NODE] [agent:chat:timing] synthesizer_total_s=66.322 end_to_end_s=118.989 ui_duration_s=114 sessionId=2d51fa6e-c2e3-4094-bc81-2685964f45ac
[NODE] [PriceService] Updated 32 token prices from CoinGecko
