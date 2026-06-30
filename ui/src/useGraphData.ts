import { useCallback, useState } from 'react';
import type { GraphData } from './types';

export interface UseGraphDataResult {
  data: GraphData | null;
  loading: boolean;
  error: string | null;
  fetchGraph: () => void;
}

export async function fetchLayout(maxNodes = 2000): Promise<GraphData> {
  const res = await fetch(`/api/layout?max_nodes=${maxNodes}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export function useGraphData(): UseGraphDataResult {
  const [data, setData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchGraph = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchLayout();
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error cargando grafo');
    } finally {
      setLoading(false);
    }
  }, []);

  return { data, loading, error, fetchGraph };
}
