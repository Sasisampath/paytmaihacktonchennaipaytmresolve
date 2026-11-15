"use client";

import { useSyncExternalStore } from "react";
import { decodeStore, emptyStore, storeKey, type Store } from "./storage.ts";

let cachedRaw: string | null = null;
let snapshot = emptyStore;
const changeEvent = "paytm-resolve:change";

function readSnapshot() {
  try {
    const raw = localStorage.getItem(storeKey);
    if (cachedRaw !== raw) {
      cachedRaw = raw;
      snapshot = decodeStore(raw);
    }
    return snapshot;
  } catch {
    return emptyStore;
  }
}

function subscribe(notify: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === storeKey || event.key === null) notify();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(changeEvent, notify);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(changeEvent, notify);
  };
}

export function useStore() {
  return useSyncExternalStore(subscribe, readSnapshot, () => emptyStore);
}

export function useHydrated() {
  return useSyncExternalStore(() => () => {}, () => true, () => false);
}

export async function transact<T>(update: (store: Store) => { store: Store; result: T }) {
  const apply = () => {
    let current: Store;
    try {
      current = decodeStore(localStorage.getItem(storeKey));
    } catch {
      throw new Error("Browser storage is unavailable. Enable site storage and try again.");
    }
    const { store, result } = update(current);
    try {
      localStorage.setItem(storeKey, JSON.stringify(store));
    } catch {
      throw new Error("Changes could not be saved in this browser. Free some site storage and try again.");
    }
    window.dispatchEvent(new Event(changeEvent));
    return result;
  };
  return navigator.locks ? navigator.locks.request(storeKey, apply) : apply();
}
