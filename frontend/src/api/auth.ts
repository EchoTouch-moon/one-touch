import api from './client';

export interface LoginResponse {
  token: string;
  username: string;
  role: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  verification_code: string;
}

export interface RegisterResponse {
  accepted: boolean;
  message: string;
}

export interface AuthStatusResponse {
  authenticated: boolean;
  username: string | null;
  role: string | null;
}

export interface PublicConfigResponse {
  llm: {
    provider: string;
    model: string;
    base_url: string;
    provider_options: { value: string; label: string }[];
  };
}

export interface InviteCodeItem {
  id: number;
  code: string;
  created_by: number | null;
  used_by: number | null;
  used_at: string | null;
  created_at: string;
  revoked: boolean;
}

export async function login(username: string, password: string): Promise<LoginResponse> {
  const res = await api.post<LoginResponse>('/auth/login', { username, password }, {
    headers: {
      'X-Skip-Auth': '1',
      'X-Suppress-Auth-Expired-Toast': '1',
    },
  });
  return res.data;
}

export async function register(body: RegisterRequest): Promise<RegisterResponse> {
  const res = await api.post<RegisterResponse>('/auth/register', body);
  return res.data;
}

export async function sendRegistrationCode(email: string): Promise<{ sent: boolean; message: string }> {
  const res = await api.post<{ sent: boolean; message: string }>('/auth/register/send-code', { email });
  return res.data;
}

export async function sendPasswordResetCode(email: string): Promise<{ sent: boolean; message: string }> {
  const res = await api.post<{ sent: boolean; message: string }>('/auth/password-reset/send-code', { email });
  return res.data;
}

export async function resetPassword(body: RegisterRequest): Promise<RegisterResponse> {
  const res = await api.post<RegisterResponse>('/auth/password-reset', body);
  return res.data;
}

export async function getAuthStatus(): Promise<AuthStatusResponse> {
  const res = await api.get<AuthStatusResponse>('/auth/status', {
    headers: { 'X-Suppress-Auth-Expired-Toast': '1' },
  });
  return res.data;
}

export async function getPublicConfig(): Promise<PublicConfigResponse> {
  const res = await api.get<PublicConfigResponse>('/auth/config');
  return res.data;
}

export async function createInviteCode(): Promise<{ id: number; code: string; created_at: string }> {
  const res = await api.post('/auth/invite-codes');
  return res.data;
}

export async function listInviteCodes(): Promise<InviteCodeItem[]> {
  const res = await api.get<InviteCodeItem[]>('/auth/invite-codes');
  return res.data;
}

export async function revokeInviteCode(codeId: number): Promise<void> {
  await api.delete(`/auth/invite-codes/${codeId}`);
}

export interface UserItem {
  id: number;
  email: string;
  role: string;
  created_at: string;
}

export async function listUsers(): Promise<UserItem[]> {
  const res = await api.get<UserItem[]>('/auth/users');
  return res.data;
}

export async function createUser(email: string, password: string): Promise<UserItem> {
  const res = await api.post<UserItem>('/auth/users', { email, password });
  return res.data;
}

export async function deleteUser(userId: number): Promise<void> {
  await api.delete(`/auth/users/${userId}`);
}

export function isAuthApiError(error: unknown): error is { response?: { data?: { detail?: string; message?: string } } } {
  return typeof error === 'object' && error !== null && 'response' in error;
}

export function getAuthApiMessage(
  error: { response?: { data?: { detail?: string; message?: string } } },
  fallback: string,
): string {
  return error.response?.data?.detail || error.response?.data?.message || fallback;
}
