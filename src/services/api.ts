import axios, { AxiosHeaders } from 'axios';
import {
    MOCK_ENGLISH_GRADE_RESPONSE,
    MOCK_ENGLISH_HISTORY,
    MOCK_ENGLISH_JOB_STATES,
    MOCK_CAPABILITIES_RESPONSE,
    MOCK_GRADE_RESPONSE,
    MOCK_HISTORY,
    MOCK_JOB_STATES,
    MOCK_UPLOAD_RESPONSE,
    getMockJobState,
    getMockSubmissionDetail,
} from './mockData';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1';
const USE_MOCK = (import.meta.env.VITE_USE_MOCK || 'false') === 'true';
const DEV_USER_ID = import.meta.env.DEV ? (import.meta.env.VITE_DEV_USER_ID || '').trim() : '';

const TOKEN_KEY = 'access_token';
const USER_KEY = 'auth_user';
const ACTIVE_PROFILE_ID_KEY = 'active_profile_id';
const ACTIVE_PROFILE_USER_ID_KEY = 'active_profile_user_id';
let redirectingToLogin = false;

const syncAccessTokenCookie = (token: string | null) => {
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    if (token && token.trim()) {
        document.cookie = `access_token=${encodeURIComponent(token.trim())}; Path=/; SameSite=Lax${secure}`;
        return;
    }
    document.cookie = `access_token=; Path=/; Max-Age=0; SameSite=Lax${secure}`;
};

const clearAuthState = () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem('user_id');
    localStorage.removeItem('user_phone');
    localStorage.removeItem(ACTIVE_PROFILE_ID_KEY);
    localStorage.removeItem(ACTIVE_PROFILE_USER_ID_KEY);
    syncAccessTokenCookie(null);
};

export const apiClient = axios.create({
    baseURL: API_BASE_URL,
    timeout: 60000,
    headers: {
        'Content-Type': 'application/json',
    },
});

