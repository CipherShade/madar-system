import { useEffect, useState } from 'react';
import { api } from '../../../lib/api';
/**
 * Center picker data for every super-admin form that targets a tenant
 * (support notes, usage overrides, subscription actions). Loaded once and
 * shared inside the mounted section.
 */
export function useCenterOptions() {
    const [centers, setCenters] = useState([]);
    useEffect(() => {
        let cancelled = false;
        void api('/admin/tenants?page=1&limit=200')
            .then((data) => {
            if (!cancelled)
                setCenters(data.tenants);
        })
            .catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, []);
    return centers;
}
