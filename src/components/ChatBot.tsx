'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Mic, Navigation, Send, Star, Volume2, VolumeX, X } from 'lucide-react';
import { toast } from '@/components/Toast';
import { useEscapeKey } from '@/lib/use-escape';
import { useVoiceInput } from '@/lib/use-voice-input';
import { DEFAULT_SUGGESTIONS } from '@/lib/chatbot';
import type { ChatMapAction, ChatResponse, ChatStore } from '@/app/api/chat/route';

type Message = {
    id: number;
    role: 'user' | 'bot';
    text: string;
    stores?: ChatStore[];
    mapAction?: ChatMapAction;
};

const GREETING =
    'Chào bạn! Mình là trợ lý tìm cửa hàng tiện lợi. Bạn thử hỏi mình: "tìm Circle K gần tôi", "cửa hàng 24h", hay "chỗ nào có Wi-Fi" nhé.';

function StoreCard({ store }: { store: ChatStore }) {
    return (
        <div className="mt-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3">
            <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{store.name}</p>
                {store.brandName && (
                    <span className="shrink-0 rounded-full bg-blue-100 dark:bg-blue-950 px-2 py-0.5 text-[10px] font-bold text-blue-700 dark:text-blue-300">
                        {store.brandName}
                    </span>
                )}
            </div>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{store.address}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                <span className="flex items-center gap-1 font-semibold text-gray-800 dark:text-gray-200">
                    <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                    {store.rating.toFixed(1)}
                    <span className="font-normal text-gray-500 dark:text-gray-400">
                        ({store.ratingCount})
                    </span>
                </span>
                {store.distanceText && (
                    <span className="text-gray-600 dark:text-gray-300">{store.distanceText}</span>
                )}
                <span
                    className={`font-medium ${
                        store.openText === 'Đã đóng cửa'
                            ? 'text-gray-400 dark:text-gray-500'
                            : 'text-emerald-600 dark:text-emerald-400'
                    }`}
                >
                    {store.openText}
                </span>
            </div>
            <a
                href={store.directionsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
            >
                <Navigation className="h-3.5 w-3.5" />
                Chỉ đường
            </a>
        </div>
    );
}

export default function ChatBot() {
    const [open, setOpen] = useState(false);
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [sending, setSending] = useState(false);
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [speakingId, setSpeakingId] = useState<number | null>(null);
    const pathname = usePathname();
    const router = useRouter();

    const idRef = useRef(1);
    const sendingRef = useRef(false);
    const locationRef = useRef<{ lat: number; lng: number } | null>(null);
    const greetedRef = useRef(false);
    const listRef = useRef<HTMLDivElement>(null);

    useEscapeKey(() => setOpen(false), open);

    useEffect(() => {
        return () => {
            if ('speechSynthesis' in window) {
                window.speechSynthesis.cancel();
            }
        };
    }, []);

    useEffect(() => {
        listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
    }, [messages, sending, open]);

    const sendMessage = useCallback(async (raw: string) => {
        const text = raw.trim().slice(0, 500);
        if (!text || sendingRef.current) {
            return;
        }
        sendingRef.current = true;
        setSending(true);
        setSuggestions([]);
        setMessages((prev) => [...prev, { id: idRef.current++, role: 'user', text }]);
        setInput('');
        try {
            const loc = locationRef.current;
            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: text,
                    lat: loc?.lat,
                    lng: loc?.lng,
                }),
            });
            const data = (await res.json()) as ChatResponse;
            setMessages((prev) => [
                ...prev,
                {
                    id: idRef.current++,
                    role: 'bot',
                    text: data.reply,
                    stores: data.stores,
                    mapAction: data.mapAction,
                },
            ]);
            setSuggestions(data.suggestions ?? []);
        } catch {
            setMessages((prev) => [
                ...prev,
                { id: idRef.current++, role: 'bot', text: 'Mất kết nối rồi, bạn thử lại giúp mình nhé.' },
            ]);
        } finally {
            sendingRef.current = false;
            setSending(false);
        }
    }, []);

    const handleOpen = useCallback(() => {
        setOpen((prev) => {
            const next = !prev;
            if (next && !greetedRef.current) {
                greetedRef.current = true;
                if ('geolocation' in navigator) {
                    navigator.geolocation.getCurrentPosition(
                        (pos) => {
                            locationRef.current = {
                                lat: pos.coords.latitude,
                                lng: pos.coords.longitude,
                            };
                        },
                        () => {},
                        { timeout: 5000 }
                    );
                }
                const id = idRef.current++;
                setMessages([{ id, role: 'bot', text: GREETING }]);
                setSuggestions(DEFAULT_SUGGESTIONS);
            }
            if (!next && 'speechSynthesis' in window) {
                window.speechSynthesis.cancel();
                setSpeakingId(null);
            }
            return next;
        });
    }, []);

    const { supported: voiceSupported, listening: voiceListening, toggle: toggleVoice } = useVoiceInput(
        useCallback((transcript: string) => sendMessage(transcript), [sendMessage]),
        useCallback((message: string) => toast(message, 'error'), [])
    );

    const speak = (id: number, text: string) => {
        if (!('speechSynthesis' in window)) {
            toast('Trình duyệt không hỗ trợ đọc thành tiếng.', 'error');
            return;
        }
        if (speakingId === id) {
            window.speechSynthesis.cancel();
            setSpeakingId(null);
            return;
        }
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'vi-VN';
        utterance.onend = () => setSpeakingId(null);
        utterance.onerror = () => setSpeakingId(null);
        setSpeakingId(id);
        window.speechSynthesis.speak(utterance);
    };

    const applyMapAction = (action: ChatMapAction) => {
        const payload = JSON.stringify(action);
        if (pathname === '/') {
            window.dispatchEvent(new CustomEvent('finder:bot-search', { detail: action }));
        } else {
            sessionStorage.setItem('finder:bot-search', payload);
            router.push('/');
        }
        setOpen(false);
    };

    return (
        <>
            <button
                type="button"
                onClick={handleOpen}
                aria-label={open ? 'Đóng chat' : 'Mở trợ lý chat'}
                className="fixed bottom-5 right-5 z-50 flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-blue-600 text-white shadow-xl transition hover:scale-105"
            >
                {open ? <X className="h-6 w-6" /> : <img src="/chatbot-mascot.png" alt="Trợ lý chat" className="h-full w-full object-cover" />}
            </button>

            {open && (
                <div className="fixed bottom-24 right-5 z-50 flex h-[min(68vh,540px)] w-[min(calc(100vw-2.5rem),380px)] flex-col overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-2xl">
                    <div className="flex items-center gap-3 border-b border-gray-200 dark:border-gray-700 bg-blue-600 px-4 py-3">
                        <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-white/20">
                            <img src="/chatbot-mascot.png" alt="Trợ lý Co-Fi" className="h-full w-full object-cover" />
                        </span>
                        <div className="flex-1">
                            <p className="text-sm font-bold text-white">Trợ lý Co-Fi</p>
                            <p className="flex items-center gap-1.5 text-xs text-blue-100">
                                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                                Đang trực tuyến
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => setOpen(false)}
                            aria-label="Đóng chat"
                            className="rounded-full p-1.5 text-white hover:bg-white/20"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    </div>

                    <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-3 py-4">
                        {messages.map((msg) =>
                            msg.role === 'user' ? (
                                <div key={msg.id} className="flex justify-end">
                                    <p className="max-w-[80%] rounded-2xl rounded-br-md bg-blue-600 px-3.5 py-2 text-sm text-white">
                                        {msg.text}
                                    </p>
                                </div>
                            ) : (
                                <div key={msg.id} className="flex justify-start">
                                    <div className="max-w-[88%] rounded-2xl rounded-bl-md bg-gray-100 dark:bg-gray-800 px-3.5 py-2.5">
                                        <div className="flex items-start justify-between gap-2">
                                            <p className="text-sm text-gray-800 dark:text-gray-200">{msg.text}</p>
                                            <button
                                                type="button"
                                                onClick={() => speak(msg.id, msg.text)}
                                                title={speakingId === msg.id ? 'Dừng đọc' : 'Đọc to trả lời'}
                                                aria-label="Đọc to trả lời"
                                                className="shrink-0 rounded-full p-1 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400"
                                            >
                                                {speakingId === msg.id ? (
                                                    <VolumeX className="h-4 w-4" />
                                                ) : (
                                                    <Volume2 className="h-4 w-4" />
                                                )}
                                            </button>
                                        </div>
                                        {msg.stores?.map((store) => (
                                            <StoreCard key={store.id} store={store} />
                                        ))}
                                        {msg.mapAction && (
                                            <button
                                                type="button"
                                                onClick={() => applyMapAction(msg.mapAction!)}
                                                className="mt-2 w-full rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950 px-3 py-2 text-xs font-semibold text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900"
                                            >
                                                {msg.mapAction.label}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )
                        )}
                        {sending && (
                            <div className="flex justify-start">
                                <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-md bg-gray-100 dark:bg-gray-800 px-4 py-3">
                                    {[0, 1, 2].map((i) => (
                                        <span
                                            key={i}
                                            className="h-2 w-2 animate-bounce rounded-full bg-gray-400 dark:bg-gray-500"
                                            style={{ animationDelay: `${i * 0.15}s` }}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {suggestions.length > 0 && !sending && (
                        <div className="flex gap-2 overflow-x-auto border-t border-gray-100 dark:border-gray-800 px-3 py-2">
                            {suggestions.map((s) => (
                                <button
                                    key={s}
                                    type="button"
                                    onClick={() => sendMessage(s)}
                                    className="shrink-0 rounded-full border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950 px-3 py-1.5 text-xs font-medium text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900"
                                >
                                    {s}
                                </button>
                            ))}
                        </div>
                    )}

                    <div className="flex items-center gap-2 border-t border-gray-200 dark:border-gray-700 px-3 py-2.5">
                        {voiceSupported && (
                            <button
                                type="button"
                                onClick={toggleVoice}
                                title={voiceListening ? 'Dừng nghe' : 'Nói để chat'}
                                aria-label="Nói để chat"
                                className={`shrink-0 rounded-full p-2 transition ${
                                    voiceListening
                                        ? 'bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400 animate-pulse'
                                        : 'text-gray-400 hover:text-blue-600 dark:text-gray-500 dark:hover:text-blue-400'
                                }`}
                            >
                                <Mic className="h-5 w-5" />
                            </button>
                        )}
                        <input
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    sendMessage(input);
                                }
                            }}
                            placeholder="Nhắn tin..."
                            className="min-w-0 flex-1 rounded-full border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-4 py-2 text-sm text-gray-800 dark:text-gray-200 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-800"
                        />
                        <button
                            type="button"
                            onClick={() => sendMessage(input)}
                            disabled={!input.trim() || sending}
                            aria-label="Gửi tin nhắn"
                            className="shrink-0 rounded-full bg-blue-600 p-2.5 text-white transition hover:bg-blue-700 disabled:opacity-40"
                        >
                            <Send className="h-4 w-4" />
                        </button>
                    </div>
                </div>
            )}
        </>
    );
}