apiClient.interceptors.request.use((config) => {
    if (window.location.pathname.includes('/login')) {
        redirectingToLogin = false;
    }
    const headers = AxiosHeaders.from(config.headers);
    const requestPath = (config.url || '').split(/[?#]/, 1)[0];
    const accountAssistant = /^\/assistant\/(conversations|turns|confirmations)(\/|$)/.test(requestPath) || /^\/(plans|plan-jobs)(\/|$)/.test(requestPath) || /^\/me\/api-keys(\/|$)/.test(requestPath);
    const token = localStorage.getItem(TOKEN_KEY);
    syncAccessTokenCookie(token);
    // Never accept a cached or caller-provided development identity.
    headers.delete('X-User-Id');
    if (token) {
        headers.Authorization = `Bearer ${token}`;
    } else if (!accountAssistant && DEV_USER_ID && !headers.has('Authorization')) {
        headers.set('X-User-Id', DEV_USER_ID);
    }
    if (accountAssistant) {
        headers.delete('X-Profile-Id');
    } else if (!headers['X-Profile-Id']) {
        const activeProfileId = (localStorage.getItem('active_profile_id') || '').trim();
        const activeProfileUserId = (localStorage.getItem(ACTIVE_PROFILE_USER_ID_KEY) || '').trim();
        const currentUserId = (localStorage.getItem('user_id') || '').trim();
        // Guard against stale profile_id leaking across account switches.
        if (activeProfileId && (!activeProfileUserId || (currentUserId && activeProfileUserId === currentUserId))) {
            headers['X-Profile-Id'] = activeProfileId;
        }
    }

    // 禁用 GET 请求的缓存，确保总是获取最新数据
    if (config.method === 'get' && !accountAssistant) {
        config.params = {
            ...config.params,
            _t: Date.now(),
        };
    }

    return { ...config, headers };
});

if (USE_MOCK) {
    let mockStartTime = 0;
    let mockSubject: 'math' | 'english' = 'math';
    type MockJobState =
        | (typeof MOCK_JOB_STATES)[keyof typeof MOCK_JOB_STATES]
        | (typeof MOCK_ENGLISH_JOB_STATES)[keyof typeof MOCK_ENGLISH_JOB_STATES];

    const requestSubject = (data: unknown): 'math' | 'english' => {
        let value = data;
        if (typeof value === 'string') {
            try {
                value = JSON.parse(value) as unknown;
            } catch {
                return 'math';
            }
        }
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            return String((value as Record<string, unknown>).subject || '').toLowerCase() === 'english'
                ? 'english'
                : 'math';
        }
        return 'math';
    };

    apiClient.interceptors.request.use(async (config) => {
        console.log(`[MOCK] Request: ${config.method?.toUpperCase()} ${config.url}`);

        await new Promise(r => setTimeout(r, 600));

        if (config.url?.includes('/capabilities')) {
            return { ...config, adapter: () => Promise.resolve({ data: MOCK_CAPABILITIES_RESPONSE, status: 200, statusText: 'OK', headers: {}, config }) };
        }

        if (config.url?.includes('/uploads')) {
            return { ...config, adapter: () => Promise.resolve({ data: MOCK_UPLOAD_RESPONSE, status: 200, statusText: 'OK', headers: {}, config }) };
        }

        if (config.url?.includes('/grade')) {
            mockStartTime = Date.now();
            mockSubject = requestSubject(config.data);
            const response = mockSubject === 'english' ? MOCK_ENGLISH_GRADE_RESPONSE : MOCK_GRADE_RESPONSE;
            return { ...config, adapter: () => Promise.resolve({ data: response, status: 200, statusText: 'OK', headers: {}, config }) };
        }

        if (config.url?.includes('/jobs/')) {
            const elapsed = Date.now() - mockStartTime;
            const mockData: MockJobState = getMockJobState(mockSubject, elapsed);

            const responseData = {
                ...mockData,
                elapsed_ms: elapsed,
                request: { upload_id: MOCK_UPLOAD_RESPONSE.upload_id, subject: mockSubject },
            };
            return { ...config, adapter: () => Promise.resolve({ data: responseData, status: 200, statusText: 'OK', headers: {}, config }) };
        }

        const requestPath = String(config.url || '').split('?')[0].replace(/\/+$/, '') || '/';
        const submissionDetailMatch = requestPath.match(/^\/submissions\/([^/]+)$/);
        if (submissionDetailMatch && config.method === 'get') {
            const submissionID = decodeURIComponent(submissionDetailMatch[1]);
            const detail = getMockSubmissionDetail(mockSubject, submissionID);
            return { ...config, adapter: () => Promise.resolve({ data: detail, status: 200, statusText: 'OK', headers: {}, config }) };
        }

        if (requestPath === '/submissions' && config.method === 'get') {
            const selectedSubject = String(config.params?.subject || '').toLowerCase();
            const items = selectedSubject === 'english'
                ? MOCK_ENGLISH_HISTORY.items
                : selectedSubject === 'math'
                    ? MOCK_HISTORY.items
                    : [...MOCK_HISTORY.items, ...MOCK_ENGLISH_HISTORY.items];
            return { ...config, adapter: () => Promise.resolve({ data: { items }, status: 200, statusText: 'OK', headers: {}, config }) };
        }

        return config;
    });
}

apiClient.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            const requestAuthHeader =
                String(error.config?.headers?.Authorization || error.config?.headers?.authorization || '').trim();
            const usedToken = requestAuthHeader.toLowerCase().startsWith('bearer ')
                ? requestAuthHeader.slice(7).trim()
                : '';
            const currentToken = (localStorage.getItem(TOKEN_KEY) || '').trim();

            // If this 401 comes from an old request that used an outdated token,
            // ignore it so we don't wipe the newly logged-in token.
            if (usedToken && currentToken && usedToken !== currentToken) {
                return Promise.reject(error);
            }

            // If this 401 came from a request sent before login (no Authorization header),
            // ignore it when we already have a newer token in storage.
            if (!usedToken && currentToken) {
                return Promise.reject(error);
            }

            // For authenticated failures (or no token currently stored), clear local auth state.
            if (usedToken || !currentToken) {
                clearAuthState();
            }

            const onLoginPage = window.location.pathname.includes('/login');
            if (!onLoginPage && !redirectingToLogin) {
                redirectingToLogin = true;
                window.location.replace('/login');
            }
        }
        if (error.response?.status === 402 && !window.location.pathname.includes('/subscribe')) {
            try {
                localStorage.setItem(
                    'last_quota_error',
                    JSON.stringify({
                        at: Date.now(),
                        detail: error.response?.data?.detail || null,
                        path: window.location.pathname + window.location.search,
                    })
                );
            } catch {
                // ignore
            }
            window.location.href = '/subscribe?reason=quota';
        }
        return Promise.reject(error);
    }
);
