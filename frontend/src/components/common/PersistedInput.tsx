import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X } from 'lucide-react';
import clsx from 'clsx';
import { usePersistedInput } from '../../hooks/usePersistedInput';

interface PersistedInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
    /** Unique key to identify this field - use format: "page_fieldname" */
    fieldKey: string;
    /** Label for the input */
    label?: string;
    /** Whether to show the suggestions dropdown */
    showSuggestions?: boolean;
    /** Callback when value changes */
    onValueChange?: (value: string) => void;
    /** Callback when value is committed (blur or enter) */
    onValueCommit?: (value: string) => void;
    /** Whether to persist value across refreshes */
    persist?: boolean;
    /** Custom class for the container */
    containerClassName?: string;
    /** Show clear button */
    showClearButton?: boolean;
    /** Error message */
    error?: string;
}

export function PersistedInput({
    fieldKey,
    label,
    showSuggestions = true,
    onValueChange,
    onValueCommit,
    persist = true,
    containerClassName,
    showClearButton = true,
    error,
    className,
    placeholder,
    disabled,
    ...inputProps
}: PersistedInputProps) {
    const {
        value,
        setValue,
        suggestions,
        addToSuggestions,
        removeSuggestion,
        clearValue,
    } = usePersistedInput({ fieldKey, persist, trackSuggestions: showSuggestions });

    const [isOpen, setIsOpen] = useState(false);
    const [filteredSuggestions, setFilteredSuggestions] = useState<string[]>([]);
    const [highlightedIndex, setHighlightedIndex] = useState(-1);
    const inputRef = useRef<HTMLInputElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Filter suggestions based on current value
    useEffect(() => {
        if (!showSuggestions) return;

        const filtered = suggestions.filter(s =>
            s.toLowerCase().includes(value.toLowerCase()) && s !== value
        );
        setFilteredSuggestions(filtered);
    }, [value, suggestions, showSuggestions]);

    // Close dropdown on outside click
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (
                dropdownRef.current &&
                !dropdownRef.current.contains(e.target as Node) &&
                inputRef.current &&
                !inputRef.current.contains(e.target as Node)
            ) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const newValue = e.target.value;
        setValue(newValue);
        onValueChange?.(newValue);
        setIsOpen(true);
        setHighlightedIndex(-1);
    }, [setValue, onValueChange]);

    const handleBlur = useCallback(() => {
        // Delay to allow click on suggestion
        setTimeout(() => {
            if (value.trim()) {
                addToSuggestions(value);
                onValueCommit?.(value);
            }
            setIsOpen(false);
        }, 150);
    }, [value, addToSuggestions, onValueCommit]);

    const handleFocus = useCallback(() => {
        // Always show suggestions dropdown on focus if there are any
        if (showSuggestions && suggestions.length > 0) {
            setIsOpen(true);
            setHighlightedIndex(-1);
        }
    }, [showSuggestions, suggestions.length]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
        if (!isOpen || filteredSuggestions.length === 0) {
            if (e.key === 'Enter' && value.trim()) {
                addToSuggestions(value);
                onValueCommit?.(value);
            }
            return;
        }

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setHighlightedIndex(prev =>
                    prev < filteredSuggestions.length - 1 ? prev + 1 : 0
                );
                break;
            case 'ArrowUp':
                e.preventDefault();
                setHighlightedIndex(prev =>
                    prev > 0 ? prev - 1 : filteredSuggestions.length - 1
                );
                break;
            case 'Enter':
                e.preventDefault();
                if (highlightedIndex >= 0) {
                    const selected = filteredSuggestions[highlightedIndex];
                    setValue(selected);
                    onValueChange?.(selected);
                    onValueCommit?.(selected);
                } else if (value.trim()) {
                    addToSuggestions(value);
                    onValueCommit?.(value);
                }
                setIsOpen(false);
                break;
            case 'Escape':
                setIsOpen(false);
                break;
        }
    }, [isOpen, filteredSuggestions, highlightedIndex, value, setValue, addToSuggestions, onValueChange, onValueCommit]);

    const selectSuggestion = useCallback((suggestion: string) => {
        setValue(suggestion);
        onValueChange?.(suggestion);
        onValueCommit?.(suggestion);
        setIsOpen(false);
        inputRef.current?.focus();
    }, [setValue, onValueChange, onValueCommit]);

    const handleRemoveSuggestion = useCallback((e: React.MouseEvent, suggestion: string) => {
        e.stopPropagation();
        removeSuggestion(suggestion);
    }, [removeSuggestion]);

    const handleClear = useCallback(() => {
        clearValue();
        onValueChange?.('');
        inputRef.current?.focus();
    }, [clearValue, onValueChange]);

    return (
        <div className={clsx('relative', containerClassName)}>
            {label && (
                <label className="block text-sm font-medium text-gray-300 mb-1.5">
                    {label}
                </label>
            )}

            <div className="relative">
                <input
                    ref={inputRef}
                    type="text"
                    value={value}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    onFocus={handleFocus}
                    onKeyDown={handleKeyDown}
                    disabled={disabled}
                    placeholder={placeholder}
                    className={clsx(
                        'w-full px-3 py-2 rounded-lg',
                        'bg-dark-700 border text-white placeholder-gray-500',
                        'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent',
                        'transition-colors duration-200',
                        error ? 'border-red-500' : 'border-dark-600',
                        disabled && 'opacity-50 cursor-not-allowed',
                        (showClearButton || showSuggestions) && 'pr-16',
                        className
                    )}
                    {...inputProps}
                />

                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    {value && showClearButton && !disabled && (
                        <button
                            type="button"
                            onClick={handleClear}
                            className="p-1 text-gray-400 hover:text-white transition-colors rounded"
                            title="Clear"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    )}
                </div>
            </div>

            {error && (
                <p className="mt-1 text-sm text-red-400">{error}</p>
            )}

            {/* Suggestions Dropdown */}
            {isOpen && showSuggestions && filteredSuggestions.length > 0 && (
                <div
                    ref={dropdownRef}
                    className={clsx(
                        'absolute z-50 w-full mt-1',
                        'bg-dark-800 border border-dark-600 rounded-lg shadow-xl',
                        'max-h-60 overflow-y-auto'
                    )}
                >
                    <div className="py-1">
                        <div className="px-3 py-1.5 text-xs text-gray-500 uppercase tracking-wider border-b border-dark-600">
                            Recent entries
                        </div>
                        {filteredSuggestions.map((suggestion, index) => (
                            <div
                                key={suggestion}
                                onClick={() => selectSuggestion(suggestion)}
                                className={clsx(
                                    'flex items-center justify-between px-3 py-2 cursor-pointer',
                                    'transition-colors duration-100',
                                    index === highlightedIndex
                                        ? 'bg-primary-600/20 text-white'
                                        : 'text-gray-300 hover:bg-dark-700'
                                )}
                            >
                                <span className="truncate">{suggestion}</span>
                                <button
                                    type="button"
                                    onClick={(e) => handleRemoveSuggestion(e, suggestion)}
                                    className="p-0.5 text-gray-500 hover:text-red-400 transition-colors ml-2 shrink-0"
                                    title="Remove from history"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Show all suggestions when input is empty but focused */}
            {isOpen && showSuggestions && !value && suggestions.length > 0 && filteredSuggestions.length === 0 && (
                <div
                    ref={dropdownRef}
                    className={clsx(
                        'absolute z-50 w-full mt-1',
                        'bg-dark-800 border border-dark-600 rounded-lg shadow-xl',
                        'max-h-60 overflow-y-auto'
                    )}
                >
                    <div className="py-1">
                        <div className="px-3 py-1.5 text-xs text-gray-500 uppercase tracking-wider border-b border-dark-600">
                            Recent entries
                        </div>
                        {suggestions.slice(0, 10).map((suggestion, index) => (
                            <div
                                key={suggestion}
                                onClick={() => selectSuggestion(suggestion)}
                                className={clsx(
                                    'flex items-center justify-between px-3 py-2 cursor-pointer',
                                    'transition-colors duration-100',
                                    index === highlightedIndex
                                        ? 'bg-primary-600/20 text-white'
                                        : 'text-gray-300 hover:bg-dark-700'
                                )}
                            >
                                <span className="truncate">{suggestion}</span>
                                <button
                                    type="button"
                                    onClick={(e) => handleRemoveSuggestion(e, suggestion)}
                                    className="p-0.5 text-gray-500 hover:text-red-400 transition-colors ml-2 shrink-0"
                                    title="Remove from history"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

// Textarea version
interface PersistedTextareaProps extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> {
    fieldKey: string;
    label?: string;
    onValueChange?: (value: string) => void;
    onValueCommit?: (value: string) => void;
    persist?: boolean;
    containerClassName?: string;
    showClearButton?: boolean;
    error?: string;
}

export function PersistedTextarea({
    fieldKey,
    label,
    onValueChange,
    onValueCommit,
    persist = true,
    containerClassName,
    showClearButton = true,
    error,
    className,
    placeholder,
    disabled,
    ...textareaProps
}: PersistedTextareaProps) {
    const {
        value,
        setValue,
        addToSuggestions,
        clearValue,
    } = usePersistedInput({ fieldKey, persist, trackSuggestions: false });

    const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const newValue = e.target.value;
        setValue(newValue);
        onValueChange?.(newValue);
    }, [setValue, onValueChange]);

    const handleBlur = useCallback(() => {
        if (value.trim()) {
            addToSuggestions(value);
            onValueCommit?.(value);
        }
    }, [value, addToSuggestions, onValueCommit]);

    const handleClear = useCallback(() => {
        clearValue();
        onValueChange?.('');
    }, [clearValue, onValueChange]);

    return (
        <div className={clsx('relative', containerClassName)}>
            {label && (
                <label className="block text-sm font-medium text-gray-300 mb-1.5">
                    {label}
                </label>
            )}

            <div className="relative">
                <textarea
                    value={value}
                    onChange={handleChange}
                    onBlur={handleBlur}
                    disabled={disabled}
                    placeholder={placeholder}
                    className={clsx(
                        'w-full px-3 py-2 rounded-lg resize-y min-h-[100px]',
                        'bg-dark-700 border text-white placeholder-gray-500',
                        'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent',
                        'transition-colors duration-200',
                        error ? 'border-red-500' : 'border-dark-600',
                        disabled && 'opacity-50 cursor-not-allowed',
                        className
                    )}
                    {...textareaProps}
                />

                {value && showClearButton && !disabled && (
                    <button
                        type="button"
                        onClick={handleClear}
                        className="absolute right-2 top-2 p-1 text-gray-400 hover:text-white transition-colors rounded"
                        title="Clear"
                    >
                        <X className="w-4 h-4" />
                    </button>
                )}
            </div>

            {error && (
                <p className="mt-1 text-sm text-red-400">{error}</p>
            )}
        </div>
    );
}
