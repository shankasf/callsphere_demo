import { useState, useEffect, useCallback } from 'react';

const STORAGE_PREFIX = 'reclaim_field_';
const SUGGESTIONS_PREFIX = 'reclaim_suggestions_';
const MAX_SUGGESTIONS = 20;

interface UsePersistedInputOptions {
    /** Unique key to identify this field across the app */
    fieldKey: string;
    /** Initial value if nothing is stored */
    defaultValue?: string;
    /** Whether to persist the value (default: true) */
    persist?: boolean;
    /** Whether to track suggestions (default: true) */
    trackSuggestions?: boolean;
}

interface UsePersistedInputReturn {
    value: string;
    setValue: (value: string) => void;
    suggestions: string[];
    addToSuggestions: (value: string) => void;
    removeSuggestion: (value: string) => void;
    clearValue: () => void;
    clearSuggestions: () => void;
}

/**
 * Hook for persisted input fields with autocomplete suggestions.
 * Values persist across page refreshes and suggestions are tracked from all previous entries.
 */
export function usePersistedInput({
    fieldKey,
    defaultValue = '',
    persist = true,
    trackSuggestions = true,
}: UsePersistedInputOptions): UsePersistedInputReturn {
    const storageKey = `${STORAGE_PREFIX}${fieldKey}`;
    const suggestionsKey = `${SUGGESTIONS_PREFIX}${fieldKey}`;

    // Initialize value from localStorage or default
    const [value, setValueState] = useState<string>(() => {
        if (!persist) return defaultValue;
        try {
            const stored = localStorage.getItem(storageKey);
            return stored !== null ? stored : defaultValue;
        } catch {
            return defaultValue;
        }
    });

    // Initialize suggestions from localStorage
    const [suggestions, setSuggestions] = useState<string[]>(() => {
        if (!trackSuggestions) return [];
        try {
            const stored = localStorage.getItem(suggestionsKey);
            return stored ? JSON.parse(stored) : [];
        } catch {
            return [];
        }
    });

    // Persist value to localStorage when it changes
    useEffect(() => {
        if (!persist) return;
        try {
            if (value) {
                localStorage.setItem(storageKey, value);
            } else {
                localStorage.removeItem(storageKey);
            }
        } catch (e) {
            console.warn('Failed to persist input value:', e);
        }
    }, [value, storageKey, persist]);

    // Persist suggestions to localStorage when they change
    useEffect(() => {
        if (!trackSuggestions) return;
        try {
            localStorage.setItem(suggestionsKey, JSON.stringify(suggestions));
        } catch (e) {
            console.warn('Failed to persist suggestions:', e);
        }
    }, [suggestions, suggestionsKey, trackSuggestions]);

    const setValue = useCallback((newValue: string) => {
        setValueState(newValue);
    }, []);

    const addToSuggestions = useCallback((newValue: string) => {
        if (!trackSuggestions || !newValue.trim()) return;
        
        setSuggestions(prev => {
            const trimmed = newValue.trim();
            // Remove duplicates and add to front
            const filtered = prev.filter(s => s.toLowerCase() !== trimmed.toLowerCase());
            const updated = [trimmed, ...filtered].slice(0, MAX_SUGGESTIONS);
            return updated;
        });
    }, [trackSuggestions]);

    const removeSuggestion = useCallback((valueToRemove: string) => {
        setSuggestions(prev => prev.filter(s => s !== valueToRemove));
    }, []);

    const clearValue = useCallback(() => {
        setValueState('');
        try {
            localStorage.removeItem(storageKey);
        } catch {}
    }, [storageKey]);

    const clearSuggestions = useCallback(() => {
        setSuggestions([]);
        try {
            localStorage.removeItem(suggestionsKey);
        } catch {}
    }, [suggestionsKey]);

    return {
        value,
        setValue,
        suggestions,
        addToSuggestions,
        removeSuggestion,
        clearValue,
        clearSuggestions,
    };
}

/**
 * Get all suggestions for a field without managing state
 */
export function getFieldSuggestions(fieldKey: string): string[] {
    try {
        const stored = localStorage.getItem(`${SUGGESTIONS_PREFIX}${fieldKey}`);
        return stored ? JSON.parse(stored) : [];
    } catch {
        return [];
    }
}

/**
 * Get the persisted value for a field
 */
export function getPersistedValue(fieldKey: string): string | null {
    try {
        return localStorage.getItem(`${STORAGE_PREFIX}${fieldKey}`);
    } catch {
        return null;
    }
}

/**
 * Clear all persisted values and suggestions
 */
export function clearAllPersistedData(): void {
    try {
        const keys = Object.keys(localStorage);
        keys.forEach(key => {
            if (key.startsWith(STORAGE_PREFIX) || key.startsWith(SUGGESTIONS_PREFIX)) {
                localStorage.removeItem(key);
            }
        });
    } catch (e) {
        console.warn('Failed to clear persisted data:', e);
    }
}
