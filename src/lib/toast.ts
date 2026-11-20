import { useSyncExternalStore } from 'react';

/** A short, non-blocking message shown at the top of the screen for a couple of seconds. */
export type Toast = { id: number; message: string; icon?: string };

let current: Toast | null = null;
let nextId = 1;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());

export function showToast(message: string, { icon, durationMs = 2500 }: { icon?: string; durationMs?: number } = {}) {
  current = { id: nextId++, message, icon };
  emit();
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    current = null;
    timer = null;
    emit();
  }, durationMs);
}

export function useToast() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}
