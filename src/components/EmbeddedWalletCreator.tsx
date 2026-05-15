import React, { useEffect, useRef } from 'react';
import { usePrivy, useCreateWallet } from '@privy-io/react-auth';


const EmbeddedWalletCreator: React.FC = () => {
    const { ready, authenticated, user } = usePrivy();
    const { createWallet } = useCreateWallet();
    const hasTriedCreate = useRef(false);

    useEffect(() => {
        if (!ready || !authenticated || !user) return;
        if (hasTriedCreate.current) return;

        const hasEmbeddedWallet = (user.linkedAccounts ?? []).some(
            (acc) => acc.type === 'wallet' || acc.type === 'smart_wallet'
        );
        if (hasEmbeddedWallet) return;

        hasTriedCreate.current = true;
        createWallet().catch((err) => {
            console.error('Failed to create embedded wallet:', err);
            hasTriedCreate.current = false;
        });
    }, [ready, authenticated, user, createWallet]);

    return null;
};

export default EmbeddedWalletCreator;
