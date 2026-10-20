'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Bus, Footprints, Mic, Navigation, Send, Star, Volume2, VolumeX, X } from 'lucide-react';
import { toast } from '@/components/Toast';
import { useEscapeKey } from '@/hooks/use-escape';
import { useVoiceInput } from '@/hooks/use-voice-input';
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

function StoreCard({ store, onDirections }: { store: ChatStore; onDirections: (store: ChatStore) => void }) {
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
            <button
                type="button"
                onClick={() => onDirections(store)}
                className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
            >
                <Navigation className="h-3.5 w-3.5" />
                Chỉ đường
            </button>
        </div>
    );
}

/* Phiên âm cách đọc cho tên riêng/thuật ngữ tiếng Anh khi đưa vào TTS —
   giọng Việt đọc nguyên văn sẽ sai (vd "Circle K" thành xi-ếc-lờ-ka).
   Chỉ áp cho bản sao dùng để đọc, văn bản hiển thị giữ nguyên. Xếp cụm
   dài trước cụm ngắn để thay thế không chồng nhau (WinMart+ trước WinMart). */
const SPEECH_REPLACEMENTS: [RegExp, string][] = [
    [/WinMart\+/gi, 'Uyn mát cộng'],
    [/WinMart/gi, 'Uyn mát'],
    [/Circle\s*K/gi, 'Xơ cồ cây'],
    [/7\s*-\s*Eleven/gi, 'Xe vừn I lê vừn'],
    [/FamilyMart/gi, 'Pha mi li mát'],
    [/GS25/gi, 'Gi ét hai lăm'],
    [/OhMee/gi, 'Ô mi'],
    [/Co-Fi/gi, 'Cô Phi'],
    [/Wi-?Fi/gi, 'quai phai'],
    [/\bATM\b/g, 'ây ti em'],
    [/24\/7/g, 'hai tư trên bảy'],
    [/24\s*h\b/gi, '24 giờ'],
];

function normalizeForSpeech(text: string): string {
    let out = text;
    for (const [pattern, replacement] of SPEECH_REPLACEMENTS) {
        out = out.replace(pattern, replacement);
    }
    return out;
}

