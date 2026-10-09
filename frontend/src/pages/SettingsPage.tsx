import LegacyReviewNotice from '../components/LegacyReviewNotice';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';
import api from '../api/client';
import {
  createUser,
  deleteUser,
  getAuthApiMessage,
  getPublicConfig,
  isAuthApiError,
  listUsers,
  updateUser,
  type UserItem,
} from '../api/auth';
import { getEnrichQuota, type EnrichQuota } from '../api/enrich';
import { getOpsStatus, getVersion, type OpsStatus, type VersionInfo } from '../api/ops';
import { getActivity, type ActivityResponse } from '../api/profile';
import { useAuthStore } from '../store/authStore';
import { useSettingsStore } from '../store/settingsStore';
import StylusDiagnostics from '../components/StylusDiagnostics';

const fallbackProviders = [
  { value: 'ollama', label: 'Ollama (Local)' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'doubao', label: 'Doubao (Volcengine)' },
];
type ProviderValue = 'openai' | 'ollama' | 'anthropic' | 'doubao';
const HEATMAP_DAYS = 84;
type SettingsTab = 'profile' | 'data' | 'llm' | 'admin';

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/* ── page furniture ─────────────────────────────────────────────────────────
   Settings is an editorial account page: every block is the same card, opened
   by an eyebrow, a title and one line of explanation. The helpers below are
   that shape, so no section re-invents its own spacing or type. */

function Section({
  eyebrow,
  title,
  badge,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  badge?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="card p-5 sm:p-6">
      <p className="eyebrow">{eyebrow}</p>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="text-title font-semibold text-ink">{title}</h2>
        {badge}
      </div>
      {description ? <p className="mt-1.5 max-w-[62ch] text-meta text-ink-mute">{description}</p> : null}
      {children ? <div className="mt-4 sm:mt-5">{children}</div> : null}
    </section>
  );
}

function Fact({ label, children, mono = false }: { label: string; children: ReactNode; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="stat-label">{label}</dt>
      <dd className={`mt-1 break-words text-meta text-ink ${mono ? 'num' : ''}`}>{children}</dd>
    </div>
  );
}

/* ── heatmap ────────────────────────────────────────────────────────────────
   One hue at rising weight: the `good` token carried at four opacities on top
   of a hairline for an empty day. The ladder is spaced so each step clears the
   one below it by ~1.4:1, which keeps five steps legible at 16px without
   spending a second hue on the chart. */

const HEATMAP_STEPS = [
  'bg-line',
  'bg-good opacity-35',
  'bg-good opacity-55',
  'bg-good opacity-75',
  'bg-good',
];

function intensity(count: number) {
  if (count <= 0) return HEATMAP_STEPS[0];
  if (count <= 1) return HEATMAP_STEPS[1];
  if (count <= 3) return HEATMAP_STEPS[2];
  if (count <= 6) return HEATMAP_STEPS[3];
  return HEATMAP_STEPS[4];
}

