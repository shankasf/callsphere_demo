import {
    createContext,
    useContext,
    useState,
    useCallback,
    useEffect,
    type ReactNode,
} from 'react';
import type { Industry } from '../types';

const STORAGE_KEY = 'callsphere_demo_industry';

interface IndustryContextType {
    /** The currently selected industry, or null if none chosen yet. */
    industry: Industry | null;
    /** Convenience accessor for the slug ('all' is never stored here — null means unset). */
    slug: string | null;
    /** Persist + activate an industry selection. */
    selectIndustry: (industry: Industry) => void;
    /** Clear the selection (returns the user to the picker). */
    clearIndustry: () => void;
}

const IndustryContext = createContext<IndustryContextType | undefined>(undefined);

function readStored(): Industry | null {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Industry;
        return parsed && parsed.slug ? parsed : null;
    } catch {
        return null;
    }
}

export function IndustryProvider({ children }: { children: ReactNode }) {
    const [industry, setIndustry] = useState<Industry | null>(() => readStored());

    // Keep state in sync if another tab changes the selection.
    useEffect(() => {
        const onStorage = (e: StorageEvent) => {
            if (e.key === STORAGE_KEY) setIndustry(readStored());
        };
        window.addEventListener('storage', onStorage);
        return () => window.removeEventListener('storage', onStorage);
    }, []);

    const selectIndustry = useCallback((next: Industry) => {
        setIndustry(next);
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {
            /* localStorage may be unavailable (private mode) — selection still works in-memory */
        }
    }, []);

    const clearIndustry = useCallback(() => {
        setIndustry(null);
        try {
            localStorage.removeItem(STORAGE_KEY);
        } catch {
            /* ignore */
        }
    }, []);

    return (
        <IndustryContext.Provider
            value={{
                industry,
                slug: industry?.slug ?? null,
                selectIndustry,
                clearIndustry,
            }}
        >
            {children}
        </IndustryContext.Provider>
    );
}

export function useIndustry() {
    const ctx = useContext(IndustryContext);
    if (ctx === undefined) {
        throw new Error('useIndustry must be used within an IndustryProvider');
    }
    return ctx;
}

export { IndustryContext };
