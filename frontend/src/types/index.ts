export interface LinkMapping {
  short_code: string;
  original_url: string;
  click_count: number;
  created_at: string | null;
  nickname: string | null;
}

export interface StatsData {
  total_links: number;
  total_clicks: number;
}

export interface ClickHistory {
  date: string;
  count: number;
}