function ActivityHeatmap({ activity }: { activity: ActivityResponse }) {
  const recentDays = useMemo(
    () => activity.days.slice(-HEATMAP_DAYS).map((day) => ({
      ...day,
      total: day.captured + day.reviewed,
    })),
    [activity.days],
  );
  const weeks = useMemo(() => {
    const result = [];
    for (let i = 0; i < recentDays.length; i += 7) {
      result.push(recentDays.slice(i, i + 7));
    }
    return result;
  }, [recentDays]);
  const summary = useMemo(() => recentDays.reduce(
    (acc, day) => ({
      captured: acc.captured + day.captured,
      reviewed: acc.reviewed + day.reviewed,
      activeDays: acc.activeDays + (day.total > 0 ? 1 : 0),
    }),
    { captured: 0, reviewed: 0, activeDays: 0 },
  ), [recentDays]);

  return (
    <div className="grid gap-x-10 gap-y-6 lg:grid-cols-[auto_minmax(0,1fr)] lg:items-start">
      <div className="min-w-0">
        <div className="overflow-x-auto pb-1">
          <div className="flex w-max gap-1">
            {weeks.map((week, weekIndex) => (
              <div key={weekIndex} className="grid grid-rows-7 gap-1">
                {week.map((day) => (
                  <div
                    key={day.date}
                    title={`${day.date}: ${day.captured} captured, ${day.reviewed} reviewed`}
                    className={`h-4 w-4 rounded-xs ${intensity(day.total)}`}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
        <div className="mt-3.5 flex flex-wrap items-center gap-1.5">
          <span className="text-micro text-ink-mute">Less</span>
          {[0, 1, 3, 6, 9].map((value) => (
            <span key={value} className={`h-4 w-4 rounded-xs ${intensity(value)}`} />
          ))}
          <span className="text-micro text-ink-mute">More</span>
        </div>
      </div>

      {/* Sits beside the grid so the card reads as one row instead of a small
          chart floating in a wide empty field. */}
      <div className="min-w-0 border-line pt-5 lg:border-l lg:pl-10 lg:pt-0">
        <div className="grid grid-cols-3 gap-x-4 gap-y-5">
          {[
            ['Captured', summary.captured],
            ['Reviewed', summary.reviewed],
            ['Active days', summary.activeDays],
          ].map(([label, value]) => (
            <div key={label} className="min-w-0">
              <p className="stat-value">{value}</p>
              <p className="stat-label mt-1.5">{label}</p>
            </div>
          ))}
        </div>
        <p className="mt-5 max-w-[54ch] text-micro text-ink-mute">
          Recent activity is based on capture and review events in the visible heatmap window.
        </p>
      </div>
    </div>
  );
}

function UsersSection() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [creating, setCreating] = useState(false);
  const currentUserEmail = useAuthStore((s) => s.username);

  const fetchUsers = useCallback(async () => {
    try {
      const data = await listUsers();
      setUsers(data);
    } catch {
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void fetchUsers(), 0);
    return () => window.clearTimeout(timer);
  }, [fetchUsers]);

  const handleCreate = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || password.length < 8) {
      toast.error('Email + password (8+ chars) required');
      return;
    }
    setCreating(true);
    try {
      await createUser(trimmedEmail, password);
      toast.success(`User ${trimmedEmail} created`);
      setEmail('');
      setPassword('');
      await fetchUsers();
    } catch (err) {
      const msg = isAuthApiError(err) ? getAuthApiMessage(err, 'Failed to create user') : 'Failed to create user';
      toast.error(msg);
    } finally {
      setCreating(false);
    }
  }, [email, password, fetchUsers]);

  const handleDelete = useCallback(async (user: UserItem) => {
    if (!window.confirm(`Delete user ${user.email}? Their words and history will be removed.`)) return;
    try {
      await deleteUser(user.id);
      toast.success('User removed');
      await fetchUsers();
    } catch (err) {
      const msg = isAuthApiError(err) ? getAuthApiMessage(err, 'Failed to delete user') : 'Failed to delete user';
      toast.error(msg);
    }
  }, [fetchUsers]);

  const handleToggleDisabled = useCallback(async (user: UserItem) => {
    try {
      await updateUser(user.id, { is_disabled: !user.is_disabled });
      toast.success(user.is_disabled ? 'User enabled' : 'User disabled');
      await fetchUsers();
    } catch (err) {
      const msg = isAuthApiError(err) ? getAuthApiMessage(err, 'Failed to update user') : 'Failed to update user';
      toast.error(msg);
    }
  }, [fetchUsers]);

  return (
    <Section
      eyebrow="Admin"
      title="Users"
      description="Internal beta: create accounts for testers directly. Share the email and password through a secure channel."
    >
      <form onSubmit={handleCreate} className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div className="min-w-0">
          <label className="label" htmlFor="admin-user-email">Email</label>
          <input
            id="admin-user-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tester@example.com"
            className="field"
            autoComplete="email"
          />
        </div>
        <div className="min-w-0">
          <label className="label" htmlFor="admin-user-password">Password</label>
          <input
            id="admin-user-password"
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="8+ characters"
            className="field num"
            autoComplete="new-password"
          />
        </div>
        <button
          type="submit"
          disabled={creating || !email.trim() || password.length < 8}
          className="btn btn-primary"
        >
          {creating ? 'Creating...' : 'Create user'}
        </button>
      </form>

      <div className="rule mt-5 pt-5">
        {loading ? (
          <div aria-busy="true" className="space-y-2">
            <span className="sr-only">Loading users…</span>
            {[0, 1].map((row) => <div key={row} className="skeleton h-16 w-full" />)}
          </div>
        ) : users.length === 0 ? (
          <div className="empty">
            <p className="text-lead font-semibold text-ink">No accounts yet</p>
            <p className="max-w-[38ch] text-micro text-ink-mute">
              Create the first tester account with the form above.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {users.map((u) => {
              const isAdmin = u.role === 'admin';
              const isSelf = u.email === currentUserEmail;
              return (
                <li
                  key={u.id}
                  className="well flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <code className="num truncate text-meta text-ink">{u.email}</code>
                      <span className={isAdmin ? 'pill pill-brand' : 'pill pill-line'}>{u.role}</span>
                      {u.is_disabled && <span className="pill pill-bad">disabled</span>}
                    </div>
                    <p className="mt-1 text-micro text-ink-mute">
                      Created {new Date(u.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  {!isAdmin && !isSelf && (
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void handleToggleDisabled(u)}
                        className="btn btn-secondary"
                      >
                        {u.is_disabled ? 'Enable' : 'Disable'}
                      </button>
                      <span aria-hidden="true" className="h-5 w-px bg-line" />
                      <button
                        type="button"
                        onClick={() => void handleDelete(u)}
                        className="btn btn-danger"
                      >
                        Remove
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Section>
  );
}

function ProfileSection({ activity }: { activity: ActivityResponse | null }) {
  const summary = activity?.summary;

  return (
    <div className="space-y-5">
      <Section
        eyebrow="Your library"
        title="At a glance"
        description="Lifetime totals across every word you have captured."
      >
        <div className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4">
          {[
            ['Total words', `${summary?.total_words ?? 0}`],
            ['Enriched', `${summary?.enriched_words ?? 0}`],
            ['Due now', `${summary?.due_count ?? 0}`],
            ['Streak', `${summary?.streak_days ?? 0}d`],
          ].map(([label, value]) => (
            <div key={label} className="min-w-0">
              <p className="stat-value">{value}</p>
              <p className="stat-label mt-1.5">{label}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section
        eyebrow="Activity"
        title="Last 12 weeks"
        description="Captured + reviewed, one cell per day."
      >
        {activity ? (
          <ActivityHeatmap activity={activity} />
        ) : (
          <div aria-busy="true" className="space-y-4">
            <span className="sr-only">Loading activity…</span>
            <div className="skeleton h-36 w-full max-w-[16rem]" />
            <div className="grid grid-cols-3 gap-4">
              <div className="skeleton h-12" />
              <div className="skeleton h-12" />
              <div className="skeleton h-12" />
            </div>
          </div>
        )}
      </Section>
    </div>
  );
}

function DataSection({
  onExport,
  onImport,
  opsStatus,
}: {
  onExport: () => void;
  onImport: () => void;
  opsStatus: OpsStatus | null;
}) {
  return (
    <div className="space-y-5">
      <Section
        eyebrow="Data"
        title="Export & import"
        description="Export includes version metadata, review algorithm state, definitions, handwriting sources, and review records."
      >
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={onExport} className="btn btn-primary">
            Export JSON
          </button>
          <span aria-hidden="true" className="hidden h-5 w-px bg-line sm:block" />
          <button type="button" onClick={onImport} className="btn btn-danger">
            Import JSON
          </button>
        </div>
      </Section>

      {opsStatus && (
        <div className="grid gap-5 md:grid-cols-2">
          <section className="card p-5 sm:p-6">
            <h3 className="text-lead font-semibold text-ink">Backup status</h3>
            <dl className="mt-4 grid gap-4">
              <Fact label="Database">{opsStatus.database_exists ? 'available' : 'not found'}</Fact>
              <Fact label="Backups">
                {opsStatus.backup_enabled ? `${opsStatus.backup_retention_days}d retention` : 'off'}
              </Fact>
              <Fact label="Latest">
                {opsStatus.latest_backup_at ? new Date(opsStatus.latest_backup_at).toLocaleString() : 'none yet'}
              </Fact>
              {opsStatus.latest_backup_path && (
                <div className="min-w-0">
                  <dt className="stat-label">Path</dt>
                  <dd className="num mt-1 break-all text-micro text-ink-mute">{opsStatus.latest_backup_path}</dd>
                </div>
              )}
            </dl>
          </section>

          <section className="card p-5 sm:p-6">
            <h3 className="text-lead font-semibold text-ink">Handwriting storage</h3>
            <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-5">
              <div className="min-w-0">
                <p className="stat-value">{opsStatus.handwriting_ink_count}</p>
                <p className="stat-label mt-1.5">Ink docs</p>
                <p className="stat-label mt-0.5">{formatBytes(opsStatus.handwriting_ink_bytes)}</p>
              </div>
              <div className="min-w-0">
                <p className="stat-value">{opsStatus.handwriting_image_count}</p>
                <p className="stat-label mt-1.5">Previews</p>
                <p className="stat-label mt-0.5">{formatBytes(opsStatus.handwriting_image_bytes)}</p>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function ServerLlmSection({
  loading,
  providerOptions,
  llm,
  quota,
}: {
  loading: boolean;
  providerOptions: typeof fallbackProviders;
  quota: EnrichQuota | null;
  llm: {
    provider: ProviderValue;
    model: string;
    baseUrl: string;
  };
}) {
  return (
    <div className="space-y-5">
      <Section
        eyebrow="Server LLM"
        title="Model behind enrich"
        badge={<span className="pill pill-line">Read-only</span>}
        description="This deployment's provider is configured on the server and cannot be changed here."
      >
        {loading ? (
          <div aria-busy="true" className="space-y-4">
            <span className="sr-only">Loading server config…</span>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="skeleton h-12" />
              <div className="skeleton h-12" />
              <div className="skeleton h-12" />
            </div>
          </div>
        ) : (
          <dl className="grid gap-4 sm:grid-cols-3">
            <Fact label="Provider">
              {providerOptions.find((p) => p.value === llm.provider)?.label || llm.provider}
            </Fact>
            <Fact label="Model" mono>{llm.model}</Fact>
            {llm.baseUrl && <Fact label="Base URL" mono>{llm.baseUrl}</Fact>}
          </dl>
        )}
      </Section>

      <Section
        eyebrow="AI enrich quota"
        title="Daily allowance"
        description="Shared across this account; it resets on the server's schedule."
      >
        <div className="grid grid-cols-2 gap-x-4 gap-y-5 md:grid-cols-3">
          <div className="min-w-0">
            <p className="stat-value">{quota?.limit ?? 'Unlimited'}</p>
            <p className="stat-label mt-1.5">Daily limit</p>
          </div>
          <div className="min-w-0">
            <p className="stat-value">{quota?.used ?? 0}</p>
            <p className="stat-label mt-1.5">Used today</p>
          </div>
          <div className="min-w-0">
            <p className="stat-value">{quota?.remaining ?? 'Unlimited'}</p>
            <p className="stat-label mt-1.5">Remaining</p>
          </div>
        </div>
      </Section>

      <Section
        eyebrow="Personal API key"
        title="Bring your own key"
        badge={<span className="pill pill-warn">Planned</span>}
        description="Not available in this beta — the server key keeps cost and troubleshooting predictable."
      >
        <div className="grid gap-3 text-micro text-ink-mute md:grid-cols-3">
          <p className="well p-3.5">
            Current beta uses the server key for stability, cost control, and easier troubleshooting.
          </p>
          <p className="well p-3.5">
            When enabled, personal keys should be encrypted on the server and never shown back in full.
          </p>
          <p className="well p-3.5">
            Browser-only storage is not the default for the web app because it is harder to sync and protect.
          </p>
        </div>
      </Section>
    </div>
  );
}

function AdminSection({
  versionInfo,
  opsStatus,
  showDiagnostics,
  onToggleDiagnostics,
}: {
  versionInfo: VersionInfo | null;
  opsStatus: OpsStatus | null;
  showDiagnostics: boolean;
  onToggleDiagnostics: () => void;
}) {
  return (
    <div className="space-y-5">
      <UsersSection />

      <Section
        eyebrow="Admin"
        title="Build"
        description="What this frontend and its backend were built from."
      >
        <dl className="grid grid-cols-2 gap-x-4 gap-y-5 lg:grid-cols-4">
          <Fact label="Frontend" mono>{import.meta.env.VITE_APP_VERSION || 'dev'}</Fact>
          <Fact label="Built" mono>{(import.meta.env.VITE_BUILD_DATE || '').slice(0, 19) || 'dev'}</Fact>
          <Fact label="Backend" mono>{versionInfo?.version || 'unknown'}</Fact>
          <Fact label="Backups">
            {versionInfo?.backup_enabled ? `On, ${versionInfo.backup_retention_days}d` : 'Off'}
          </Fact>
        </dl>
      </Section>

      <Section
        eyebrow="Admin"
        title="Runtime"
        description="The database, backup policy and enrichment model this instance is running."
      >
        <dl className="grid grid-cols-2 gap-x-4 gap-y-5 lg:grid-cols-4">
          <Fact label="DB" mono>{opsStatus?.database_engine || 'unknown'}</Fact>
          <Fact label="Backup">
            {opsStatus?.backup_enabled ? `On, ${opsStatus.backup_retention_days}d` : 'Off'}
          </Fact>
          <Fact label="LLM" mono>
            {opsStatus?.llm_provider ? `${opsStatus.llm_provider} / ${opsStatus.llm_model || 'unset'}` : 'unknown'}
          </Fact>
          <Fact label="AI limit" mono>{opsStatus?.enrich_daily_limit ?? 5}/day</Fact>
        </dl>
      </Section>

      <Section
        eyebrow="Admin"
        title="Beta operations"
        description="Sign-ups and review volume across the current cohort."
      >
        <div className="grid grid-cols-2 gap-x-4 gap-y-5 lg:grid-cols-4">
          <div className="min-w-0">
            <p className="stat-value">
              {opsStatus?.regular_user_count ?? 0}
              <span className="ml-1 text-meta font-normal text-ink-mute">
                / {opsStatus?.registration_max_users || 'open'}
              </span>
            </p>
            <p className="stat-label mt-1.5">Users</p>
            <p className="stat-label mt-0.5">{opsStatus?.disabled_user_count ?? 0} disabled</p>
          </div>
          <div className="min-w-0">
            <p className="stat-value">{opsStatus?.registration_enabled ? 'Enabled' : 'Closed'}</p>
            <p className="stat-label mt-1.5">Registration</p>
          </div>
          <div className="min-w-0">
            <p className="stat-value">{opsStatus?.active_users_7d ?? 0}</p>
            <p className="stat-label mt-1.5">Active 7d</p>
          </div>
          <div className="min-w-0">
            <p className="stat-value">{opsStatus?.reviews_7d ?? 0}</p>
            <p className="stat-label mt-1.5">Reviews 7d</p>
          </div>
        </div>
      </Section>

      <Section
        eyebrow="Admin"
        title="AI enrich health"
        description="Enrichment runs recorded in the current window."
      >
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-x-4 gap-y-5">
            <div className="min-w-0">
              <p className="stat-value">{opsStatus?.enrich_recent_total ?? 0}</p>
              <p className="stat-label mt-1.5">Recent events</p>
            </div>
            <div className="min-w-0">
              <p className="stat-value">
                {opsStatus?.enrich_avg_duration_ms ? `${opsStatus.enrich_avg_duration_ms}ms` : 'n/a'}
              </p>
              <p className="stat-label mt-1.5">Avg latency</p>
            </div>
          </div>
          <div className="rule pt-5">
            <p className="eyebrow">By status</p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {Object.entries(opsStatus?.enrich_by_status || {}).length === 0 ? (
                <p className="text-micro text-ink-mute">No events yet</p>
              ) : (
                Object.entries(opsStatus?.enrich_by_status || {}).map(([status, count]) => (
                  <span key={status} className="pill pill-neutral">
                    {status}: {count}
                  </span>
                ))
              )}
            </div>
          </div>
        </div>
      </Section>

      <Section
        eyebrow="Admin"
        title="Recent signals"
        description="The last feedback and client errors reported by the beta."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          {[
            ['Feedback', opsStatus?.recent_feedback || []],
            ['Client errors', opsStatus?.recent_client_errors || []],
          ].map(([label, records]) => (
            <div key={label as string} className="min-w-0 rounded-md border border-line p-4">
              <p className="eyebrow">{label as string}</p>
              {(records as Record<string, unknown>[]).length === 0 ? (
                <p className="mt-3 text-micro text-ink-mute">No recent records.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {(records as Record<string, unknown>[]).map((record, index) => (
                    <li key={index} className="well px-3 py-2">
                      <p className="truncate text-micro font-semibold text-ink">
                        {String(record.message || record.url || record.page_url || 'record')}
                      </p>
                      <p className="num mt-0.5 truncate text-micro text-ink-mute">
                        {String(record.ts || '')} {record.user_id ? `user ${record.user_id}` : ''}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </Section>

      <Section
        eyebrow="Admin"
        title="Stylus diagnostics"
        description="Pointer, pressure and prediction capabilities of this device."
      >
        <button type="button" onClick={onToggleDiagnostics} className="btn btn-secondary">
          {showDiagnostics ? 'Hide' : 'Show'}
        </button>
        {showDiagnostics && <div className="mt-5"><StylusDiagnostics /></div>}
      </Section>
    </div>
  );
}

export default function SettingsPage() {
  const { llm, setLlm } = useSettingsStore();
  const role = useAuthStore((s) => s.role);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [providerOptions, setProviderOptions] = useState(fallbackProviders);
  const [activity, setActivity] = useState<ActivityResponse | null>(null);
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);
  const [opsStatus, setOpsStatus] = useState<OpsStatus | null>(null);
  const [enrichQuota, setEnrichQuota] = useState<EnrichQuota | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');

  useEffect(() => {
    const load = async () => {
      try {
        const [configRes, activityRes, versionRes, quotaRes, opsStatusRes] = await Promise.all([
          getPublicConfig(),
          getActivity(HEATMAP_DAYS),
          getVersion(),
          getEnrichQuota(),
          role === 'admin' ? getOpsStatus() : Promise.resolve(null),
        ]);
        setLlm({
          provider: configRes.llm.provider as ProviderValue,
          model: configRes.llm.model,
          baseUrl: configRes.llm.base_url,
        });
        setProviderOptions(configRes.llm.provider_options);
        setActivity(activityRes);
        setVersionInfo(versionRes);
        setEnrichQuota(quotaRes);
        setOpsStatus(opsStatusRes);
      } catch {
        toast.error('Failed to load settings');
      } finally {
        setLoadingConfig(false);
      }
    };

    void load();
  }, [role, setLlm]);

  const handleExport = useCallback(async () => {
    try {
      const res = await api.get('/sync/export');
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `glm-words-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Data exported');
    } catch {
      toast.error('Export failed');
    }
  }, []);

  const handleImport = useCallback(async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        const preview = await api.post('/sync/import', { data, mode: 'merge' }, { params: { dry_run: true } });
        const summary = `Import preview:\n\n${preview.data.imported} words to import\n${preview.data.skipped} skipped\n${preview.data.delete_count} deleted first\n\nContinue?`;
        if (!window.confirm(summary)) return;
        const res = await api.post('/sync/import', { data, mode: 'merge' });
        toast.success(`Imported ${res.data.imported} words (${res.data.skipped} skipped)`);
      } catch {
        toast.error('Import failed');
      }
    };
    input.click();
  }, []);

  const tabs = useMemo(
    () => [
      { id: 'profile' as const, label: 'Profile' },
      { id: 'data' as const, label: 'Data' },
      { id: 'llm' as const, label: 'AI' },
      ...(role === 'admin' ? [{ id: 'admin' as const, label: 'Admin' }] : []),
    ],
    [role],
  );

  const currentTab: SettingsTab = activeTab === 'admin' && role !== 'admin' ? 'profile' : activeTab;

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head-text">
          <p className="eyebrow">Account</p>
          <h1 className="page-title">Settings</h1>
          <p className="page-lede">Your vocabulary activity and personal data tools.</p>
        </div>
      </div>

      <LegacyReviewNotice />

      <div
        role="tablist"
        aria-label="Settings sections"
        className="mb-5 flex w-fit max-w-full gap-1 rounded-lg border border-line p-1"
      >
        {tabs.map((tab) => {
          const active = currentTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`settings-tab-${tab.id}`}
              aria-selected={active}
              aria-controls="settings-panel"
              onClick={() => setActiveTab(tab.id)}
              className={`relative z-10 min-h-11 min-w-0 flex-1 rounded-md px-3 text-meta font-semibold transition-colors duration-[var(--dur-base)] sm:flex-none sm:px-5 ${
                active ? 'text-ink' : 'text-ink-mute hover:text-ink-soft'
              }`}
            >
              {active && (
                <motion.span
                  layoutId="settings-tab"
                  aria-hidden="true"
                  transition={{ type: 'spring', stiffness: 480, damping: 38 }}
                  className="absolute inset-0 -z-10 rounded-md border border-line bg-surface shadow-hair"
                />
              )}
              <span className="truncate">{tab.label}</span>
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id="settings-panel"
        aria-labelledby={`settings-tab-${currentTab}`}
        tabIndex={-1}
        className="outline-none"
      >
      {currentTab === 'profile' && <ProfileSection activity={activity} />}
      {currentTab === 'data' && (
        <DataSection
          onExport={() => void handleExport()}
          onImport={() => void handleImport()}
          opsStatus={opsStatus}
        />
      )}
      {currentTab === 'llm' && (
        <ServerLlmSection loading={loadingConfig} providerOptions={providerOptions} llm={llm} quota={enrichQuota} />
      )}
      {currentTab === 'admin' && role === 'admin' && (
        <AdminSection
          versionInfo={versionInfo}
          opsStatus={opsStatus}
          showDiagnostics={showDiagnostics}
          onToggleDiagnostics={() => setShowDiagnostics((value) => !value)}
        />
      )}
      </div>
    </div>
  );
}
