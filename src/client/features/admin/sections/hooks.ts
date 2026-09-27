import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
import type { CenterOption } from './types';

/**
 * Center picker data for every super-admin form that targets a tenant
 * (support notes, usage overrides, subscription actions). Loaded once and
 * shared inside the mounted section.
 */
export function useCenterOptions(): CenterOption[] {
  const [centers, setCenters] = useState<CenterOption[]>([]);

  useEffect(() => {
    let cancelled = false;
    void api<{ tenants: CenterOption[] }>('/admin/tenants?page=1&limit=200')
      .then((data) => {
        if (!cancelled) setCenters(data.tenants);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  return centers;
}
