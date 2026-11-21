import { useSyncExternalStore } from 'react';

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = matchMedia(query);
      mq.addEventListener('change', cb);
      return () => mq.removeEventListener('change', cb);
    },
    () => matchMedia(query).matches,
    () => false,
  );
}

export const useIsPhone = () => useMediaQuery('(max-width: 639px)');
export const useIsDesktop = () => useMediaQuery('(min-width: 1024px)');
export const useIsWide = () => useMediaQuery('(min-width: 1280px)');
