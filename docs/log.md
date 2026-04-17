8|LokaCash  | [agent:chat] {
8|LokaCash  |   sessionId: 'aa72e78a-144f-4797-8073-85664ce23d53',
8|LokaCash  |   contentPreview: 'rave现在代币价格是多少',
8|LokaCash  |   images: 0
8|LokaCash  | }
8|LokaCash  | [agent:chat] Dedup: skipping duplicate message for session aa72e78a-144f-4797-8073-85664ce23d53
8|LokaCash  | [evaluateRouting] Orchestrator Plan (primary): {
8|LokaCash  |   "isSimpleChat": false,
8|LokaCash  |   "queryType": "investment-analysis",
8|LokaCash  |   "capabilities": {
8|LokaCash  |     "analysis": {
8|LokaCash  |       "needed": false
8|LokaCash  |     },
8|LokaCash  |     "search": {
8|LokaCash  |       "needed": false
8|LokaCash  |     },
8|LokaCash  |     "simulate": {
8|LokaCash  |       "needed": false
8|LokaCash  |     },
8|LokaCash  |     "web3": {
8|LokaCash  |       "needed": true,
8|LokaCash  |       "query": "RAVE token current price"
8|LokaCash  |     }
8|LokaCash  |   }
8|LokaCash  | }
8|LokaCash  | [agent:chat:timing] routing_s=4.100 total_s=4.100 sessionId=aa72e78a-144f-4797-8073-85664ce23d53 digest_len=0
8|LokaCash  | [researchService] Starting deep research on: "rave现在代币价格是多少"
8|LokaCash  | [agent:chat:timing] tool_dispatch_s=0.018 total_s=4.119 sessionId=aa72e78a-144f-4797-8073-85664ce23d53 tools=2
8|LokaCash  | [researchService:inner] [TIMING] stage=main.preflight.config_load elapsed_s=0.001
8|LokaCash  | [researchService:inner] [TIMING] stage=main.preflight.bird_setup elapsed_s=0.000 first_run=True
8|LokaCash  | [researchService:inner] [TIMING] stage=main.preflight.x_source elapsed_s=0.000 source=bird method=env
8|LokaCash  | [researchService:inner] [TIMING] stage=main.preflight.capabilities_basic elapsed_s=0.000 youtube=True tiktok=True instagram=True bluesky=False truthsocial=False
8|LokaCash  | [researchService:inner] [TIMING] stage=main.preflight.available_sources elapsed_s=0.000 available=all
8|LokaCash  | [researchService:inner] [TIMING] stage=main.preflight.route_and_dates elapsed_s=0.000 query_type=breaking_news search=web|x
8|LokaCash  | [researchService:plan] [SourcePlan] query_type=breaking_news mode=x-web reddit_source=scrapecreators x_source=bird web_backend=exa scrapecreators=yes
8|LokaCash  | [researchService:plan] [SourcePlan] enabled reddit=False x=True web=True youtube=False(disabled_by_search_flag) tiktok=False(disabled_by_search_flag) instagram=False(disabled_by_search_flag) xiaohongshu=False(disabled_by_search_flag) bluesky=False(disabled_by_search_flag) truthsocial=False(disabled_by_search_flag) polymarket=False(disabled_by_search_flag)
8|LokaCash  | [researchService:bird] [Bird] Searching: rave现在代币价格是多少 since:2026-03-18
8|LokaCash  | [researchService:inner] [TIMING] stage=run_research.submit_futures elapsed_s=0.007 workers=3 do_reddit=False do_x=True run_youtube=False run_tiktok=False run_instagram=False run_xiaohongshu=False do_hackernews=False do_bluesky=False do_truthsocial=False do_polymarket=False web_backend=exa
8|LokaCash  | [researchService:web] [WebSearch] plan backend=exa depth=quick from=2026-03-18 to=2026-04-17 topic="rave现在代币价格是多少"
8|LokaCash  | [researchService:web] [Exa] request depth=quick num_results=12 max_chars=1000 from=2026-03-18 to=2026-04-17 topic="rave现在代币价格是多少"        
8|LokaCash  | [web3Research] cli non-zero exit code=1 query="rave现在代币价格是 多少 ; RAVE token current price" stderr="[web3-cli] intent=token_quote query="rave现在代币价格是多少 ; RAVE token current price""
8|LokaCash  | [web3Research] failed sessionId=aa72e78a-144f-4797-8073-85664ce23d53 err=[web3-cli] intent=token_quote query="rave现在代币价格是多少 ; RAVE token current price"
8|LokaCash  | [researchService:web] [Exa] done elapsed_s=1.358 raw_results=12 normalized_results=12
8|LokaCash  | [researchService:web] [WebSearch] done backend=exa elapsed_s=1.360 results=12
8|LokaCash  | [researchService:bird] [BirdRaw] shape=list len=12
8|LokaCash  | [researchService:bird] [BirdRaw] first_item_keys=['id', 'text', 'createdAt', 'replyCount', 'retweetCount', 'likeCount', 'conversationId', 'inReplyToStatusId', 'author', 'authorId']
8|LokaCash  | [researchService:bird] [BirdPreview] normalized_items=12 showing_first=5
8|LokaCash  | [researchService:bird] [BirdPreview] [1] @HeQinglian date=2026-04-17 id=X1
8|LokaCash  | [researchService:bird] [BirdPreview] [1] url=https://x.com/HeQinglian/status/2044939648628060576
8|LokaCash  | [researchService:bird] [BirdPreview] [1] text='@rainbow78521 湖南 等地有句乡俗老话，“生人”，就是这种表现，指老人脾气古怪，成天骂人。例如“他在生人 ，没多少日子了，不要与他计较。” 这话，可能现在湖南青年一代也不懂了。'
8|LokaCash  | [researchService:bird] [BirdPreview] [2] @vamosrafa231 date=2026-04-17 id=X2
8|LokaCash  | [researchService:bird] [BirdPreview] [2] url=https://x.com/vamosrafa231/status/2044939566642340163
8|LokaCash  | [researchService:bird] [BirdPreview] [2] text='@horobeyo @shihu114514 驱逐舰可以在几十公里外安全悠闲地舰炮射击，那么这个阶段登陆部队面临的战场威胁还需要舰炮来提供火力支援吗？或者说，登陆战打到还需要舰炮射击的程度，那说明空中火力支援和地面自身火力都是不足的，这对于现代登陆作战来说属于不及格吧'
8|LokaCash  | [researchService:bird] [BirdPreview] [3] @EmberCN date=2026-04-17 id=X3
8|LokaCash  | [researchService:bird] [BirdPreview] [3] url=https://x.com/EmberCN/status/2044939553019163057
8|LokaCash  | [researchService:bird] [BirdPreview] [3] text='SIREN 庄家这是把月 初砸盘散出去的筹码收回来、重新控盘 93% 以上的代币后，又来 "激烈的操纵" 了😂  最 近 24 小时拉涨了 185%：从上次砸到最低的 $0.13，现在又拉回到 $2.18。 https://t.co/idp6sVreAY'
8|LokaCash  | [researchService:bird] [BirdPreview] [4] @Qian000005 date=2026-04-17 id=X4
8|LokaCash  | [researchService:bird] [BirdPreview] [4] url=https://x.com/Qian000005/status/2044939258662932889
8|LokaCash  | [researchService:bird] [BirdPreview] [4] text='说句扎心的真话，牛 市最危险的时刻，从来不是暴跌砸盘，而是，所有人都在喊“冲”，所有人都觉得自己能赢，K线还在新高，情绪一致看多的时候。 你没发现吗，山寨币一天换一个热点，昨天的十倍叙事今天就凉了。 朋友圈全是翻倍截图，没人晒自己亏了多少。 新人刚进场就敢上杠杆，张口就是“这波all in能财务自由”。 大盘天天涨，你…'
8|LokaCash  | [researchService:bird] [BirdPreview] [5] @CryptoJ29 date=2026-04-17 id=X5
8|LokaCash  | [researchService:bird] [BirdPreview] [5] url=https://x.com/CryptoJ29/status/2044937422744727552
8|LokaCash  | [researchService:bird] [BirdPreview] [5] text='新的周期真的开始了 先是享受了 $RAVE 推背感 将散户将格局打开了 再是参与了 $ORDI 暴力拉升  让散户将思维打开 市场不再是主动做市商MM作恶的地方 资金正在板块之间流动 不只有meme会有更多 的协议机会出现'
8|LokaCash  | [researchService:x] [XDiag] source=bird topic='rave现在代币价格是 多少' items=12 error=none bird_raw_list_len=12
8|LokaCash  | [researchService:inner] [TIMING] stage=run_research.wait_x elapsed_s=1.461 count=12 timeout_s=75
8|LokaCash  | [researchService:inner] [TIMING] stage=run_research.wait_web elapsed_s=0.000 count=12 timeout_s=75
8|LokaCash  | [researchService:inner] [TIMING] stage=run_research.top_stages elapsed_s=1.468 top=wait_x:1.461s, submit_futures:0.007s, wait_web:0.000s
8|LokaCash  | [researchService:inner] [TIMING] stage=run_research.total elapsed_s=1.468 topic=rave现在代币价格是多少 depth=quick
8|LokaCash  | [researchService:inner] [TIMING] stage=main.run_research elapsed_s=1.468 reddit=0 x=12 youtube=0 tiktok=0 instagram=0 hn=0 bluesky=0 truthsocial=0 polymarket=0 web=12
8|LokaCash  | [researchService:inner] [TIMING] stage=main.processing elapsed_s=0.007 deduped_total=13
8|LokaCash  | [researchService:inner] [TIMING] stage=main.write_outputs elapsed_s=0.003
8|LokaCash  | [researchService:inner] [TIMING] stage=main.output_result elapsed_s=0.000 emit=compact
8|LokaCash  | [researchService:inner] [TIMING] stage=main.total elapsed_s=1.768 topic=rave现在代币价格是多少 depth=quick
8|LokaCash  | [researchService:timing] python_run_s=2.163 total_s=2.163 topic="rave现在代币价格是多少"
8|LokaCash  | [researchService:timing] python_run_breakdown tag=close topic="rave现在代币价格是多少" spawn_boot_s=0.007 first_output_s=0.332 first_stdout_s=2.102 first_stderr_s=0.332 stream_window_s=1.770 quiet_tail_s=0.055 stdout_chunks=1 stdout_bytes=7183 stderr_chunks=14 stderr_bytes=9087 stderr_lines=66
8|LokaCash  | [researchService:timing] parse_output_s=0.006 total_s=2.170 topic="rave现在代币价格是多少" sources=13 stdout_len=5415
8|LokaCash  | [researchService:sources] extraction_preview=x.com|不只有meme会有 更多的协议机会出现...|https://x.com/CryptoJ29/status/2044937422744727552 || concerts.consequence.net|United We Dance Tickets, Live at Bogart's, Cincinnati on Apr|https://concerts.consequence.net/events/united-we-dance-at-bogarts-on-2026-04-17-20-00 || chaincatcher.com|RAVE 持续拉升突破 19 美元创历史新高，近 24 小时合约爆仓额位列全网第三 - ChainCatcher|https://www.chaincatcher.com/article/2258680  
8|LokaCash  | [researchService:timing] finalize_summary_s=0.000 total_s=2.171 topic="rave现在代币价格是多少" final_len=5293
8|LokaCash  | [sources] rawStdout length: 5415, has URLs: 17
8|LokaCash  | [sources] compact extraction: 13 sources, snippets: 1
8|LokaCash  | [sources] final extraction: raw_count=13 preferred_count=13 unique_domains=10 domains=coindesk.com,x.com,concerts.consequence.net,chaincatcher.com,weex.ac,panewslab.com,weex.com,news.bitcoin.com,mexc.co,mexc.fm
8|LokaCash  | [sources] final extraction preview: coindesk.com|狂热期货清算金额 达4300万美元，位居比特币和以太坊之后第三高|https://www.coindesk.com/zh/markets/2026/04/14/rave-ranks-alongside-bitcoin-and-ether-in-the-top-three-just-not-in-the-way-you-think || coindesk.com|RAVE 在过去一周内从 0.25 美元飙升至 14 美元|http://www.coindesk.com/zh/markets/2026/04/13/this-little-known-token-just-posted-a-6-000-rally-and-traders-are-trying-to-figure-out-why || x.com|不只有meme会有更多的协议机会出现...|https://x.com/CryptoJ29/status/2044937422744727552
8|LokaCash  | [agent:chat:timing] tools_parallel_wait_s=2.159 total_s=6.279 sessionId=aa72e78a-144f-4797-8073-85664ce23d53
8|LokaCash  | [agent:chat] Promise.allSettled completed: ✅ SEARCH, ✅ WEB3     
8|LokaCash  | [agent:chat:html] Starting PARALLEL HTML generation (queryType=investment-analysis), contextString length=8020
8|LokaCash  | [AI chatStream] model=deepseek-v3, max_tokens=16384, messages=2, inputLen=28171
8|LokaCash  | [agent:chat] Starting synthesis stream (queryType=investment-analysis), prompt length: 17508
8|LokaCash  | [AI chatStream] model=claude-sonnet-4-6, max_tokens=8192, messages=2, inputLen=25021
8|LokaCash  | [AI chatStream] Response OK, status=200
8|LokaCash  | [AI chatStream] Response OK, status=200
8|LokaCash  | [agent:chat] Synthesis stream obtained, reading...