import { useEffect, useState } from 'react';

/** The current time, refreshed every `everyMs`. For labels like "last seen 2 min ago". */
export function useNow(everyMs = 5_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(id);
  }, [everyMs]);
  return now;
}
