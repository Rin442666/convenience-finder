'use client';

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
    useSyncExternalStore,
    type ReactNode,
} from 'react';
import { AppUser } from '@/lib/auth-system';
import { toast } from '@/components/Toast';
import {
    clearLegacyAuthData,
    loadSession,
    persistSession,
} from '@/lib/client-session';

/* Dark mode lưu ở class "dark" trên <html> (script chặn trong <head> của
   layout gắn sẵn trước khi React hydrate). Đọc qua useSyncExternalStore
   để lần render đầu của client khớp HTML từ server, tránh hydration mismatch. */
function subscribeDarkMode(onChange: () => void): () => void {
    const observer = new MutationObserver(onChange);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
}

function getDarkModeSnapshot(): boolean {
    return document.documentElement.classList.contains('dark');
}

function getDarkModeServerSnapshot(): boolean {
    return false;
}

export type PublicUser = Omit<AppUser, 'password'>;

type AppContextValue = {
    currentUser: PublicUser | null;
    authToken: string | null;
    authReady: boolean;
    darkMode: boolean;
    toggleDarkMode: () => void;
    login: (email: string, password: string) => Promise<boolean>;
    register: (fullName: string, email: string, password: string, username?: string) => Promise<boolean>;
    logout: () => void;
    updateCurrentUser: (user: PublicUser) => void;
    requestAuth: () => void;
    authRequestKey: number;
};

const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
    const ctx = useContext(AppContext);
    if (!ctx) {
        throw new Error('useApp phải dùng bên trong <AppProvider>.');
    }
    return ctx;
}

function applySession(user: PublicUser, token: string) {
    persistSession({ authToken: token, user });
}

export function AppProvider({ children }: { children: ReactNode }) {
    const [currentUser, setCurrentUser] = useState<PublicUser | null>(null);
    const [authToken, setAuthToken] = useState<string | null>(null);
    const [authReady, setAuthReady] = useState(false);
    const [authRequestKey, setAuthRequestKey] = useState(0);
    const darkMode = useSyncExternalStore(subscribeDarkMode, getDarkModeSnapshot, getDarkModeServerSnapshot);

    /* eslint-disable react-hooks/set-state-in-effect */
    useEffect(() => {
        clearLegacyAuthData();
        const saved = loadSession();
        if (saved) {
            setCurrentUser(saved.user);
            setAuthToken(saved.authToken);
        }
        setAuthReady(true);
    }, []);
    /* eslint-enable react-hooks/set-state-in-effect */

    const toggleDarkMode = useCallback(() => {
        const value = !getDarkModeSnapshot();
        document.documentElement.classList.toggle('dark', value);
        try {
            window.localStorage.setItem('finder_dark_mode', value ? '1' : '0');
        } catch {
        }
    }, []);

    const login = useCallback(async (email: string, password: string): Promise<boolean> => {
        try {
            const res = await fetch('/api/auth', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: email.trim(), password }),
            });
            const data = await res.json();
            if (!res.ok || !data.token) {
                toast(data.message || 'Email hoặc mật khẩu không đúng.', 'error');
                return false;
            }
            setCurrentUser(data.user);
            setAuthToken(data.token);
            applySession(data.user, data.token);
            return true;
        } catch (error) {
            console.error('Lỗi đăng nhập:', error);
            toast('Không thể đăng nhập. Vui lòng thử lại.', 'error');
            return false;
        }
    }, []);

    const register = useCallback(
        async (fullName: string, email: string, password: string, username?: string): Promise<boolean> => {
            try {
                const res = await fetch('/api/auth/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ fullName, email, password, username }),
                });
                const data = await res.json();
                if (!res.ok || !data.token) {
                    toast(data.message || 'Không thể đăng ký tài khoản.', 'error');
                    return false;
                }
                setCurrentUser(data.user);
                setAuthToken(data.token);
                applySession(data.user, data.token);
                toast('Đăng ký thành công!', 'success');
                return true;
            } catch (error) {
                console.error('Lỗi đăng ký:', error);
                toast('Không thể đăng ký. Vui lòng thử lại.', 'error');
                return false;
            }
        },
        []
    );

    const logout = useCallback(() => {
        setCurrentUser(null);
        setAuthToken(null);
        persistSession(null);
    }, []);

    const updateCurrentUser = useCallback(
        (user: PublicUser) => {
            setCurrentUser(user);
            if (authToken) {
                persistSession({ authToken, user });
            }
        },
        [authToken]
    );

    const requestAuth = useCallback(() => {
        setAuthRequestKey((key) => key + 1);
    }, []);

    const value = useMemo<AppContextValue>(
        () => ({
            currentUser,
            authToken,
            authReady,
            darkMode,
            toggleDarkMode,
            login,
            register,
            logout,
            updateCurrentUser,
            requestAuth,
            authRequestKey,
        }),
        [currentUser, authToken, authReady, darkMode, toggleDarkMode, login, register, logout, updateCurrentUser, requestAuth, authRequestKey]
    );

    return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
