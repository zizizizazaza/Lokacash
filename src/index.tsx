import React from 'react';
import ReactDOM from 'react-dom/client';
import { PrivyProvider } from '@privy-io/react-auth';
import { Capacitor } from '@capacitor/core';
import { SplashScreen } from '@capacitor/splash-screen';
import { AppUrlListener } from './components/AppUrlListener';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';

// Hide native splash screen immediately when JS bundle loads
if (Capacitor.isNativePlatform()) {
  SplashScreen.hide().catch(console.error);
}
const privyAppId = import.meta.env.VITE_PRIVY_APP_ID?.trim();
if (!privyAppId) {
  throw new Error('Missing VITE_PRIVY_APP_ID. Please set it in your .env file.');
}

// Use production domain for OAuth redirect on mobile (Capacitor)
const isNative = Capacitor.isNativePlatform();
const customOAuthRedirectUrl = isNative
  ? 'https://www.loka.cash/redirect'
  : undefined;

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <>
    <AppUrlListener />
    <PrivyProvider
      appId={privyAppId}
      config={{
        embeddedWallets: {
          createOnLogin: 'users-without-wallets',
        },
        ...(customOAuthRedirectUrl ? { customOAuthRedirectUrl } : {}),
      }}
    >
      <ErrorBoundary>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ErrorBoundary>
    </PrivyProvider>
  </>
);
