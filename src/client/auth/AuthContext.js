import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useContext, useEffect, useState } from 'react';
import { apiUrl } from '../lib/config';
const AuthContext = createContext(undefined);
const api = (path, options) => fetch(apiUrl(`/api${path}`), { ...options, credentials: 'include', headers: { 'Content-Type': 'application/json', ...options?.headers } });
async function parseResponse(response) {
    const body = await response.json();
    if (!response.ok)
        throw new Error(body.error?.message || body.error?.messageEn || 'Request failed');
    return { user: body.data?.user, error: body.error };
}
export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const refreshUser = async () => {
        try {
            const result = await parseResponse(await api('/auth/me'));
            setUser(result.user ?? null);
        }
        catch {
            setUser(null);
        }
    };
    useEffect(() => { void refreshUser().finally(() => setLoading(false)); }, []);
    const login = async (credentials) => {
        const result = await parseResponse(await api('/auth/login', { method: 'POST', body: JSON.stringify(credentials) }));
        setUser(result.user ?? null);
    };
    const registerCenter = async (params) => {
        const result = await parseResponse(await api('/auth/register-center', { method: 'POST', body: JSON.stringify(params) }));
        setUser(result.user ?? null);
    };
    const logout = async () => {
        await api('/auth/logout', { method: 'POST' });
        setUser(null);
    };
    return (_jsx(AuthContext.Provider, { value: { user, loading, login, registerCenter, logout, refreshUser, hasRole: (...roles) => user !== null && roles.includes(user.role) }, children: children }));
}
export function useAuth() {
    const value = useContext(AuthContext);
    if (!value)
        throw new Error('useAuth must be used inside AuthProvider');
    return value;
}
