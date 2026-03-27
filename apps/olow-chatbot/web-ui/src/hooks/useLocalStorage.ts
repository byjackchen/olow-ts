import { useCallback, useState } from 'react';

/**
 * Generic hook that keeps React state in sync with `localStorage`.
 *
 * The stored value is JSON-serialised.  If the key does not exist or the
 * stored JSON is unparseable, `initialValue` is used instead.
 */
export function useLocalStorage<T>(
  key: string,
  initialValue: T,
): [T, (value: T | ((prev: T) => T)) => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = localStorage.getItem(key);
      return item ? (JSON.parse(item) as T) : initialValue;
    } catch {
      return initialValue;
    }
  });

  const setValue = useCallback(
    (value: T | ((prev: T) => T)) => {
      setStoredValue((prev) => {
        const next = value instanceof Function ? value(prev) : value;
        try {
          localStorage.setItem(key, JSON.stringify(next));
        } catch {
          // localStorage is full or unavailable — state still updates.
        }
        return next;
      });
    },
    [key],
  );

  return [storedValue, setValue];
}