export default function ChatBot() {
    const [open, setOpen] = useState(false);
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [sending, setSending] = useState(false);
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [speakingId, setSpeakingId] = useState<number | null>(null);
    /* Cửa hàng đang chọn phương tiện để chỉ đường (popup). */
    const [directionsStore, setDirectionsStore] = useState<ChatStore | null>(null);
    const pathname = usePathname();
    const router = useRouter();

    const idRef = useRef(1);
    const sendingRef = useRef(false);
    /* Số thứ tự của lệnh đọc mới nhất — callback speak() bị trễ (setTimeout)
       của lệnh cũ kiểm tra số này để tự hủy, tránh đọc chồng câu. */
    const speakSeqRef = useRef(0);
    const locationRef = useRef<{ lat: number; lng: number } | null>(null);
    const greetedRef = useRef(false);
    const listRef = useRef<HTMLDivElement>(null);

    useEscapeKey(() => setOpen(false), open && directionsStore === null);
    useEscapeKey(() => setDirectionsStore(null), directionsStore !== null);

    /* Mở Google Maps chỉ đường theo phương tiện người dùng chọn.
       directionsUrl đã có sẵn origin/destination → chỉ cần thêm travelmode. */
    const openDirections = (travelmode: 'walking' | 'driving' | 'transit') => {
        if (!directionsStore) return;
        window.open(`${directionsStore.directionsUrl}&travelmode=${travelmode}`, '_blank');
        setDirectionsStore(null);
    };

    useEffect(() => {
        return () => {
            speakSeqRef.current += 1;
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
                speakSeqRef.current += 1;
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
        const synth = window.speechSynthesis;
        /* Mỗi lần bấm nút là một lệnh đọc mới; lệnh cũ đang chờ trong
           setTimeout sẽ tự hủy khi thấy số thứ tự đã đổi. */
        const seq = ++speakSeqRef.current;
        if (speakingId === id) {
            synth.cancel();
            setSpeakingId(null);
            return;
        }
        synth.cancel();
        const utterance = new SpeechSynthesisUtterance(normalizeForSpeech(text));
        utterance.lang = 'vi-VN';
        /* Ưu tiên giọng Việt bản "Natural/Online" (vd HoaiMy) — giọng đời
           cũ mặc định (Microsoft An) nghe rất máy móc. */
        const viVoices = synth.getVoices().filter((v) => v.lang.toLowerCase().startsWith('vi'));
        const viVoice = viVoices.find((v) => /natural|online/i.test(v.name)) || viVoices[0];
        if (viVoice) {
            utterance.voice = viVoice;
        }
        utterance.onend = () => setSpeakingId(null);
        utterance.onerror = (event) => {
            setSpeakingId(null);
            /* interrupted/canceled = người dùng tự dừng hoặc chuyển câu
               đọc khác, không phải lỗi thật. */
            if (event.error !== 'interrupted' && event.error !== 'canceled') {
                toast('Không đọc được nội dung này.', 'error');
            }
        };
        setSpeakingId(id);
        /* Edge/Chrome nuốt utterance khi speak() ngay sau cancel() trong
           cùng một nhịp — chờ 80ms rồi resume + speak mới đọc ổn định
           (đã kiểm chứng trên máy thật: speak không cancel trước thì đọc). */
        window.setTimeout(() => {
            if (speakSeqRef.current !== seq) {
                return;
            }
            synth.resume();
            synth.speak(utterance);
        }, 80);
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
                {open ? <X className="h-6 w-6" /> : <img src="/images/chatbot-mascot.png" alt="Trợ lý chat" className="h-full w-full object-cover" />}
            </button>

            {open && (
                <div className="fixed bottom-24 right-5 z-50 flex h-[min(68vh,540px)] w-[min(calc(100vw-2.5rem),380px)] flex-col overflow-hidden rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-2xl">
                    <div className="flex items-center gap-3 border-b border-gray-200 dark:border-gray-700 bg-blue-600 px-4 py-3">
                        <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-white/20">
                            <img src="/images/chatbot-mascot.png" alt="Trợ lý Co-Fi" className="h-full w-full object-cover" />
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
                                            <StoreCard key={store.id} store={store} onDirections={setDirectionsStore} />
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

            {directionsStore && (
                <div
                    className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4"
                    onClick={() => setDirectionsStore(null)}
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        className="w-full max-w-xs rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-5 shadow-2xl"
                    >
                        <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">
                            Chỉ đường
                        </h3>
                        <p className="mt-1 truncate text-xs text-gray-500 dark:text-gray-400">
                            {directionsStore.name}
                        </p>
                        <div className="mt-4 flex overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                            <button
                                type="button"
                                onClick={() => openDirections('walking')}
                                className="flex flex-1 flex-col items-center gap-1.5 px-2 py-3 text-xs font-semibold text-gray-600 dark:text-gray-400 transition hover:bg-gray-100 dark:hover:bg-gray-700 active:bg-blue-600 active:text-white"
                            >
                                <Footprints className="h-5 w-5" />
                                Đi bộ
                            </button>
                            <button
                                type="button"
                                onClick={() => openDirections('driving')}
                                className="flex flex-1 flex-col items-center gap-1.5 border-x border-gray-200 dark:border-gray-700 px-2 py-3 text-xs font-semibold text-gray-600 dark:text-gray-400 transition hover:bg-gray-100 dark:hover:bg-gray-700 active:bg-blue-600 active:text-white"
                            >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
                                    <path d="M5 17h14" />
                                    <circle cx="7" cy="17" r="3" />
                                    <circle cx="17" cy="17" r="3" />
                                    <path d="M7 17l3-7h4l3 7" />
                                    <path d="M10 10l1.5-4h2L15 10" />
                                </svg>
                                Xe máy
                            </button>
                            <button
                                type="button"
                                onClick={() => openDirections('transit')}
                                className="flex flex-1 flex-col items-center gap-1.5 px-2 py-3 text-xs font-semibold text-gray-600 dark:text-gray-400 transition hover:bg-gray-100 dark:hover:bg-gray-700 active:bg-blue-600 active:text-white"
                            >
                                <Bus className="h-5 w-5" />
                                Xe buýt
                            </button>
                        </div>
                        <p className="mt-2.5 text-center text-[11px] text-gray-400 dark:text-gray-500">
                            Mở trong Google Maps
                        </p>
                        <button
                            type="button"
                            onClick={() => setDirectionsStore(null)}
                            className="mt-1.5 w-full rounded-xl px-4 py-2 text-sm font-medium text-gray-500 dark:text-gray-400 transition hover:bg-gray-100 dark:hover:bg-gray-800"
                        >
                            Hủy
                        </button>
                    </div>
                </div>
            )}
        </>
    );
}
