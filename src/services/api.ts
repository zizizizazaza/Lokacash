/**
 * Frontend API client for communicating with the backend server.
 */

const API_BASE = import.meta.env.VITE_API_BASE || '/api';

class ApiClient {
  private token: string | null = null;
  private tokenGetter: (() => Promise<string | null>) | null = null;
  private guestId: string | null = null;

  constructor() {
    this.token = sessionStorage.getItem('loka_token');
  }

  setTokenGetter(getter: () => Promise<string | null>) {
    this.tokenGetter = getter;
  }

  setToken(token: string) {
    this.token = token;
    sessionStorage.setItem('loka_token', token);
  }

  clearToken() {
    this.token = null;
    this.tokenGetter = null;
    sessionStorage.removeItem('loka_token');
  }

  /** Attach a guest identifier to unauthenticated requests as `x-guest-id`. */
  setGuestId(guestId: string) {
    this.guestId = guestId;
  }

  get isAuthenticated(): boolean {
    return Boolean(this.token || this.tokenGetter);
  }

  private async request<T>(path: string, options: RequestInit = {}, _isRetry = false): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    };

    const activeToken = this.tokenGetter ? await this.tokenGetter() : this.token;

    if (activeToken) {
      headers['Authorization'] = `Bearer ${activeToken}`;
    } else if (this.guestId) {
      headers['x-guest-id'] = this.guestId;
    }

    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
    });

    // Auto-retry on 401: refresh token from Privy and try once more
    if (response.status === 401 && !_isRetry && this.tokenGetter) {
      console.warn('[API] 401 received, refreshing token and retrying...');
      try {
        const freshToken = await this.tokenGetter();
        if (freshToken) {
          this.token = freshToken;
          sessionStorage.setItem('loka_token', freshToken);
          return this.request<T>(path, options, true);
        }
      } catch (refreshErr) {
        console.error('[API] Token refresh failed:', refreshErr);
      }
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }


    return response.json() as Promise<T>;
  }

  // ============ Auth ============

  async loginEmail(email: string, name?: string) {
    const result = await this.request<{ token: string; user: any }>('/auth/login/email', {
      method: 'POST',
      body: JSON.stringify({ email, name }),
    });
    this.setToken(result.token);
    return result;
  }

  async loginOAuth(provider: string, providerId: string, email?: string, name?: string) {
    const result = await this.request<{ token: string; user: any }>('/auth/login/oauth', {
      method: 'POST',
      body: JSON.stringify({ provider, providerId, email, name }),
    });
    this.setToken(result.token);
    return result;
  }

  async getMe() {
    return this.request<any>('/auth/me');
  }

  async acceptRisk() {
    return this.request('/auth/accept-risk', { method: 'POST' });
  }

  async getIflytekToken() {
    return this.request<{ url: string; appId: string }>('/voice/iflytek-token');
  }

  async runConsensus(mode: string, message: string) {
    return this.request<{
      success: boolean;
      groupId: string;
      mode: string;
      consensus: {
        id: string;
        finalAnswer: string;
        confidence: number;
        agentResponses: Array<{ agentId: string; answer: string; confidence: number }>;
        weightedVotes: Record<string, number>;
        roundsUsed: number;
        executionTime: number;
        consensusReached: boolean;
      };
    }>('/agents/consensus', {
      method: 'POST',
      body: JSON.stringify({ mode, message }),
    });
  }

  async syncPrivyUser(data: { email?: string; name?: string; avatar?: string }) {
    return this.request<any>('/auth/sync', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // ============ Projects ============

  async getProjects(filters?: { category?: string; status?: string }) {
    const params = new URLSearchParams();
    if (filters?.category) params.set('category', filters.category);
    if (filters?.status) params.set('status', filters.status);
    const qs = params.toString();
    return this.request<any[]>(`/projects${qs ? `?${qs}` : ''}`);
  }

  async getProject(id: string) {
    return this.request<any>(`/projects/${encodeURIComponent(id)}`);
  }

  async investInProject(projectId: string, amount: number) {
    return this.request<any>(`/projects/${encodeURIComponent(projectId)}/invest`, {
      method: 'POST',
      body: JSON.stringify({ amount }),
    });
  }

  async revokeInvestment(projectId: string) {
    return this.request<any>(`/projects/${encodeURIComponent(projectId)}/revoke-investment`, {
      method: 'DELETE',
    });
  }

  // ============ Treasury ============

  async getTreasuryStats() {
    return this.request<any>('/treasury/stats');
  }

  // ============ Portfolio ============

  async getHoldings() {
    return this.request<any[]>('/portfolio/holdings');
  }

  async getHistory() {
    return this.request<any[]>('/portfolio/history');
  }

  async getInvestments() {
    return this.request<any[]>('/portfolio/investments');
  }

  // ============ Trading ============

  async getTradeOrders(filters?: { projectId?: string; status?: string }) {
    const params = new URLSearchParams();
    if (filters?.projectId) params.set('projectId', filters.projectId);
    if (filters?.status) params.set('status', filters.status);
    const qs = params.toString();
    return this.request<any[]>(`/trade${qs ? `?${qs}` : ''}`);
  }

  async createTradeOrder(data: { projectId: string; listPrice: number; shares: number }) {
    return this.request<any>('/trade', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async buyTradeOrder(orderId: string) {
    return this.request<any>(`/trade/${encodeURIComponent(orderId)}/buy`, {
      method: 'POST',
    });
  }

  // ============ Mint / Redeem ============

  async mintAIUSD(amount: number) {
    return this.request<any>('/portfolio/mint', {
      method: 'POST',
      body: JSON.stringify({ amount }),
    });
  }

  async redeemAIUSD(amount: number) {
    return this.request<any>('/portfolio/redeem', {
      method: 'POST',
      body: JSON.stringify({ amount }),
    });
  }

  async swapToken(data: { token: string; tokenSymbol: string; action: 'buy' | 'sell'; amount: number; amountType?: 'token' | 'usd'; estimatedUSD?: number; chain?: string }) {
    return this.request<{
      transaction: any;
      action: string;
      token: string;
      tokenAmount: number;
      pricePerToken: number;
      totalUSD: number;
      slippage: number;
      gasFee: number;
      chain: string;
    }>('/portfolio/swap', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // ============ Chat / AI ============

  async getChatHistory(from?: string, to?: string, sessionId?: string) {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (sessionId) params.set('sessionId', sessionId);
    const qs = params.toString();
    return this.request<any[]>(`/chat/history${qs ? `?${qs}` : ''}`);
  }

  async getConversations() {
    return this.request<{ id: string; title: string; time: string; messageCount: number; firstMessageAt: string; lastMessageAt: string }[]>('/chat/conversations');
  }

  async sendChatMessage(content: string, agentId?: string) {
    return this.request<{ userMessage: any; assistantMessage: any }>('/chat/send', {
      method: 'POST',
      body: JSON.stringify({ content, agentId }),
    });
  }

  async clearChatHistory() {
    return this.request('/chat/history', { method: 'DELETE' });
  }

  async deleteConversation(sessionId: string) {
    return this.request(`/chat/conversations/${encodeURIComponent(sessionId)}`, { method: 'DELETE' });
  }

  // ============ Share links ============

  async createShareLink(sessionId: string) {
    return this.request<{ token: string; createdAt: string }>('/chat/share', {
      method: 'POST',
      body: JSON.stringify({ sessionId }),
    });
  }

  async getSharedChat(token: string) {
    return this.request<{
      token: string;
      sessionId: string;
      createdAt: string;
      messages: Array<{
        id: string;
        role: string;
        content: string;
        agentId?: string | null;
        metadata?: string | null;
        createdAt: string;
      }>;
    }>(`/chat/share/${encodeURIComponent(token)}`);
  }

  async revokeShareLink(token: string) {
    return this.request(`/chat/share/${encodeURIComponent(token)}`, { method: 'DELETE' });
  }

  // ============ Groups ============

  async getGroups() {
    return this.request<any[]>('/groups');
  }

  async getGroupMessages(groupId: string, cursor?: string, limit = 50) {
    const params = new URLSearchParams({ limit: String(limit) });
    if (cursor) params.set('cursor', cursor);
    return this.request<{ messages: any[]; nextCursor: string | null; hasMore: boolean }>(
      `/groups/${encodeURIComponent(groupId)}/messages?${params}`
    );
  }

  async sendGroupMessage(groupId: string, content: string) {
    return this.request<any>(`/groups/${encodeURIComponent(groupId)}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
  }

  async deleteGroupMessage(groupId: string, messageId: string) {
    return this.request<any>(`/groups/${encodeURIComponent(groupId)}/messages/${encodeURIComponent(messageId)}`, {
      method: 'DELETE',
    });
  }

  async joinGroup(groupId: string) {
    return this.request<any>(`/groups/${encodeURIComponent(groupId)}/join`, {
      method: 'POST',
    });
  }

  async leaveGroup(groupId: string) {
    return this.request<any>(`/groups/${encodeURIComponent(groupId)}/leave`, {
      method: 'POST',
    });
  }

  async getGroupMembers(groupId: string) {
    return this.request<any[]>(`/groups/${encodeURIComponent(groupId)}/members`);
  }

  // ============ Profile ============

  async getProfile() {
    return this.request<any>('/users/profile');
  }

  async updateProfile(data: { name?: string; avatar?: string; bio?: string; twitter?: string; linkedin?: string; personalWebsite?: string; isPublic?: boolean; }) {
    return this.request<any>('/users/profile', {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  // ============ Subscription & Quota ============

  async getQuota(): Promise<{ plan: string; roundtable: { used: number; limit: number; period: string }; fast?: { used: number; limit: number; period: string } }> {
    return this.request('/subscription/quota');
  }

  async startCheckout(data: { plan: 'pro' | 'max'; billingCycle: 'monthly' | 'yearly' }): Promise<{ url: string }> {
    return this.request('/subscription/checkout', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getGuestQuota(): Promise<{
    autoUsed: number;
    autoLimit: number;
    autoRemaining: number;
    resetAt: string;
  }> {
    return this.request('/guest/quota');
  }

  async getGuestConfig(): Promise<{ enabled: boolean; autoLimit: number; autoWindowHours: number }> {
    return this.request('/guest/config');
  }

  async getPublicConfig(): Promise<{
    plans: {
      free: { fast: number; roundtable: number; windowDays: number; monthlyUsd: number; yearlyUsd: number };
      pro: { fast: number; roundtable: number; windowDays: number; monthlyUsd: number; yearlyUsd: number };
      max: { fast: number; roundtable: number; windowDays: number; monthlyUsd: number; yearlyUsd: number };
    };
    guest: { enabled: boolean; autoLimit: number; autoWindowHours: number };
  }> {
    return this.request('/config/public');
  }

  async openBillingPortal(): Promise<{ url: string }> {
    return this.request('/subscription/portal', { method: 'POST' });
  }

  async uploadFile(file: File) {
    const formData = new FormData();
    formData.append('file', file);
    
    const activeToken = this.tokenGetter ? await this.tokenGetter() : this.token;
    const headers: Record<string, string> = {};
    if (activeToken) headers['Authorization'] = `Bearer ${activeToken}`;

    const response = await fetch(`${API_BASE}/upload`, {
      method: 'POST',
      headers,
      body: formData,
    });

    if (!response.ok) throw new Error('Upload failed');
    return response.json() as Promise<{ url: string; type: string }>;
  }

  // ============ Credit Score ============

  async getCreditScore() {
    return this.request<any>('/credit/score');
  }

  async getCreditHistory() {
    return this.request<any[]>('/credit/history');
  }

  async getCreditEvents() {
    return this.request<any[]>('/credit/events');
  }

  // ============ Enterprise / Apply ============

  async submitEnterprise(data: { companyName: string; country: string; registrationNo?: string }) {
    return this.request<any>('/apply/enterprise/submit', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getEnterprises() {
    return this.request<any[]>('/apply/enterprise');
  }

  async advanceEnterprise(id: string) {
    return this.request<any>(`/apply/enterprise/${encodeURIComponent(id)}/advance`, {
      method: 'POST',
    });
  }

  async submitApplication(data: {
    enterpriseId: string; projectName: string; category: string;
    monthlyRevenue: number; requestedAmount: number; proposedApy: number;
    durationDays: number; description?: string; collateralType?: string;
    collateralValue?: number; revenueSource?: string;
  }) {
    return this.request<any>('/apply/projects/apply', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getApplications() {
    return this.request<any[]>('/apply/projects/applications');
  }

  // ============ Enterprise Verification ============

  async getEnterpriseVerificationStatus() {
    return this.request<any>('/enterprise/verify-status');
  }

  async updateEnterpriseVerificationStep(data: {
    step: number;
    companyName?: string;
    country?: string;
    registrationNo?: string;
    description?: string;
    website?: string;
    foundedYear?: number;
    categories?: string;
    companyLogo?: string;
    licenseDoc?: string;
    uboName?: string;
    uboIdDoc?: string;
  }) {
    return this.request<any>('/enterprise/verify-step', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // ============ Stripe Revenue Verification ============

  async submitStripeApiKey(apiKey: string) {
    return this.request<{ success: boolean; message: string }>('/stripe/connect-key', {
      method: 'POST',
      body: JSON.stringify({ apiKey }),
    });
  }

  async disconnectStripe() {
    return this.request<{ success: boolean; message: string }>('/stripe/disconnect', {
      method: 'DELETE',
    });
  }

  async getStripeRevenue() {
    return this.request<{
      connected: boolean;
      keyStatus: string | null;
      mrr: number;
      last30dRev: number;
      momGrowth: number;
      lastSyncAt: string | null;
    }>('/stripe/revenue');
  }

  // ============ Portfolio Additional ============

  async getHistoricalBalance() {
    return this.request<any[]>('/portfolio/historical-balance');
  }

  // ============ Governance ============

  async getProposals() {
    return this.request<any[]>('/governance/proposals');
  }

  async createProposal(data: { title: string; description: string; category: string; durationDays?: number }) {
    return this.request<any>('/governance/proposals', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async voteOnProposal(proposalId: string, vote: 'for' | 'against') {
    return this.request<any>(`/governance/proposals/${encodeURIComponent(proposalId)}/vote`, {
      method: 'POST',
      body: JSON.stringify({ vote }),
    });
  }

  // ============ Repayment ============

  async getRepaymentSchedule(projectId: string) {
    return this.request<any[]>(`/repayment/${encodeURIComponent(projectId)}/schedule`);
  }

  // ============ Liquidation ============

  async getCollateral(projectId: string) {
    return this.request<any[]>(`/liquidation/${encodeURIComponent(projectId)}/collateral`);
  }

  async getLiquidationEvents(projectId: string) {
    return this.request<any[]>(`/liquidation/${encodeURIComponent(projectId)}/events`);
  }

  async getLiquidationSummary(projectId: string) {
    return this.request<any>(`/liquidation/${encodeURIComponent(projectId)}/summary`);
  }

  // ============ Invitation Codes ============

  async validateInvitationCode(code: string) {
    return this.request<{ valid: boolean; reason?: string; code?: string }>('/invitation/validate', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
  }

  async useInvitationCode(code: string) {
    return this.request<{ ok: boolean; code: string }>('/invitation/use', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
  }

  async generateInvitationCode() {
    return this.request<{ code: string; maxUses: number; useCount: number; createdAt: string }>('/invitation/generate', {
      method: 'POST',
    });
  }

  async getMyInvitationCodes() {
    return this.request<Array<{ code: string; maxUses: number; useCount: number; isActive: boolean; expiresAt: string | null; createdAt: string }>>('/invitation/my-codes');
  }

  // ============ TrustMRR ============

  async getTrustMRRStartups(category?: string) {
    const params = new URLSearchParams();
    if (category && category !== 'All') params.set('category', category);
    const qs = params.toString();
    return this.request<{ data: any[]; meta: any }>(`/trustmrr/startups${qs ? `?${qs}` : ''}`);
  }

  async getTrustMRRStartupDetail(slug: string) {
    return this.request<{ data: any; partial: boolean }>(`/trustmrr/startups/${encodeURIComponent(slug)}`);
  }

  // ============ Community ============

  // Friends
  async sendFriendRequest(userId: string) {
    return this.request<any>('/community/friends/request', { method: 'POST', body: JSON.stringify({ userId }) });
  }
  async acceptFriendRequest(friendshipId: string) {
    return this.request<any>('/community/friends/accept', { method: 'POST', body: JSON.stringify({ friendshipId }) });
  }
  async rejectFriendRequest(friendshipId: string) {
    return this.request<any>('/community/friends/reject', { method: 'POST', body: JSON.stringify({ friendshipId }) });
  }
  async removeFriend(userId: string) {
    return this.request<any>(`/community/friends/${userId}`, { method: 'DELETE' });
  }
  async getFriends() {
    return this.request<any[]>('/community/friends');
  }
  async getFriendRequests() {
    return this.request<any[]>('/community/friends/requests');
  }

  // Conversations
  async getCommunityConversations() {
    return this.request<any[]>('/community/conversations');
  }
  async createDMConversation(userId: string) {
    return this.request<any>('/community/conversations', { method: 'POST', body: JSON.stringify({ userId }) });
  }
  async getConversationMessages(convId: string, cursor?: string) {
    const params = new URLSearchParams();
    if (cursor) params.set('cursor', cursor);
    const qs = params.toString();
    return this.request<{ messages: any[]; nextCursor: string | null; hasMore: boolean }>(
      `/community/conversations/${convId}/messages${qs ? `?${qs}` : ''}`
    );
  }
  async sendConversationMessage(convId: string, content: string, attachmentUrl?: string, attachmentType?: string) {
    return this.request<any>(`/community/conversations/${convId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content, attachmentUrl, attachmentType }),
    });
  }

  async markConversationAsRead(convId: string) {
    return this.request<{ success: boolean }>(`/community/conversations/${convId}/read`, { method: 'POST' });
  }

  // User search
  async searchUsers(query: string) {
    return this.request<any[]>(`/community/users/search?q=${encodeURIComponent(query)}`);
  }

  // Groups
  async createCommunityGroup(data: { name: string; bio?: string; avatar?: string; memberIds?: string[] }) {
    return this.request<any>('/community/groups', { method: 'POST', body: JSON.stringify(data) });
  }
  async addGroupMembers(groupId: string, userIds: string[]) {
    return this.request<{ added: number; members: any[] }>(`/community/groups/${groupId}/members`, {
      method: 'POST',
      body: JSON.stringify({ userIds }),
    });
  }
  async removeGroupMember(groupId: string, memberId: string) {
    return this.request<{ members: any[] }>(`/community/groups/${groupId}/members/${memberId}`, {
      method: 'DELETE',
    });
  }
  async dissolveGroup(groupId: string) {
    return this.request<{ deleted: boolean; groupId: string }>(`/community/groups/${groupId}`, {
      method: 'DELETE',
    });
  }

  // Unread count (for badge)
  async getUnreadCount() {
    return this.request<{ unread: number; dmUnread: number; friendRequests: number }>('/community/unread-count');
  }

  // Polls
  async createPoll(groupId: string, data: { question: string; options: string[]; duration: string }) {
    return this.request<any>(`/community/groups/${groupId}/polls`, { method: 'POST', body: JSON.stringify(data) });
  }
  async votePoll(pollId: string, optionId: string) {
    return this.request<any>(`/community/polls/${pollId}/vote`, { method: 'POST', body: JSON.stringify({ optionId }) });
  }
  async getGroupPolls(groupId: string) {
    return this.request<any[]>(`/community/groups/${groupId}/polls`);
  }

  // ============ Discover ============

  async discoverGroups() {
    return this.request<any[]>('/groups/discover');
  }

  async discoverUsers() {
    return this.request<any[]>('/users/discover');
  }


}

// Singleton instance
export const api = new ApiClient();
