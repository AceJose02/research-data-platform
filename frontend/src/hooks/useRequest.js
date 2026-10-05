import { useEffect, useRef, useState } from "react";

/**
 * Run an async request whenever `deps` change. Earlier in-flight requests are
 * aborted, so a slow response can never overwrite a newer one.
 *
 * `factory(signal)` returns a promise, or null to skip.
 */
export function useRequest(factory, deps) {
  const [state, setState] = useState({ data: null, error: null, loading: false });
  const factoryRef = useRef(factory);
  factoryRef.current = factory;

  useEffect(() => {
    const controller = new AbortController();
    const promise = factoryRef.current?.(controller.signal);
    if (!promise) {
      setState({ data: null, error: null, loading: false });
      return undefined;
    }
    setState((prev) => ({ ...prev, error: null, loading: true }));
    promise.then(
      (data) => {
        if (!controller.signal.aborted) setState({ data, error: null, loading: false });
      },
      (error) => {
        if (error?.name === "AbortError" || controller.signal.aborted) return;
        setState((prev) => ({ ...prev, error, loading: false }));
      },
    );
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return state;
}
