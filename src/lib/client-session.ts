/* Session chỉ gồm token + thông tin công khai của user,
   KHÔNG bao giờ chứa password. */
import { AppUser } from '@/lib/auth-system';

export const STORAGE_SESSION_KEY = 'finder_session';

export type SessionData = {
authToken: string
    user: Omit<AppUser, 'password'>;
};

export function loadSession(): SessionData | null {
    if (typeof window === 'undefined') {
        return null;
    }

    try {
        const saved = window.localStorage.getItem(STORAGE_SESSION_KEY);
        if (!saved) {
            return null;
        }
        const parsed = JSON.parse(saved) as SessionData;
        if (!parsed?.authToken || !parsed?.user?.id) {
            return null;
        }
        return parsed;
    } catch {
        window.localStorage.removeItem(STORAGE_SESSION_KEY);
        return null;
    }
}

export function persistSession(session: SessionData | null) {
    if (typeof window === 'undefined') {
        return;
    }

    if (!session) {
        window.localStorage.removeItem(STORAGE_SESSION_KEY);
        return;
    }

    window.localStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(session));
}

export function clearLegacyAuthData() {
    if (typeof window === 'undefined') {
        return;
    }
    window.localStorage.removeItem('finder_users');
    window.localStorage.removeItem('finder_current_user');
}
