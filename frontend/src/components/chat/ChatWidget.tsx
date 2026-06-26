import { useState, useRef, useEffect, useCallback } from 'react';
import {
    MessageSquare,
    X,
    Maximize2,
    Minimize2,
    Send,
    Loader2,
    AlertCircle,
    Bot,
} from 'lucide-react';
import clsx from 'clsx';
import { useIndustry } from '../../context/IndustryContext';
import { chatApi, type ChatResponse } from '../../services/api';

interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
}

/**
 * Pull the assistant's reply text out of the loose backend response shape.
 * The chat endpoint is being built in parallel, so we defensively look for the
 * common field names rather than assuming a single contract.
 */
function extractReply(data: ChatResponse): string {
    const candidate =
        data.response ?? data.reply ?? data.message ?? data.content;
    if (typeof candidate === 'string' && candidate.trim()) {
        return candidate;
    }
    return "Sorry, I didn't catch that. Could you try again?";
}

function extractSessionId(data: ChatResponse): string | undefined {
    return data.session_id ?? data.sessionId;
}

/**
 * Floating text-chat widget pinned to the BOTTOM-LEFT — the mirror of the
 * bottom-right VoiceWidget. Sends the currently-selected demo industry slug to
 * POST /api/chat and keeps a session id across turns.
 */
