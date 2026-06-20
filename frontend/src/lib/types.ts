// ─── Existing Brief types ───

export interface BriefItem {
  timestamp: string;
  source: string;
  title: string;
  url: string;
  extended_headline: string | null;
  key_entities: string[];
}

export interface AvailableDate {
  key: string;
  label: string;
  date_et: string;
  is_weekend: boolean;
}

export interface BriefResponse {
  status: string;
  agent: string;
  day_key: string;
  day_label: string;
  available_dates: AvailableDate[];
  items: BriefItem[];
  item_count: number;
}

// ─── Weekly Notification types ───

export interface NotificationItem {
  title: string;
  timestamp: string;
  source: string;
  url: string;
  score: number;
}

export interface TopicNotification {
  notification_id: string;
  topic_id: string;
  topic_name: string;
  week_start: string;
  week_end: string;
  significance: "high" | "medium" | "low" | "none";
  significance_reason: string;
  headline: string;
  summary: string;
  agent_path: string;
  items: NotificationItem[];
  item_count: number;
  created_at: string;
}

export interface NotificationWeek {
  week_end: string;
  week_start: string;
  notification_count: number;
}

export interface NotificationsResponse {
  status: string;
  week_end: string;
  week_start: string;
  notifications: TopicNotification[];
  notification_count: number;
  available_weeks: NotificationWeek[];
}

// ─── Analysis Event types ───

export interface AnalysisEvent {
  event_id: string;
  ticker: string;
  event_type: string;
  severity: "high" | "medium" | "low";
  headline: string;
  detail: string;
  metrics: Record<string, unknown>;
  date: string;
  agent_path: string;
  created_at: string;
}

export interface AnalysisEventsResponse {
  status: string;
  events: AnalysisEvent[];
  event_count: number;
  available_dates: string[];
}

// ─── Techmap Highlight types (new) ───

export interface TechmapEvidence {
  title: string;
  timestamp: string;
  source: string;
  url: string;
}

export interface TechmapHighlight {
  topic_id: string;
  company: string;
  week_start: string;
  week_end: string;
  headline: string;
  top_cluster_label: string;
  takeaways: string[];
  evidence: TechmapEvidence[];
  agent_path: string;
  created_at: string;
}

export interface TechmapHighlightsResponse {
  status: string;
  highlights: TechmapHighlight[];
  highlight_count: number;
  week_end: string;
  week_start: string;
  available_weeks: string[];
}

// ─── Combined count (updated) ───

export interface NotificationCountResponse {
  count: number;
  weekly_count: number;
  analysis_count: number;
  techmap_count: number;
  week_end: string;
  latest_event_date: string;
  techmap_week_end: string;
}