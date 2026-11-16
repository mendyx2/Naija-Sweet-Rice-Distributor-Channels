"use client";

/** The customer's delivery area, remembered in this browser and shared by the header, product pages and cart. */
import { useSyncExternalStore } from "react";

const KEY = "nsr_zone";
const EVENT = "nsr-zone-change";

function read(): string {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

function subscribe(cb: () => void) {
  const onStorage = (e: StorageEvent) => e.key === KEY && cb();
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", onStorage);
  };
}

export function setZone(id: string) {
  try {
    localStorage.setItem(KEY, id);
  } catch {}
  window.dispatchEvent(new Event(EVENT));
}

/** "" until the browser has loaded (and when no area has been chosen). */
export function useZone(): string {
  return useSyncExternalStore(subscribe, read, () => "");
}

export function openAreaPicker() {
  window.dispatchEvent(new Event("nsr-open-area-picker"));
}

// ─── The store the customer buys from, and delivery or pickup ───────────────
const STORE_KEY = "nsr_store";
const FULFIL_KEY = "nsr_fulfillment";
const STORE_EVENT = "nsr-store-change";

function readKey(k: string): string {
  try {
    return localStorage.getItem(k) ?? "";
  } catch {
    return "";
  }
}
function subscribeStore(cb: () => void) {
  const onStorage = (e: StorageEvent) => (e.key === STORE_KEY || e.key === FULFIL_KEY) && cb();
  window.addEventListener(STORE_EVENT, cb);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(STORE_EVENT, cb);
    window.removeEventListener("storage", onStorage);
  };
}

export function setStore(id: string) {
  try {
    localStorage.setItem(STORE_KEY, id);
  } catch {}
  window.dispatchEvent(new Event(STORE_EVENT));
}

export function setFulfillment(f: "DELIVERY" | "PICKUP") {
  try {
    localStorage.setItem(FULFIL_KEY, f);
  } catch {}
  window.dispatchEvent(new Event(STORE_EVENT));
}

/** The chosen store's id ("" if none). */
export function useStoreChoice(): string {
  return useSyncExternalStore(subscribeStore, () => readKey(STORE_KEY), () => "");
}

export function useFulfillment(): "DELIVERY" | "PICKUP" {
  const v = useSyncExternalStore(subscribeStore, () => readKey(FULFIL_KEY), () => "");
  return v === "PICKUP" ? "PICKUP" : "DELIVERY";
}
