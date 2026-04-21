import React, { useState } from 'react';
import { useLoginWithOAuth, useLoginWithEmail } from '@privy-io/react-auth';
import { api } from '../services/api';

interface AuthModalProps {
    onLogin: () => void;
    onClose: () => void;
    initialStep?: 'login' | 'invite';
}

type OAuthProvider = 'google' | 'twitter';

// Update this URL to your actual waitlist form
const WAITLIST_URL = 'https://forms.gle/lokacash-waitlist';

const AuthModal: React.FC<AuthModalProps> = ({ onLogin, onClose, initialStep = 'login' }) => {
    const [step, setStep] = useState<'login' | 'invite'>(initialStep);

    // --- Invite code step ---
    const [inviteCode, setInviteCode] = useState('');
    const [inviteError, setInviteError] = useState<string | null>(null);
    const [inviteChecking, setInviteChecking] = useState(false);

    const handleInviteSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!inviteCode.trim()) return;
        setInviteChecking(true);
        setInviteError(null);
        try {
            const result = await api.validateInvitationCode(inviteCode.trim());
            if (result.valid) {
                localStorage.setItem('loka_invite_code', inviteCode.trim().toUpperCase());
                api.useInvitationCode(inviteCode.trim().toUpperCase()).catch(() => {});
                onLogin(); // ✅ only grant access after code verified
            } else {
                setInviteError(result.reason || 'Invalid invitation code');
            }
        } catch {
            setInviteError('Failed to verify code. Please try again.');
        } finally {
            setInviteChecking(false);
        }
    };

    // --- Login step ---
    const [email, setEmail] = useState('');
    const [otpCode, setOtpCode] = useState('');
    const [codeSent, setCodeSent] = useState(false);
    const [authError, setAuthError] = useState<string | null>(null);

    const afterLogin = () => {
        setAuthError(null);
        // If already has invite code saved, let them in immediately
        const stored = localStorage.getItem('loka_invite_code');
        if (stored) {
            onLogin();
        } else {
            setStep('invite');
        }
    };

    const { initOAuth, loading: oauthLoading } = useLoginWithOAuth({
        onComplete: afterLogin,
        onError: (error: unknown) => {
            const msg = error && typeof error === 'object' && 'message' in error
                ? (error as any).message
                : String(error ?? 'Login failed');
            setAuthError(msg);
        },
    });

    const { sendCode, loginWithCode, state: emailState } = useLoginWithEmail({
        onComplete: afterLogin,
        onError: (error: unknown) => {
            const msg = error && typeof error === 'object' && 'message' in error
                ? (error as any).message
                : String(error ?? 'Email login failed');
            setAuthError(msg);
        },
    });

    const handleOAuthLogin = async (provider: OAuthProvider) => {
        setAuthError(null);
        try {
            await initOAuth({ provider });
        } catch (err) {
            setAuthError(err instanceof Error ? err.message : 'Login failed');
        }
    };

    const handleSendCode = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email.trim()) return;
        setAuthError(null);
        try {
            await sendCode({ email: email.trim() });
            setCodeSent(true);
            setOtpCode('');
        } catch (err) {
            setAuthError(err instanceof Error ? err.message : 'Failed to send code');
        }
    };

    const handleLoginWithCode = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!otpCode.trim()) return;
        setAuthError(null);
        try {
            await loginWithCode({ code: otpCode.trim() });
        } catch (err) {
            setAuthError(err instanceof Error ? err.message : 'Invalid code');
        }
    };

    const handleBackToEmail = () => {
        setCodeSent(false);
        setOtpCode('');
        setAuthError(null);
    };

    const isLoading = oauthLoading || emailState.status === 'sending-code' || emailState.status === 'submitting-code';

    return (
        <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center md:p-4" style={{ animation: 'fadeIn 0.3s ease' }}>
            <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={step === 'invite' ? undefined : onClose} />
            <style>{`
                @keyframes slideUpSheet { from { transform: translateY(100%); } to { transform: translateY(0); } }
                @keyframes slideUpCenter { from { opacity: 0; transform: translateY(24px) scale(0.96); } to { opacity: 1; transform: translateY(0) scale(1); } }
            `}</style>
            <div
                className="relative bg-white w-full max-h-[92vh] overflow-y-auto rounded-t-[28px] md:rounded-[32px] md:max-w-[380px] shadow-2xl border border-gray-100"
                style={{ animation: window.matchMedia('(max-width: 767px)').matches ? 'slideUpSheet 0.35s cubic-bezier(0.16,1,0.3,1)' : 'slideUpCenter 0.35s cubic-bezier(0.16,1,0.3,1)' }}
            >
                {step === 'login' ? (
                    /* ========== STEP 1: Login ========== */
                    <div className="bg-white p-8 space-y-5">
                        {/* Header */}
                        <div className="text-center space-y-2">
                            <div className="w-12 h-12 bg-black text-white rounded-xl mx-auto flex items-center justify-center font-serif text-2xl italic mb-4">
                                L
                            </div>
                            <h2 className="text-2xl font-bold text-black tracking-tight">Sign In</h2>
                            <p className="text-sm text-gray-500 font-medium">Create a smart wallet or connect your own.</p>
                        </div>

                        {/* Invite code notice */}
                        <div
                            className="flex items-start gap-3 px-4 py-3 rounded-2xl"
                            style={{ background: 'rgba(0,230,118,0.06)', border: '1px solid rgba(0,230,118,0.2)' }}
                        >
                            <svg className="w-4 h-4 mt-0.5 shrink-0" style={{ color: '#00C853' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                            </svg>
                            <p className="text-[11px] text-gray-600 font-medium leading-relaxed">
                                An <span className="font-black text-black">invitation code</span> is required after sign in.{' '}
                                Don't have one?{' '}
                                <a
                                    href={WAITLIST_URL}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="font-black underline underline-offset-2"
                                    style={{ color: '#00C853' }}
                                >
                                    Join the waitlist →
                                </a>
                            </p>
                        </div>

                        {/* Auth Options */}
                        <div className="space-y-3">
                            {authError && (
                                <div className="px-4 py-2.5 bg-red-50 border border-red-100 rounded-xl text-xs text-red-600">
                                    {authError}
                                </div>
                            )}

                            {/* Google */}
                            <button
                                onClick={() => handleOAuthLogin('google')}
                                disabled={isLoading}
                                className="w-full flex items-center justify-center gap-3 py-3.5 bg-gray-50 hover:bg-gray-100 border border-gray-100 rounded-2xl text-sm font-bold text-black transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                                <svg className="w-5 h-5" viewBox="0 0 24 24">
                                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                                </svg>
                                {oauthLoading ? 'Logging in...' : 'Continue with Google'}
                            </button>

                            {/* X (Twitter) */}
                            <button
                                onClick={() => handleOAuthLogin('twitter')}
                                disabled={isLoading}
                                className="w-full flex items-center justify-center gap-3 py-3.5 bg-gray-50 hover:bg-gray-100 border border-gray-100 rounded-2xl text-sm font-bold text-black transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                                </svg>
                                Continue with X
                            </button>

                            <div className="relative flex items-center py-1">
                                <div className="flex-grow border-t border-gray-100"></div>
                                <span className="flex-shrink-0 mx-4 text-[10px] font-bold text-gray-400 tracking-widest">OR</span>
                                <div className="flex-grow border-t border-gray-100"></div>
                            </div>

                            {/* Email */}
                            {codeSent ? (
                                <form onSubmit={handleLoginWithCode} className="space-y-3">
                                    <p className="text-xs text-gray-500">
                                        We sent a code to <span className="font-semibold text-black">{email}</span>
                                    </p>
                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        autoComplete="one-time-code"
                                        value={otpCode}
                                        onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                        placeholder="Enter 6-digit code"
                                        className="w-full py-3.5 px-4 bg-gray-50 border border-gray-200 rounded-2xl text-sm text-black placeholder-gray-400 outline-none focus:border-black focus:ring-1 focus:ring-black transition-all text-center tracking-[0.3em]"
                                    />
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            onClick={handleBackToEmail}
                                            className="flex-1 py-3.5 bg-gray-100 hover:bg-gray-200 rounded-2xl text-sm font-bold text-black transition-all"
                                        >
                                            Back
                                        </button>
                                        <button
                                            type="submit"
                                            disabled={otpCode.length < 6 || isLoading}
                                            className="flex-1 py-3.5 bg-black text-white hover:bg-gray-800 rounded-2xl text-sm font-bold transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                                        >
                                            {emailState.status === 'submitting-code' ? 'Verifying...' : 'Verify'}
                                        </button>
                                    </div>
                                </form>
                            ) : (
                                <form onSubmit={handleSendCode} className="space-y-3">
                                    <div className="relative">
                                        <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <rect x="2" y="4" width="20" height="16" rx="2"/>
                                            <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>
                                        </svg>
                                        <input
                                            type="email"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            placeholder="Enter your email address"
                                            disabled={isLoading}
                                            className="w-full py-3.5 pl-12 pr-4 bg-gray-50 border border-gray-200 rounded-2xl text-sm text-black placeholder-gray-400 outline-none focus:border-black focus:ring-1 focus:ring-black transition-all disabled:opacity-60"
                                        />
                                    </div>
                                    {email.trim() && (
                                        <button
                                            type="submit"
                                            disabled={isLoading}
                                            className="w-full py-3.5 bg-black text-white hover:bg-gray-800 rounded-2xl text-sm font-bold transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                                        >
                                            {emailState.status === 'sending-code' ? 'Sending code...' : 'Continue'}
                                        </button>
                                    )}
                                </form>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="text-center pt-1">
                            <p className="text-[10px] text-gray-400 font-medium leading-relaxed">
                                By connecting, you agree to our Terms of Service and Privacy Policy.{' '}
                                Fiat deposits require KYC verification.
                            </p>
                        </div>
                    </div>
                ) : (
                    /* ========== STEP 2: Invitation Code (shown after login) ========== */
                    <>
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
                        <div className="px-8 py-6">
                            <form onSubmit={handleInviteSubmit} className="space-y-4">
                                {inviteError && (
                                    <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-100 rounded-2xl">
                                        <svg className="w-4 h-4 text-red-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                        <span className="text-xs text-red-600 font-medium">{inviteError}</span>
                                    </div>
                                )}
                                <div>
                                    <label className="block text-[10px] font-bold text-gray-400 tracking-widest uppercase mb-2 ml-1">
                                        Invitation Code
                                    </label>
                                    <input
                                        type="text"
                                        value={inviteCode}
                                        onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                                        placeholder="ABC123"
                                        disabled={inviteChecking}
                                        className="w-full py-4 px-5 bg-gray-50 border-2 border-gray-100 rounded-2xl text-base text-black placeholder-gray-300 outline-none focus:border-[#00E676] focus:bg-white transition-all disabled:opacity-60 tracking-[0.25em] font-mono font-bold text-center"
                                        autoFocus
                                    />
                                </div>
                                <button
                                    type="submit"
                                    disabled={!inviteCode.trim() || inviteChecking}
                                    className="w-full py-4 bg-[#00E676] text-black rounded-2xl text-sm font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#00C853] active:scale-[0.98] shadow-lg shadow-[#00E676]/20"
                                >
                                    {inviteChecking ? (
                                        <span className="flex items-center justify-center gap-2">
                                            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                            </svg>
                                            Verifying...
                                        </span>
                                    ) : 'Unlock Access'}
                                </button>
                            </form>
                        </div>

                        {/* Footer */}
                        <div className="px-8 pb-8 text-center">
                            <p className="text-[11px] text-gray-400 font-medium leading-relaxed">
                                Don't have a code?{' '}
                                <a
                                    href={WAITLIST_URL}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="font-black underline underline-offset-2"
                                    style={{ color: '#00C853' }}
                                >
                                    Join the waitlist →
                                </a>
                            </p>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default AuthModal;
