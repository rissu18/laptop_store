"use client";

import { useSyncExternalStore } from "react";

/**
 * Väike brauseripoolne store, mis hoiab väärtust localStorage'is ja sünkroniseerib
 * seda kõigi komponentide ning brauseri kaartide (tab) vahel.
 *
 * Serveris ja esimesel renderdusel on väärtus alati `initial` — see väldib hydration-vigu.
 * NB! Siin hoitakse ainult ID-sid ja koguseid, mitte hindu. Hinnad küsitakse alati serverist.
 */
export function createPersistentStore<T>(key: string, initial: T, validate: (value: unknown) => T) {
  const listeners = new Set<() => void>();
  let cache: T | undefined;

  function read(): T {
    if (cache !== undefined) return cache;
    try {
      const raw = window.localStorage.getItem(key);
      cache = raw ? validate(JSON.parse(raw)) : initial;
    } catch {
      cache = initial;
    }
    return cache;
  }

  function write(value: T) {
    cache = value;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Privaatne režiim või täis salvestusruum — store töötab edasi mälus
    }
    listeners.forEach((listener) => listener());
  }

  function subscribe(listener: () => void) {
    listeners.add(listener);
    const onStorage = (event: StorageEvent) => {
      if (event.key !== key) return;
      cache = undefined;
      listener();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(listener);
      window.removeEventListener("storage", onStorage);
    };
  }

  return {
    get: read,
    set: (update: (current: T) => T) => write(update(read())),
    useValue: () => useSyncExternalStore(subscribe, read, () => initial),
  };
}
