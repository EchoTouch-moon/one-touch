import api from './client';

export interface EnrichQuota {
  limit: number | null;
  used: number;
  remaining: number | null;
  reset_at: string;
}

export interface EnrichResponse {
  status: string;
  word_id: number;
  text: string;
  quota?: EnrichQuota;
}

export function getEnrichErrorMessage(error: unknown): string {
  const detail = (error as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  if (typeof detail === 'object' && detail !== null && 'message' in detail) {
    const message = String((detail as { message?: unknown }).message || 'Daily AI enrich limit reached');
    const quota = (detail as { quota?: Partial<EnrichQuota> }).quota;
    if (quota?.reset_at) {
      const reset = new Date(quota.reset_at).toLocaleDateString();
      return `${message}. Resets on ${reset}.`;
    }
    return message;
  }
  if (typeof detail === 'string') return detail;
  return 'Enrichment failed';
}

export async function enrichWord(wordId: number): Promise<EnrichResponse> {
  const res = await api.post(`/enrich/${wordId}`, null, { timeout: 120000 });
  return res.data;
}

export async function getEnrichQuota(): Promise<EnrichQuota> {
  const res = await api.get('/enrich/quota');
  return res.data;
}
