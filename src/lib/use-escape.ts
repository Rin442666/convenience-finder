// Hook dùng chung: bấm phím Esc thì gọi onEscape (đóng modal/popup).
// active=false thì không lắng nghe (dùng cho modal có early-return).
import { useEffect } from 'react';

export function useEscapeKey(onEscape: () => void, active = true): void {
    useEffect(() => {
        if (!active) {
            return;
        }
        const handler = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onEscape();
            }
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [onEscape, active]);
}
