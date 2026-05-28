// Strongly-typed custom events used to coordinate App.tsx (the titlebar) with
// the Editor without lifting state up. Augmenting WindowEventMap lets
// addEventListener/dispatchEvent infer each event's detail payload, removing
// the `as CustomEvent<…>` / `as EventListener` casts at the call sites.
declare global {
  interface WindowEventMap {
    "spicesim:title": CustomEvent<string>;
    "spicesim:sidebar-state": CustomEvent<{ collapsed: boolean }>;
    "spicesim:inspector-state": CustomEvent<{ collapsed: boolean }>;
    "spicesim:toggle-sidebar": CustomEvent<undefined>;
    "spicesim:toggle-inspector": CustomEvent<undefined>;
    "spicesim:share": CustomEvent<undefined>;
  }
}

export {};
