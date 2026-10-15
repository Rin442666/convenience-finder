'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

/* Hook nhập liệu bằng giọng nói dùng Web Speech API .
   Dùng chung cho ô tìm kiếm và chatbot. */


function subscribeVoiceSupport(): () => void {
    return () => {};
}
function getVoiceSupportSnapshot(): boolean {
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}
function getVoiceSupportServerSnapshot(): boolean {
    return false;
}


function cleanTranscript(raw: string): string {
    return raw
        .trim()
        .replace(/[.,!?;:…]+$/u, '')
        .replace(/\s+/g, ' ')
        .trim();
}

export function useVoiceInput(
    onResult: (transcript: string) => void,
    onError?: (message: string) => void
) {
    const [listening, setListening] = useState(false);
    const recognitionRef = useRef<SpeechRecognition | null>(null);
    const supported = useSyncExternalStore(
    subscribeVoiceSupport,
    getVoiceSupportSnapshot,
    getVoiceSupportServerSnapshot
);


    useEffect(() => {
        return () => {
            recognitionRef.current?.abort();
            recognitionRef.current = null;
        };
    }, []);

    const stop = useCallback(() => {
        recognitionRef.current?.stop();
    }, []);

    const start = useCallback(() => {
        if (recognitionRef.current) {
            recognitionRef.current.abort();
            recognitionRef.current = null;
        }
        const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!Ctor) {
            onError?.('Trình duyệt không hỗ trợ tìm kiếm bằng giọng nói.');
            return;
        }
        const recognition = new Ctor();
        recognition.lang = 'vi-VN';
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;
        recognition.onresult = (event: SpeechRecognitionEvent) => {
            const transcript = cleanTranscript(event.results?.[0]?.[0]?.transcript ?? '');
            if (transcript) {
                onResult(transcript);
            }
        };
        recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
            if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
                onError?.('Chưa được cấp quyền micro. Hãy cho phép trong trình duyệt rồi thử lại.');
            } else if (event.error === 'no-speech') {
                onError?.('Không nghe thấy gì, bạn thử nói lại nhé.');
            } else if (event.error !== 'aborted') {
                onError?.('Không nghe rõ, bạn thử lại nhé.');
            }
        };
        recognition.onend = () => {
            recognitionRef.current = null;
            setListening(false);
        };
        recognitionRef.current = recognition;
        try {
            recognition.start();
            setListening(true);
        } catch {
            recognitionRef.current = null;
            setListening(false);
        }
    }, [onResult, onError]);

    const toggle = useCallback(() => {
        if (listening) {
            stop();
        } else {
            start();
        }
    }, [listening, start, stop]);

    return { supported, listening, toggle };
}
