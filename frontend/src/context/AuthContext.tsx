import { createContext, useContext, useState, type ReactNode } from 'react';

// Role types with different access levels
export type UserRole = 'admin' | 'agent' | 'requester';

interface User {
    id: number;
    email: string;
    fullName: string;
    role: UserRole;
}

interface AuthContextType {
    user: User | null;
    isAuthenticated: boolean;
    role: UserRole;
    login: (token: string, userData: User) => void;
    logout: () => void;
    // Voice widget permissions based on role
    voicePermissions: {
        canInitiateCall: boolean;
        canViewTranscript: boolean;
        canAccessAllAgents: boolean;
        canEscalate: boolean;
        canViewCosts: boolean;
        maxCallDuration: number; // in minutes
    };
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Default permissions for each role
const rolePermissions: Record<UserRole, AuthContextType['voicePermissions']> = {
    admin: {
        canInitiateCall: true,
        canViewTranscript: true,
        canAccessAllAgents: true,
        canEscalate: true,
        canViewCosts: true,
        maxCallDuration: 60, // 60 minutes
    },
    agent: {
        canInitiateCall: true,
        canViewTranscript: true,
        canAccessAllAgents: false, // Only assigned agents
        canEscalate: true,
        canViewCosts: false,
        maxCallDuration: 30, // 30 minutes
    },
    requester: {
        canInitiateCall: true,
        canViewTranscript: false, // Cannot see full transcript
        canAccessAllAgents: false, // Only triage agent
        canEscalate: false, // Cannot manually escalate
        canViewCosts: false,
        maxCallDuration: 15, // 15 minutes
    },
};

interface AuthProviderProps {
    children: ReactNode;
}

// NOTE: This dashboard is fully PUBLIC (no login). The AuthProvider is kept
// only as a stub so components that call useAuth() (e.g. Sidebar) keep working.
// It always reports an authenticated admin user and never shows a login wall.
const STUB_USER: User = {
    id: 0,
    email: 'admin@callsphere.demo',
    fullName: 'CallSphere Demo',
    role: 'admin',
};

export function AuthProvider({ children }: AuthProviderProps) {
    const [user] = useState<User | null>(STUB_USER);
    const isAuthenticated = true;

    // No-op login/logout — dashboard is public.
    const login = (_token: string, _userData: User) => {};
    const logout = () => {};

    const role: UserRole = user?.role || 'admin';
    const voicePermissions = rolePermissions[role];

    return (
        <AuthContext.Provider
            value={{
                user,
                isAuthenticated,
                role,
                login,
                logout,
                voicePermissions,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}

export { AuthContext };
