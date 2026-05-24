import type { CircuitDoc } from "./model.ts";

const SHARE_KEY = "doc";

export function encodeSharedDoc(doc: CircuitDoc): string {
  const json = JSON.stringify(doc);
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function decodeSharedDoc(encoded: string): unknown | null {
  const padded = encoded.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(encoded.length / 4) * 4, "=");
  try {
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

export function sharedDocFromHash(hash: string): unknown | null {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  const params = new URLSearchParams(raw);
  const encoded = params.get(SHARE_KEY);
  return encoded ? decodeSharedDoc(encoded) : null;
}

export function shareUrlForDoc(href: string, doc: CircuitDoc): string {
  const url = new URL(href);
  const params = new URLSearchParams(url.hash.startsWith("#") ? url.hash.slice(1) : url.hash);
  params.set(SHARE_KEY, encodeSharedDoc(doc));
  url.hash = params.toString();
  return url.toString();
}
