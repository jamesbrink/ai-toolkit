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
  }, deps);
}
