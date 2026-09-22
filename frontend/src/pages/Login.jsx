import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { FileUploadArea } from '../components/ui/FileUploadArea';

const BACKUP_MIN_PASSWORD_LEN = 8;

function parseDetailMessage(text) {
  try {
    const j = JSON.parse(text);
    const d = j.detail;
    if (typeof d === 'string') return d;
    if (Array.isArray(d))
      return d.map(x => (typeof x === 'string' ? x : x.msg || JSON.stringify(x))).join(' ');
  } catch {
    /* ignore */
  }
  return text;
}

export default function Login() {
  const { setupComplete, login, registerAdmin } = useAuth();
  const [restoreExpanded, setRestoreExpanded] = useState(false);
  const [restoreFile, setRestoreFile] = useState(null);
  const [restoreFileKey, setRestoreFileKey] = useState(0);
  const [restorePassword, setRestorePassword] = useState('');
  const [restoreMeta, setRestoreMeta] = useState(null);
  const [restoreMetaBusy, setRestoreMetaBusy] = useState(false);
  const [restorePreview, setRestorePreview] = useState(null);
  const [restorePreviewBusy, setRestorePreviewBusy] = useState(false);
  const [restoreExecuteBusy, setRestoreExecuteBusy] = useState(false);
  const [restoreMsg, setRestoreMsg] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState('');

  const isFirstUser = setupComplete === false;

  const handleAuthSubmit = async (event) => {
    event.preventDefault();
    setAuthError('');

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setAuthError('Enter your email address.');
      return;
    }
    if (!password) {
      setAuthError('Enter your password.');
      return;
    }
    if (isFirstUser && password !== confirmPassword) {
      setAuthError('Passwords do not match.');
      return;
    }

    setAuthBusy(true);
    try {
      if (isFirstUser) {
        await registerAdmin(normalizedEmail, password);
      } else {
        await login(normalizedEmail, password);
      }
    } catch (error) {
      setAuthError(error?.message || 'Authentication failed.');
    } finally {
      setAuthBusy(false);
    }
  };

  useEffect(() => {
    if (!isFirstUser || !restoreExpanded || !restoreFile) {
      return undefined;
    }
    let cancelled = false;
    setRestoreMetaBusy(true);
    setRestoreMeta(null);
    setRestorePreview(null);
    setRestoreMsg(null);
    (async () => {
      try {
        const form = new FormData();
        form.append('file', restoreFile);
        const res = await fetch('/api/auth/restore-setup/metadata', { method: 'POST', body: form });
        const text = await res.text();
        let data;
        try {
          data = JSON.parse(text);
        } catch {
          data = { detail: text || res.statusText };
        }
        if (!res.ok) {
          throw new Error(parseDetailMessage(text) || res.statusText);
        }
        if (!cancelled) {
          setRestoreMeta(data);
        }
      } catch (e) {
        if (!cancelled) {
          setRestoreMsg({ type: 'err', text: e.message || 'Could not read backup file' });
        }
      } finally {
        if (!cancelled) {
          setRestoreMetaBusy(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isFirstUser, restoreExpanded, restoreFile]);

  const clearRestoreWizard = () => {
    setRestoreFile(null);
    setRestoreFileKey(k => k + 1);
    setRestorePassword('');
    setRestoreMeta(null);
    setRestorePreview(null);
    setRestoreMsg(null);
  };

  const heading = isFirstUser
    ? 'Create your admin account'
    : 'Sign in to your account';

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8 p-8">
        <div>
          <h1 className="text-center text-3xl font-bold text-gray-900">
            Sekaro
          </h1>
          <h2 className="mt-2 text-center text-lg text-gray-600">
            {heading}
          </h2>
        </div>

        <form className="mt-8 space-y-4" onSubmit={handleAuthSubmit}>
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={event => setEmail(event.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="you@example.com"
              disabled={authBusy}
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete={isFirstUser ? 'new-password' : 'current-password'}
              required
              minLength={8}
              value={password}
              onChange={event => setPassword(event.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              disabled={authBusy}
            />
          </div>

          {isFirstUser && (
            <>
              <div>
                <label htmlFor="confirm-password" className="block text-sm font-medium text-gray-700 mb-1">
                  Confirm password
                </label>
                <input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={event => setConfirmPassword(event.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  disabled={authBusy}
                />
              </div>
              <p className="text-xs text-gray-500">
                Use at least 8 characters with an uppercase letter, lowercase letter, and a number.
              </p>
            </>
          )}

          {authError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {authError}
            </p>
          )}

          <button
            type="submit"
            disabled={authBusy}
            className="w-full py-2.5 px-4 rounded-lg text-sm font-medium text-white bg-gray-900 hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-900 disabled:opacity-50"
          >
            {authBusy
              ? (isFirstUser ? 'Creating account…' : 'Signing in…')
              : (isFirstUser ? 'Create admin account' : 'Sign in')}
          </button>
        </form>

        {isFirstUser && (
          <>
            <p className="text-center text-sm text-gray-500">
              The first account created becomes the admin.
            </p>

            <div className="mt-10 pt-8 border-t border-gray-200 space-y-3">
              {!restoreExpanded ? (
                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => setRestoreExpanded(true)}
                    className="text-sm font-medium text-blue-700 hover:text-blue-800 underline underline-offset-2"
                  >
                    Want to restore from a backup?
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-gray-800">Restore from backup</p>
                    <button
                      type="button"
                      onClick={() => {
                        setRestoreExpanded(false);
                        clearRestoreWizard();
                      }}
                      className="text-xs text-gray-500 hover:text-gray-700 underline"
                    >
                      Hide
                    </button>
                  </div>
                  <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    Use a Quickly backup file (<code className="text-[11px]">.qbk</code>). If the backup is encrypted, you need the password — losing it
                    means the data in that file is unrecoverable. The optional hint is stored in plain text in the file.
                  </p>
                  <div className="flex items-stretch gap-2">
                    <FileUploadArea
                      key={restoreFileKey}
                      size="full"
                      className="text-xs flex-1 min-w-0"
                      accept=".qbk,application/octet-stream"
                      disabled={restoreMetaBusy || restorePreviewBusy || restoreExecuteBusy}
                      onChange={e => {
                        setRestoreMsg(null);
                        setRestorePreview(null);
                        setRestoreMeta(null);
                        setRestoreFile(e.target.files?.[0] || null);
                      }}
                    >
                      {restoreFile ? (
                        <span className="truncate text-gray-800">{restoreFile.name}</span>
                      ) : (
                        <span className="text-gray-500">Choose backup file (.qbk)</span>
                      )}
                    </FileUploadArea>
                    {restoreFile ? (
                      <button
                        type="button"
                        title="Remove file"
                        onClick={clearRestoreWizard}
                        className="shrink-0 px-3 rounded-lg border border-gray-300 text-sm font-medium text-gray-600 bg-white hover:bg-gray-50"
                        disabled={restoreMetaBusy || restorePreviewBusy || restoreExecuteBusy}
                      >
                        ×
                      </button>
                    ) : null}
                  </div>

                  {restoreMetaBusy && (
                    <p className="text-center text-xs text-gray-500">Reading backup…</p>
                  )}

                  {restoreMeta && !restoreMetaBusy && (
                    <div className="rounded-lg border border-gray-200 bg-white p-3 text-xs space-y-2 text-left">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <p className="font-semibold text-gray-800">This backup</p>
                          <ul className="text-gray-600 space-y-0.5">
                            <li>When: {restoreMeta.backup_preview?.backed_up_at ? new Date(restoreMeta.backup_preview.backed_up_at).toLocaleString() : '—'}</li>
                            <li>Leads: {restoreMeta.backup_preview?.lead_count ?? '—'}</li>
                            <li>Inboxes: {restoreMeta.backup_preview?.inbox_count ?? '—'}</li>
                            <li>Campaigns: {restoreMeta.backup_preview?.campaign_count ?? '—'}</li>
                            <li>Users: {restoreMeta.backup_preview?.user_count ?? '—'}</li>
                            <li>Admins: {(restoreMeta.backup_preview?.admin_emails || []).join(', ') || '—'}</li>
                            <li>Encrypted: {restoreMeta.encrypted ? 'yes' : 'no'}</li>
                          </ul>
                        </div>
                        <div>
                          <p className="font-semibold text-gray-800">Current database (will be replaced)</p>
                          <ul className="text-gray-600 space-y-0.5">
                            <li>Leads: {restoreMeta.current_database?.lead_count ?? '—'}</li>
                            <li>Inboxes: {restoreMeta.current_database?.inbox_count ?? '—'}</li>
                            <li>Campaigns: {restoreMeta.current_database?.campaign_count ?? '—'}</li>
                            <li>Users: {restoreMeta.current_database?.user_count ?? '—'}</li>
                            <li>Admins: {(restoreMeta.current_database?.admin_emails || []).join(', ') || '—'}</li>
                          </ul>
                        </div>
                      </div>
                      {restoreMeta.password_hint ? (
                        <p className="text-gray-500">
                          Hint: <span className="font-mono">{restoreMeta.password_hint}</span>
                        </p>
                      ) : null}
                      <p className="text-amber-800 border-t border-amber-100 pt-2 mt-2">
                        Confirm only if this is the correct backup.
                      </p>
                    </div>
                  )}

                  {restoreMeta && !restorePreview && !restoreMeta.encrypted && (
                    <button
                      type="button"
                      disabled={restorePreviewBusy || restoreMetaBusy}
                      className="w-full py-2 px-4 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                      onClick={async () => {
                        if (!restoreFile) return;
                        setRestorePreviewBusy(true);
                        setRestoreMsg(null);
                        setRestorePreview(null);
                        try {
                          const form = new FormData();
                          form.append('file', restoreFile);
                          const res = await fetch('/api/auth/restore-setup/preview', { method: 'POST', body: form });
                          const text = await res.text();
                          let data;
                          try {
                            data = JSON.parse(text);
                          } catch {
                            data = { detail: text || res.statusText };
                          }
                          if (!res.ok) {
                            throw new Error(parseDetailMessage(text) || res.statusText);
                          }
                          setRestorePreview(data);
                        } catch (e) {
                          setRestoreMsg({ type: 'err', text: e.message || 'Could not verify backup' });
                        } finally {
                          setRestorePreviewBusy(false);
                        }
                      }}
                    >
                      {restorePreviewBusy ? 'Checking…' : 'Verify backup'}
                    </button>
                  )}

                  {restoreMeta && restoreMeta.encrypted && !restorePreview && (
                    <>
                      <input
                        type="password"
                        placeholder={`Backup password (at least ${BACKUP_MIN_PASSWORD_LEN} characters)`}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                        value={restorePassword}
                        onChange={e => setRestorePassword(e.target.value)}
                        disabled={restorePreviewBusy || restoreExecuteBusy}
                        autoComplete="off"
                      />
                      <button
                        type="button"
                        disabled={
                          restorePreviewBusy ||
                          !restoreFile ||
                          restorePassword.length < BACKUP_MIN_PASSWORD_LEN
                        }
                        className="w-full py-2 px-4 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                        onClick={async () => {
                          if (!restoreFile) return;
                          setRestorePreviewBusy(true);
                          setRestoreMsg(null);
                          setRestorePreview(null);
                          try {
                            const form = new FormData();
                            form.append('file', restoreFile);
                            form.append('password', restorePassword);
                            const res = await fetch('/api/auth/restore-setup/preview', { method: 'POST', body: form });
                            const text = await res.text();
                            let data;
                            try {
                              data = JSON.parse(text);
                            } catch {
                              data = { detail: text || res.statusText };
                            }
                            if (!res.ok) {
                              throw new Error(parseDetailMessage(text) || res.statusText);
                            }
                            setRestorePreview(data);
                          } catch (e) {
                            setRestoreMsg({ type: 'err', text: e.message || 'Wrong password or invalid backup' });
                          } finally {
                            setRestorePreviewBusy(false);
                          }
                        }}
                      >
                        {restorePreviewBusy ? 'Checking…' : 'Verify password'}
                      </button>
                    </>
                  )}

                  {restorePreview && (
                    <div className="rounded-lg border border-gray-200 bg-white p-3 text-xs space-y-2 text-left">
                      <p className="font-semibold text-gray-800">Verified — full details</p>
                      <ul className="text-gray-600 space-y-0.5">
                        <li>When: {restorePreview.backup?.backed_up_at ? new Date(restorePreview.backup.backed_up_at).toLocaleString() : '—'}</li>
                        <li>Leads: {restorePreview.backup?.lead_count ?? '—'}</li>
                        <li>Inboxes: {restorePreview.backup?.inbox_count ?? '—'}</li>
                        <li>Campaigns: {restorePreview.backup?.campaign_count ?? '—'}</li>
                        <li>Users: {restorePreview.backup?.user_count ?? '—'}</li>
                        <li>Admins: {(restorePreview.backup?.admin_emails || []).join(', ') || '—'}</li>
                      </ul>
                      <button
                        type="button"
                        disabled={restoreExecuteBusy}
                        className="w-full py-2 px-4 rounded-lg text-sm font-medium text-white bg-gray-900 hover:bg-gray-800 disabled:opacity-50"
                        onClick={async () => {
                          if (
                            !window.confirm(
                              'Replace the database with this backup? This cannot be undone.',
                            )
                          ) {
                            return;
                          }
                          setRestoreExecuteBusy(true);
                          setRestoreMsg(null);
                          try {
                            const res = await fetch('/api/auth/restore-setup/execute', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ restore_token: restorePreview.restore_token }),
                            });
                            const text = await res.text();
                            let data;
                            try {
                              data = JSON.parse(text);
                            } catch {
                              data = { detail: text || res.statusText };
                            }
                            if (!res.ok) {
                              throw new Error(parseDetailMessage(text) || res.statusText);
                            }
                            setRestoreMsg({ type: 'ok', text: data.detail || 'Restore complete. Reloading…' });
                            setRestorePreview(null);
                            if (res.headers.get('X-Quickly-Reload') === '1') {
                              setTimeout(() => window.location.reload(), 300);
                            }
                          } catch (e) {
                            setRestoreMsg({ type: 'err', text: e.message || 'Restore failed' });
                          } finally {
                            setRestoreExecuteBusy(false);
                          }
                        }}
                      >
                        {restoreExecuteBusy ? 'Restoring…' : 'Confirm and restore'}
                      </button>
                    </div>
                  )}

                  {restoreMsg && (
                    <p
                      className={`text-center text-xs ${restoreMsg.type === 'ok' ? 'text-green-700' : 'text-red-600'}`}
                    >
                      {restoreMsg.text}
                    </p>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
