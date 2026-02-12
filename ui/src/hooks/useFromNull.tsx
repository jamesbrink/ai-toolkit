import { useEffect, useRef } from 'react';

export function useFromNull(effect: () => void | (() => void), deps: Array<unknown>) {
  const prevDepsRef = useRef<unknown[]>([]);

  useEffect(() => {
    const shouldRun = deps.some((dep, i) => prevDepsRef.current[i] == null && dep != null);

    if (shouldRun) {
      const cleanup = effect();
      prevDepsRef.current = deps;
      return cleanup;
    }

    prevDepsRef.current = deps;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps is intentionally spread as the dependency array; this hook dynamically forwards caller-provided deps
  }, deps);
}
