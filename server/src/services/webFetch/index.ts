/**
 * Public surface of the webFetch subsystem. Other modules (the socket
 * handler, the AI service, future tool definitions) should import from
 * here so internal refactors don't ripple outward.
 */
export { fetchUrl, pageToPromptBlock } from './fetchUrl.service.js';
export { extractUrls } from './urlExtractor.js';
export type { FetchedPage, FetchedPageError, FetchOutcome } from './types.js';
