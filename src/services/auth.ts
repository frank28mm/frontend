import { apiClient } from './api';

const TOKEN_KEY = 'access_token';
const USER_KEY = 'auth_user';
const ACTIVE_PROFILE_ID_KEY = 'active_profile_id';
const ACTIVE_PROFILE_USER_ID_KEY = 'active_profile_user_id';
const PARENT_DISPLAY_NAME_KEY = 'parent_display_name';
export const AUTH_CHANGED_EVENT = 'auth:changed';
export const PARENT_DISPLAY_NAME_CHANGED_EVENT = 'parent_display_name:changed';

const syncAccessTokenCookie = (token: string | null) => {
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  if (token && token.trim()) {
    document.cookie = `access_token=${encodeURIComponent(token.trim())}; Path=/; SameSite=Lax${secure}`;
    return;
  }
  document.cookie = `access_token=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
};

const emitParentDisplayNameChanged = () => {
  window.dispatchEvent(new Event(PARENT_DISPLAY_NAME_CHANGED_EVENT));
};

const setParentDisplayNameCache = (name: string | null) => {
  const next = (name || '').trim();
  if (next) {
    localStorage.setItem(PARENT_DISPLAY_NAME_KEY, next);
  } else {
    localStorage.removeItem(PARENT_DISPLAY_NAME_KEY);
  }
  emitParentDisplayNameChanged();
};

const refreshParentDisplayNameFromServer = async (): Promise<string | null> => {
  try {
    const response = await apiClient.get<{ nickname?: string | null }>('/me/account');
    const nickname = (response.data?.nickname || '').trim();
    setParentDisplayNameCache(nickname || null);
    return nickname || null;
  } catch {
    return null;
  }
};

export interface AuthUser {
  user_id: string;
  phone: string;
  created_at?: string;
  last_login_at?: string;
}

export interface SmsSendResponse {
  ok: boolean;
  expires_in_seconds: number;
  code?: string;
}

export interface SmsVerifyResponse {
  access_token: string;
  token_type: string;
  expires_at: string;
  user: AuthUser;
}

export const authService = {
  async sendSmsCode(phone: string): Promise<SmsSendResponse> {
    const response = await apiClient.post<SmsSendResponse>('/auth/sms/send', { phone });
    return response.data;
  },

  async verifySmsCode(phone: string, code: string): Promise<SmsVerifyResponse> {
    const response = await apiClient.post<SmsVerifyResponse>('/auth/sms/verify', { phone, code });
    const data = response.data;

    // Switching identity: clear cached profile selection so /me/profiles can re-seed correctly.
    localStorage.removeItem(ACTIVE_PROFILE_ID_KEY);
    localStorage.removeItem(ACTIVE_PROFILE_USER_ID_KEY);
    setParentDisplayNameCache(null);

    localStorage.setItem(TOKEN_KEY, data.access_token);
    syncAccessTokenCookie(data.access_token);
    localStorage.setItem(USER_KEY, JSON.stringify(data.user));
    localStorage.setItem('user_id', data.user.user_id);
    localStorage.setItem('user_phone', data.user.phone);
    window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
    void refreshParentDisplayNameFromServer();

    return data;
  },

  async loginEmail(email: string, password: string): Promise<SmsVerifyResponse> {
    const response = await apiClient.post<SmsVerifyResponse>('/auth/login/email', { email, password });
    const data = response.data;

    // Switching identity: clear cached profile selection so /me/profiles can re-seed correctly.
    localStorage.removeItem(ACTIVE_PROFILE_ID_KEY);
    localStorage.removeItem(ACTIVE_PROFILE_USER_ID_KEY);
    setParentDisplayNameCache(null);

    localStorage.setItem(TOKEN_KEY, data.access_token);
    syncAccessTokenCookie(data.access_token);
    localStorage.setItem(USER_KEY, JSON.stringify(data.user));
    localStorage.setItem('user_id', data.user.user_id);
    localStorage.setItem('user_phone', data.user.phone);
    window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
    void refreshParentDisplayNameFromServer();

    return data;
  },

  async logout(): Promise<void> {
    try {
      await apiClient.post('/auth/logout');
    } catch {
      // ignore
    }
    localStorage.removeItem(TOKEN_KEY);
    syncAccessTokenCookie(null);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem('user_id');
    localStorage.removeItem('user_phone');
    localStorage.removeItem(ACTIVE_PROFILE_ID_KEY);
    localStorage.removeItem(ACTIVE_PROFILE_USER_ID_KEY);
    setParentDisplayNameCache(null);
    window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
  },

  async refreshParentDisplayName(): Promise<string | null> {
    return refreshParentDisplayNameFromServer();
  },

  getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  },

  getUser(): AuthUser | null {
    const stored = localStorage.getItem(USER_KEY);
    if (!stored) return null;
    try {
      return JSON.parse(stored) as AuthUser;
    } catch {
      return null;
    }
  },

  isLoggedIn(): boolean {
    return !!this.getToken();
  },
};
