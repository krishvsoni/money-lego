"use client";

import { useCallback, useEffect, useState } from "react";
import { api, errorMessage } from "./api-client";

interface Loaded<T> {
  path: string | null;
  data: T | null;
  error: string | null;
}

// Fetches a JSON resource. Results are tagged with the path they belong to, so switching
// paths never shows the previous path's data, and a late response for an old path is
// dropped by the cancellation flag.
export function useResource<T>(path: string | null) {
  const [state, setState] = useState<Loaded<T>>({ path: null, data: null, error: null });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    api<T>(path)
      .then((data) => !cancelled && setState({ path, data, error: null }))
      .catch((e) => !cancelled && setState((s) => ({ path, data: s.path === path ? s.data : null, error: errorMessage(e) })));
    return () => {
      cancelled = true;
    };
  }, [path, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  const setData = useCallback((data: T) => setState((s) => ({ ...s, data })), []);
  const current = state.path === path;

  return { data: current ? state.data : null, error: current ? state.error : null, loading: !current, setData, reload };
}
