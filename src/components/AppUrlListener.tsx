import { useEffect } from 'react';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

const LAST_HANDLED_OAUTH_URL_KEY = 'loka_last_handled_oauth_url';

export const AppUrlListener = () => {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    // Handle deep links received while app is running
    const listener = App.addListener('appUrlOpen', (event) => {
      console.log('[AppUrlListener] appUrlOpen fired:', event.url);
      handleOAuthUrl(event.url);
    });

    // Cold start fallback: check if the app was launched with an OAuth URL
    // Capacitor may have queued the URL before this listener was registered
    App.getLaunchUrl().then((result) => {
      if (result?.url) {
        console.log('[AppUrlListener] getLaunchUrl:', result.url);
        handleOAuthUrl(result.url);
      }
    });

    return () => {
      listener.then(l => l.remove());
    };
  }, []);

  return null;
};

function handleOAuthUrl(url: string) {
  try {
    const deepLinkUrl = new URL(url);
    if (
      deepLinkUrl.search &&
      deepLinkUrl.searchParams.has('privy_oauth_code') &&
      deepLinkUrl.searchParams.has('privy_oauth_state') &&
      deepLinkUrl.searchParams.has('privy_oauth_provider')
    ) {
      const lastHandledUrl = sessionStorage.getItem(LAST_HANDLED_OAUTH_URL_KEY);
      if (lastHandledUrl === url) {
        console.log('[AppUrlListener] Duplicate OAuth URL ignored');
        return;
      }

      console.log('[AppUrlListener] OAuth params detected, navigating...');
      const currentUrl = new URL(window.location.href);
      currentUrl.search = deepLinkUrl.search;

      if (window.location.search === currentUrl.search) {
        console.log('[AppUrlListener] OAuth params already present on page, skipping navigation');
        sessionStorage.setItem(LAST_HANDLED_OAUTH_URL_KEY, url);
        return;
      }

      sessionStorage.setItem(LAST_HANDLED_OAUTH_URL_KEY, url);
      // Privy expects a real navigation so it can consume the OAuth params.
      window.location.assign(currentUrl.toString());
    }
  } catch (error) {
    console.error('[AppUrlListener] Failed to parse deep link URL:', error);
  }
}
