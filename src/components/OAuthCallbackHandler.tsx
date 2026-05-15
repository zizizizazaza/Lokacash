import React, { useState, useEffect, useRef } from 'react';
import { useLoginWithOAuth, usePrivy, useCreateWallet } from '@privy-io/react-auth';


const OAuthCallbackHandler: React.FC = () => {
    const { ready, authenticated, user } = usePrivy();
    const { createWallet } = useCreateWallet();
    const hasTriedCreate = useRef(false);

    const [hasOAuthParams, setHasOAuthParams] = useState(() =>
        typeof window !== 'undefined' && window.location.search.includes('privy_oauth_')
    );

    // Listen for in-place URL updates from AppUrlListener (popstate)
    useEffect(() => {
        const checkOAuthParams = () => {
            if (window.location.search.includes('privy_oauth_')) {
                setHasOAuthParams(true);
            }
        };
        window.addEventListener('popstate', checkOAuthParams);
        return () => window.removeEventListener('popstate', checkOAuthParams);
    }, []);

    const linkedWallets = (user?.linkedAccounts ?? []).filter(
        (acc) => acc.type === 'wallet' || acc.type === 'smart_wallet'
    ) as Array<{ address: string; walletClientType?: string }>;
    const hasWallet = linkedWallets.length > 0;


    const { state: oauthState } = useLoginWithOAuth({
        onComplete: () => {
            setHasOAuthParams(false);
            if (typeof window !== 'undefined' && window.location.search.includes('privy_oauth_')) {
                const url = new URL(window.location.href);
                url.searchParams.delete('privy_oauth_state');
                url.searchParams.delete('privy_oauth_provider');
                url.searchParams.delete('privy_oauth_code');
                window.history.replaceState({}, '', url.pathname + (url.search || ''));
            }
        },
        onError: () => setHasOAuthParams(false),
    });


    useEffect(() => {
        if (!ready || !authenticated || !user) return;
        if (hasTriedCreate.current) return;
        if (hasWallet) return;

        hasTriedCreate.current = true;
        createWallet().catch((err) => {
            console.error('Failed to create embedded wallet:', err);
            hasTriedCreate.current = false;
        });
    }, [ready, authenticated, user, hasWallet, createWallet]);


    const isOAuthProcessing = hasOAuthParams && (oauthState.status === 'initial' || oauthState.status === 'loading');
    const isWaitingForWallet = authenticated && !hasWallet; 
    const isLoading = isOAuthProcessing || isWaitingForWallet;

    if (!isLoading) return null;

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-white/95 backdrop-blur-sm animate-fadeIn">
            <div className="flex flex-col items-center gap-6">
                <div className="w-12 h-12 bg-black text-white rounded-xl flex items-center justify-center font-serif text-2xl italic">L</div>
                <div className="flex flex-col items-center gap-3">
                    <div className="w-8 h-8 border-2 border-black border-t-transparent rounded-full animate-spin" />
                    <p className="text-sm font-bold text-gray-600 tracking-wide">
                        {isWaitingForWallet ? 'Setting up your wallet...' : 'Signing you in...'}
                    </p>
                </div>
            </div>
        </div>
    );
};

export default OAuthCallbackHandler;
