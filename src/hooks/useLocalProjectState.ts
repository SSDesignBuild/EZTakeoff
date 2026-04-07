import { useEffect, useState } from 'react';
import { ServiceDefinition } from '../data/services';

export function useLocalProjectState(service: ServiceDefinition) {
  const storageKey = `sns-takeoff:${service.slug}`;
  const [values, setValues] = useState<Record<string, string | number | boolean>>(() => {
    const raw = window.localStorage.getItem(storageKey);
    if (raw) {
      try {
        return { ...service.defaults, ...JSON.parse(raw) };
      } catch {
        return service.defaults;
      }
    }
    return service.defaults;
  });

  useEffect(() => {
    window.localStorage.setItem(storageKey, JSON.stringify(values));
  }, [storageKey, values]);

  return { values, setValues };
}
