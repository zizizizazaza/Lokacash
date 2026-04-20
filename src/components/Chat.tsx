import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ResponsiveContainer, BarChart, CartesianGrid, XAxis, YAxis, Tooltip, Bar } from 'recharts';
import { Icons } from '../constants';
import { MarketAsset } from '../types';
import { api } from '../services/api';
import { AssetDetail, mapApiProject } from './Market';
import { useVoice } from '../hooks/useVoice';

// Parse [TRADE_ACTION]...[/TRADE_ACTION] blocks from AI responses
interface TradeAction {
    type: 'invest' | 'mint';
    action: 'buy' | 'sell' | 'mint' | 'redeem';
    token?: string;
    tokenSymbol?: string;
    amount: string;
    amountType?: 'token' | 'usd';
    estimatedUSD?: string;
    chain?: string;
    projectName?: string;
    unit?: string;
    apy?: string;
    term?: string;
    minInvestment?: string;
}

function stripMarkdown(text: string): string {
    return text
        .replace(/\*\*(.*?)\*\*/g, '$1')   // **bold** → bold
        .replace(/__(.*?)__/g, '$1')       // __underline__ → underline
        .replace(/^#{1,6}\s+/gm, '')       // ## heading → heading
        .replace(/\*(.*?)\*/g, '$1')       // *italic* → italic
        .replace(/`([^`]+)`/g, '$1');      // `code` → code
}

function parseTradeAction(content: string): { text: string; action: TradeAction | null } {
    const regex = /\[TRADE_ACTION\]\s*([\s\S]*?)\s*\[\/TRADE_ACTION\]/;
    const match = content.match(regex);
    if (!match) return { text: stripMarkdown(content), action: null };
    try {
        const action = JSON.parse(match[1]) as TradeAction;
        const text = stripMarkdown(content.replace(regex, '').trim());
        return { text, action };
    } catch {
        return { text: stripMarkdown(content), action: null };
    }
}

const cashFlowAssets = [
    { title: 'Draftly - 3D Web Builder', category: 'AI/SaaS', image: '/covers/draftly.png', desc: 'Build 3D websites 10× faster. $6,172/mo verified revenue. MRR $3,165. 100 active subscriptions. 85% profit margin.', progress: 78, apy: '16%', term: '240 Days', backers: 6 },
    { title: 'POST BRIDGE - Social Media', category: 'AI/Marketing', image: '/covers/postbridge.png', desc: 'Multi-platform social media publishing. $28,901/mo verified Stripe revenue. MRR $30,958. +65% MoM. 1,503 active subscriptions.', progress: 65, apy: '18.2%', term: '270 Days', backers: 8 },
    { title: 'Deeptrue - AI Translation', category: 'AI/Language', image: '/covers/deeptrue.png', desc: 'Real-time AI meeting translation. $2,022/mo verified Stripe revenue. MRR $2,001. +19% MoM. 61 subscriptions. 30+ languages.', progress: 38, apy: '20.5%', term: '120 Days', backers: 4 },
    { title: 'PxlSafe - Video Editor Tools', category: 'AI/Creator', image: '/covers/pxlsafe.png', desc: 'AI plugin suite for video editors. $6,300/mo total revenue. MRR $4,500 from 90+ subscribers. 1,600+ customers. 90% profit margin.', progress: 16, apy: '14.8%', term: '365 Days', backers: 5 },
    { title: 'Rezi - AI Resume Builder', category: 'AI/Career', image: '/covers/rezi.png', desc: 'Best AI resume builder. $271,104/mo verified Stripe revenue. MRR $290,693. +8% MoM. ~1M users annually. Listed at $15M.', progress: 98, apy: '15.5%', term: '180 Days', backers: 12 },
    { title: 'Comp AI - Compliance Automation', category: 'AI/Security', image: '/covers/compai.png', desc: 'Fastest SOC 2 & ISO 27001 compliance via AI. $482K/mo verified Stripe revenue. MRR $8,700 (subscriptions). $2M total revenue.', progress: 0, apy: '22%', term: '90 Days', backers: 0 },
];

const Chat: React.FC = () => {
    const [messages, setMessages] = useState<any[]>([]);
    const [inputText, setInputText] = useState('');
    const [activeAgent, setActiveAgent] = useState('ComputeDAO GPU');
    const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(true);
    const [activeForm, setActiveForm] = useState<'buy' | 'sell' | 'deposit' | 'withdraw' | null>(null);
    const [formAmount, setFormAmount] = useState('');
    const [formAsset, setFormAsset] = useState('AIUSD');
    const [activeAssetTab, setActiveAssetTab] = useState<'Background' | 'Financial Health' | 'Rules'>('Background');
    const [projectCardExpanded, setProjectCardExpanded] = useState(false);
    const [typedPlaceholder, setTypedPlaceholder] = useState('');
    const [isInputFocused, setIsInputFocused] = useState(false);
    const [selectedAssetName, setSelectedAssetName] = useState<string | null>(null);
    const [showActionMenu, setShowActionMenu] = useState(false);
    const [showEarningStrategy, setShowEarningStrategy] = useState(false);
    const [isStreaming, setIsStreaming] = useState(false);
    const [marketAssets, setMarketAssets] = useState<MarketAsset[]>([]);
    const [detailAsset, setDetailAsset] = useState<MarketAsset | null>(null);
    const [tradeExecuting, setTradeExecuting] = useState<Record<number, 'pending' | 'success' | 'error'>>({});
    const [conversations, setConversations] = useState<{ id: string; title: string; time: string; messageCount: number; firstMessageAt: string; lastMessageAt: string }[]>([]);
    const [activeConvId, setActiveConvId] = useState<string | null>(null);
    const [sessionId, setSessionId] = useState<string>(() => crypto.randomUUID());
    const abortControllerRef = useRef<AbortController | null>(null);
    const pendingVoiceSendRef = useRef(false);

    // Invitation code gate
    const [showInviteModal, setShowInviteModal] = useState(false);
    const [inviteCode, setInviteCode] = useState('');
    const [inviteError, setInviteError] = useState<string | null>(null);
    const [inviteChecking, setInviteChecking] = useState(false);
    const pendingMessageRef = useRef<string | null>(null);

    // Voice hook — handles ASR + TTS + voice mode
    const voice = useVoice({
        language: 'en-US',
        onTranscript: (text) => {
            setInputText(text);
        },
        onRecordingEnd: (text) => {
            if (text.trim()) {
                setInputText(text);
                pendingVoiceSendRef.current = true;
            }
        },
    });

    // Auto-send after voice recognition ends
    useEffect(() => {
        if (pendingVoiceSendRef.current && inputText.trim() && !isStreaming) {
            pendingVoiceSendRef.current = false;
            const text = inputText.trim();
            const userMsg = { role: 'user', content: text, timestamp: new Date().toLocaleTimeString() };
            setMessages(prev => [...prev, userMsg]);
            setInputText('');
            sendToAI(text);
        }
    }, [inputText]);

    useEffect(() => {
        const phrases = [
            'Invest $5,000 in ComputeDAO...',
            'Compare yields across all active pools...',
            'Show me the top performing assets...',
            'Mint 1000 AIUSD...',
            'Analyze AI Agent Marketplace risk...',
        ];
        let phraseIdx = 0;
        let charIdx = 0;
        let isDeleting = false;
        let timeout: ReturnType<typeof setTimeout>;

        const tick = () => {
            if (isInputFocused || inputText) {
                timeout = setTimeout(tick, 200);
                return;
            }
            const current = phrases[phraseIdx];
            if (!isDeleting) {
                charIdx++;
                setTypedPlaceholder(current.slice(0, charIdx));
                if (charIdx >= current.length) {
                    isDeleting = true;
                    timeout = setTimeout(tick, 2000);
                    return;
                }
                timeout = setTimeout(tick, 60 + Math.random() * 40);
            } else {
                charIdx--;
                setTypedPlaceholder(current.slice(0, charIdx));
                if (charIdx <= 0) {
                    isDeleting = false;
                    phraseIdx = (phraseIdx + 1) % phrases.length;
                    timeout = setTimeout(tick, 400);
                    return;
                }
                timeout = setTimeout(tick, 25);
            }
        };
        tick();
        return () => clearTimeout(timeout);
    }, [isInputFocused, inputText]);

    // Format conversation time label
    const formatConvTime = (iso: string) => {
        const d = new Date(iso);
        const now = new Date();
        const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
        if (diffDays === 0) return 'Today';
        if (diffDays === 1) return 'Yesterday';
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

    // Fetch conversations list
    const loadConversations = useCallback(() => {
        api.getConversations().then(setConversations).catch(() => { });
    }, []);

    // Fetch market assets for project detail view + load conversations
    useEffect(() => {
        api.getProjects().then(data => {
            if (Array.isArray(data) && data.length > 0) setMarketAssets(data.map(mapApiProject));
        }).catch(() => { });
        loadConversations();
    }, []);

    // Load a conversation's messages from API
    const loadConversation = async (conv: typeof conversations[0]) => {
        setActiveConvId(conv.id);
        setSessionId(conv.id); // reuse sessionId so new messages go into same conv
        try {
            const msgs = await api.getChatHistory(undefined, undefined, conv.id);
            setMessages(msgs.map((m: any) => ({
                role: m.role,
                content: m.content,
                timestamp: new Date(m.createdAt).toLocaleTimeString(),
            })));
        } catch {
            setMessages([]);
        }
        setLeftSidebarCollapsed(true);
    };

    // Delete a conversation
    const deleteConversation = async (convId: string, e: React.MouseEvent) => {
        e.stopPropagation(); // prevent triggering loadConversation
        try {
            await api.deleteConversation(convId);
            // If we deleted the active conversation, clear chat
            if (activeConvId === convId) {
                setMessages([]);
                setActiveConvId(null);
                setSessionId(crypto.randomUUID());
            }
            loadConversations();
        } catch { /* ignore */ }
    };

    useEffect(() => {
        const pendingProject = sessionStorage.getItem('pending_chat_project');
        if (pendingProject) {
            sessionStorage.removeItem('pending_chat_project');
            handleProjectClick(pendingProject);
        }

        const pendingAction = sessionStorage.getItem('pending_chat_action');
        if (pendingAction) {
            sessionStorage.removeItem('pending_chat_action');
            if (pendingAction === 'deposit' || pendingAction === 'withdraw') {
                setFormAsset('USD');
            } else {
                setActiveForm(pendingAction as 'buy' | 'sell');
            }
        }

        const pendingAgent = sessionStorage.getItem('pending_chat_agent');
        if (pendingAgent) {
            sessionStorage.removeItem('pending_chat_agent');
            setActiveAgent(pendingAgent);
            setSelectedAssetName(pendingAgent);
        }

        const handleSetAgent = (e: Event) => {
            const customEvent = e as CustomEvent;
            setMessages([]);
            setActiveAgent(customEvent.detail);
            setSelectedAssetName(customEvent.detail);
        };
        window.addEventListener('loka-set-chat-agent', handleSetAgent);

        return () => window.removeEventListener('loka-set-chat-agent', handleSetAgent);
    }, []);

    // Auto-login for demo purposes (always refresh to avoid stale token)
    useEffect(() => {
        api.loginEmail('demo@loka.finance').catch(() => { });
    }, []);

    const sendToAI = async (text: string) => {
        if (isStreaming) return;
        setIsStreaming(true);

        // Add the streaming placeholder message
        const placeholderIdx = messages.length; // will be the last
        setMessages(prev => [...prev, { role: 'assistant', content: '', timestamp: new Date().toLocaleTimeString(), isStreaming: true }]);

        try {
            // Try streaming first
            const abortController = new AbortController();
            abortControllerRef.current = abortController;

            const headers: Record<string, string> = { 'Content-Type': 'application/json' };
            const token = sessionStorage.getItem('loka_token');
            if (token) headers['Authorization'] = `Bearer ${token}`;

            // Build asset context for selected asset
            const selectedAsset = selectedAssetName ? cashFlowAssets.find(a => a.title === selectedAssetName) : null;
            const assetContext = selectedAsset ? {
                name: selectedAsset.title,
                category: selectedAsset.category,
                apy: selectedAsset.apy,
                term: selectedAsset.term,
                progress: selectedAsset.progress,
                backers: selectedAsset.backers,
                description: selectedAsset.desc,
            } : undefined;

            const response = await fetch(`${import.meta.env.VITE_API_BASE || '/api'}/chat/stream`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ content: text, agentId: activeAgent, sessionId, assetContext }),
                signal: abortController.signal,
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const reader = response.body!.getReader();
            const decoder = new TextDecoder();
            let fullContent = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n');
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6).trim();
                        if (data === '[DONE]') continue;
                        try {
                            const parsed = JSON.parse(data);
                            if (parsed.content) {
                                fullContent += parsed.content;
                                setMessages(prev => {
                                    const updated = [...prev];
                                    const lastAssistant = updated.findLastIndex(m => m.role === 'assistant' && m.isStreaming);
                                    if (lastAssistant >= 0) {
                                        updated[lastAssistant] = { ...updated[lastAssistant], content: fullContent };
                                    }
                                    return updated;
                                });
                            }
                            if (parsed.error) {
                                fullContent = parsed.error;
                            }
                        } catch { /* skip */ }
                    }
                }
            }

            // Mark streaming complete
            setMessages(prev => {
                const updated = [...prev];
                const lastAssistant = updated.findLastIndex(m => m.role === 'assistant' && m.isStreaming);
                if (lastAssistant >= 0) {
                    updated[lastAssistant] = { ...updated[lastAssistant], content: fullContent || 'No response received.', isStreaming: false };
                }
                return updated;
            });
            // Refresh conversation list after AI responds
            loadConversations();
            // Auto-speak in voice mode
            if (voice.voiceMode && fullContent) {
                voice.speak(fullContent);
            }
        } catch (err: any) {
            if (err.name === 'AbortError') return;
            // Fallback: try non-streaming
            try {
                const result = await api.sendChatMessage(text, activeAgent);
                setMessages(prev => {
                    const updated = [...prev];
                    const lastAssistant = updated.findLastIndex(m => m.role === 'assistant' && m.isStreaming);
                    if (lastAssistant >= 0) {
                        updated[lastAssistant] = { role: 'assistant', content: result.assistantMessage.content, timestamp: new Date().toLocaleTimeString(), isStreaming: false };
                    }
                    return updated;
                });
            } catch {
                setMessages(prev => {
                    const updated = [...prev];
                    const lastAssistant = updated.findLastIndex(m => m.role === 'assistant' && m.isStreaming);
                    if (lastAssistant >= 0) {
                        updated[lastAssistant] = { role: 'assistant', content: 'Sorry, failed to get a response. Please try again.', timestamp: new Date().toLocaleTimeString(), isStreaming: false };
                    }
                    return updated;
                });
            }
        } finally {
            setIsStreaming(false);
            abortControllerRef.current = null;
        }
    };

    const handleProjectClick = (projectName: string) => {
        const userMsg = { role: 'user', content: `Analyze project: ${projectName}`, timestamp: new Date().toLocaleTimeString() };
        setMessages(prev => [...prev, userMsg]);

        setTimeout(() => {
            const isShopify = projectName.includes('Shopify');
            const aiMsg = {
                role: 'assistant',
                type: 'project_detail',
                project: projectName,
                content: `I've synthesized a comprehensive institutional-grade report for ${projectName}. This asset pool aligns with Loka's 'Low-Volatility Cash Flow' mandate, backed by real-world revenue and professional infrastructure.`,
                data: {
                    title: projectName,
                    entity: isShopify ? 'Dropstream LLC' : 'ComputeDAO Foundation',
                    registration: isShopify ? 'ACRA ID: 20230812X • Founded 2023' : 'BVI ID: 102459X • Founded 2021',
                    sections: [
                        {
                            title: 'Background & Business Narrative',
                            content: isShopify
                                ? 'Dropstream facilitates liquidity for high-growth e-commerce merchants on the Shopify platform. This specific cluster consists of 12 verified sellers with a combined annual GMV exceeding $50M. By analyzing deep-level API data, we identify merchants with stable 60% repeat customer rates and low return ratios, providing them with working capital to accelerate inventory turnover.'
                                : 'ComputeDAO is a decentralized physical infrastructure network (DePIN) focusing on high-performance AI compute. This batch (Batch #4) targets the scaling of H100 GPU clusters in Tier-3 data centers. As AI model training demand reaches an all-time high, ComputeDAO provides the essential hardware layer, secured by physical asset ownership and long-term enterprise rendering contracts.',
                            objective: isShopify
                                ? '"Inventory financing for seasonal peak demand across consumer electronics and home-ware verticals."'
                                : '"Purchasing 8 additional NVIDIA H100 GPUs and pre-paying data center rack fees in Tokyo for 12 months."'
                        },
                        {
                            title: 'Entity Credit & Financial Health',
                            isGrid: true,
                            items: [
                                { label: 'Total Raising', value: isShopify ? '$1.5M' : '$4.2M' },
                                { label: 'Repayment Rate', value: '100% On-time' },
                                { label: 'Current Raising', value: isShopify ? '$185,000' : '$375,420' },
                                { label: 'Loka Risk Score', value: 'AAA (Safe)' },
                                { label: 'Coverage Ratio', value: isShopify ? '2.4x' : '1.8x' },
                                { label: 'Backers Pledged', value: isShopify ? '89' : '124' }
                            ]
                        },
                        {
                            title: 'Leadership & Verification',
                            items: [
                                { name: isShopify ? 'Alex Chen' : 'Dr. Victor Wang', role: 'CEO / Founders', bio: isShopify ? 'Ex-AWS Principal Architect, 10+ years scaling cloud infra.' : 'Ex-NVIDIA Senior Researcher, Ph.D in Parallel Computing.' },
                                { name: 'Sarah Li', role: 'CTO', bio: 'Ex-Stripe Engineering, expert in secure protocol auditing.' }
                            ]
                        },
                        {
                            title: 'The Agreement & Protections',
                            subSections: [
                                {
                                    label: 'Fund Flow: Auto-Repayment Mechanism',
                                    text: isShopify
                                        ? 'Investors → Loka SPV → Merchant → Revenue Gen → Stripe Escrow → Auto-Repay (Principal + Interest).'
                                        : 'Investors → ComputeDAO SPV → Hardware Acquisition → Compute Revenue → Secure Escrow → Bi-weekly Distributions.'
                                },
                                {
                                    label: 'Key Rights & Protections',
                                    text: 'Senior Secured position with Bankruptcy Remote SPV structure. Assets are protected by Seniority (paid back first) and a 150% over-collateralization ratio against verified receivables.'
                                },
                                {
                                    label: 'Participation Terms',
                                    isHighlight: true,
                                    text: `Entry: 1,000 USDC. Target APY: ${isShopify ? '8.9%' : '15.5%'}. Face value at maturity: $${isShopify ? '1,030.50' : '1,065.20'}. Manual legal audit completed by Loka Protocol.`
                                }
                            ]
                        }
                    ]
                },
                timestamp: new Date().toLocaleTimeString()
            };
            setMessages(prev => [...prev, aiMsg]);
        }, 800);
    };

    const handleAssetClick = (assetName: string) => {
        const userMsg = { role: 'user', content: `View ${assetName} details`, timestamp: new Date().toLocaleTimeString() };
        setMessages(prev => [...prev, userMsg]);

        setTimeout(() => {
            const aiMsg = {
                role: 'assistant',
                type: 'asset_detail',
                asset: assetName,
                content: assetName === 'AIUSD'
                    ? "Here is the latest data for AIUSD. Our protocol maintains a stable yield through cross-chain delta-neutral strategies, currently delivering a solid and sustainable APY."
                    : "I've analyzed the current market for you. Here are the most popular Cash Flow assets available for investment right now. These projects represent high-quality AI infrastructure and enterprise revenue streams.",
                data: assetName === 'AIUSD' ? {
                    apy: '12.4%',
                    tvl: '$42.5M',
                    yieldSource: 'Cross-chain Delta Neutral',
                    risk: 'Low',
                    collateral: '150%'
                } : {
                    hot_assets: [
                        { title: 'ComputeDAO - GPU Expansion', apy: '15.5%', target: '$500k', progress: 75, term: '60d' },
                        { title: 'Shopify Merchant Cluster X', apy: '8.9%', target: '$200k', progress: 93, term: '30d' },
                        { title: 'Vercel Enterprise Flow', apy: '10.2%', target: '$1000k', progress: 42, term: '90d' },
                        { title: 'AWS Infrastructure Note', apy: '11.4%', target: '$750k', progress: 61, term: '45d' }
                    ]
                },
                timestamp: new Date().toLocaleTimeString()
            };
            setMessages(prev => [...prev, aiMsg]);
        }, 800);
    };

    const handleVoiceInput = () => {
        voice.toggleRecording();
        if (!voice.isRecording) {
            setInputText('');
        }
    };

    // TTS: speak AI reply, with option to stop
    const handleSpeak = (text: string) => {
        if (voice.isSpeaking) {
            voice.stopSpeaking();
        } else {
            voice.speak(text);
        }
    };

    const handleSend = () => {
        if (!inputText.trim() || isStreaming) return;

        // Check invitation code before sending
        const hasInvite = localStorage.getItem('loka_invite_code');
        if (!hasInvite) {
            pendingMessageRef.current = inputText.trim();
            setShowInviteModal(true);
            return;
        }

        const text = inputText.trim();
        const userMsg = { role: 'user', content: text, timestamp: new Date().toLocaleTimeString() };
        setMessages(prev => [...prev, userMsg]);
        setInputText('');

        sendToAI(text);
    };

    const handleInviteSubmit = async () => {
        if (!inviteCode.trim()) return;
        setInviteChecking(true);
        setInviteError(null);
        try {
            const result = await api.validateInvitationCode(inviteCode.trim());
            if (result.valid) {
                localStorage.setItem('loka_invite_code', inviteCode.trim().toUpperCase());
                api.useInvitationCode(inviteCode.trim()).catch(() => { });
                setShowInviteModal(false);
                setInviteCode('');
                // Auto-send the pending message
                if (pendingMessageRef.current) {
                    const text = pendingMessageRef.current;
                    pendingMessageRef.current = null;
                    const userMsg = { role: 'user', content: text, timestamp: new Date().toLocaleTimeString() };
                    setMessages(prev => [...prev, userMsg]);
                    setInputText('');
                    sendToAI(text);
                }
            } else {
                setInviteError(result.reason || 'Invalid code');
            }
        } catch {
            setInviteError('Failed to verify code. Please try again.');
        } finally {
            setInviteChecking(false);
        }
    };

    const handleInlineActionSubmit = () => {
        if (!formAmount || isStreaming) return;

        const actionStr = activeForm === 'buy' ? 'buy' : 'sell';
        const assetName = activeAgent;
        const userMsgText = `I want to ${actionStr} ${formAmount} USDC of ${assetName}.`;
        const userMsg = { role: 'user', content: userMsgText, timestamp: new Date().toLocaleTimeString() };
        setMessages(prev => [...prev, userMsg]);
        setActiveForm(null);
        setFormAmount('');

        sendToAI(userMsgText);
    };

    const handleActionResponse = async (index: number, confirm: boolean) => {
        setMessages(prev => prev.map((m, i) => i === index ? { ...m, actionCompleted: true } : m));

        const userMsg = { role: 'user', content: confirm ? 'Confirm' : 'Reject', timestamp: new Date().toLocaleTimeString() };
        setMessages(prev => [...prev, userMsg]);

        if (!confirm) return;

        const msg = messages[index];
        const parsed = msg?.content ? parseTradeAction(msg.content) : { action: null };
        const action = msg?.tradeAction || parsed.action;

        if (!action) {
            setTimeout(() => {
                setMessages(prev => [...prev, { role: 'assistant', content: 'Transaction confirmed. Processing your request...', timestamp: new Date().toLocaleTimeString() }]);
            }, 500);
            return;
        }

        setTradeExecuting(prev => ({ ...prev, [index]: 'pending' }));

        try {
            if (action.type === 'invest' && action.action === 'buy') {
                // Cash flow asset investment — use real API
                const matchedAsset = marketAssets.find(a =>
                    a.title.toLowerCase().includes((action.projectName || '').toLowerCase()) ||
                    (action.projectName || '').toLowerCase().includes(a.title.toLowerCase())
                );
                if (matchedAsset) {
                    const amount = parseFloat(action.amount);
                    if (amount < 10) throw new Error('Minimum investment is $10 USDC');
                    await api.investInProject(matchedAsset.id, amount);
                    setTradeExecuting(prev => ({ ...prev, [index]: 'success' }));
                    setMessages(prev => [...prev, {
                        role: 'assistant',
                        content: `✅ Successfully invested **$${amount.toLocaleString()} USDC** in ${matchedAsset.title}!\n\nExpected APY: ${action.apy || matchedAsset.apy + '%'}\nTerm: ${action.term || matchedAsset.durationDays + 'd'}\n\nYou can track this investment in your Portfolio. You've also been added to the project's Group Chat.`,
                        timestamp: new Date().toLocaleTimeString()
                    }]);
                } else {
                    throw new Error(`Project "${action.projectName}" not found in marketplace.`);
                }
            } else if (action.type === 'invest' && action.action === 'sell') {
                // Revoke investment
                const matchedAsset = marketAssets.find(a =>
                    a.title.toLowerCase().includes((action.projectName || '').toLowerCase())
                );
                if (matchedAsset) {
                    await api.revokeInvestment(matchedAsset.id);
                    setTradeExecuting(prev => ({ ...prev, [index]: 'success' }));
                    setMessages(prev => [...prev, {
                        role: 'assistant',
                        content: `✅ Investment in ${matchedAsset.title} has been revoked. Your USDC has been refunded.`,
                        timestamp: new Date().toLocaleTimeString()
                    }]);
                } else {
                    throw new Error(`Project "${action.projectName}" not found.`);
                }
            } else if (action.type === 'mint') {
                // Mint/redeem AIUSD
                const amount = parseFloat(action.amount);
                if (action.action === 'mint') {
                    await api.mintAIUSD(amount);
                } else {
                    await api.redeemAIUSD(amount);
                }
                setTradeExecuting(prev => ({ ...prev, [index]: 'success' }));
                const label = action.action === 'mint' ? 'Minted' : 'Redeemed';
                setMessages(prev => [...prev, {
                    role: 'assistant',
                    content: `✅ ${label} **${amount.toLocaleString()} AIUSD** successfully. Your portfolio has been updated.`,
                    timestamp: new Date().toLocaleTimeString()
                }]);
            }
        } catch (err: any) {
            setTradeExecuting(prev => ({ ...prev, [index]: 'error' }));
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: `❌ Transaction failed: ${err.message || 'Unknown error'}. Please try again or check your balance.`,
                timestamp: new Date().toLocaleTimeString()
            }]);
        }
    };

    const chatGradientSvg = (c1: string, c2: string, emoji: string, w = 400, h = 300) => {
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="${c1}"/><stop offset="100%" stop-color="${c2}"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#g)"/><text x="50%" y="55%" font-size="${Math.round(h * 0.25)}" text-anchor="middle" dominant-baseline="middle">${emoji}</text></svg>`;
        return `data:image/svg+xml,${encodeURIComponent(svg)}`;
    };



    const chatSessions = conversations.map(c => ({
        id: c.id,
        title: c.title,
        time: formatConvTime(c.time),
        active: c.id === activeConvId,
    }));

    return (
        <div className="flex flex-col h-full bg-[#fafafa] text-black overflow-hidden font-sans">
            {detailAsset ? (
                <div className="flex-1 overflow-y-auto bg-white">
                    <AssetDetail asset={detailAsset} onClose={() => setDetailAsset(null)} />
                </div>
            ) : (
                <div className="flex flex-1 overflow-hidden relative">
                    {/* Chat History Sidebar — only render when expanded */}
                    {!leftSidebarCollapsed && (
                        <div className="h-full bg-[#fafafa] border-r border-gray-100 flex flex-col shrink-0 w-full absolute inset-0 z-40 md:relative md:w-64">
                            <div className="flex items-center justify-between px-4 pt-8 md:pt-4 pb-3">
                                <h2 className="text-xs font-black text-black tracking-widest uppercase">History</h2>
                                <button
                                    onClick={() => setLeftSidebarCollapsed(true)}
                                    className="w-9 h-9 rounded-lg flex items-center justify-center text-gray-400 hover:text-black hover:bg-gray-100 transition-all"
                                >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" /></svg>
                                </button>
                            </div>
                            <button
                                onClick={() => { setMessages([]); setActiveConvId(null); setSessionId(crypto.randomUUID()); setLeftSidebarCollapsed(true); }}
                                className="mx-3 mb-3 px-3 py-2.5 bg-black text-white rounded-xl text-[11px] font-bold tracking-wide hover:bg-gray-800 transition-all flex items-center justify-center gap-2"
                            >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                                New Chat
                            </button>
                            <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-0.5">
                                {chatSessions.length === 0 && (
                                    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                                        <svg className="w-8 h-8 text-gray-200 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                                        <p className="text-[11px] text-gray-400 font-medium">No conversations yet</p>
                                        <p className="text-[10px] text-gray-300 mt-1">Start chatting to see history here</p>
                                    </div>
                                )}
                                {chatSessions.map((session) => (
                                    <div
                                        key={session.id}
                                        className={`w-full text-left px-3 py-2.5 rounded-xl text-xs transition-all group/item flex items-start gap-2.5 cursor-pointer ${session.active
                                            ? 'bg-white shadow-sm border border-gray-100 font-bold text-black'
                                            : 'text-gray-500 hover:bg-white hover:shadow-sm hover:text-black font-medium'
                                            }`}
                                        onClick={() => {
                                            const conv = conversations.find(c => c.id === session.id);
                                            if (conv) loadConversation(conv);
                                        }}
                                    >
                                        <svg className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${session.active ? 'text-green-500' : 'text-gray-300 group-hover/item:text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                                        <div className="flex-1 min-w-0">
                                            <p className="truncate leading-tight">{session.title}</p>
                                            <p className="text-[10px] text-gray-400 mt-0.5">{session.time}</p>
                                        </div>
                                        <button
                                            onClick={(e) => deleteConversation(session.id, e)}
                                            className="w-6 h-6 rounded-md flex items-center justify-center opacity-0 group-hover/item:opacity-100 text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all shrink-0 mt-0.5"
                                            title="Delete conversation"
                                        >
                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Main Chat Area */}
                    <main className="flex-1 flex flex-col relative bg-white md:border-l md:border-gray-100">
                        {/* Sidebar Toggle Button */}
                        {leftSidebarCollapsed && (
                            <button
                                onClick={() => setLeftSidebarCollapsed(false)}
                                className="absolute top-8 md:top-4 left-4 z-30 w-9 h-9 bg-white border border-gray-200 rounded-xl flex items-center justify-center text-gray-400 hover:text-black hover:border-gray-300 hover:shadow-md transition-all"
                                title="Show chat history"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" /></svg>
                            </button>
                        )}
                        <div className="flex-1 overflow-y-auto w-full">
                            {(() => {
                                const selectedCurrent = cashFlowAssets.find(a => a.title === activeAgent) || cashFlowAssets[0];
                                const progress = 75;
                                const mockMonthlyRevenue = [
                                    { month: 'Aug', amount: 380000 },
                                    { month: 'Sep', amount: 395000 },
                                    { month: 'Oct', amount: 410000 },
                                    { month: 'Nov', amount: 415000 },
                                    { month: 'Dec', amount: 430000 },
                                    { month: 'Jan', amount: 450000 },
                                ];

                                // Shared tab content renderer
                                const renderTabContent = () => (
                                    <div className="w-full max-w-5xl mx-auto">
                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 px-4 gap-4">
                                            <div className="flex gap-4 sm:gap-8 border-b border-gray-100 flex-1 sm:mr-8 overflow-x-auto">
                                                {['Background', 'Financial Health', 'Rules'].map(tab => (
                                                    <button
                                                        key={tab}
                                                        onClick={() => setActiveAssetTab(tab as any)}
                                                        className={`text-xs sm:text-sm font-black tracking-widest uppercase pb-4 -mb-px transition-colors border-b-[3px] whitespace-nowrap ${activeAssetTab === tab ? 'border-green-500 text-black' : 'border-transparent text-gray-300 hover:text-black hover:border-black/20'}`}
                                                    >
                                                        {tab}
                                                    </button>
                                                ))}
                                            </div>
                                            <div className="flex gap-2 sm:gap-3 shrink-0">
                                                <span className="px-3 py-1 bg-black text-white text-[10px] font-bold rounded-full">Verified by Loka</span>
                                                <span className="px-3 py-1 bg-gray-100 text-gray-500 text-[10px] font-bold rounded-full">Stripe API Verified</span>
                                            </div>
                                        </div>

                                        <div className="w-full transition-all">
                                            <div className="flex flex-col gap-12 pt-4">
                                                {activeAssetTab === 'Background' && (
                                                    <div className="w-full space-y-12 animate-fadeIn pb-10">
                                                        <div className="flex flex-col lg:flex-row items-center justify-between bg-gray-50/40 p-5 rounded-[2.5rem] border border-gray-100/50 gap-6">
                                                            <div className="flex items-center gap-6 w-full">
                                                                <div className="w-16 h-16 bg-white rounded-3xl border border-gray-100 shadow-sm flex items-center justify-center text-2xl font-bold text-black shrink-0">{selectedCurrent.title.charAt(0)}</div>
                                                                <div className="flex flex-col gap-4">
                                                                    <div>
                                                                        <div className="flex items-center gap-2">
                                                                            <h3 className="font-bold text-black text-lg">{selectedCurrent.title} LLC</h3>
                                                                            <div className="w-4 h-4 bg-green-500 rounded-full flex items-center justify-center border-2 border-white shadow-sm">
                                                                                <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M5 13l4 4L19 7" /></svg>
                                                                            </div>
                                                                        </div>
                                                                        <p className="text-[11px] text-gray-400 font-medium mt-1">Singapore (ACRA ID: 20230812X) • Founded 2023</p>
                                                                    </div>
                                                                    <div className="flex flex-wrap gap-2">
                                                                        {[{ label: 'Twitter', color: '#1DA1F2' }, { label: 'LinkedIn', color: '#0077b5' }, { label: 'GitHub', color: '#000' }].map((social, i) => (
                                                                            <div key={i} className="flex items-center gap-1.5 bg-white border border-gray-100 px-3 py-1.5 rounded-xl shadow-sm hover:shadow-md hover:border-black/5 transition-all cursor-pointer">
                                                                                <span className="text-[10px] font-bold text-gray-500">{social.label}</span>
                                                                                <div className="w-3 h-3 bg-green-50 rounded-full flex items-center justify-center"><svg className="w-1.5 h-1.5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={5} d="M5 13l4 4L19 7" /></svg></div>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            <div className="flex flex-col sm:flex-row bg-black rounded-3xl p-5 gap-4 sm:gap-8 shrink-0 shadow-lg">
                                                                <div>
                                                                    <p className="text-xl font-serif italic font-bold text-white leading-none">$1.5M</p>
                                                                    <p className="text-[8px] font-bold text-gray-500 tracking-widest mt-2 uppercase">Total Funding Raised</p>
                                                                </div>
                                                                <div className="w-px h-full bg-white/10 hidden sm:block" />
                                                                <div>
                                                                    <p className="text-xl font-serif italic font-bold text-green-500 leading-none">100% ↑</p>
                                                                    <p className="text-[8px] font-bold text-gray-500 tracking-widest mt-2 uppercase">On-time Repayment</p>
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <div className="space-y-6">
                                                            <div className="flex items-center gap-4"><h3 className="text-base font-black text-black">Business Narrative</h3><div className="h-px flex-1 bg-gray-50" /></div>
                                                            <p className="text-sm text-gray-500 leading-loose font-medium max-w-4xl">We are operating over 500 GPUs in Singapore. This funding batch will be used to prepay electricity and bandwidth expansion for our next month of generative AI rendering contracts. Over the past 12 months, we have maintained a 99.9% uptime and generated consistent cash flows from our enterprise clients.</p>
                                                            <div className="bg-[#fcfbf9] p-8 rounded-[2rem] border-l-4 border-green-500 italic text-sm text-gray-600 shadow-sm">"Purchasing 8 additional H100 GPUs and pre-paying data center rack fees in Tokyo to expand computing rental capacity."</div>
                                                        </div>
                                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                                            {['https://images.unsplash.com/photo-1557683316-973673baf926?q=80&w=800', 'https://images.unsplash.com/photo-1557682250-33bd709cbe85?q=80&w=800', 'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?q=80&w=800'].map((url, i) => (
                                                                <div key={i} className="aspect-[1.6/1] bg-gray-100 rounded-[2.5rem] overflow-hidden border border-gray-100 shadow-sm group"><img src={url} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" /></div>
                                                            ))}
                                                        </div>
                                                        <div className="space-y-8">
                                                            <div className="flex items-center gap-4"><h3 className="text-base font-black text-black">Leadership & Backing</h3><div className="h-px flex-1 bg-gray-50" /></div>
                                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                                {[{ name: 'Alex Chen', role: 'Chief Executive Officer', badge: 'Ex-AWS Principal Architect', bio: '10+ years scaling global cloud infrastructure. Led GPU cluster deployments for Fortune 500 AI divisions.' }, { name: 'Sarah Li', role: 'Chief Technology Officer', badge: 'Ex-Stripe Engineering', bio: 'Expert in secure protocol & system architecture. Specializes in DePIN hardware attestation layers.' }].map((person, i) => (
                                                                    <div key={i} className="bg-white border border-gray-100 rounded-[2.5rem] p-8 flex items-start gap-6 shadow-sm hover:shadow-md transition-all">
                                                                        <div className="w-16 h-16 bg-gray-50 rounded-2xl flex items-center justify-center font-serif text-2xl text-gray-300 shrink-0">{person.name[0]}</div>
                                                                        <div className="space-y-1">
                                                                            <p className="font-black text-black text-base">{person.name}</p>
                                                                            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{person.role}</p>
                                                                            <div className="pt-2"><span className="text-[11px] text-blue-600 font-black bg-blue-50 px-2.5 py-1 rounded-lg">{person.badge}</span></div>
                                                                            <p className="text-xs text-gray-500 mt-4 font-medium leading-relaxed">{person.bio}</p>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                                {activeAssetTab === 'Financial Health' && (
                                                    <div className="w-full space-y-8 animate-fadeIn">
                                                        <section className="space-y-6">
                                                            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                                                                <div className="flex items-center gap-3">
                                                                    <h3 className="text-base font-bold text-black">Stripe Connect API Monitor</h3>
                                                                    <div className="bg-blue-50 text-blue-600 text-[9px] font-bold px-3 py-1 rounded-full italic">Read-Only Access</div>
                                                                </div>
                                                                <div className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-[#00E676] animate-pulse" /><span className="text-[10px] font-bold text-[#00E676]">Oracle Online</span></div>
                                                            </div>
                                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                                                {[{ label: '30d Gross Flow', value: '$1,245,600', sub: 'Up 11.2% MoM', trend: 'up' }, { label: 'Coverage Ratio', value: '2.49x', sub: 'Calculated at Maturity', trend: 'safe' }, { label: 'MRR', value: '$42,000', sub: 'Enterprise Focus', trend: 'up' }].map((stat, i) => (
                                                                    <div key={i} className="p-6 bg-white glass rounded-3xl border border-gray-100 shadow-sm transition-all hover:shadow-md">
                                                                        <p className="text-[10px] font-bold text-gray-400 tracking-widest mb-3">{stat.label}</p>
                                                                        <p className="text-3xl font-serif italic text-black mb-1">{stat.value}</p>
                                                                        <p className="text-[10px] font-bold text-[#00E676] tracking-tighter flex items-center gap-1">{stat.trend === 'up' && '▲'} {stat.sub}</p>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                                <div className="p-6 bg-white glass rounded-3xl border border-gray-100 shadow-sm space-y-4">
                                                                    <div className="flex justify-between items-center">
                                                                        <p className="text-sm font-bold text-black">Revenue Timeline (6mo)</p>
                                                                        <p className="text-[10px] font-bold text-gray-400">Verifiably Accurate</p>
                                                                    </div>
                                                                    <div className="h-[200px] w-full">
                                                                        <ResponsiveContainer width="100%" height="100%">
                                                                            <BarChart data={mockMonthlyRevenue}>
                                                                                <CartesianGrid strokeDasharray="1 6" vertical={false} stroke="#f0f0f0" />
                                                                                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 700, fill: '#999' }} dy={8} />
                                                                                <YAxis hide />
                                                                                <Tooltip cursor={{ fill: '#f9f9f9' }} content={({ payload }) => payload?.[0] ? (<div className="bg-black text-white p-3 rounded-2xl text-[10px] font-black shadow-2xl">${payload[0].value?.toLocaleString()}</div>) : null} />
                                                                                <Bar dataKey="amount" fill="#000" radius={[4, 4, 4, 4]} barSize={32} />
                                                                            </BarChart>
                                                                        </ResponsiveContainer>
                                                                    </div>
                                                                </div>
                                                                <div className="p-6 bg-gray-50 rounded-3xl border border-gray-100 space-y-4">
                                                                    <p className="text-sm font-bold text-black">Customer Concentration Analysis</p>
                                                                    <div className="space-y-4">
                                                                        {[{ label: 'Top 1 Customer', value: '15%', color: 'bg-black' }, { label: 'Top 5 Customers', value: '42%', color: 'bg-gray-400' }, { label: 'Long-Tail Borrowers', value: '43%', color: 'bg-gray-200' }].map((item, i) => (
                                                                            <div key={i} className="space-y-2">
                                                                                <div className="flex justify-between text-[11px] font-bold"><span className="text-gray-400">{item.label}</span><span className="text-black">{item.value}</span></div>
                                                                                <div className="w-full h-1.5 bg-white rounded-full overflow-hidden border border-gray-100/50"><div className={`h-full ${item.color}`} style={{ width: item.value }} /></div>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                    <p className="text-[10px] text-gray-400 italic leading-relaxed">Diversified customer base ensures that if a single client churns, the underlying asset revenue remains robust enough to cover interest payments.</p>
                                                                </div>
                                                            </div>
                                                        </section>
                                                        <section className="space-y-4">
                                                            <div className="flex items-center gap-4"><h3 className="text-base font-bold text-black">Loka AI Risk scoring</h3><div className="h-px flex-1 bg-gray-100" /></div>
                                                            <div className="p-8 bg-purple-50 rounded-[40px] border-2 border-purple-100/50 relative overflow-hidden group">
                                                                <div className="absolute -right-10 -bottom-10 w-48 h-48 bg-purple-200/20 rounded-full blur-3xl group-hover:scale-150 transition-transform duration-1000" />
                                                                <div className="relative z-10 space-y-6">
                                                                    <div className="flex justify-between items-start">
                                                                        <div className="space-y-1"><div className="p-2 bg-purple-600 rounded-lg w-fit text-white text-xs">Loka AI v2.4</div><p className="text-[10px] font-bold text-purple-400 mt-2">Analysis Engine: Predictive Default Model</p></div>
                                                                        <div className="text-right"><div className="text-5xl font-serif italic text-purple-600">AAA</div><p className="text-xs font-bold text-purple-400">98/100 Confidence</p></div>
                                                                    </div>
                                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                                        <div className="space-y-3">
                                                                            <p className="text-[11px] font-bold text-purple-900 border-b border-purple-100 pb-1">Key Strengths</p>
                                                                            <ul className="space-y-2">{['Market Fit: AI computing demand is in a phase of exponential growth.', 'Cash Flow Quality: Stripe lock-box account with mandatory repayment mechanism.', 'Strong Collateral: Physical GPU lien + Accounts receivable security interest.'].map((p, i) => (<li key={i} className="flex items-center gap-3 text-[11px] text-purple-800 font-medium italic"><span className="text-[#00E676] text-lg">✓</span> {p}</li>))}</ul>
                                                                        </div>
                                                                        <div className="space-y-3">
                                                                            <p className="text-[11px] font-bold text-purple-900 border-b border-purple-100 pb-1">Risk Observations</p>
                                                                            <ul className="space-y-2">{['Geopolitics: Data center electricity rates in Tokyo impacted by energy price volatility.', 'Obsolescence: Risk of H100 computing power facing depreciation after 24 months.'].map((p, i) => (<li key={i} className="flex items-center gap-3 text-[11px] text-purple-800 font-medium italic"><span className="text-orange-400 text-lg">⚠️</span> {p}</li>))}</ul>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </section>
                                                    </div>
                                                )}
                                                {activeAssetTab === 'Rules' && (
                                                    <div className="w-full space-y-12 animate-fadeIn">
                                                        <section className="space-y-6">
                                                            <h3 className="text-base font-bold text-black">Campaign Rules & Mechanics</h3>
                                                            <div className="p-8 bg-white border border-gray-100 rounded-3xl shadow-sm space-y-8">
                                                                <div className="relative pt-6 pb-2">
                                                                    <div className="absolute top-8 left-[16%] right-[16%] h-1 bg-gray-100 rounded-full" />
                                                                    <div className="absolute top-8 left-[16%] h-1 bg-[#00E676] transition-all duration-1000 rounded-full" style={{ width: `${progress * 0.68}%` }} />
                                                                    <div className="relative flex justify-between z-10 w-full">
                                                                        {[{ label: 'Start', title: 'Fundraising', desc: 'Freely deposit or withdraw USDC.', active: false }, { label: '$250k', title: 'Success Point', desc: 'Goal met. Campaign secures funding.', active: true }, { label: '$500k', title: 'Lock & Deploy', desc: 'Pool locked immediately. Yield begins.', active: false }].map((step, i) => (
                                                                            <div key={i} className="flex flex-col items-center w-1/3 text-center space-y-3">
                                                                                <div className={`w-5 h-5 rounded-full bg-white border-4 ${step.active ? 'border-black' : 'border-gray-200'} shadow-sm relative`}>
                                                                                    <span className={`absolute -top-7 left-1/2 -translate-x-1/2 text-[9px] font-black tracking-widest ${step.active ? 'text-black' : 'text-gray-400'} whitespace-nowrap`}>{step.label}</span>
                                                                                </div>
                                                                                <div><h4 className="text-[11px] font-black tracking-widest text-black mb-1">{step.title}</h4><p className="text-[10px] text-gray-500 font-medium px-2 leading-relaxed">{step.desc}</p></div>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-6 border-t border-gray-100">
                                                                    <div className="flex gap-4 p-5 bg-green-50/50 rounded-2xl border border-green-100/50"><div className="text-xl" style={{ marginTop: '2px' }}>💸</div><div><h4 className="text-[11px] font-black tracking-widest text-black mb-1">If Campaign Succeeds</h4><p className="text-[10px] text-gray-500 leading-relaxed font-medium">Funds are locked. Guaranteed payout rules execute to distribute principal and yield direct to wallet.</p></div></div>
                                                                    <div className="flex gap-4 p-5 bg-red-50/40 rounded-2xl border border-red-100/50"><div className="text-xl" style={{ marginTop: '2px' }}>↩️</div><div><h4 className="text-[11px] font-black tracking-widest text-black mb-1">If Campaign Fails</h4><p className="text-[10px] text-gray-500 leading-relaxed font-medium">Should the soft cap be missed before deadline, automated systems auto-refund 100% of participants' capital safety.</p></div></div>
                                                                </div>
                                                            </div>
                                                        </section>
                                                        <section className="space-y-8">
                                                            <h3 className="text-base font-bold text-black">Fund Flow & Asset Structure</h3>
                                                            <div className="p-10 bg-gray-50 rounded-[32px] border border-gray-100 flex flex-wrap items-center justify-center gap-x-4 gap-y-8 text-center relative overflow-hidden">
                                                                <div className="absolute top-0 right-0 p-4"><div className="px-2 py-0.5 bg-white/80 backdrop-blur rounded text-[9px] font-bold text-gray-400 border border-gray-100">Guaranteed Escrow</div></div>
                                                                {['Investors', 'Loka SPV', 'Borrower', 'Purchase H100', 'Revenue Gen', 'Stripe Escrow', 'Auto-Repay'].map((step, i) => (
                                                                    <React.Fragment key={i}>
                                                                        <div className="relative group"><div className={`px-4 py-3 rounded-2xl border shadow-sm transition-all duration-500 flex items-center justify-center min-w-[100px] ${i === 6 ? 'bg-black text-white border-black' : 'bg-white text-black border-gray-100 group-hover:border-black'}`}><p className="text-[9px] font-black tracking-widest">{step}</p></div><div className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap font-bold text-gray-300 italic">Step 0{i + 1}</div></div>
                                                                        {i < 6 && <div className="text-gray-300 font-light text-xl animate-pulse">→</div>}
                                                                    </React.Fragment>
                                                                ))}
                                                            </div>
                                                        </section>
                                                        <section className="space-y-6">
                                                            <h3 className="text-base font-bold text-black">Key Rights & Protections</h3>
                                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                                {[{ icon: '🥇', title: 'Seniority', badge: 'Senior Secured', plainEnglish: 'In the event of liquidation, you are paid back first—before the company\'s shareholders.' }, { icon: '🛡️', title: 'Structure', badge: 'Bankruptcy Remote', plainEnglish: 'Assets are held in a secure, independent SPV. Even if the parent company fails, your investment remains out of reach for their creditors.' }, { icon: '🧱', title: 'Collateral Ratio', badge: '120%-150%', plainEnglish: 'Every $100 lent is backed by up to $150 in expected revenue. Even if earnings drop by 30%, your principal remains secure.' }, { icon: '🤖', title: 'Smart Escrow', badge: 'Code Enforced', plainEnglish: 'Revenue is intercepted by SDK and flows directly into secure escrow. It is tamper-proof and automatically distributed at maturity.' }].map((item, i) => (
                                                                    <div key={i} className="group relative bg-white border border-gray-100 p-6 rounded-[32px] hover:border-black transition-all duration-300 shadow-sm overflow-hidden h-48 flex flex-col justify-between">
                                                                        <div className="space-y-3"><div className="text-2xl">{item.icon}</div><div><p className="text-[11px] font-bold text-gray-400 tracking-tight">{item.title}</p><p className="text-sm font-black text-black leading-tight mt-1">{item.badge}</p></div></div>
                                                                        <div className="flex items-center gap-1.5 pt-2 border-t border-gray-50"><div className="w-1.5 h-1.5 rounded-full bg-[#00E676]" /><span className="text-[9px] font-bold text-gray-400 tracking-widest">Active Protection</span></div>
                                                                        <div className="absolute inset-0 bg-black/95 p-6 flex flex-col justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-y-4 group-hover:translate-y-0 cursor-default"><p className="text-[13px] text-white font-medium leading-relaxed italic text-center">"{item.plainEnglish}"</p></div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </section>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );

                                // Shared project brief card renderer
                                const renderProjectBrief = () => (
                                    <div className="w-full max-w-5xl mx-auto bg-white border border-gray-100 rounded-[2rem] p-6 shadow-[0_5px_40px_-15px_rgba(0,0,0,0.05)] transition-all">
                                        <div className="flex flex-col lg:flex-row gap-8">
                                            <div className="flex-1 flex flex-col justify-between">
                                                <div className="mb-6 lg:mb-0 flex gap-4">
                                                    <img src={selectedCurrent.image} className="w-12 h-12 rounded-full object-cover border border-gray-100 shrink-0 mt-1" alt={selectedCurrent.title} />
                                                    <div>
                                                        <h3 className="text-2xl font-bold text-black mb-2">{selectedCurrent.title}</h3>
                                                        <p className="text-xs text-gray-500 font-medium leading-relaxed pr-8">{selectedCurrent.desc}</p>
                                                    </div>
                                                </div>
                                                <div className="flex flex-wrap gap-8 items-end pt-4 border-t border-gray-50 lg:border-none lg:pt-0">
                                                    <div><p className="text-[9px] font-bold text-gray-400 tracking-widest uppercase mb-1">Target Yield</p><p className="text-lg font-serif italic text-black font-bold">15.5% <span className="text-[10px] text-gray-400 not-italic font-sans">APY</span></p></div>
                                                    <div><p className="text-[9px] font-bold text-gray-400 tracking-widest uppercase mb-1">Target Raise</p><p className="text-lg font-serif italic text-black font-bold">$500,000</p></div>
                                                    <div><p className="text-[9px] font-bold text-gray-400 tracking-widest uppercase mb-1">Duration</p><p className="text-base font-bold text-black">60 Days</p></div>
                                                </div>
                                            </div>
                                            <div className="w-full lg:w-[460px] bg-gray-50/80 rounded-3xl p-4 sm:p-6 shrink-0 border border-gray-100/80">
                                                <div className="space-y-6">
                                                    <div className="flex justify-between items-end">
                                                        <div><p className="text-[9px] font-bold text-gray-400 tracking-widest uppercase mb-2">Campaign Progress</p><p className="text-3xl font-serif italic text-black font-bold">${((500000 * progress) / 100).toLocaleString()}</p></div>
                                                        <div className="text-right"><p className="text-[9px] font-bold text-gray-400 tracking-widest uppercase mb-2">Goal</p><p className="text-sm font-bold text-black font-serif italic">$500k</p></div>
                                                    </div>
                                                    <div className="space-y-2.5">
                                                        <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden"><div className="h-full bg-black rounded-full" style={{ width: `${progress}%` }} /></div>
                                                        <div className="flex justify-between items-center text-[10px] font-bold"><span className="text-black">{progress}% funded</span><div className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" /><span className="text-black tracking-wide">Fundraising</span></div></div>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <div className="flex -space-x-1.5"><div className="w-6 h-6 rounded-full bg-gray-200 border-2 border-gray-50" /><div className="w-6 h-6 rounded-full bg-gray-300 border-2 border-gray-50" /><div className="w-6 h-6 rounded-full bg-black flex items-center justify-center border-2 border-gray-50 z-10"><span className="text-[8px] font-bold text-white">+86</span></div></div>
                                                        <span className="text-[10px] font-bold text-gray-400 ml-1">Backers pledged</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );

                                return messages.length === 0 ? (
                                    <div className="min-h-full w-full flex flex-col max-w-5xl mx-auto px-4 sm:px-10 pt-16 sm:pt-32 pb-8 sm:pb-32">
                                        <div className="flex flex-col items-center mb-8 sm:mb-10">
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 sm:w-10 sm:h-10 bg-green-500 rounded-xl flex items-center justify-center text-black font-black shadow-lg text-sm sm:text-base">
                                                    L
                                                </div>
                                                <h1 className="text-2xl sm:text-3xl font-black text-black tracking-tight">Loka AI</h1>
                                            </div>
                                        </div>

                                        <div className={`bg-white border rounded-2xl p-3 sm:p-4 w-full flex flex-col max-w-3xl mx-auto mb-8 sm:mb-12 relative transition-all duration-500 group/input ${activeForm ? 'border-green-400/60 shadow-[0_0_30px_-5px_rgba(74,222,128,0.2)] scale-[1.01]' : isInputFocused ? 'border-green-400/60 shadow-[0_0_30px_-5px_rgba(74,222,128,0.2)] scale-[1.01]' : 'border-gray-200/80 shadow-[0_8px_40px_-12px_rgba(0,0,0,0.08)] hover:border-green-200 hover:shadow-[0_12px_50px_-15px_rgba(0,0,0,0.1)] idle-input-glow'}`}>
                                            {/* Input Row — switches between normal input and inline sentence */}
                                            {activeForm ? (
                                                <div className="flex items-center w-full px-3 sm:px-6 py-4 sm:py-5 gap-2 flex-wrap">
                                                    <span className="text-sm sm:text-base font-medium text-black whitespace-nowrap">I want to {activeForm}</span>
                                                    <input
                                                        type="number"
                                                        value={formAmount}
                                                        onChange={(e) => setFormAmount(e.target.value)}
                                                        onKeyDown={(e) => e.key === 'Enter' && handleInlineActionSubmit()}
                                                        placeholder="0.00"
                                                        autoFocus
                                                        className="w-20 sm:w-28 bg-transparent border-b-2 border-green-400 outline-none text-sm sm:text-base font-bold text-green-600 text-center py-1 placeholder:text-green-300/60 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                                    />
                                                    <span className="text-sm sm:text-base font-medium text-black whitespace-nowrap">USDC of</span>
                                                    <span className="text-sm sm:text-base font-bold text-black bg-gray-100 px-2 sm:px-3 py-1 rounded-lg truncate max-w-[120px] sm:max-w-none">{activeAgent}</span>
                                                    <span className="text-sm sm:text-base font-medium text-black">.</span>
                                                    <div className="flex items-center gap-2 ml-auto">
                                                        <button
                                                            onClick={() => { setActiveForm(null); setFormAmount(''); }}
                                                            className="w-9 h-9 rounded-lg flex items-center justify-center text-gray-400 hover:text-black hover:bg-gray-100 transition-all"
                                                        >
                                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                                                        </button>
                                                        <button
                                                            onClick={handleInlineActionSubmit}
                                                            className="w-12 h-12 bg-green-500 text-white rounded-xl flex items-center justify-center hover:bg-green-600 transition-all shadow-lg shadow-green-500/30"
                                                        >
                                                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 10l7-7m0 0l7 7m-7-7v18" /></svg>
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="flex items-center w-full relative">
                                                    {!inputText && !isInputFocused && !voice.isRecording && (
                                                        <div className="absolute left-3 sm:left-6 right-24 sm:right-28 top-1/2 -translate-y-1/2 pointer-events-none flex items-center overflow-hidden">
                                                            <span className="text-gray-400 text-base font-medium truncate">{typedPlaceholder}</span>
                                                            <span className="inline-block w-[2px] h-5 bg-green-400 ml-[1px] animate-[cursorBlink_1s_steps(2)_infinite]" />
                                                        </div>
                                                    )}
                                                    {voice.isRecording && (
                                                        <div className="absolute left-3 sm:left-6 right-24 sm:right-28 top-1/2 -translate-y-1/2 pointer-events-none flex items-center gap-3">
                                                            <span className="text-violet-500 text-base font-bold animate-pulse">Listening...</span>
                                                            <div className="flex items-center gap-1.5">
                                                                <span className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-ping" style={{ animationDuration: '1s', animationDelay: '0ms' }} />
                                                                <span className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-ping" style={{ animationDuration: '1.2s', animationDelay: '200ms' }} />
                                                                <span className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-ping" style={{ animationDuration: '0.8s', animationDelay: '400ms' }} />
                                                            </div>
                                                        </div>
                                                    )}
                                                    <input
                                                        type="text"
                                                        value={voice.isRecording ? "" : inputText}
                                                        onChange={(e) => setInputText(e.target.value)}
                                                        onFocus={() => setIsInputFocused(true)}
                                                        onBlur={() => setIsInputFocused(false)}
                                                        onKeyDown={(e) => e.key === 'Enter' && !voice.isRecording && handleSend()}
                                                        placeholder=""
                                                        disabled={voice.isRecording}
                                                        className={`flex-1 bg-transparent border-none outline-none text-black text-base px-3 sm:px-6 py-5 sm:py-6 font-medium relative z-10 ${voice.isRecording ? 'opacity-0' : ''} transition-opacity`}
                                                    />
                                                    <button
                                                        onClick={handleVoiceInput}
                                                        className={`w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center rounded-xl transition-all mr-1 sm:mr-2 shrink-0 relative ${voice.isRecording
                                                            ? 'bg-violet-50 text-violet-500 ring-2 ring-violet-500/50 shadow-lg shadow-violet-500/20 scale-105'
                                                            : 'text-gray-400 hover:text-black hover:bg-gray-50'
                                                            }`}
                                                        title={voice.isRecording ? "Stop Recording" : "Voice Input"}
                                                    >
                                                        {voice.isRecording && (
                                                            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-violet-500 rounded-full animate-ping" />
                                                        )}
                                                        {voice.isRecording && (
                                                            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-violet-500 rounded-full" />
                                                        )}
                                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                                                    </button>
                                                    <button
                                                        onClick={handleSend}
                                                        disabled={voice.isRecording}
                                                        className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center transition-all duration-300 shrink-0 mr-1 ${isInputFocused && !voice.isRecording ? 'bg-green-500 text-white shadow-lg shadow-green-500/30 scale-110' : 'bg-green-100 text-green-600 hover:bg-green-600 hover:text-white'}`}
                                                    >
                                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 10l7-7m0 0l7 7m-7-7v18" /></svg>
                                                    </button>
                                                </div>
                                            )}
                                            {/* Quick Actions Row */}
                                            <div className="flex gap-2 px-3 sm:px-6 pb-3 pt-2 border-t border-gray-100/50 items-center flex-wrap">
                                                {/* @Asset Button */}
                                                {(() => {
                                                    const selectedAsset = selectedAssetName ? cashFlowAssets.find(a => a.title === selectedAssetName) : null;
                                                    return selectedAsset ? (
                                                        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 border border-green-300 rounded-full text-[11px] font-bold text-green-700">
                                                            <button
                                                                onClick={() => handleProjectClick(selectedAsset.title)}
                                                                className="flex items-center gap-1.5 hover:opacity-80 transition-opacity"
                                                            >
                                                                <img src={selectedAsset.image} alt={selectedAsset.title} className="w-4 h-4 rounded-full object-cover" />
                                                                <span className="max-w-[120px] truncate">@{selectedAsset.title}</span>
                                                            </button>
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); setSelectedAssetName(null); }}
                                                                className="ml-0.5 text-green-400 hover:text-red-500 transition-colors flex items-center"
                                                            >
                                                                <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <button
                                                            onClick={() => window.dispatchEvent(new CustomEvent('loka-nav-market'))}
                                                            className="px-4 py-2 border rounded-full text-[11px] font-bold transition-all flex items-center gap-2 hover:scale-105 active:scale-95 bg-gray-50 border-gray-100 text-gray-500 hover:border-black hover:text-black hover:shadow-sm"
                                                        >
                                                            <span className="text-base leading-none">@</span>
                                                            Asset
                                                        </button>
                                                    );
                                                })()}

                                                {/* + Action Menu Button */}
                                                <div className="relative">
                                                    <button
                                                        onClick={() => setShowActionMenu(!showActionMenu)}
                                                        className={`w-9 h-9 border rounded-full text-sm font-bold transition-all flex items-center justify-center hover:scale-105 active:scale-95 ${showActionMenu
                                                            ? 'bg-black border-black text-white'
                                                            : 'bg-gray-50 border-gray-100 text-gray-500 hover:border-black hover:text-black hover:shadow-sm'
                                                            }`}
                                                    >
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                                                    </button>
                                                    {showActionMenu && (
                                                        <div className="absolute bottom-full left-0 mb-3 w-52 bg-white border border-gray-100 rounded-2xl shadow-[0_12px_40px_-8px_rgba(0,0,0,0.12)] p-2 z-[100] animate-fadeIn">
                                                            <div className="absolute bottom-[-6px] left-3 w-3 h-3 bg-white border-r border-b border-gray-100 rotate-45" />
                                                            {!selectedAssetName && (
                                                                <p className="text-[9px] text-amber-600 font-bold px-3 py-1.5 bg-amber-50 rounded-xl mb-1 flex items-center gap-1.5">
                                                                    <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M12 3a9 9 0 100 18 9 9 0 000-18z" /></svg>
                                                                    Please select an asset first
                                                                </p>
                                                            )}
                                                            <button
                                                                onClick={() => { if (selectedAssetName) { setActiveForm('buy'); setFormAmount(''); setShowActionMenu(false); } }}
                                                                disabled={!selectedAssetName}
                                                                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[11px] font-bold transition-all ${selectedAssetName
                                                                    ? 'text-black hover:bg-green-50 cursor-pointer'
                                                                    : 'text-gray-300 cursor-not-allowed'
                                                                    }`}
                                                            >
                                                                <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${selectedAssetName ? 'bg-green-100' : 'bg-gray-100'}`}>
                                                                    <svg className={`w-3 h-3 ${selectedAssetName ? 'text-green-600' : 'text-gray-300'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                                                                </div>
                                                                Buy Asset
                                                            </button>
                                                            <button
                                                                onClick={() => { if (selectedAssetName) { setActiveForm('sell'); setFormAmount(''); setShowActionMenu(false); } }}
                                                                disabled={!selectedAssetName}
                                                                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[11px] font-bold transition-all ${selectedAssetName
                                                                    ? 'text-black hover:bg-red-50 cursor-pointer'
                                                                    : 'text-gray-300 cursor-not-allowed'
                                                                    }`}
                                                            >
                                                                <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${selectedAssetName ? 'bg-red-100' : 'bg-gray-100'}`}>
                                                                    <svg className={`w-3 h-3 ${selectedAssetName ? 'text-red-600' : 'text-gray-300'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M20 12H4" /></svg>
                                                                </div>
                                                                Sell Asset
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="relative ml-2 flex items-center h-full">
                                                    <div
                                                        onClick={() => setShowEarningStrategy(!showEarningStrategy)}
                                                        className="w-9 h-9 bg-violet-50 border border-violet-100 rounded-full cursor-pointer hover:bg-violet-100 transition-all flex items-center justify-center shadow-sm"
                                                    >
                                                        <Icons.Coins className="w-5 h-5 text-violet-600" />
                                                    </div>

                                                    {showEarningStrategy && (
                                                        <>
                                                            <div className="fixed inset-0 z-[99]" onClick={() => setShowEarningStrategy(false)} />
                                                            <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-72 p-5 bg-black shadow-2xl rounded-[24px] z-[100] border border-white/10">
                                                                <p className="text-[9px] font-black text-violet-400 tracking-[0.3em] mb-4 uppercase text-center">Earning Strategy</p>
                                                                <div className="space-y-4">
                                                                    <div className="flex items-start gap-3">
                                                                        <div className="w-8 h-8 rounded-xl bg-violet-500/10 flex items-center justify-center shrink-0">✨</div>
                                                                        <div>
                                                                            <p className="text-[11px] font-black text-white leading-tight flex items-center justify-between">
                                                                                Early Bird Bonus
                                                                                <span className="text-violet-400">+20 pts</span>
                                                                            </p>
                                                                            <p className="text-[10px] text-gray-400 mt-1 leading-relaxed">Subscribe within first 48h of asset release.</p>
                                                                        </div>
                                                                    </div>
                                                                    <div className="flex items-start gap-3">
                                                                        <div className="w-8 h-8 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">🐳</div>
                                                                        <div>
                                                                            <p className="text-[11px] font-black text-white leading-tight flex items-center justify-between">
                                                                                High-Volume Tier
                                                                                <span className="text-amber-400">+50 pts</span>
                                                                            </p>
                                                                            <p className="text-[10px] text-gray-400 mt-1 leading-relaxed">One-time bonus for single subscriptions &gt;$5k.</p>
                                                                        </div>
                                                                    </div>
                                                                    <div className="flex items-start gap-3">
                                                                        <div className="w-8 h-8 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0">⌛</div>
                                                                        <div>
                                                                            <p className="text-[11px] font-black text-white leading-tight flex items-center justify-between">
                                                                                Loyalty Stream
                                                                                <span className="text-blue-400">+10 pts</span>
                                                                            </p>
                                                                            <p className="text-[10px] text-gray-400 mt-1 leading-relaxed">Earn every 30 days of continuous holding.</p>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Cash Flow Assets Slider */}
                                        <div className="w-full mt-8 sm:mt-10">
                                            <div className="flex items-center justify-between mb-4">
                                                <h3 className="text-sm font-black text-black tracking-widest uppercase">Funding Projects</h3>
                                                <button
                                                    onClick={() => window.dispatchEvent(new CustomEvent('loka-nav-market'))}
                                                    className="text-[11px] font-bold text-gray-500 hover:text-black hover:underline underline-offset-4 decoration-2 transition-all flex items-center gap-1"
                                                >
                                                    View All <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
                                                </button>
                                            </div>
                                            {/* Mobile: vertical scroll, Desktop: horizontal scroll */}
                                            <div className="w-full sm:overflow-x-auto pb-6 pt-4 -mt-4 sm:cursor-grab sm:active:cursor-grabbing selection:bg-transparent [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                                                <div className="flex flex-col sm:flex-row sm:w-max gap-3 sm:gap-5 px-0 sm:px-2">
                                                    {cashFlowAssets.slice(0, 5).map((asset, idx) => (
                                                        <div
                                                            key={idx}
                                                            onClick={() => {
                                                                setSelectedAssetName(asset.title);
                                                                window.dispatchEvent(new CustomEvent('loka-nav-market'));
                                                                setTimeout(() => window.dispatchEvent(new CustomEvent('loka-open-asset', { detail: asset.title })), 100);
                                                            }}
                                                            className={`w-full sm:w-72 bg-white rounded-[1.5rem] sm:rounded-[2rem] border border-gray-100 p-4 sm:p-5 shrink-0 shadow-sm hover:border-black/10 hover:shadow-[0_12px_50px_-15px_rgba(0,0,0,0.1)] sm:hover:-translate-y-1 transition-all group flex flex-col gap-3 sm:gap-4 cursor-pointer`}
                                                        >
                                                            <div className="flex items-center justify-between">
                                                                <div className="flex items-center gap-3 w-full">
                                                                    <div className="w-12 h-12 rounded-2xl overflow-hidden shadow-sm border border-gray-100 shrink-0">
                                                                        <img src={asset.image} alt={asset.title} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                                                                    </div>
                                                                    <div className="flex flex-col flex-1 min-w-0 pr-2">
                                                                        <h4 className="font-black text-black text-sm leading-tight truncate group-hover:text-green-600 transition-colors">{asset.title}</h4>
                                                                        <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest mt-0.5 truncate">{asset.category}</p>
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            <div className="min-h-[2.5rem]">
                                                                <p className="text-xs text-gray-500 font-medium leading-relaxed line-clamp-2">{asset.desc}</p>
                                                            </div>

                                                            <div className="space-y-1.5 mt-auto">
                                                                <div className="flex justify-between items-center text-[9px] font-black uppercase tracking-widest">
                                                                    <span className="text-gray-400">Progress</span>
                                                                    <div className="flex items-center gap-1.5 hover:scale-105 transition-transform cursor-pointer">
                                                                        <span className="text-black">{asset.progress || 75}%</span>
                                                                        <span className="text-gray-400 font-bold normal-case text-[10px]">({asset.backers || 0} backers)</span>
                                                                    </div>
                                                                </div>
                                                                <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                                                    <div className="h-full bg-green-500 rounded-full" style={{ width: `${asset.progress || 75}%` }}></div>
                                                                </div>
                                                            </div>

                                                            <div className="pt-3 border-t border-gray-50 flex items-center justify-between">
                                                                <div>
                                                                    <p className="text-[9px] text-gray-400 font-black tracking-widest uppercase mb-0.5">Target Yield</p>
                                                                    <p className="text-base font-black text-black">{asset.apy || '15.5%'}</p>
                                                                </div>
                                                                <div className="text-right">
                                                                    <p className="text-[9px] text-gray-400 font-black tracking-widest uppercase mb-0.5">Lock Term</p>
                                                                    <p className="text-sm font-black text-black mt-1">{asset.term || '60 Days'}</p>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="px-4 pt-12 pb-4 sm:p-8 space-y-6 sm:space-y-8 max-w-5xl mx-auto">
                                        {/* Project Details Card at top of chat — only show when asset is @-selected */}
                                        {(() => {
                                            if (!selectedAssetName) return null;
                                            const matchedAsset = marketAssets.find(a => a.title === selectedCurrent.title || selectedCurrent.title.includes(a.title) || a.title.includes(selectedCurrent.title));
                                            const displayApy = matchedAsset ? `${matchedAsset.apy}%` : (selectedCurrent.apy || '15.5%');
                                            const displayTarget = matchedAsset ? `$${(matchedAsset.targetAmount / 1000).toFixed(0)}k` : '$500k';
                                            const displayTerm = matchedAsset ? `${matchedAsset.durationDays}d` : (selectedCurrent.term || '60d');
                                            const displayProgress = matchedAsset ? Math.min(100, Math.round((matchedAsset.raisedAmount / matchedAsset.targetAmount) * 100)) : (selectedCurrent.progress || progress);
                                            const coverImg = matchedAsset ? matchedAsset.issuerLogo : selectedCurrent.image;
                                            return (
                                                <div className="w-full bg-white border border-gray-100 rounded-2xl shadow-sm hover:shadow-md transition-all overflow-hidden">
                                                    <div
                                                        className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 p-4 sm:p-5 cursor-pointer group"
                                                        onClick={() => {
                                                            if (matchedAsset) {
                                                                setDetailAsset(matchedAsset);
                                                            } else {
                                                                setProjectCardExpanded(!projectCardExpanded);
                                                            }
                                                        }}
                                                    >
                                                        <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
                                                            <img src={coverImg} className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl object-cover border border-gray-100 shrink-0" alt={selectedCurrent.title} />
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex items-center gap-2 mb-1">
                                                                    <h3 className="text-sm font-black text-black truncate">{selectedCurrent.title}</h3>
                                                                    <span className="px-1.5 py-0.5 bg-green-50 text-green-600 text-[8px] font-black rounded tracking-wider shrink-0">VERIFIED</span>
                                                                </div>
                                                                <p className="text-[11px] text-gray-400 font-medium leading-snug line-clamp-1">{matchedAsset?.subtitle || selectedCurrent.desc}</p>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-3 sm:gap-5 shrink-0 sm:pl-4 sm:border-l border-gray-100 overflow-x-auto">
                                                            <div className="text-left sm:text-right">
                                                                <p className="text-[8px] font-bold text-gray-400 tracking-widest uppercase">Yield</p>
                                                                <p className="text-sm font-black text-black">{displayApy}</p>
                                                            </div>
                                                            <div className="text-left sm:text-right">
                                                                <p className="text-[8px] font-bold text-gray-400 tracking-widest uppercase">Raise</p>
                                                                <p className="text-sm font-black text-black">{displayTarget}</p>
                                                            </div>
                                                            <div className="text-left sm:text-right">
                                                                <p className="text-[8px] font-bold text-gray-400 tracking-widest uppercase">Term</p>
                                                                <p className="text-sm font-bold text-black">{displayTerm}</p>
                                                            </div>
                                                            {/* Progress bar inline */}
                                                            <div className="flex items-center gap-2 shrink-0 pl-3 sm:pl-4 border-l border-gray-100">
                                                                <div className="w-16 sm:w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                                                    <div className="h-full bg-black rounded-full" style={{ width: `${displayProgress}%` }} />
                                                                </div>
                                                                <span className="text-[9px] font-bold text-gray-400 whitespace-nowrap">{displayProgress}%</span>
                                                            </div>
                                                            {/* Arrow icon */}
                                                            <div className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center shrink-0 group-hover:bg-gray-100 transition-all ml-2">
                                                                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })()}

                                        {/* Voice Mode Status Bar */}
                                        {voice.voiceMode && (
                                            <div className="flex items-center justify-center gap-3 py-3 px-4 bg-gradient-to-r from-blue-50 to-purple-50 rounded-2xl border border-blue-100 animate-in fade-in duration-300">
                                                <div className={`w-3 h-3 rounded-full ${voice.isRecording ? 'bg-violet-500 animate-pulse' : voice.isSpeaking ? 'bg-blue-500 animate-pulse' : 'bg-green-500'}`} />
                                                <span className="text-xs font-bold text-gray-600">
                                                    {voice.isRecording ? '🎤 Listening...' : voice.isSpeaking ? '🔊 Speaking...' : '✨ Voice Mode Active — Speak to chat'}
                                                </span>
                                                <button
                                                    onClick={() => voice.toggleVoiceMode()}
                                                    className="ml-auto text-[10px] font-bold text-gray-400 hover:text-red-500 transition-colors px-2 py-1 rounded-lg hover:bg-red-50"
                                                >
                                                    Exit
                                                </button>
                                            </div>
                                        )}

                                        {messages.map((msg, i) => (
                                            <div key={i} className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
                                                <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                                    <div className={`shadow-sm rounded-2xl ${msg.role === 'user'
                                                        ? 'max-w-[80%] p-4 bg-black text-white font-medium shadow-md'
                                                        : 'w-full max-w-[90%] bg-white text-black border border-gray-100 p-6'
                                                        }`}>
                                                        {msg.role === 'assistant' && msg.type === 'asset_detail' ? (
                                                            <div className="space-y-6">
                                                                <p className="text-sm text-gray-700 leading-relaxed font-medium">{msg.content}</p>

                                                                <div className="flex items-center justify-between pb-4 border-b border-gray-50">
                                                                    <div className="flex items-center gap-4">
                                                                        <div className="w-10 h-10 bg-black rounded-xl flex items-center justify-center text-white">
                                                                            {msg.asset === 'AIUSD' ? 'AI' : <Icons.TrendingUp />}
                                                                        </div>
                                                                        <div>
                                                                            <h2 className="text-base font-black">{msg.asset} Summary</h2>
                                                                            <p className="text-[9px] text-gray-400 font-bold  tracking-widest">Real-time Overview</p>
                                                                        </div>
                                                                    </div>
                                                                    {msg.asset === 'AIUSD' && (
                                                                        <div className="text-right">
                                                                            <p className="text-[10px] text-gray-400 font-black  tracking-widest">Current APY</p>
                                                                            <p className="text-2xl font-black text-green-500">{msg.data.apy}</p>
                                                                        </div>
                                                                    )}
                                                                </div>

                                                                {msg.data.hot_assets ? (
                                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                                        {msg.data.hot_assets.map((asset: any, idx: number) => (
                                                                            <div key={idx} className="p-5 bg-gray-50 rounded-2xl border border-gray-100 group hover:border-black/10 hover:shadow-lg transition-all">
                                                                                <div className="flex items-center justify-between mb-4">
                                                                                    <h4 className="text-sm font-black text-black">{asset.title}</h4>
                                                                                    <span className="text-xs font-black text-green-500">{asset.apy} APY</span>
                                                                                </div>
                                                                                <div className="flex items-center justify-between text-[10px] text-gray-500 font-bold  tracking-widest mb-4">
                                                                                    <span>Target: <span className="text-black">{asset.target}</span></span>
                                                                                    <span>Term: <span className="text-black">{asset.term}</span></span>
                                                                                </div>
                                                                                <div className="space-y-2 mb-6">
                                                                                    <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                                                                        <div className="h-full bg-green-500 rounded-full" style={{ width: `${asset.progress}%` }}></div>
                                                                                    </div>
                                                                                    <div className="flex justify-between text-[9px] font-black  tracking-tighter text-gray-400">
                                                                                        <span>Progress</span>
                                                                                        <span>{asset.progress}% Funded</span>
                                                                                    </div>
                                                                                </div>
                                                                                <button
                                                                                    onClick={() => handleProjectClick(asset.title)}
                                                                                    className="w-full py-2.5 bg-black text-white text-[10px] font-black rounded-lg hover:bg-gray-800 transition-all  tracking-widest"
                                                                                >
                                                                                    View Details
                                                                                </button>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                ) : (
                                                                    <>
                                                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                                                            {[
                                                                                { label: 'Total Value Locked', value: msg.data.tvl },
                                                                                { label: 'Yield Source', value: msg.data.yieldSource },
                                                                                { label: 'Risk Rating', value: msg.data.risk },
                                                                                { label: 'Collateral Ratio', value: msg.data.collateral },
                                                                            ].map((stat, idx) => (
                                                                                <div key={idx} className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                                                                                    <p className="text-[8px] font-black text-gray-400  tracking-widest mb-1">{stat.label}</p>
                                                                                    <p className="text-xs font-bold text-black">{stat.value}</p>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    </>
                                                                )}
                                                            </div>
                                                        ) : msg.role === 'assistant' && msg.type === 'project_detail' ? (
                                                            <div className="space-y-8 text-left">
                                                                <div className="flex flex-col gap-1 pb-4 border-b border-gray-100">
                                                                    <div className="flex items-center gap-3">
                                                                        <h2 className="text-xl font-black text-black">{msg.data.title}</h2>
                                                                        <span className="px-2 py-0.5 bg-black text-[8px] font-black text-white rounded  tracking-tighter">Verified</span>
                                                                    </div>
                                                                    <p className="text-[10px] text-gray-400 font-bold  tracking-widest">{msg.data.registration}</p>
                                                                </div>

                                                                <p className="text-sm text-gray-700 leading-relaxed font-medium mt-4">{msg.content}</p>

                                                                <div className="space-y-10">
                                                                    {msg.data.sections.map((section: any, sIdx: number) => (
                                                                        <div key={sIdx} className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-500" style={{ animationDelay: `${sIdx * 100}ms` }}>
                                                                            <div className="flex items-center gap-3">
                                                                                <div className="h-4 w-1 bg-black rounded-full"></div>
                                                                                <h3 className="text-xs font-black text-black  tracking-widest">{section.title}</h3>
                                                                            </div>

                                                                            {section.content && (
                                                                                <div className="space-y-4 pl-4">
                                                                                    <p className="text-sm text-gray-600 leading-relaxed font-medium">
                                                                                        {section.content}
                                                                                    </p>
                                                                                    {section.objective && (
                                                                                        <div className="p-4 bg-gray-50 rounded-xl border border-gray-100 italic">
                                                                                            <p className="text-[9px] font-black text-gray-400  tracking-widest mb-1">Primary Funding Objective</p>
                                                                                            <p className="text-sm text-black font-semibold">{section.objective}</p>
                                                                                        </div>
                                                                                    )}
                                                                                </div>
                                                                            )}

                                                                            {section.isGrid ? (
                                                                                <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 pl-4">
                                                                                    {section.items.map((item: any, iIdx: number) => (
                                                                                        <div key={iIdx} className="p-3 bg-gray-50/80 rounded-xl border border-gray-100 flex flex-col gap-1">
                                                                                            <p className="text-[9px] font-black text-gray-400  tracking-widest">{item.label}</p>
                                                                                            <p className="text-xs font-black text-black">{item.value}</p>
                                                                                        </div>
                                                                                    ))}
                                                                                </div>
                                                                            ) : section.items ? (
                                                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pl-4">
                                                                                    {section.items.map((member: any, mIdx: number) => (
                                                                                        <div key={mIdx} className="p-4 bg-white border border-gray-100 rounded-2xl flex gap-4 shadow-sm">
                                                                                            <div className="w-10 h-10 bg-gray-50 rounded-xl flex items-center justify-center font-serif italic text-lg text-gray-400 shrink-0">
                                                                                                {member.name?.[0]}
                                                                                            </div>
                                                                                            <div className="space-y-1">
                                                                                                <p className="text-xs font-black text-black ">{member.name}</p>
                                                                                                <p className="text-[9px] font-bold text-blue-500  tracking-tighter">{member.role}</p>
                                                                                                <p className="text-[10px] text-gray-500 leading-tight">{member.bio}</p>
                                                                                            </div>
                                                                                        </div>
                                                                                    ))}
                                                                                </div>
                                                                            ) : null}

                                                                            {section.subSections && (
                                                                                <div className="space-y-3 pl-4">
                                                                                    {section.subSections.map((sub: any, subIdx: number) => (
                                                                                        <div key={subIdx} className={`p-4 rounded-xl border ${sub.isHighlight ? 'bg-black text-white border-black shadow-lg shadow-black/10' : 'bg-gray-50/50 border-gray-100'}`}>
                                                                                            <div className="flex items-center gap-2 mb-2">
                                                                                                {sub.isHighlight && <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></div>}
                                                                                                <p className={`text-[9px] font-black  tracking-widest ${sub.isHighlight ? 'text-gray-400' : 'text-gray-400'}`}>{sub.label}</p>
                                                                                            </div>
                                                                                            <p className={`text-sm leading-relaxed font-medium ${sub.isHighlight ? 'text-white/90' : 'text-gray-600'}`}>
                                                                                                {sub.text}
                                                                                            </p>
                                                                                        </div>
                                                                                    ))}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <>
                                                                {(() => {
                                                                    const { text: cleanText, action: tradeAction } = msg.role === 'assistant' && msg.content ? parseTradeAction(msg.content) : { text: msg.content, action: null };
                                                                    return (
                                                                        <>
                                                                            <div className="text-sm leading-relaxed whitespace-pre-wrap">{cleanText}{msg.isStreaming && <span className="inline-block w-1.5 h-4 bg-black/70 ml-0.5 animate-pulse" />}</div>

                                                                            {/* Trade Confirmation Card */}
                                                                            {tradeAction && !msg.actionCompleted && !msg.isStreaming && (
                                                                                <div className="mt-4 p-4 bg-gradient-to-br from-gray-50 to-white border border-gray-200 rounded-2xl space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                                                                    <div className="flex items-center gap-3">
                                                                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold shadow-sm ${tradeAction.type === 'invest' ? 'bg-green-100 text-green-600' :
                                                                                                'bg-violet-100 text-violet-600'
                                                                                            }`}>
                                                                                            {tradeAction.type === 'invest' ? '📈' : '🪙'}
                                                                                        </div>
                                                                                        <div className="flex-1">
                                                                                            <p className="text-xs font-black text-black tracking-wide">
                                                                                                {tradeAction.type === 'invest' ? `${tradeAction.action === 'buy' ? 'Invest in' : 'Revoke from'} ${tradeAction.projectName}` :
                                                                                                    `${tradeAction.action === 'mint' ? 'Mint' : 'Redeem'} AIUSD`}
                                                                                            </p>
                                                                                            <p className="text-[10px] text-gray-400 font-bold tracking-widest uppercase mt-0.5">
                                                                                                {tradeAction.type === 'invest' ? 'Cash Flow Marketplace' : 'AIUSD Protocol'}
                                                                                            </p>
                                                                                        </div>
                                                                                        {tradeExecuting[i] === 'pending' && (
                                                                                            <div className="w-6 h-6 border-2 border-green-400 border-t-transparent rounded-full animate-spin" />
                                                                                        )}
                                                                                        {tradeExecuting[i] === 'success' && (
                                                                                            <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                                                                                                <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                                                                                            </div>
                                                                                        )}
                                                                                        {tradeExecuting[i] === 'error' && (
                                                                                            <div className="w-6 h-6 bg-red-500 rounded-full flex items-center justify-center">
                                                                                                <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
                                                                                            </div>
                                                                                        )}
                                                                                    </div>

                                                                                    {/* Details Grid */}
                                                                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                                                                        <div className="p-2.5 bg-white rounded-xl border border-gray-100">
                                                                                            <p className="text-[8px] font-black text-gray-400 tracking-widest uppercase">Amount</p>
                                                                                            <p className="text-sm font-black text-black mt-0.5">
                                                                                                {tradeAction.amount} {tradeAction.unit || 'USDC'}
                                                                                            </p>
                                                                                        </div>
                                                                                        {tradeAction.estimatedUSD && (
                                                                                            <div className="p-2.5 bg-white rounded-xl border border-gray-100">
                                                                                                <p className="text-[8px] font-black text-gray-400 tracking-widest uppercase">Est. Cost</p>
                                                                                                <p className="text-sm font-black text-black mt-0.5">${parseFloat(tradeAction.estimatedUSD).toLocaleString()} USDC</p>
                                                                                            </div>
                                                                                        )}
                                                                                        {tradeAction.apy && (
                                                                                            <div className="p-2.5 bg-white rounded-xl border border-gray-100">
                                                                                                <p className="text-[8px] font-black text-gray-400 tracking-widest uppercase">APY</p>
                                                                                                <p className="text-sm font-black text-green-500 mt-0.5">{tradeAction.apy}</p>
                                                                                            </div>
                                                                                        )}
                                                                                        {tradeAction.term && (
                                                                                            <div className="p-2.5 bg-white rounded-xl border border-gray-100">
                                                                                                <p className="text-[8px] font-black text-gray-400 tracking-widest uppercase">Term</p>
                                                                                                <p className="text-sm font-black text-black mt-0.5">{tradeAction.term}</p>
                                                                                            </div>
                                                                                        )}

                                                                                    </div>

                                                                                    {/* Confirm / Reject Buttons */}
                                                                                    {!tradeExecuting[i] && (
                                                                                        <div className="flex gap-2 pt-1">
                                                                                            <button
                                                                                                onClick={() => handleActionResponse(i, true)}
                                                                                                className="flex-1 py-2.5 bg-black text-white text-xs font-black rounded-xl hover:bg-gray-800 transition-all shadow-lg shadow-black/10 tracking-wide flex items-center justify-center gap-2"
                                                                                            >
                                                                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                                                                                                Confirm {tradeAction.type === 'invest' ? 'Investment' : 'Transaction'}
                                                                                            </button>
                                                                                            <button
                                                                                                onClick={() => handleActionResponse(i, false)}
                                                                                                className="px-5 py-2.5 bg-gray-100 text-gray-600 text-xs font-black rounded-xl hover:bg-gray-200 transition-all tracking-wide"
                                                                                            >
                                                                                                Cancel
                                                                                            </button>
                                                                                        </div>
                                                                                    )}
                                                                                    {tradeExecuting[i] === 'pending' && (
                                                                                        <p className="text-[10px] font-bold text-gray-400 text-center animate-pulse">Processing transaction...</p>
                                                                                    )}
                                                                                </div>
                                                                            )}

                                                                            {/* Legacy action type (fallback) */}
                                                                            {msg.type === 'action' && !msg.actionCompleted && !tradeAction && (
                                                                                <div className="mt-4 flex gap-2">
                                                                                    <button onClick={() => handleActionResponse(i, true)} className="px-4 py-2 bg-black text-white text-xs font-bold rounded-lg hover:bg-gray-800 transition-all">Confirm</button>
                                                                                    <button onClick={() => handleActionResponse(i, false)} className="px-4 py-2 bg-gray-100 text-black text-xs font-bold rounded-lg hover:bg-gray-200 transition-all">Reject</button>
                                                                                </div>
                                                                            )}
                                                                        </>
                                                                    );
                                                                })()}
                                                            </>
                                                        )}
                                                        <div className={`flex items-center gap-2 mt-4 ${msg.role === 'user' ? 'justify-end' : 'justify-between'}`}>
                                                            <p className={`text-[10px] opacity-40 ${msg.role === 'user' ? 'text-white/70' : 'text-gray-500'}`}>{msg.timestamp}</p>
                                                            {msg.role === 'assistant' && msg.content && !msg.isStreaming && (
                                                                <button
                                                                    onClick={() => handleSpeak(msg.content)}
                                                                    className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold transition-all ${voice.isSpeaking ? 'bg-blue-50 text-blue-500' : 'text-gray-300 hover:text-gray-600 hover:bg-gray-50'}`}
                                                                    title={voice.isSpeaking ? "Stop Speaking" : "Read Aloud"}
                                                                >
                                                                    {voice.isSpeaking ? (
                                                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor" /><rect x="14" y="4" width="4" height="16" rx="1" fill="currentColor" /></svg>
                                                                    ) : (
                                                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>
                                                                    )}
                                                                    {voice.isSpeaking ? 'Stop' : 'Listen'}
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>

                                                {msg.role === 'assistant' && msg.type === 'project_detail' && (
                                                    <div className="flex flex-wrap gap-2 px-1 animate-in fade-in slide-in-from-top-2 duration-500 delay-300">
                                                        {[
                                                            { label: 'Deep Analysis of Project Background', query: 'Can you provide a deeper analysis of the project background and its market positioning?' },
                                                            { label: 'Profitability & Yield Expectation', query: 'What are the specific profitability metrics and the detailed yield expectation for this project?' },
                                                            { label: 'Security & Guarantees', query: 'How does Loka ensure the security of this investment and what specific guarantees are in place?' }
                                                        ].map((action, idx) => (
                                                            <button
                                                                key={idx}
                                                                onClick={() => setInputText(action.query)}
                                                                className="px-4 py-2.5 bg-white hover:bg-black hover:text-white border border-gray-100 hover:border-black rounded-xl text-xs font-bold text-gray-600 transition-all duration-300 shadow-sm"
                                                            >
                                                                {action.label}
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                );
                            })()}
                        </div>



                        {messages.length > 0 && (
                            <div className="px-3 sm:px-12 pb-4 sm:pb-8 pt-0 flex flex-col items-center relative z-50 mt-auto bg-gradient-to-t from-[#fafafa] via-[#fafafa] to-transparent shrink-0">
                                <div className={`bg-white border rounded-2xl p-2 sm:p-3 w-full max-w-4xl flex flex-col shadow-2xl transition-all duration-500 group/bottominput ${activeForm ? 'border-green-400/60 shadow-[0_0_30px_-5px_rgba(74,222,128,0.2)] scale-[1.01]' : 'border-gray-200 shadow-black/5 hover:border-green-200 focus-within:border-green-400/50 focus-within:scale-[1.005] focus-within:shadow-[0_0_30px_-5px_rgba(74,222,128,0.15)]'}`}>
                                    {activeForm ? (
                                        /* Inline sentence mode for bottom input */
                                        <div className="flex items-center w-full px-4 py-3 gap-2 flex-wrap">
                                            <span className="text-sm font-medium text-black whitespace-nowrap">I want to {activeForm}</span>
                                            <input
                                                type="number"
                                                value={formAmount}
                                                onChange={(e) => setFormAmount(e.target.value)}
                                                onKeyDown={(e) => e.key === 'Enter' && handleInlineActionSubmit()}
                                                placeholder="0.00"
                                                autoFocus
                                                className="w-24 bg-transparent border-b-2 border-green-400 outline-none text-sm font-bold text-green-600 text-center py-0.5 placeholder:text-green-300/60 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                            />
                                            <span className="text-sm font-medium text-black whitespace-nowrap">USDC of</span>
                                            <span className="text-sm font-bold text-black bg-gray-100 px-2 py-0.5 rounded-lg">{activeAgent}</span>
                                            <span className="text-sm font-medium text-black">.</span>
                                            <div className="flex items-center gap-2 ml-auto">
                                                <button
                                                    onClick={() => { setActiveForm(null); setFormAmount(''); }}
                                                    className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-black hover:bg-gray-100 transition-all"
                                                >
                                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                                                </button>
                                                <button
                                                    onClick={handleInlineActionSubmit}
                                                    className="w-10 h-10 bg-green-500 text-white rounded-xl flex items-center justify-center hover:bg-green-600 transition-all shadow-lg shadow-green-500/30"
                                                >
                                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 10l7-7m0 0l7 7m-7-7v18" /></svg>
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="flex items-center w-full relative">
                                                {voice.isRecording && (
                                                    <div className="absolute left-6 top-1/2 -translate-y-1/2 pointer-events-none flex items-center gap-1.5 z-20">
                                                        <span className="text-violet-500 text-xs font-bold animate-pulse">Listening...</span>
                                                        <div className="flex items-center gap-1">
                                                            <span className="w-1 h-1 bg-violet-400 rounded-full animate-ping" style={{ animationDuration: '1s', animationDelay: '0ms' }} />
                                                            <span className="w-1 h-1 bg-violet-400 rounded-full animate-ping" style={{ animationDuration: '1.2s', animationDelay: '200ms' }} />
                                                            <span className="w-1 h-1 bg-violet-400 rounded-full animate-ping" style={{ animationDuration: '0.8s', animationDelay: '400ms' }} />
                                                        </div>
                                                    </div>
                                                )}
                                                <input
                                                    type="text"
                                                    value={voice.isRecording ? "" : inputText}
                                                    onChange={(e) => setInputText(e.target.value)}
                                                    onKeyDown={(e) => e.key === 'Enter' && !voice.isRecording && handleSend()}
                                                    placeholder={voice.isRecording ? "" : "Ask your assistant..."}
                                                    disabled={voice.isRecording}
                                                    className={`flex-1 bg-transparent border-none outline-none text-black text-sm px-6 py-3 placeholder:text-gray-300 font-medium whitespace-nowrap overflow-hidden text-ellipsis ${voice.isRecording ? 'opacity-0' : ''} transition-opacity z-10`}
                                                />
                                                <button
                                                    onClick={handleVoiceInput}
                                                    className={`w-8 h-8 flex items-center justify-center rounded-xl transition-all mr-2 shrink-0 relative z-20 ${voice.isRecording
                                                        ? 'bg-violet-50 text-violet-500 ring-1 ring-violet-500/50 shadow-sm scale-110'
                                                        : 'text-gray-400 hover:text-black hover:bg-gray-100'
                                                        }`}
                                                    title={voice.isRecording ? "Stop Recording" : "Voice Input"}
                                                >
                                                    {voice.isRecording && (
                                                        <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-violet-500 rounded-full animate-ping" />
                                                    )}
                                                    {voice.isRecording && (
                                                        <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-violet-500 rounded-full" />
                                                    )}
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                                                </button>
                                                <button
                                                    onClick={handleSend}
                                                    disabled={voice.isRecording}
                                                    className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all shadow-lg shadow-black/5 shrink-0 mr-1 z-20 ${voice.isRecording
                                                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed scale-95 opacity-50'
                                                        : 'bg-green-100 text-green-600 hover:bg-green-600 hover:text-white active:scale-90 group-focus-within/bottominput:bg-green-500 group-focus-within/bottominput:text-white'
                                                        }`}
                                                >
                                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 10l7-7m0 0l7 7m-7-7v18" /></svg>
                                                </button>
                                            </div>

                                            {/* Quick Actions — consistent with home page */}
                                            <div className="flex gap-2 px-4 pb-1 pt-1 border-t border-gray-100/50 mt-1 items-center">
                                                {/* @Asset Button */}
                                                {(() => {
                                                    const selectedAsset = selectedAssetName ? cashFlowAssets.find(a => a.title === selectedAssetName) : null;
                                                    return selectedAsset ? (
                                                        <div className="flex items-center gap-1.5 px-3 py-1 bg-green-50 border border-green-300 rounded-full text-[10px] font-bold text-green-700">
                                                            <button
                                                                onClick={() => handleProjectClick(selectedAsset.title)}
                                                                className="flex items-center gap-1.5 hover:opacity-80 transition-opacity"
                                                            >
                                                                <img src={selectedAsset.image} alt={selectedAsset.title} className="w-4 h-4 rounded-full object-cover" />
                                                                <span className="max-w-[100px] truncate">@{selectedAsset.title}</span>
                                                            </button>
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); setSelectedAssetName(null); }}
                                                                className="ml-0.5 text-green-400 hover:text-red-500 transition-colors flex items-center"
                                                            >
                                                                <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <button
                                                            onClick={() => window.dispatchEvent(new CustomEvent('loka-nav-market'))}
                                                            className="px-3 py-1 border rounded-full text-[10px] font-bold transition-all flex items-center gap-1.5 hover:scale-105 active:scale-95 bg-gray-50/50 border-gray-100/80 text-gray-500 hover:border-black hover:text-black"
                                                        >
                                                            <span className="text-sm leading-none">@</span>
                                                            Asset
                                                        </button>
                                                    );
                                                })()}

                                                {/* + Action Menu Button */}
                                                <div className="relative">
                                                    <button
                                                        onClick={() => setShowActionMenu(!showActionMenu)}
                                                        className={`w-7 h-7 border rounded-full text-xs font-bold transition-all flex items-center justify-center hover:scale-105 active:scale-95 ${showActionMenu
                                                            ? 'bg-black border-black text-white'
                                                            : 'bg-gray-50/50 border-gray-100/80 text-gray-500 hover:border-black hover:text-black'
                                                            }`}
                                                    >
                                                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                                                    </button>
                                                    {showActionMenu && (
                                                        <div className="absolute bottom-full left-0 mb-3 w-52 bg-white border border-gray-100 rounded-2xl shadow-[0_12px_40px_-8px_rgba(0,0,0,0.12)] p-2 z-[100] animate-fadeIn">
                                                            <div className="absolute bottom-[-6px] left-3 w-3 h-3 bg-white border-r border-b border-gray-100 rotate-45" />
                                                            {!selectedAssetName && (
                                                                <p className="text-[9px] text-amber-600 font-bold px-3 py-1.5 bg-amber-50 rounded-xl mb-1 flex items-center gap-1.5">
                                                                    <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M12 3a9 9 0 100 18 9 9 0 000-18z" /></svg>
                                                                    Select an asset first
                                                                </p>
                                                            )}
                                                            <button
                                                                onClick={() => { if (selectedAssetName) { setActiveForm('buy'); setFormAmount(''); setShowActionMenu(false); } }}
                                                                disabled={!selectedAssetName}
                                                                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[11px] font-bold transition-all ${selectedAssetName ? 'text-black hover:bg-green-50 cursor-pointer' : 'text-gray-300 cursor-not-allowed'
                                                                    }`}
                                                            >
                                                                <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${selectedAssetName ? 'bg-green-100' : 'bg-gray-100'}`}>
                                                                    <svg className={`w-3 h-3 ${selectedAssetName ? 'text-green-600' : 'text-gray-300'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                                                                </div>
                                                                Buy Asset
                                                            </button>
                                                            <button
                                                                onClick={() => { if (selectedAssetName) { setActiveForm('sell'); setFormAmount(''); setShowActionMenu(false); } }}
                                                                disabled={!selectedAssetName}
                                                                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[11px] font-bold transition-all ${selectedAssetName ? 'text-black hover:bg-red-50 cursor-pointer' : 'text-gray-300 cursor-not-allowed'
                                                                    }`}
                                                            >
                                                                <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${selectedAssetName ? 'bg-red-100' : 'bg-gray-100'}`}>
                                                                    <svg className={`w-3 h-3 ${selectedAssetName ? 'text-red-600' : 'text-gray-300'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M20 12H4" /></svg>
                                                                </div>
                                                                Sell Asset
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>
                        )}
                    </main>
                </div>
            )}

            {/* ── Invitation Code Modal (chat gate) ── */}
            {showInviteModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ animation: 'fadeIn 0.3s ease' }}>
                    <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setShowInviteModal(false)} />
                    <div className="relative bg-white w-full max-w-[380px] overflow-hidden rounded-[32px] shadow-2xl border border-gray-100" style={{ animation: 'slideUp 0.35s cubic-bezier(0.16,1,0.3,1)' }}>
                        {/* Header */}
                        <div className="px-8 pt-10 pb-2 text-center">
                            <div className="w-16 h-16 mx-auto mb-5 bg-[#00E676]/10 rounded-2xl flex items-center justify-center">
                                <svg className="w-7 h-7 text-[#00E676]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                                </svg>
                            </div>
                            <h2 className="text-xl font-black text-black tracking-tight">Invitation Required</h2>
                            <p className="text-sm text-gray-400 font-medium mt-1.5">Enter your code to unlock access</p>
                        </div>
                        {/* Body */}
                        <div className="px-8 py-6 space-y-4">
                            {inviteError && (
                                <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-100 rounded-2xl">
                                    <svg className="w-4 h-4 text-red-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                    <span className="text-xs text-red-600 font-medium">{inviteError}</span>
                                </div>
                            )}
                            <div>
                                <label className="block text-[10px] font-bold text-gray-400 tracking-widest uppercase mb-2 ml-1">Invitation Code</label>
                                <input
                                    type="text"
                                    value={inviteCode}
                                    onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                                    onKeyDown={(e) => e.key === 'Enter' && handleInviteSubmit()}
                                    placeholder="ABC123"
                                    disabled={inviteChecking}
                                    className="w-full py-4 px-5 bg-gray-50 border-2 border-gray-100 rounded-2xl text-base text-black placeholder-gray-300 outline-none focus:border-[#00E676] focus:bg-white transition-all disabled:opacity-60 tracking-[0.25em] font-mono font-bold text-center"
                                    autoFocus
                                />
                            </div>
                            <button
                                onClick={handleInviteSubmit}
                                disabled={!inviteCode.trim() || inviteChecking}
                                className="w-full py-4 bg-[#00E676] text-black rounded-2xl text-sm font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#00C853] active:scale-[0.98] shadow-lg shadow-[#00E676]/20"
                            >
                                {inviteChecking ? (
                                    <span className="flex items-center justify-center gap-2">
                                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                                        Verifying...
                                    </span>
                                ) : 'Continue'}
                            </button>
                        </div>
                        {/* Footer */}
                        <div className="px-8 pb-8 text-center">
                            <p className="text-[11px] text-gray-400 font-medium leading-relaxed">
                                Don't have a code? Ask an existing<br />Loka member to share one with you.
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Chat;