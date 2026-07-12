import useSWR from 'swr';
import type { LinkMapping, StatsData, ClickHistory } from '../types';

const fetcher = (url: string) => fetch(url).then(res => res.json());

export function useLinks() {
  const { data: links, error: linksError, mutate: mutateLinks, isLoading: linksLoading } = useSWR<LinkMapping[]>('/api/links?limit=100', fetcher);
  
  return {
    links: links || [],
    isLoading: linksLoading,
    isError: linksError,
    mutateLinks
  };
}

export function useDashboardData() {
  const { data: stats, error: statsError, mutate: mutateStats } = useSWR<StatsData>('/api/stats', fetcher);
  const { data: history, error: historyError, mutate: mutateHistory } = useSWR<ClickHistory[]>('/api/clicks-over-time?days=14', fetcher);

  const refreshAll = () => {
    mutateStats();
    mutateHistory();
  };

  return {
    stats: stats || { total_links: 0, total_clicks: 0 },
    history: history || [],
    isLoading: !stats && !statsError,
    isError: statsError || historyError,
    refreshAll
  };
}
