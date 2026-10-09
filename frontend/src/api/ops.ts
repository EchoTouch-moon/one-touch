import api from './client';

export interface VersionInfo {
  version: string;
  build_date: string;
  backup_enabled: boolean;
  backup_retention_days: number;
}

export interface OpsStatus {
  version: string;
  build_date: string;
  database_engine: string;
  database_path: string;
  database_exists: boolean;
  backup_enabled: boolean;
  backup_dir: string;
  backup_retention_days: number;
  llm_provider: string;
  llm_model: string;
  llm_configured: boolean;
  enrich_daily_limit: number;
  enrich_recent_total: number;
  enrich_by_status: Record<string, number>;
  enrich_avg_duration_ms: number | null;
  regular_user_count: number;
  disabled_user_count: number;
  registration_enabled: boolean;
  registration_max_users: number;
  active_users_7d: number;
  reviews_7d: number;
  latest_backup_at: string | null;
  latest_backup_path: string;
  handwriting_ink_count: number;
  handwriting_image_count: number;
  handwriting_ink_bytes: number;
  handwriting_image_bytes: number;
  recent_feedback: Record<string, unknown>[];
  recent_client_errors: Record<string, unknown>[];
}

export interface ClientErrorPayload {
  message: string;
  stack?: string;
  source?: string;
  url?: string;
  user_agent?: string;
  build_version?: string;
  build_date?: string;
}

export interface FeedbackPayload {
  message: string;
  page_url?: string;
  user_agent?: string;
  build_version?: string;
  build_date?: string;
}

export async function getVersion(): Promise<VersionInfo> {
  const res = await api.get<VersionInfo>('/ops/version');
  return res.data;
}

export async function getOpsStatus(): Promise<OpsStatus> {
  const res = await api.get<OpsStatus>('/ops/status');
  return res.data;
}

export async function reportClientError(payload: ClientErrorPayload): Promise<void> {
  await api.post('/ops/client-errors', payload);
}

export async function sendFeedback(payload: FeedbackPayload): Promise<void> {
  await api.post('/ops/feedback', payload);
}
