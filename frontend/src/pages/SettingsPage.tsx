import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../api/client';
import { createUser, deleteUser, getAuthApiMessage, getPublicConfig, isAuthApiError, listUsers, type UserItem } from '../api/auth';
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

function intensity(count: number) {
  if (count <= 0) return 'bg-gray-100';
  if (count <= 1) return 'bg-emerald-200';
  if (count <= 3) return 'bg-emerald-300';
  if (count <= 6) return 'bg-emerald-500';
  return 'bg-emerald-700';
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
    <div className="grid gap-3 md:grid-cols-[auto_minmax(16rem,1fr)]">
      <div className="rounded-xl border border-gray-200 bg-white p-4 md:w-max md:max-w-full">
        <div className="mx-auto w-max max-w-full overflow-x-auto">
          <div className="flex w-max gap-1">
            {weeks.map((week, weekIndex) => (
              <div key={weekIndex} className="grid grid-rows-7 gap-1">
                {week.map((day) => (
                  <div
                    key={day.date}
                    title={`${day.date}: ${day.captured} captured, ${day.reviewed} reviewed`}
                    className={`h-3 w-3 rounded-[3px] ${intensity(day.total)}`}
                  />
                ))}
              </div>
            ))}
          </div>
          <div className="mt-3 flex w-max items-center justify-end gap-2 text-xs text-gray-400">
            <span>Less</span>
            {[0, 1, 3, 6, 9].map((value) => (
              <span key={value} className={`h-3 w-3 rounded-[3px] ${intensity(value)}`} />
            ))}
            <span>More</span>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 md:min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Last 12 weeks</p>
        <div className="mt-4 grid grid-cols-3 gap-3 md:grid-cols-1 lg:grid-cols-3">
          {[
            ['Captured', summary.captured],
            ['Reviewed', summary.reviewed],
            ['Active days', summary.activeDays],
          ].map(([label, value]) => (
            <div key={label}>
              <p className="text-2xl font-semibold text-gray-900">{value}</p>
              <p className="mt-1 text-xs text-gray-400">{label}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs leading-5 text-gray-400">
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

  return (
    <section>
      <div className="mb-3">
        <h2 className="text-lg font-medium text-gray-800">Users</h2>
        <p className="mt-1 text-xs text-gray-400">
          Internal beta: create accounts for testers directly. Share the email + password through a secure channel.
        </p>
      </div>
      <form
        onSubmit={handleCreate}
        className="mb-3 grid gap-2 rounded-xl border border-gray-200 bg-white p-4 sm:grid-cols-[1fr_1fr_auto]"
      >
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="tester@example.com"
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
          autoComplete="email"
        />
        <input
          type="text"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password (8+ chars)"
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono focus:border-indigo-400 focus:outline-none"
          autoComplete="new-password"
        />
        <button
          type="submit"
          disabled={creating || !email.trim() || password.length < 8}
          className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800 disabled:opacity-40"
        >
          {creating ? 'Creating...' : 'Create user'}
        </button>
      </form>
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        {loading ? (
          <p className="text-sm text-gray-400">Loading...</p>
        ) : users.length === 0 ? (
          <p className="text-sm text-gray-400">No users yet.</p>
        ) : (
          <div className="space-y-2">
            {users.map((u) => {
              const isAdmin = u.role === 'admin';
              const isSelf = u.email === currentUserEmail;
              return (
                <div key={u.id} className="flex items-center justify-between gap-3 rounded-lg bg-gray-50 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <code className="truncate font-mono text-sm text-gray-700">{u.email}</code>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${
                        isAdmin ? 'bg-indigo-50 text-indigo-600' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {u.role}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-gray-400">
                      Created {new Date(u.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  {!isAdmin && !isSelf && (
                    <button
                      onClick={() => void handleDelete(u)}
                      className="text-xs text-red-400 hover:text-red-600"
                    >
                      Remove
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

function ProfileSection({ activity }: { activity: ActivityResponse | null }) {
  const summary = activity?.summary;

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-4">
        {[
          ['Total words', summary?.total_words ?? 0],
          ['Enriched', summary?.enriched_words ?? 0],
          ['Due now', summary?.due_count ?? 0],
          ['Streak', `${summary?.streak_days ?? 0}d`],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</p>
            <p className="mt-2 text-2xl font-semibold text-gray-900">{value}</p>
          </div>
        ))}
      </div>

      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-medium text-gray-800">Activity</h2>
          <span className="text-xs text-gray-400">captured + reviewed</span>
        </div>
        {activity ? (
          <ActivityHeatmap activity={activity} />
        ) : (
          <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-400">
            Loading activity...
          </div>
        )}
      </section>
    </>
  );
}

function DataSection({
  onExport,
  onImport,
}: {
  onExport: () => void;
  onImport: () => void;
}) {
  return (
    <section>
      <h2 className="mb-3 text-lg font-medium text-gray-800">Data</h2>
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <p className="mb-4 text-sm text-gray-500">
          Export your word data as JSON for backup or import a previous 一触 export.
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={onExport}
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-800"
          >
            Export JSON
          </button>
          <button
            onClick={onImport}
            className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-200"
          >
            Import JSON
          </button>
        </div>
      </div>
    </section>
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
    <div className="space-y-4">
      <section>
        <div className="mb-3 flex items-center gap-2">
          <h2 className="text-lg font-medium text-gray-800">Server LLM</h2>
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-gray-500">
            Read-only
          </span>
        </div>
        <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4 lg:grid lg:grid-cols-3 lg:gap-4 lg:space-y-0">
          {loading ? (
            <p className="text-sm text-gray-400">Loading server config...</p>
          ) : (
            <>
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-400">Provider</p>
                <p className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">
                  {providerOptions.find((p) => p.value === llm.provider)?.label || llm.provider}
                </p>
              </div>
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-400">Model</p>
                <p className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">{llm.model}</p>
              </div>
              {llm.baseUrl && (
                <div>
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-400">Base URL</p>
                  <p className="break-all rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">{llm.baseUrl}</p>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-medium text-gray-800">AI enrich quota</h2>
        <div className="grid gap-3 rounded-xl border border-gray-200 bg-white p-4 sm:grid-cols-3">
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-400">Daily limit</p>
            <p className="text-2xl font-semibold text-gray-900">{quota?.limit ?? 'Unlimited'}</p>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-400">Used today</p>
            <p className="text-2xl font-semibold text-gray-900">{quota?.used ?? 0}</p>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-400">Remaining</p>
            <p className="text-2xl font-semibold text-gray-900">{quota?.remaining ?? 'Unlimited'}</p>
          </div>
        </div>
      </section>

      <section>
        <div className="rounded-xl border border-dashed border-gray-200 bg-white p-4">
          <div className="mb-3 flex items-center gap-2">
            <h2 className="text-lg font-medium text-gray-800">Personal API key</h2>
            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-600">
              Planned
            </span>
          </div>
          <div className="grid gap-3 text-sm text-gray-500 md:grid-cols-3">
            <p className="rounded-lg bg-gray-50 p-3">Current beta uses the server key for stability, cost control, and easier troubleshooting.</p>
            <p className="rounded-lg bg-gray-50 p-3">When enabled, personal keys should be encrypted on the server and never shown back in full.</p>
            <p className="rounded-lg bg-gray-50 p-3">Browser-only storage is not the default for the web app because it is harder to sync and protect.</p>
          </div>
        </div>
      </section>
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
    <div className="space-y-8">
      <UsersSection />
      <section>
        <h2 className="mb-3 text-lg font-medium text-gray-800">Build</h2>
        <div className="grid gap-3 rounded-xl border border-gray-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-400">Frontend</p>
            <p className="font-mono text-sm text-gray-700">{import.meta.env.VITE_APP_VERSION || 'dev'}</p>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-400">Built</p>
            <p className="font-mono text-sm text-gray-700">
              {(import.meta.env.VITE_BUILD_DATE || '').slice(0, 19) || 'dev'}
            </p>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-400">Backend</p>
            <p className="font-mono text-sm text-gray-700">{versionInfo?.version || 'unknown'}</p>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-400">Backups</p>
            <p className="text-sm text-gray-700">
              {versionInfo?.backup_enabled ? `On, ${versionInfo.backup_retention_days}d` : 'Off'}
            </p>
          </div>
        </div>
      </section>
      <section>
        <h2 className="mb-3 text-lg font-medium text-gray-800">Runtime</h2>
        <div className="grid gap-3 rounded-xl border border-gray-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-400">DB</p>
            <p className="font-mono text-sm text-gray-700">{opsStatus?.database_engine || 'unknown'}</p>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-400">Backup</p>
            <p className="text-sm text-gray-700">{opsStatus?.backup_enabled ? `On, ${opsStatus.backup_retention_days}d` : 'Off'}</p>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-400">LLM</p>
            <p className="font-mono text-sm text-gray-700">
              {opsStatus?.llm_provider ? `${opsStatus.llm_provider} / ${opsStatus.llm_model || 'unset'}` : 'unknown'}
            </p>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-400">AI limit</p>
            <p className="text-sm text-gray-700">{opsStatus?.enrich_daily_limit ?? 5}/day</p>
          </div>
        </div>
      </section>
      <section>
        <h2 className="mb-3 text-lg font-medium text-gray-800">AI enrich health</h2>
        <div className="grid gap-3 rounded-xl border border-gray-200 bg-white p-4 sm:grid-cols-3">
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-400">Recent events</p>
            <p className="text-2xl font-semibold text-gray-900">{opsStatus?.enrich_recent_total ?? 0}</p>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-400">Avg latency</p>
            <p className="text-2xl font-semibold text-gray-900">
              {opsStatus?.enrich_avg_duration_ms ? `${opsStatus.enrich_avg_duration_ms}ms` : 'n/a'}
            </p>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-400">Status</p>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(opsStatus?.enrich_by_status || {}).length === 0 ? (
                <span className="text-sm text-gray-400">No events yet</span>
              ) : (
                Object.entries(opsStatus?.enrich_by_status || {}).map(([status, count]) => (
                  <span key={status} className="rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600">
                    {status}: {count}
                  </span>
                ))
              )}
            </div>
          </div>
        </div>
      </section>
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-medium text-gray-800">Stylus diagnostics</h2>
          <button
            type="button"
            onClick={onToggleDiagnostics}
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:border-gray-300 hover:text-gray-800"
          >
            {showDiagnostics ? 'Hide' : 'Show'}
          </button>
        </div>
        {showDiagnostics && <StylusDiagnostics />}
      </section>
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
      { id: 'llm' as const, label: 'LLM' },
      ...(role === 'admin' ? [{ id: 'admin' as const, label: 'Admin' }] : []),
    ],
    [role],
  );

  const currentTab: SettingsTab = activeTab === 'admin' && role !== 'admin' ? 'profile' : activeTab;

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Settings</h1>
          <p className="mt-1 text-sm text-gray-500">Your vocabulary activity and personal data tools.</p>
        </div>
      </div>

      <div className="mb-6 overflow-x-auto">
        <div className="inline-flex min-w-full gap-1 rounded-xl border border-gray-200 bg-white p-1 sm:min-w-0">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`min-w-0 flex-1 rounded-lg px-3 py-2 text-sm font-medium transition sm:flex-none sm:px-4 ${
                currentTab === tab.id
                  ? 'bg-gray-900 text-white shadow-sm'
                  : 'text-gray-500 hover:bg-gray-50 hover:text-gray-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {currentTab === 'profile' && <ProfileSection activity={activity} />}
      {currentTab === 'data' && (
        <DataSection
          onExport={() => void handleExport()}
          onImport={() => void handleImport()}
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
  );
}
