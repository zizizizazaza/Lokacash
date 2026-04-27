import React, { useState, useEffect } from 'react';

const TxModal: React.FC = () => {
    const [formAmount, setFormAmount] = useState('');
    const [formAsset, setFormAsset] = useState('USD');
    const [paymentMethod, setPaymentMethod] = useState<'card' | 'paypal' | 'revolut' | 'bank_transfer'>('card');
    const [fiatProvider, setFiatProvider] = useState<'swapped' | 'paybis' | 'alchemypay' | 'banxa'>('swapped');
    const [showMethodPicker, setShowMethodPicker] = useState(false);
    const [showProviderPicker, setShowProviderPicker] = useState(false);
    const [modalAction, setModalAction] = useState<'deposit' | 'withdraw' | null>(null);

    useEffect(() => {
        const handleOpenModal = (e: Event) => {
            const detail = (e as CustomEvent).detail;
            if (detail === 'deposit' || detail === 'withdraw') {
                setModalAction(detail);
                setFormAsset('USD');
                setFormAmount('');
                setShowMethodPicker(false);
                setShowProviderPicker(false);
            }
        };
        window.addEventListener('loka-open-modal', handleOpenModal);
        return () => window.removeEventListener('loka-open-modal', handleOpenModal);
    }, []);

    const handleModalSubmit = () => {
        if (!formAmount) return;
        setModalAction(null);
        setFormAmount('');
        setShowMethodPicker(false);
        setShowProviderPicker(false);
    };

    if (!modalAction) return null;

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => { setModalAction(null); setShowMethodPicker(false); setShowProviderPicker(false); }} />
            <div className="relative bg-white rounded-[2rem] shadow-2xl w-full max-w-md mx-4 p-6 animate-in zoom-in-95 fade-in slide-in-from-bottom-4 duration-300 max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="flex justify-between items-center mb-5">
                    <h3 className="text-lg font-bold text-black">{modalAction === 'deposit' ? 'Deposit' : 'Withdraw'}</h3>
                    <button onClick={() => { setModalAction(null); setShowMethodPicker(false); setShowProviderPicker(false); }} className="text-gray-400 hover:text-black bg-gray-50 hover:bg-gray-100 transition-colors p-2 rounded-full">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                {modalAction === 'withdraw' && (
                    <div className="flex justify-between items-center mb-5 px-1 pb-1">
                        <span className="text-[13px] text-gray-400 font-medium">Available balance</span>
                        <span
                            className="text-xl font-black text-black cursor-pointer hover:opacity-70 transition-opacity"
                            onClick={() => setFormAmount('12300')}
                        >
                            12,300.00 <span className="text-sm font-bold text-gray-400">USDC</span>
                        </span>
                    </div>
                )}

                {/* Fiat / Crypto Toggle */}
                <div className="flex gap-2 p-1 bg-gray-50 border border-gray-100 rounded-xl mb-4">
                    <button onClick={() => setFormAsset('USD')} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${['USD', 'EUR', 'CNY'].includes(formAsset) ? 'bg-white shadow-sm text-black border border-gray-100' : 'text-gray-500 hover:text-black border border-transparent'}`}>
                        <span className="flex items-center -space-x-1">
                            <img src="/logos/visa.svg" alt="" className="h-2.5" style={{ filter: ['USD', 'EUR', 'CNY'].includes(formAsset) ? 'brightness(0)' : 'brightness(0) opacity(0.4)' }} />
                            <img src="/logos/mastercard-color.svg" alt="" className="h-4" />
                        </span>
                        Fiat (Bank/Card)
                    </button>
                    <button onClick={() => setFormAsset('USDC')} className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${formAsset === 'USDC' ? 'bg-white shadow-sm text-black border border-gray-100' : 'text-gray-500 hover:text-black border border-transparent'}`}>
                        <img src="/logos/usdc.svg" alt="USDC" className="w-4 h-4" />
                        USDC (Web3)
                    </button>
                </div>

                {/* ---- FIAT Mode ---- */}
                {['USD', 'EUR', 'CNY'].includes(formAsset) && (
                    <div className="space-y-4">
                        <div className="flex gap-3">
                            {modalAction === 'deposit' ? (
                                <>
                                    <input type="number" placeholder="Amount to deposit" value={formAmount} onChange={(e) => setFormAmount(e.target.value)} className="flex-1 bg-gray-50 border border-gray-100 rounded-xl px-4 py-2.5 outline-none focus:border-black font-medium transition-colors text-sm" />
                                    <select value={formAsset} onChange={(e) => setFormAsset(e.target.value)} className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-2.5 outline-none focus:border-black font-medium transition-colors min-w-[90px] text-sm">
                                        <option value="USD">USD</option>
                                        <option value="EUR">EUR</option>
                                        <option value="CNY">CNY</option>
                                    </select>
                                </>
                            ) : (
                                <>
                                    <input type="number" placeholder="USDC amount to withdraw" value={formAmount} onChange={(e) => setFormAmount(e.target.value)} className="flex-1 bg-gray-50 border border-gray-100 rounded-xl px-4 py-2.5 outline-none focus:border-black font-medium transition-colors text-sm" />
                                    <span className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-2.5 text-sm font-bold text-gray-600 flex items-center">USDC</span>
                                </>
                            )}
                        </div>

                        {modalAction === 'deposit' && (
                            <div className="flex items-center justify-between px-1">
                                <span className="text-[11px] text-gray-400 font-medium">≈ {formAmount ? (parseFloat(formAmount) * 0.997).toFixed(2) : '0.00'} USDC ↕</span>
                                <div className="flex gap-1.5">
                                    {(formAsset === 'CNY' ? ['¥100', '¥500', '¥1000'] : ['$25', '$50', '$100', '$500']).map(amt => (
                                        <button key={amt} onClick={() => setFormAmount(amt.replace(/[^0-9]/g, ''))} className="px-2.5 py-1 bg-gray-100 hover:bg-gray-200 rounded-full text-[10px] font-bold text-gray-500 hover:text-black transition-all">{amt}</button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {modalAction === 'withdraw' && (
                            <div className="flex items-center justify-between bg-gray-50 border border-gray-100 rounded-xl px-4 py-2.5">
                                <div className="flex items-center gap-2">
                                    <span className="text-[11px] text-gray-400 font-medium">Receive in</span>
                                    <select value={formAsset} onChange={(e) => setFormAsset(e.target.value)} className="bg-white border border-gray-200 rounded-lg px-2.5 py-1 outline-none focus:border-black font-bold transition-colors text-xs">
                                        <option value="USD">USD</option>
                                        <option value="EUR">EUR</option>
                                        <option value="CNY">CNY</option>
                                    </select>
                                </div>
                                <span className="text-sm font-bold text-black">
                                    ≈ {formAmount ? (parseFloat(formAmount) * (formAsset === 'CNY' ? 7.1 : formAsset === 'EUR' ? 0.92 : 1.0) * 0.997).toFixed(2) : '0.00'} {formAsset}
                                </span>
                            </div>
                        )}

                        {/* Payment Method */}
                        <div>
                            <p className="text-[11px] font-semibold text-gray-400 mb-1.5 px-1">Payment Method</p>
                            <button onClick={() => { setShowMethodPicker(!showMethodPicker); setShowProviderPicker(false); }} className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl hover:border-gray-300 transition-all group">
                                <div className="flex items-center gap-3">
                                    <span className="flex items-center justify-center w-5 h-5">
                                        {paymentMethod === 'card'
                                            ? <img src="/logos/visa.svg" alt="" className="h-3.5" style={{ filter: 'brightness(0) saturate(100%) invert(12%) sepia(83%) saturate(5765%) hue-rotate(232deg)' }} />
                                            : paymentMethod === 'paypal'
                                            ? <img src="/logos/paypal.svg" alt="" className="h-3.5" style={{ filter: 'brightness(0) saturate(100%) invert(12%) sepia(95%) saturate(6000%) hue-rotate(220deg)' }} />
                                            : paymentMethod === 'revolut'
                                            ? <img src="/logos/revolut.svg" alt="" className="h-3.5" />
                                            : <svg className="w-5 h-5 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18" /><path d="M3 7V5a2 2 0 012-2h14a2 2 0 012 2v2" /><path d="M3 7h18v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" /><rect x="7" y="11" width="3" height="3" rx=".5" /></svg>
                                        }
                                    </span>
                                    <div className="text-left">
                                        <p className="text-xs font-bold text-black">{paymentMethod === 'card' ? 'Debit/Credit Card' : paymentMethod === 'paypal' ? 'PayPal' : paymentMethod === 'revolut' ? 'Revolut Pay' : 'Local Manual Bank Transfer'}</p>
                                        <p className="text-[10px] text-gray-400 flex items-center gap-1"><svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>{paymentMethod === 'bank_transfer' ? '1 day' : 'Less than 10 minutes'}</p>
                                    </div>
                                </div>
                                <svg className={`w-4 h-4 text-gray-400 transition-transform ${showMethodPicker ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                            </button>
                            {showMethodPicker && (
                                <div className="mt-1.5 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden animate-in fade-in slide-in-from-top-1 duration-200">
                                    <p className="px-4 pt-3 pb-2 text-[11px] font-semibold text-gray-400">{modalAction === 'deposit' ? 'Payment Method' : 'Withdrawal Method'}</p>
                                    {([
                                        { id: 'card' as const, label: 'Debit/Credit Card', time: 'Less than 10 minutes', color: 'bg-blue-600' },
                                        { id: 'paypal' as const, label: 'PayPal', time: 'Less than 10 minutes', color: 'bg-[#003087]' },
                                        { id: 'revolut' as const, label: 'Revolut Pay', time: 'Less than 10 minutes', color: 'bg-[#0075EB]' },
                                        { id: 'bank_transfer' as const, label: 'Local Manual Bank Transfer', time: '1 day', color: 'bg-emerald-600' },
                                    ]).map((m) => (
                                        <button key={m.id} onClick={() => { setPaymentMethod(m.id); setShowMethodPicker(false); }} className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors border-t border-gray-50 ${paymentMethod === m.id ? 'bg-gray-50' : ''}`}>
                                            <span className={`w-8 h-8 rounded-lg ${m.color} flex items-center justify-center p-1.5`}>
                                                {m.id === 'card' && <img src="/logos/visa.svg" alt="" className="h-full" style={{ filter: 'brightness(0) invert(1)' }} />}
                                                {m.id === 'paypal' && <img src="/logos/paypal.svg" alt="" className="h-full" style={{ filter: 'brightness(0) invert(1)' }} />}
                                                {m.id === 'revolut' && <img src="/logos/revolut.svg" alt="" className="h-full" style={{ filter: 'brightness(0) invert(1)' }} />}
                                                {m.id === 'bank_transfer' && <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18" /><path d="M3 7V5a2 2 0 012-2h14a2 2 0 012 2v2" /><path d="M3 7h18v10a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" /><rect x="7" y="11" width="3" height="3" rx=".5" /></svg>}
                                            </span>
                                            <div className="flex-1 text-left">
                                                <p className="text-xs font-bold text-black">{m.label}</p>
                                                <p className="text-[10px] text-gray-400 flex items-center gap-1"><svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>{m.time}</p>
                                            </div>
                                            {paymentMethod === m.id && <svg className="w-4 h-4 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Provider */}
                        <div>
                            <p className="text-[11px] font-semibold text-gray-400 mb-1.5 px-1">Provider</p>
                            <button onClick={() => { setShowProviderPicker(!showProviderPicker); setShowMethodPicker(false); }} className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl hover:border-gray-300 transition-all group">
                                <div className="flex items-center gap-3">
                                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-white text-[10px] font-black ${fiatProvider === 'swapped' ? 'bg-emerald-600' : fiatProvider === 'paybis' ? 'bg-violet-600' : fiatProvider === 'alchemypay' ? 'bg-blue-600' : 'bg-cyan-500'}`}>
                                        {fiatProvider === 'swapped' ? '⇄' : fiatProvider === 'paybis' ? 'P' : fiatProvider === 'alchemypay' ? 'A' : 'B'}
                                    </div>
                                    <div className="text-left">
                                        <p className="text-xs font-bold text-black flex items-center gap-1.5">
                                            {fiatProvider === 'swapped' ? 'Swapped.com' : fiatProvider === 'paybis' ? 'Paybis' : fiatProvider === 'alchemypay' ? 'AlchemyPay' : 'Banxa'}
                                            {fiatProvider === 'swapped' && <span className="text-[9px] px-1.5 py-0.5 bg-green-100 text-green-700 rounded-full font-bold">Lowest Price</span>}
                                        </p>
                                        <p className="text-[10px] text-gray-400">
                                            {modalAction === 'deposit'
                                                ? (formAmount ? `≈ ${(parseFloat(formAmount || '0') * (fiatProvider === 'swapped' ? 0.9803 : fiatProvider === 'paybis' ? 0.9533 : fiatProvider === 'alchemypay' ? 0.942 : 0.9433)).toFixed(2)} USDC` : 'Enter amount to see rate')
                                                : (formAmount ? `≈ ${(parseFloat(formAmount || '0') * (formAsset === 'CNY' ? 7.1 : formAsset === 'EUR' ? 0.92 : 1.0) * (fiatProvider === 'swapped' ? 0.9803 : fiatProvider === 'paybis' ? 0.9533 : fiatProvider === 'alchemypay' ? 0.942 : 0.9433)).toFixed(2)} ${formAsset}` : 'Enter amount to see rate')
                                            }
                                        </p>
                                    </div>
                                </div>
                                <svg className={`w-4 h-4 text-gray-400 transition-transform ${showProviderPicker ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                            </button>
                            {showProviderPicker && (
                                <div className="mt-1.5 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden animate-in fade-in slide-in-from-top-1 duration-200">
                                    <p className="px-4 pt-3 pb-2 text-[11px] font-semibold text-gray-400">Select Provider</p>
                                    <p className="px-4 pb-2 text-[9px] text-gray-400">External providers process fiat-to-crypto. Rates vary by provider.</p>
                                    {([
                                        { id: 'swapped' as const, label: 'Swapped.com', color: 'bg-emerald-600', rate: 0.9803, badge: 'Lowest Price' },
                                        { id: 'paybis' as const, label: 'Paybis', color: 'bg-violet-600', rate: 0.9533, badge: null as string | null },
                                        { id: 'alchemypay' as const, label: 'AlchemyPay', color: 'bg-blue-600', rate: 0.942, badge: null as string | null },
                                        { id: 'banxa' as const, label: 'Banxa', color: 'bg-cyan-500', rate: 0.9433, badge: null as string | null },
                                    ]).map((p) => (
                                        <button key={p.id} onClick={() => { setFiatProvider(p.id); setShowProviderPicker(false); }} className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors border-t border-gray-50 ${fiatProvider === p.id ? 'bg-gray-50' : ''}`}>
                                            <div className={`w-8 h-8 ${p.color} rounded-lg flex items-center justify-center text-white text-xs font-black shadow-sm`}>{p.label[0]}</div>
                                            <div className="flex-1 text-left">
                                                <p className="text-xs font-bold text-black flex items-center gap-1.5">{p.label}{p.badge && <span className="text-[8px] px-1.5 py-0.5 bg-green-100 text-green-700 rounded-full font-bold">{p.badge}</span>}</p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-xs font-bold text-black">
                                                    {modalAction === 'deposit'
                                                        ? (formAmount ? `${(parseFloat(formAmount || '0') * p.rate).toFixed(2)} USDC` : '—')
                                                        : (formAmount ? `${(parseFloat(formAmount || '0') * (formAsset === 'CNY' ? 7.1 : formAsset === 'EUR' ? 0.92 : 1.0) * p.rate).toFixed(2)} ${formAsset}` : '—')
                                                    }
                                                </p>
                                                {formAmount && <p className="text-[10px] text-gray-400">{modalAction === 'deposit' ? `~${formAsset === 'CNY' ? '¥' : formAsset === 'EUR' ? '€' : '$'}${formAmount}` : `~${formAmount} USDC`}</p>}
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        <button onClick={handleModalSubmit} disabled={!formAmount} className="w-full py-3 bg-black text-white rounded-xl text-sm font-bold hover:bg-gray-800 transition-all tracking-wide disabled:opacity-40 disabled:cursor-not-allowed mt-1">
                            {modalAction === 'deposit' ? `Pay with ${fiatProvider === 'swapped' ? 'Swapped.com' : fiatProvider === 'paybis' ? 'Paybis' : fiatProvider === 'alchemypay' ? 'AlchemyPay' : 'Banxa'}` : `Withdraw via ${fiatProvider === 'swapped' ? 'Swapped.com' : fiatProvider === 'paybis' ? 'Paybis' : fiatProvider === 'alchemypay' ? 'AlchemyPay' : 'Banxa'}`}
                        </button>
                        <p className="text-[9px] text-gray-400 text-center">You will be redirected to complete payment on the provider's secure page.</p>
                        <div className="text-[10px] text-gray-400 font-medium flex items-center gap-1.5 px-1"><div className="w-1.5 h-1.5 rounded-full bg-blue-500" /> Processed by selected provider. KYC may be required.</div>
                    </div>
                )}

                {/* ---- CRYPTO (Web3) Mode ---- */}
                {formAsset === 'USDC' && modalAction === 'deposit' && (
                    <div className="space-y-3">
                        {/* Network: fixed to Base */}
                        <div className="flex items-center gap-2 px-1">
                            <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center">
                                <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M12 1.5l-8 4.5v12l8 4.5 8-4.5V6l-8-4.5zM12 4l5.2 3L12 10 6.8 7 12 4z" /></svg>
                            </div>
                            <span className="text-xs font-bold text-black">Base Network</span>
                        </div>

                        {/* QR Code + Address */}
                        <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4 flex flex-col items-center gap-3">
                            <div className="bg-white p-3 rounded-xl shadow-sm">
                                <svg viewBox="0 0 100 100" className="w-28 h-28">
                                    <rect width="100" height="100" fill="white" />
                                    <g fill="black">
                                        <rect x="4" y="4" width="22" height="22" /><rect x="7" y="7" width="16" height="16" fill="white" /><rect x="10" y="10" width="10" height="10" />
                                        <rect x="74" y="4" width="22" height="22" /><rect x="77" y="7" width="16" height="16" fill="white" /><rect x="80" y="10" width="10" height="10" />
                                        <rect x="4" y="74" width="22" height="22" /><rect x="7" y="77" width="16" height="16" fill="white" /><rect x="10" y="80" width="10" height="10" />
                                        {[30, 34, 38, 42, 46, 50, 54, 58, 62, 66, 70].map(x => [30, 34, 38, 42, 46, 50, 54, 58, 62, 66, 70].map(y => (x + y) % 8 < 4 ? <rect key={`${x}-${y}`} x={x} y={y} width="3" height="3" /> : null))}
                                        {[4, 8, 12, 16, 20, 30, 34, 38, 46, 54, 58, 62, 66, 74, 78, 82, 86, 90].map(x => <rect key={`t-${x}`} x={x} y={30} width="3" height="3" opacity={(x * 7) % 3 === 0 ? 1 : 0.6} />)}
                                        {[4, 8, 12, 16, 20, 30, 34, 38, 46, 54, 58, 62, 66, 74, 78, 82, 86, 90].map(y => <rect key={`l-${y}`} x={30} y={y} width="3" height="3" opacity={(y * 5) % 3 === 0 ? 1 : 0.6} />)}
                                    </g>
                                </svg>
                            </div>
                            <p className="text-xs font-mono text-black text-center leading-relaxed break-all px-2">
                                <span className="font-bold">GS3J</span>Jwf7DuU62Zs8fagCEK<br />eN81Lc9NuqUvHQAWXF<span className="font-bold">Eyr5</span>
                            </p>
                        </div>

                        <div className="flex justify-between items-center px-2">
                            <span className="text-[11px] text-gray-400">Minimum Deposit</span>
                            <span className="text-[11px] font-bold text-black">0.5 USDC</span>
                        </div>

                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
                            <p className="text-[11px] text-amber-700 font-medium leading-relaxed">
                                Only send <span className="font-bold">USDC on Base</span> to this address.<br />
                                Sending other tokens may result in loss of funds.<br />
                                Contract address ends in <span className="font-bold text-blue-600">02913</span>.
                            </p>
                        </div>

                        <button onClick={() => navigator.clipboard?.writeText('GS3JJwf7DuU62Zs8fagCEKeN81Lc9NuqUvHQAWXFEyr5')} className="w-full py-3 bg-black text-white rounded-xl text-sm font-bold hover:bg-gray-800 transition-all">
                            Copy address
                        </button>

                    </div>
                )}

                {formAsset === 'USDC' && modalAction === 'withdraw' && (
                    <div className="space-y-4">
                        <div className="flex gap-3">
                            <input type="number" placeholder="Amount to withdraw" value={formAmount} onChange={(e) => setFormAmount(e.target.value)} className="flex-1 bg-gray-50 border border-gray-100 rounded-xl px-4 py-2.5 outline-none focus:border-black font-medium transition-colors text-sm" />
                            <span className="bg-gray-50 border border-gray-100 rounded-xl px-4 py-2.5 text-sm font-medium text-gray-600">USDC</span>
                        </div>
                        <div className="p-4 bg-gray-50 rounded-xl border border-gray-100 space-y-3">
                            <p className="text-[11px] font-semibold text-gray-400">Destination Wallet</p>
                            <input type="text" placeholder="Enter Web3 wallet address (0x...)" className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2.5 text-xs outline-none focus:border-black transition-colors" />
                            <div className="flex items-center gap-2 pt-1">
                                <div className="w-4 h-4 rounded-full bg-blue-600 flex items-center justify-center">
                                    <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M12 1.5l-8 4.5v12l8 4.5 8-4.5V6l-8-4.5zM12 4l5.2 3L12 10 6.8 7 12 4z" /></svg>
                                </div>
                                <span className="text-[11px] font-bold text-gray-500">Base Network</span>
                            </div>
                        </div>
                        <button onClick={handleModalSubmit} disabled={!formAmount} className="w-full py-3 bg-black text-white rounded-xl text-sm font-bold hover:bg-gray-800 transition-all tracking-wide disabled:opacity-40 disabled:cursor-not-allowed">
                            Submit Withdrawal
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default TxModal;
