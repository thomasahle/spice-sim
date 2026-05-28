// Thin wrappers around localStorage that never throw — storage can be
// unavailable (private browsing), full, or disabled. Persisted UI flags use a
// "1"/"0" encoding; these centralize both that and the try/catch boilerplate.

/** Read a persisted boolean flag. Returns `fallback` when the key is unset or
 *  storage is unavailable. Any stored value other than "1" reads as false. */
export function readStoredBoolean(key: string, fallback: boolean): boolean {
  try {
    const stored = localStorage.getItem(key);
    if (stored == null) return fallback;
    return stored === "1";
  } catch {
    return fallback;
  }
}

/** Persist a boolean flag as "1"/"0". Silently no-ops if storage is unavailable. */
export function writeStoredBoolean(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, value ? "1" : "0");
  } catch {
    /* ignore: storage unavailable or full */
  }
}
