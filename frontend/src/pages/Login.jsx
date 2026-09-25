import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { FileUploadArea } from '../components/ui/FileUploadArea';
import { useLanguage } from '../context/LanguageContext';
import { useDarkMode } from '../context/DarkModeContext';
import Logo from '../redesign/Logo';
import { RiLock2Line, RiMailLine, RiEyeLine, RiEyeOffLine, RiShieldCheckLine, RiBarChartLine, RiArrowRightLine, RiGlobalLine, RiSunLine, RiMoonLine, RiComputerLine, RiSendPlaneLine } from 'react-icons/ri';

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
  const { themePreference, setThemePreference } = useDarkMode();
  const [restoreExpanded, setRestoreExpanded] = useState(false);
  const [restoreFile, setRestoreFile] = useState(null);
  const [restoreFileKey, setRestoreFileKey] = useState(0);
  const [restorePassword, setRestorePassword] = useState('');
  const [restoreMeta, setRestoreMeta] = useState(null);
  const [restoreMetaBusy, setRestoreMetaBusy] = useState(false);
  const [restorePreview, setRestorePreview] = useState(null);
  const [restorePreviewBusy, setRestorePreviewBusy] = useState(false);
  const [restoreExecuteBusy, setRestoreExecuteBusy] = useState(false);
  const [restoreConfirmArmed, setRestoreConfirmArmed] = useState(false);
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
  const LoginThemeIcon = themePreference === 'dark' ? RiMoonLine : themePreference === 'system' ? RiComputerLine : RiSunLine;

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
    setRestoreConfirmArmed(false);
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
          setRestoreMsg({ type: 'err', text: e.message || 'Nie udało się odczytać pliku kopii zapasowej' });
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

  return (
    <div className="sk-login-page" aria-busy={authBusy||restoreMetaBusy||restorePreviewBusy||restoreExecuteBusy}>
      <div className="sk-login-controls" aria-label="Ustawienia logowania">
        <label className="sk-login-control sk-login-control-language">
          <RiGlobalLine aria-hidden="true" />
          <select
            value={language}
            onChange={event => setLanguage(event.target.value)}
            aria-label="Język"
          >
            {languages.map(item => (
              <option key={item.code} value={item.code}>{item.label}</option>
            ))}
          </select>
        </label>
        <label className="sk-login-control sk-login-control-theme">
          <LoginThemeIcon aria-hidden="true" />
          <select
            value={themePreference}
            onChange={event => setThemePreference(event.target.value)}
            aria-label="Motyw"
          >
            <option value="light">Jasny motyw</option>
            <option value="dark">Ciemny motyw</option>
            <option value="system">Motyw systemowy</option>
          </select>
          <i className="sk-login-control-dot" aria-hidden="true" />
        </label>
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
          <div className="sk-login-float sk-login-float-send"><RiSendPlaneLine /></div>
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
              <div className="sk-login-options">
                <label className="sk-login-remember">
                  <input type="checkbox" checked={rememberLogin} onChange={e => setRememberLogin(e.target.checked)} />
                  <span>Zapamiętaj mnie</span>
                </label>
                <span className="sk-login-forgot" aria-disabled="true" title="Odzyskiwanie hasła nie jest skonfigurowane">Nie pamiętasz hasła?</span>
              </div>
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
                      Przywrócić dane z kopii zapasowej?
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-gray-800">Przywracanie z kopii zapasowej</p>
                      <button
                        type="button"
                        onClick={() => {
                          setRestoreExpanded(false);
                          clearRestoreWizard();
                        }}
                        className="text-xs text-gray-500 hover:text-gray-700 underline"
                      >
                        Ukryj
                      </button>
                    </div>
                    <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      Użyj pliku kopii Sekaro (<code className="text-[11px]">.qbk</code>). Jeśli kopia jest zaszyfrowana, potrzebujesz hasła — bez niego danych z tego pliku nie da się odzyskać. Opcjonalna podpowiedź jest zapisana w pliku jako zwykły tekst.
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
                          <span className="text-gray-500">Wybierz plik kopii (.qbk)</span>
                        )}
                      </FileUploadArea>
                      {restoreFile ? (
                        <button
                          type="button"
                          title="Usuń plik"
                          onClick={clearRestoreWizard}
                          className="shrink-0 px-3 rounded-lg border border-gray-300 text-sm font-medium text-gray-600 bg-white hover:bg-gray-50"
                          disabled={restoreMetaBusy || restorePreviewBusy || restoreExecuteBusy}
                        >
                          ×
                        </button>
                      ) : null}
                    </div>

                    {restoreMetaBusy && (
                      <p className="text-center text-xs text-gray-500">Odczytywanie kopii…</p>
                    )}

                    {restoreMeta && !restoreMetaBusy && (
                      <div className="rounded-lg border border-gray-200 bg-white p-3 text-xs space-y-2 text-left">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <p className="font-semibold text-gray-800">Wybrana kopia</p>
                            <ul className="text-gray-600 space-y-0.5">
                              <li>Data: {restoreMeta.backup_preview?.backed_up_at ? new Date(restoreMeta.backup_preview.backed_up_at).toLocaleString() : '—'}</li>
                              <li>Kontakty: {restoreMeta.backup_preview?.lead_count ?? '—'}</li>
                              <li>Skrzynki: {restoreMeta.backup_preview?.inbox_count ?? '—'}</li>
                              <li>Kampanie: {restoreMeta.backup_preview?.campaign_count ?? '—'}</li>
                              <li>Użytkownicy: {restoreMeta.backup_preview?.user_count ?? '—'}</li>
                              <li>Administratorzy: {(restoreMeta.backup_preview?.admin_emails || []).join(', ') || '—'}</li>
                              <li>Szyfrowana: {restoreMeta.encrypted ? 'tak' : 'nie'}</li>
                            </ul>
                          </div>
                          <div>
                            <p className="font-semibold text-gray-800">Obecna baza danych (zostanie zastąpiona)</p>
                            <ul className="text-gray-600 space-y-0.5">
                              <li>Kontakty: {restoreMeta.current_database?.lead_count ?? '—'}</li>
                              <li>Skrzynki: {restoreMeta.current_database?.inbox_count ?? '—'}</li>
                              <li>Kampanie: {restoreMeta.current_database?.campaign_count ?? '—'}</li>
                              <li>Użytkownicy: {restoreMeta.current_database?.user_count ?? '—'}</li>
                              <li>Administratorzy: {(restoreMeta.current_database?.admin_emails || []).join(', ') || '—'}</li>
                            </ul>
                          </div>
                        </div>
                        {restoreMeta.password_hint ? (
                          <p className="text-gray-500">
                            Podpowiedź: <span className="font-mono">{restoreMeta.password_hint}</span>
                          </p>
                        ) : null}
                        <p className="text-amber-800 border-t border-amber-100 pt-2 mt-2">
                          Kontynuuj tylko wtedy, gdy to właściwa kopia zapasowa.
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
                            setRestoreConfirmArmed(false);
                          } catch (e) {
                            setRestoreMsg({ type: 'err', text: e.message || 'Nie udało się zweryfikować kopii zapasowej' });
                          } finally {
                            setRestorePreviewBusy(false);
                          }
                        }}
                      >
                        {restorePreviewBusy ? 'Sprawdzanie…' : 'Zweryfikuj kopię'}
                      </button>
                    )}

                    {restoreMeta && restoreMeta.encrypted && !restorePreview && (
                      <>
                        <label htmlFor="restore-password" className="block text-xs font-medium text-gray-700">Hasło kopii zapasowej</label>
                        <input
                          id="restore-password"
                          type="password"
                          placeholder={`Co najmniej ${BACKUP_MIN_PASSWORD_LEN} znaków`}
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
                            setRestoreConfirmArmed(false);
                            } catch (e) {
                              setRestoreMsg({ type: 'err', text: e.message || 'Nieprawidłowe hasło lub uszkodzona kopia' });
                            } finally {
                              setRestorePreviewBusy(false);
                            }
                          }}
                        >
                          {restorePreviewBusy ? 'Sprawdzanie…' : 'Zweryfikuj hasło'}
                        </button>
                      </>
                    )}

                    {restorePreview && (
                      <div className="rounded-lg border border-gray-200 bg-white p-3 text-xs space-y-2 text-left">
                        <p className="font-semibold text-gray-800">Zweryfikowano — pełne informacje</p>
                        <ul className="text-gray-600 space-y-0.5">
                          <li>Data: {restorePreview.backup?.backed_up_at ? new Date(restorePreview.backup.backed_up_at).toLocaleString() : '—'}</li>
                          <li>Kontakty: {restorePreview.backup?.lead_count ?? '—'}</li>
                          <li>Skrzynki: {restorePreview.backup?.inbox_count ?? '—'}</li>
                          <li>Kampanie: {restorePreview.backup?.campaign_count ?? '—'}</li>
                          <li>Użytkownicy: {restorePreview.backup?.user_count ?? '—'}</li>
                          <li>Administratorzy: {(restorePreview.backup?.admin_emails || []).join(', ') || '—'}</li>
                        </ul>
                        {restoreConfirmArmed && (
                          <div className="sk-login-restore-confirm" role="alert">
                            <strong>Ta operacja zastąpi obecną bazę danych i nie można jej cofnąć.</strong>
                            <button type="button" onClick={() => setRestoreConfirmArmed(false)} disabled={restoreExecuteBusy}>
                              Anuluj
                            </button>
                          </div>
                        )}
                        <button
                          type="button"
                          disabled={restoreExecuteBusy}
                          className="w-full py-2 px-4 rounded-lg text-sm font-medium text-white bg-gray-900 hover:bg-gray-800 disabled:opacity-50"
                          onClick={async () => {
                            if (!restoreConfirmArmed) {
                              setRestoreConfirmArmed(true);
                              return;
                            }
                            setRestoreExecuteBusy(true);
                            setRestoreConfirmArmed(false);
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
                              setRestoreMsg({ type: 'ok', text: data.detail || 'Przywracanie zakończone. Ponowne ładowanie…' });
                              setRestorePreview(null);
                              if (res.headers.get('X-Quickly-Reload') === '1') {
                                setTimeout(() => window.location.reload(), 300);
                              }
                            } catch (e) {
                              setRestoreMsg({ type: 'err', text: e.message || 'Przywracanie nie powiodło się' });
                            } finally {
                              setRestoreExecuteBusy(false);
                            }
                          }}
                        >
                          {restoreExecuteBusy ? 'Przywracanie…' : restoreConfirmArmed ? 'Tak, zastąp bazę' : 'Potwierdź i przywróć'}
                        </button>
                      </div>
                    )}

                    {restoreMsg && (
                      <p
                        className={`text-center text-xs ${restoreMsg.type === 'ok' ? 'text-green-700' : 'text-red-600'}`}
                        role={restoreMsg.type === 'ok' ? 'status' : 'alert'}
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

      <footer className="sk-login-footer">© 2025 Sekaro. Wszystkie prawa zastrzeżone.</footer>
    </div>
  );

}
