
import { ProxyAgent } from 'undici';

let proxyAgent = null;

function getDispatcher() {
  const uri = (process.env.HTTPS_PROXY || process.env.HTTP_PROXY || '').trim();
  if (!uri) {
    return undefined;
  }
  if (!proxyAgent) {
    proxyAgent = new ProxyAgent({ uri });
  }
  return proxyAgent;
}


export async function fetchWithProxy(url, init = {}) {
  const dispatcher = getDispatcher();
  if (!dispatcher) {
    return fetch(url, init);
  }
  return fetch(url, { ...init, dispatcher });
}
