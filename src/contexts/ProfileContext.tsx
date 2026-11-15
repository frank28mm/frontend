import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { apiClient } from '@/services/api';
import type { ProfileItem, ProfilesResponse } from '@/services/types';

const ACTIVE_PROFILE_STORAGE_KEY = 'active_profile_id';
const ACTIVE_PROFILE_USER_ID_KEY = 'active_profile_user_id';
const TOKEN_KEY = 'access_token';
const AUTH_CHANGED_EVENT = 'auth:changed';

type ProfileContextValue = {
  profiles: ProfileItem[];
  defaultProfileId: string | null;
  activeProfileId: string | null;
  activeProfile: ProfileItem | null;
  loading: boolean;
  refresh: () => Promise<void>;
  setActiveProfile: (profileId: string) => Promise<void>;
};

const ProfileContext = createContext<ProfileContextValue | undefined>(undefined);

interface RawProfileItem {
  profile_id?: unknown;
  display_name?: unknown;
  avatar_url?: unknown;
  is_default?: unknown;
  created_at?: unknown;
}

const normalizeProfiles = (input: unknown): ProfileItem[] => {
  if (!Array.isArray(input)) return [];
  return input
    .filter((p): p is ProfileItem => Boolean(p && typeof p === 'object' && 'profile_id' in p))
    .map((p): ProfileItem => ({
      profile_id: String((p as RawProfileItem).profile_id || '').trim(),
      display_name: String((p as RawProfileItem).display_name || '').trim() || '默认',
      avatar_url: (p as RawProfileItem).avatar_url ? String((p as RawProfileItem).avatar_url).trim() : null,
      is_default: Boolean((p as RawProfileItem).is_default),
      created_at: (p as RawProfileItem).created_at ? String((p as RawProfileItem).created_at).trim() : null,
    }))
    .filter((p) => Boolean(p.profile_id));
};

export const ProfileProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [profiles, setProfiles] = useState<ProfileItem[]>([]);
  const [defaultProfileId, setDefaultProfileId] = useState<string | null>(null);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(() => {
    const stored = localStorage.getItem(ACTIVE_PROFILE_STORAGE_KEY);
    return stored ? stored.trim() : null;
  });
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const token = (localStorage.getItem(TOKEN_KEY) || '').trim();
    if (!token) {
      setProfiles([]);
      setDefaultProfileId(null);
      setActiveProfileId(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const res = await apiClient.get<ProfilesResponse>('/me/profiles');
      const nextProfiles = normalizeProfiles(res.data?.profiles);
      const nextDefault = String(res.data?.default_profile_id || '').trim() || null;

      // DEV helper removed to avoid interference
      /*
      if (
        import.meta.env.DEV &&
        nextProfiles.length === 1
      ) {
         ...
      }
      */

      setProfiles(nextProfiles);
      setDefaultProfileId(nextDefault);

      const stored = (localStorage.getItem(ACTIVE_PROFILE_STORAGE_KEY) || '').trim();
      const nextActive =
        (stored && nextProfiles.some((p) => p.profile_id === stored) ? stored : null) ||
        (nextDefault && nextProfiles.some((p) => p.profile_id === nextDefault) ? nextDefault : null) ||
        (nextProfiles[0]?.profile_id || null);

      if (nextActive) {
        localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, nextActive);
        const uid = (localStorage.getItem('user_id') || '').trim();
        if (uid) localStorage.setItem(ACTIVE_PROFILE_USER_ID_KEY, uid);
      } else {
        localStorage.removeItem(ACTIVE_PROFILE_STORAGE_KEY);
        localStorage.removeItem(ACTIVE_PROFILE_USER_ID_KEY);
      }
      setActiveProfileId(nextActive);
    } catch {
      // If profiles API is unavailable, keep a best-effort local activeProfileId.
      const stored = (localStorage.getItem(ACTIVE_PROFILE_STORAGE_KEY) || '').trim();
      setActiveProfileId(stored || null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const onAuthChanged = () => {
      refresh();
    };
    window.addEventListener(AUTH_CHANGED_EVENT, onAuthChanged);
    return () => {
      window.removeEventListener(AUTH_CHANGED_EVENT, onAuthChanged);
    };
  }, [refresh]);

  const setActiveProfile = useCallback(
    async (profileId: string) => {
      const pid = String(profileId || '').trim();
      if (!pid) return;
      if (pid === activeProfileId) return;

      localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, pid);
      const uid = (localStorage.getItem('user_id') || '').trim();
      if (uid) localStorage.setItem(ACTIVE_PROFILE_USER_ID_KEY, uid);
      setActiveProfileId(pid);
      try {
        await apiClient.post(`/me/profiles/${encodeURIComponent(pid)}/set_default`);
      } catch {
        // best-effort only
      }
    },
    [activeProfileId]
  );

  const activeProfile = useMemo(() => {
    if (!profiles.length) return null;
    if (activeProfileId) {
      const hit = profiles.find((p) => p.profile_id === activeProfileId);
      if (hit) return hit;
    }
    return profiles.find((p) => p.is_default) || profiles[0] || null;
  }, [profiles, activeProfileId]);

  const value: ProfileContextValue = {
    profiles,
    defaultProfileId,
    activeProfileId,
    activeProfile,
    loading,
    refresh,
    setActiveProfile,
  };

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
};

// eslint-disable-next-line react-refresh/only-export-components
export const useProfile = (): ProfileContextValue => {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error('useProfile must be used within ProfileProvider');
  return ctx;
};