export function ChatWidget() {
    const { slug: industrySlug, industry } = useIndustry();

    const [isOpen, setIsOpen] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const sessionIdRef = useRef<string | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    const industryName = industry?.name?.trim() || 'CallSphere';

    // Auto-scroll to the newest message.
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isSending]);

    // Focus the input when the panel opens.
    useEffect(() => {
        if (isOpen) {
            // Defer so the element exists/transition starts.
            const t = setTimeout(() => inputRef.current?.focus(), 50);
            return () => clearTimeout(t);
        }
    }, [isOpen]);

    const addMessage = useCallback(
        (role: 'user' | 'assistant', content: string) => {
            setMessages((prev) => [
                ...prev,
                {
                    id:
                        typeof crypto !== 'undefined' && 'randomUUID' in crypto
                            ? crypto.randomUUID()
                            : `${Date.now()}-${Math.random()}`,
                    role,
                    content,
                    timestamp: new Date(),
                },
            ]);
        },
        []
    );

    const sendMessage = useCallback(async () => {
        const trimmed = input.trim();
        if (!trimmed || isSending) return;

        setError(null);
        addMessage('user', trimmed);
        setInput('');
        setIsSending(true);

        try {
            const data = await chatApi.send({
                message: trimmed,
                sessionId: sessionIdRef.current,
                industry: industrySlug || 'all',
            });

            // Persist the session id across turns — reuse the server's if it
            // returns one, otherwise mint one locally so the backend can thread.
            const serverSession = extractSessionId(data);
            if (serverSession) {
                sessionIdRef.current = serverSession;
            } else if (!sessionIdRef.current) {
                sessionIdRef.current =
                    typeof crypto !== 'undefined' && 'randomUUID' in crypto
                        ? crypto.randomUUID()
                        : `${Date.now()}-${Math.random()}`;
            }

            addMessage('assistant', extractReply(data));
        } catch (err) {
            console.error('Chat request failed:', err);
            setError(
                'Something went wrong reaching the assistant. Please try again.'
            );
        } finally {
            setIsSending(false);
        }
    }, [input, isSending, industrySlug, addMessage]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        // Enter sends, Shift+Enter inserts a newline.
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            void sendMessage();
        }
    };

    if (!isOpen) {
        // Floating launcher: anchored just past the 256px sidebar (ml-64) so it
        // never overlaps the sidebar nav (e.g. the Settings link).
        return (
            <button
                onClick={() => setIsOpen(true)}
                aria-label="Open text chat"
                className={clsx(
                    'fixed bottom-6 left-[280px] z-50',
                    'w-16 h-16 rounded-full shadow-2xl',
                    'flex items-center justify-center',
                    'bg-primary-500 hover:bg-primary-400',
                    'transition-all duration-300 hover:scale-110',
                    'focus:outline-none focus:ring-2 focus:ring-primary-300 focus:ring-offset-2 focus:ring-offset-dark-950',
                    'group'
                )}
                title="Chat with us"
            >
                <MessageSquare className="w-7 h-7 text-white" />
                <span className="absolute -top-12 left-0 bg-dark-800 text-white text-sm px-3 py-2 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap shadow-lg border border-dark-600">
                    Chat with us
                </span>
            </button>
        );
    }

    return (
        <div
            role="dialog"
            aria-label={`Chat with ${industryName}`}
            className={clsx(
                'fixed z-50 bg-dark-900 border border-dark-700 rounded-2xl shadow-2xl',
                'flex flex-col overflow-hidden',
                'transition-all duration-300',
                isExpanded
                    ? 'bottom-4 left-[272px] w-96 h-[600px]'
                    : 'bottom-6 left-[280px] w-80 h-[500px]'
            )}
        >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-dark-700 bg-primary-600 flex-shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0">
                        <Bot className="w-5 h-5 text-white" />
                    </div>
                    <div className="min-w-0">
                        <h3 className="font-semibold text-white truncate">
                            Chat with {industryName}
                        </h3>
                        <span className="text-xs text-white/70">
                            AI Assistant
                        </span>
                    </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                        onClick={() => setIsExpanded(!isExpanded)}
                        aria-label={isExpanded ? 'Minimize chat' : 'Expand chat'}
                        className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                    >
                        {isExpanded ? (
                            <Minimize2 className="w-4 h-4 text-white" />
                        ) : (
                            <Maximize2 className="w-4 h-4 text-white" />
                        )}
                    </button>
                    <button
                        onClick={() => setIsOpen(false)}
                        aria-label="Close chat"
                        className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                    >
                        <X className="w-4 h-4 text-white" />
                    </button>
                </div>
            </div>

            {/* Error banner */}
            {error && (
                <div className="px-4 py-2 bg-red-900/30 border-b border-red-800 flex items-center gap-2 text-sm text-red-400 flex-shrink-0">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            {/* Message list */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full text-dark-400 text-center">
                        <MessageSquare className="w-12 h-12 mb-3 opacity-50" />
                        <p className="text-sm">Ask me anything</p>
                        <p className="text-xs mt-1 opacity-70">
                            I'm the {industryName} AI assistant
                        </p>
                    </div>
                )}

                {messages.map((msg) => (
                    <div
                        key={msg.id}
                        className={clsx(
                            'flex',
                            msg.role === 'user' ? 'justify-end' : 'justify-start'
                        )}
                    >
                        <div
                            className={clsx(
                                'max-w-[80%] p-3 rounded-xl text-sm whitespace-pre-wrap break-words',
                                msg.role === 'user'
                                    ? 'bg-primary-600 text-white rounded-br-sm'
                                    : 'bg-dark-700 text-dark-200 rounded-bl-sm'
                            )}
                        >
                            {msg.content}
                        </div>
                    </div>
                ))}

                {/* Typing / loading indicator */}
                {isSending && (
                    <div className="flex justify-start">
                        <div className="bg-dark-700 text-dark-300 p-3 rounded-xl rounded-bl-sm flex items-center gap-2">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span className="text-sm">Thinking…</span>
                        </div>
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* Composer */}
            <div className="p-3 border-t border-dark-700 bg-dark-800/50 flex-shrink-0">
                <div className="flex items-end gap-2">
                    <textarea
                        ref={inputRef}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        rows={1}
                        placeholder="Type a message…"
                        aria-label="Message"
                        className={clsx(
                            'flex-1 resize-none max-h-28 px-3 py-2 rounded-xl text-sm',
                            'bg-dark-900 border border-dark-600 text-dark-100 placeholder-dark-500',
                            'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent',
                            'transition-colors'
                        )}
                    />
                    <button
                        onClick={() => void sendMessage()}
                        disabled={!input.trim() || isSending}
                        aria-label="Send message"
                        className={clsx(
                            'w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-all',
                            'focus:outline-none focus:ring-2 focus:ring-primary-300',
                            !input.trim() || isSending
                                ? 'bg-dark-600 text-dark-400 cursor-not-allowed'
                                : 'bg-primary-500 text-white hover:bg-primary-400 hover:scale-105 active:scale-95'
                        )}
                    >
                        {isSending ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                            <Send className="w-5 h-5" />
                        )}
                    </button>
                </div>
                <p className="mt-2 text-center text-[11px] text-dark-500">
                    Press Enter to send · Shift+Enter for a new line
                </p>
            </div>
        </div>
    );
}

export default ChatWidget;
