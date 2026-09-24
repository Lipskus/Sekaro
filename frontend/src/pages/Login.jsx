import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { FileUploadArea } from '../components/ui/FileUploadArea';
import { useLanguage } from '../context/LanguageContext';
import { useDarkMode } from '../context/DarkModeContext';
import Logo from '../redesign/Logo';
import { RiLock2Line, RiMailLine, RiEyeLine, RiEyeOffLine, RiShieldCheckLine, RiBarChartLine, RiArrowRightLine } from 'react-icons/ri';

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
  const { t, language, setLanguage, languages } = useLanguage();
  const { darkMode, themePreference, setThemePreference } = useDarkMode();
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
  const [showPassword, setShowPassword] = useState(false);
  const [rememberLogin, setRememberLogin] = useState(() => {
    try { return Boolean(localStorage.getItem('sekaro.login.identifier')); } catch { return false; }
  });

  const isFirstUser = setupComplete === false;

  useEffect(() => {
    if (isFirstUser) return;
    try {
      const remembered = localStorage.getItem('sekaro.login.identifier');
      if (remembered) setEmail(remembered);
    } catch { /* ignore */ }
  }, [isFirstUser]);

  const handleAuthSubmit = async (event) => {
    event.preventDefault();
    setAuthError('');

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setAuthError(t('auth.emailRequired'));
      return;
    }
    if (!password) {
      setAuthError(t('auth.passwordRequired'));
      return;
    }
    if (isFirstUser && password !== confirmPassword) {
      setAuthError(t('auth.passwordsMismatch'));
      return;
    }

    setAuthBusy(true);
    try {
      if (isFirstUser) {
        await registerAdmin(normalizedEmail, password);
      } else {
        await login(normalizedEmail, password);
        try {
          if (rememberLogin) localStorage.setItem('sekaro.login.identifier', normalizedEmail);
          else localStorage.removeItem('sekaro.login.identifier');
        } catch { /* ignore */ }
      }
    } catch (error) {
      setAuthError(error?.message || t('auth.authFailed'));
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
    ? t('auth.createAdminTitle')
    : t('auth.signInTitle');

  return (
    <div className="sk-login-page">
      <div className="sk-login-controls" aria-label="Ustawienia logowania">
        <select
          value={language}
          onChange={event => setLanguage(event.target.value)}
          aria-label="Język"
        >
          {languages.map(item => (
            <option key={item.code} value={item.code}>{item.label}</option>
          ))}
        </select>
        <select
          value={themePreference}
          onChange={event => setThemePreference(event.target.value)}
          aria-label="Motyw"
        >
          <option value="light">Jasny motyw</option>
          <option value="dark">Ciemny motyw</option>
          <option value="system">Motyw systemowy</option>
        </select>
      </div>

      <section className="sk-login-brand-panel" aria-label="Sekaro">
        <div className="sk-login-brand">
          <span className="sk-login-logo"><Logo /></span>
          <div>
            <h1>Sekaro</h1>
            <p>Self-hosted outreach</p>
          </div>
        </div>

        <div className="sk-login-benefits">
          <div className="sk-login-benefit">
            <span><RiLock2Line /></span>
            <div><strong>Prywatny panel</strong><p>Twoje dane. Twoje zasady.<br/>Pełna kontrola na własnym serwerze.</p></div>
          </div>
          <div className="sk-login-benefit">
            <span><RiMailLine /></span>
            <div><strong>SMTP / IMAP</strong><p>Połącz własne skrzynki<br/>i wysyłaj bez ograniczeń.</p></div>
          </div>
          <div className="sk-login-benefit">
            <span><RiBarChartLine /></span>
            <div><strong>Kampanie i wątki</strong><p>Twórz kampanie, automatyzuj<br/>wątki i rozwijaj relacje.</p></div>
          </div>
        </div>

        <div className="sk-login-visual" aria-hidden="true">
          <div className="sk-login-visual-dashboard">
            <i/><i/><i/>
            <div className="sk-login-chart-line"><b/><b/><b/><b/></div>
          </div>
          <div className="sk-login-float sk-login-float-mail"><RiMailLine /></div>
          <div className="sk-login-float sk-login-float-send"><RiArrowRightLine /></div>
          <div className="sk-login-float sk-login-float-chart"><RiBarChartLine /></div>
          <div className="sk-login-handwritten">Więcej<br/>możliwości<br/>w Twoich rękach</div>
        </div>
      </section>

      <section className="sk-login-auth-column">
        <div className="sk-login-card">
          <div className="sk-login-card-heading">
            <h2>{isFirstUser ? 'Utwórz konto administratora' : 'Zaloguj się'}</h2>
            <p>{isFirstUser ? 'Pierwsze konto uzyska uprawnienia administratora.' : 'Dostęp do prywatnego panelu'}</p>
          </div>

          <form className="sk-login-form" onSubmit={handleAuthSubmit}>
            <label htmlFor="email">{isFirstUser ? 'E-mail administratora' : 'E-mail lub login'}</label>
            <div className="sk-login-input">
              <RiMailLine />
              <input
                id="email"
                type={isFirstUser ? 'email' : 'text'}
                autoComplete={isFirstUser ? 'email' : 'username'}
                required
                value={email}
                onChange={event => setEmail(event.target.value)}
                placeholder={isFirstUser ? 'admin@twojafirma.pl' : 'np. jan@twojafirma.pl'}
                disabled={authBusy}
              />
            </div>

            <label htmlFor="password">Hasło</label>
            <div className="sk-login-input">
              <RiLock2Line />
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete={isFirstUser ? 'new-password' : 'current-password'}
                required
                minLength={8}
                value={password}
                onChange={event => setPassword(event.target.value)}
                placeholder={isFirstUser ? 'Utwórz bezpieczne hasło' : 'Wpisz swoje hasło'}
                disabled={authBusy}
              />
              <button type="button" className="sk-login-eye" onClick={() => setShowPassword(v => !v)} aria-label={showPassword ? 'Ukryj hasło' : 'Pokaż hasło'}>
                {showPassword ? <RiEyeOffLine /> : <RiEyeLine />}
              </button>
            </div>

            {isFirstUser && (
              <>
                <label htmlFor="confirm-password">{t('common.confirmPassword')}</label>
                <div className="sk-login-input">
                  <RiLock2Line />
                  <input
                    id="confirm-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    required
                    minLength={8}
                    value={confirmPassword}
                    onChange={event => setConfirmPassword(event.target.value)}
                    placeholder="Powtórz hasło"
                    disabled={authBusy}
                  />
                </div>
                <p className="sk-login-hint">{t('auth.passwordHint')}</p>
              </>
            )}

            {!isFirstUser && (
              <label className="sk-login-remember">
                <input type="checkbox" checked={rememberLogin} onChange={e => setRememberLogin(e.target.checked)} />
                <span>Zapamiętaj login</span>
              </label>
            )}

            {authError && <div className="sk-login-error" role="alert">{authError}</div>}

            <button type="submit" className="sk-login-submit" disabled={authBusy}>
              <span>{authBusy ? (isFirstUser ? t('common.creatingAccount') : t('common.signingIn')) : (isFirstUser ? t('common.createAdmin') : t('common.signIn'))}</span>
              <RiArrowRightLine />
            </button>
          </form>

          <div className="sk-login-divider"><span>lub</span></div>
          <p className="sk-login-private-note"><RiShieldCheckLine /> Panel prywatny • Brak logowania przez Google i Microsoft</p>

          {isFirstUser && (
              <>
                <div>
                  <label htmlFor="confirm-password" className="block text-sm font-medium text-gray-700 mb-1">
                    {t('common.confirmPassword')}
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
                  {t('auth.passwordHint')}
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
                ? (isFirstUser ? t('common.creatingAccount') : t('common.signingIn'))
                : (isFirstUser ? t('common.createAdmin') : t('common.signIn'))}
            </button>
          </form>

          {isFirstUser && (
            <>
              <p className="text-center text-sm text-gray-500">
                {t('auth.firstAccountAdmin')}
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
                      Użyj pliku kopii Sekaro (<code className="text-[11px]">.qbk</code>). If the backup is encrypted, you need the password — losing it
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
      </section>

      <footer className="sk-login-footer">© 2026 Sekaro. Wszystkie prawa zastrzeżone.</footer>
    </div>
  );

}
