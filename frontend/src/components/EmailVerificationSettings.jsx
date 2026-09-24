import { useState, useEffect, useRef } from 'react';
import { api } from '../api';
import { useNotify } from '../context/NotificationContext';
import { Button } from './ui/Button';
import { Card } from './ui/Card';

const MAX_TEST_EMAILS = 10;

const STATUS_ICON = {
  valid:   { icon: '✓', label: 'Wyślij',          cls: 'text-green-600 font-semibold' },
  invalid: { icon: '✗', label: 'Pomiń',          cls: 'text-red-500 font-semibold' },
  risky:   { icon: '⚠', label: 'Pomiń (ryzykowny)',  cls: 'text-yellow-600 font-semibold' },
  unknown: { icon: '?', label: 'Przepuść', cls: 'text-gray-500' },
};

export default function EmailVerificationSettings() {
  const notify = useNotify();

  // ── core settings ──────────────────────────────────────────────────────────
  const [expanded,          setExpanded]          = useState(false);
  const [enabled,           setEnabled]           = useState(false);
  const [provider,          setProvider]          = useState('mailtester_ninja');
  const [apiKey,            setApiKey]            = useState('');
  const [apiKeyMasked,      setApiKeyMasked]      = useState('');
  const [providers,         setProviders]         = useState([]);
  const [saving,            setSaving]            = useState(false);
  const savedStateRef       = useRef(null); // snapshot of last-saved fields
  const [testing,           setTesting]           = useState(false);
  const [testResult,        setTestResult]        = useState(null);
  // Tracks whether the current saved credentials have been successfully tested
  const [connectionTested,  setConnectionTested]  = useState(false);
  const [credsChanged,      setCredsChanged]      = useState(false); // unsaved cred change

  // ── custom provider ────────────────────────────────────────────────────────
  const [customUrl,          setCustomUrl]          = useState('');
  const [customField,        setCustomField]        = useState('');
  const [customValidValues,  setCustomValidValues]  = useState('');
  const [customInvalidValues,setCustomInvalidValues]= useState('');
  const [customMethod,       setCustomMethod]       = useState('GET');

  // ── probe ──────────────────────────────────────────────────────────────────
  const [probeEmail,  setProbeEmail]  = useState('');
  const [probing,     setProbing]     = useState(false);
  const [probeResult, setProbeResult] = useState(null);  // { email, response }

  // ── run-test ───────────────────────────────────────────────────────────────
  const [extraEmails,       setExtraEmails]       = useState('');
  const [customTesting,     setCustomTesting]     = useState(false);
  const [customTestResults, setCustomTestResults] = useState(null);

  // ── load saved settings ────────────────────────────────────────────────────
  useEffect(() => {
    api.get('/settings/email-verification').then(data => {
      const p   = data.provider || 'mailtester_ninja';
      const cu  = data.custom_url || '';
      const cf  = data.custom_field_path || '';
      const cvv = (data.custom_valid_values || []).join(', ');
      const civ = (data.custom_invalid_values || []).join(', ');
      const cm  = data.custom_method || 'GET';
      setEnabled(data.enabled || false);
      setProvider(p);
      setApiKeyMasked(data.api_key_masked || '');
      setProviders(data.providers || []);
      setCustomUrl(cu);
      setCustomField(cf);
      setCustomValidValues(cvv);
      setCustomInvalidValues(civ);
      setCustomMethod(cm);
      setConnectionTested(data.connection_tested || false);
      setCredsChanged(false);
      savedStateRef.current = { provider: p, customUrl: cu, customField: cf, customValidValues: cvv, customInvalidValues: civ, customMethod: cm };
    }).catch(() => {});
  }, []);

  // ── helpers ────────────────────────────────────────────────────────────────
  const parseValues = str => str.split(',').map(s => s.trim()).filter(Boolean);

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        enabled,
        provider,
        custom_url: customUrl,
        custom_field_path: customField,
        custom_valid_values: parseValues(customValidValues),
        custom_invalid_values: parseValues(customInvalidValues),
        custom_method: customMethod,
      };
      if (apiKey) payload.api_key = apiKey;
      const res = await api.post('/settings/email-verification', payload);
      setApiKey('');
      setApiKeyMasked(res.api_key_masked || '');
      savedStateRef.current = { provider, customUrl, customField, customValidValues, customInvalidValues, customMethod };
      setCustomTestResults(null);
      // Any credential change resets tested state on the backend; mirror that locally
      if (credsChanged) {
        setConnectionTested(false);
        setTestResult(null);
      }
      setCredsChanged(false);
      notify({ type: 'success', message: 'Ustawienia weryfikacji e-mail zostały zapisane.' });
    } catch (e) {
      notify({ type: 'error', message: e.message });
    } finally {
      setSaving(false);
    }
  };

  const testApiKey = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const body = {};
      if (apiKey) body.api_key = apiKey;
      const res = await api.post('/settings/email-verification/test', body);
      setTestResult(res);
      if (res.ok) {
        setConnectionTested(true);
        setCredsChanged(false);
      }
    } catch (e) {
      setTestResult({ ok: false, error: e.message });
    } finally {
      setTesting(false);
    }
  };

  const probeUrl = async () => {
    if (!customUrl || !customUrl.includes('{email}')) {
      return notify({ type: 'error', message: 'URL musi zawierać {email}' });
    }
    setProbing(true);
    setProbeResult(null);
    const emailToProbe = probeEmail.trim() || 'test@gmail.com';
    try {
      const res = await api.post('/settings/email-verification/test-custom', {
        url_template: customUrl,
        field_path: '',
        valid_values: [],
        invalid_values: [],
        method: customMethod,
        test_emails: [emailToProbe],
      });
      const first = res.results?.[0];
      setProbeResult(first ? { email: first.email, response: first.raw_response } : null);
    } catch (e) {
      notify({ type: 'error', message: e.message });
    } finally {
      setProbing(false);
    }
  };

  const runTest = async () => {
    if (!customUrl || !customUrl.includes('{email}')) {
      return notify({ type: 'error', message: 'URL musi zawierać {email}' });
    }
    setCustomTesting(true);
    setCustomTestResults(null);
    const extra = extraEmails
      .split(/[\n,]+/)
      .map(s => s.trim())
      .filter(Boolean)
      .slice(0, MAX_TEST_EMAILS);
    try {
      const res = await api.post('/settings/email-verification/test-custom', {
        url_template: customUrl,
        field_path: customField,
        valid_values: parseValues(customValidValues),
        invalid_values: parseValues(customInvalidValues),
        method: customMethod,
        test_emails: extra, // empty = backend auto-picks from inboxes/leads/synthetics
      });
      setCustomTestResults(res.results || []);
      setConnectionTested(true);
      setCredsChanged(false);
      notify({ type: 'success', message: `Przetestowano adresy: ${res.results?.length ?? 0}` });
    } catch (e) {
      notify({ type: 'error', message: e.message });
    } finally {
      setCustomTesting(false);
    }
  };

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <Card className="mb-4">

      {/* ── header row ── */}
      <div
        className="flex items-center justify-between cursor-pointer select-none"
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded(v => !v); } }}
        onClick={() => setExpanded(v => !v)}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className={`text-gray-400 transition-transform text-xs ${expanded ? 'rotate-90' : ''}`}>▶</span>
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">Weryfikacja e-mail</h3>
          {enabled
            ? <span className="text-[10px] bg-green-100 text-green-700 border border-green-200 rounded-full px-2 py-0.5 font-medium shrink-0">Włączona</span>
            : <span className="text-[10px] bg-gray-100 text-gray-500 border rounded-full px-2 py-0.5 font-medium shrink-0">Wyłączona</span>
          }
        </div>
        <label className="flex items-center gap-1.5 cursor-pointer shrink-0 ml-4" onClick={e => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={enabled}
            className="rounded"
            onChange={async e => {
              const next = e.target.checked;
              if (next && (!connectionTested || credsChanged)) {
                notify({ type: 'error', message: 'Przed włączeniem weryfikacji wykonaj pomyślnie test połączenia.' });
                return;
              }
              setEnabled(next);
              try {
                await api.post('/settings/email-verification', {
                  enabled: next, provider,
                  custom_url: customUrl, custom_field_path: customField,
                  custom_valid_values: parseValues(customValidValues),
                  custom_invalid_values: parseValues(customInvalidValues),
                  custom_method: customMethod,
                  ...(apiKey ? { api_key: apiKey } : {}),
                });
                notify({ type: 'success', message: `Weryfikacja e-mail ${next ? 'włączona' : 'wyłączona'}` });
              } catch (err) { notify({ type: 'error', message: err.message }); }
            }}
          />
          <span className="text-xs font-medium text-gray-600 whitespace-nowrap">
            Włącz
          </span>
        </label>
      </div>

      {/* ── expandable body ── */}
      <div className={`grid transition-[grid-template-rows] duration-200 ease-in-out ${expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
        <div className="min-h-0 overflow-hidden">
          <div className="mt-4 space-y-5 border-t pt-4">

            <p className="text-sm text-gray-500">
              Automatycznie sprawdzaj adres e-mail kontaktu przed wysyłką. Adresy uznane za nieprawidłowe
              są pomijane, aby nie zużywać limitu wysyłki.
            </p>

            {/* ── Provider selector ── */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Usługa weryfikacji
              </label>
              <select
                className="border rounded-lg px-3 py-2 text-sm w-full max-w-xs dark:bg-gray-800 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-teal-300"
                value={provider}
                onChange={e => {
                  setProvider(e.target.value);
                  setCustomTestResults(null);
                  setProbeResult(null);
                  setConnectionTested(false);
                  setCredsChanged(true);
                  setTestResult(null);
                }}
              >
                {(providers.length > 0 ? providers : ['mailtester_ninja']).map(p => (
                  <option key={p} value={p}>
                    {p === 'custom'           ? 'Własne API'
                      : p === 'mailtester_ninja' ? 'Mailtester Ninja'
                      : p.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </div>

            {/* ── API key (built-in providers) ── */}
            {provider !== 'custom' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Klucz API</label>
                <input
                  type="password"
                  className="border rounded-lg px-3 py-2 text-sm w-full max-w-md dark:bg-gray-800 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-teal-300"
                  placeholder={apiKeyMasked || 'Wprowadź klucz API'}
                  value={apiKey}
                  onChange={e => {
                    setApiKey(e.target.value);
                    if (e.target.value) {
                      setConnectionTested(false);
                      setCredsChanged(true);
                      setTestResult(null);
                    }
                  }}
                />
                {apiKeyMasked && !apiKey && (
                  <p className="text-xs text-gray-400 mt-1">Aktualny klucz: {apiKeyMasked}</p>
                )}
              </div>
            )}

            {/* ══════════════════════════════════════════════
                Custom provider wizard
                ══════════════════════════════════════════════ */}
            {provider === 'custom' && (
              <div className="space-y-6 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-dashed border-gray-300 dark:border-gray-600">

                {/* ── Step 1: URL ── */}
                <div>
                  <StepLabel n={1} title="Podaj adres API" />
                  <p className="text-xs text-gray-500 mb-2">
                    Umieść <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded font-mono">{'{email}'}</code> w miejscu adresu.
                    Sekaro automatycznie podstawi sprawdzany e-mail.
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    <input
                      type="text"
                      className="flex-1 min-w-0 border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-600 font-mono focus:outline-none focus:ring-2 focus:ring-teal-300"
                      aria-label="Szablon URL API weryfikacji" placeholder="https://api.example.com/verify?email={email}"
                      value={customUrl}
                      onChange={e => {
                        setCustomUrl(e.target.value);
                        setProbeResult(null);
                        setCustomTestResults(null);
                      }}
                    />
                    <select
                      className="border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-teal-300"
                      aria-label="Metoda HTTP"
                      value={customMethod}
                      onChange={e => setCustomMethod(e.target.value)}
                    >
                      <option value="GET">GET</option>
                      <option value="POST">POST</option>
                    </select>
                  </div>
                </div>

                {/* ── Step 2: Probe ── */}
                <div>
                  <StepLabel n={2} title="Podejrzyj odpowiedź API" />
                  <p className="text-xs text-gray-500 mb-2">
                    Wyślij jedno żądanie, aby zobaczyć odpowiedź API. Możesz użyć dowolnego adresu testowego.
                  </p>
                  <div className="flex gap-2 flex-wrap items-center">
                    <input
                      type="email"
                      className="border rounded-lg px-3 py-2 text-sm dark:bg-gray-800 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-teal-300 w-56"
                      aria-label="Testowy adres e-mail"
                      placeholder="test@gmail.com"
                      value={probeEmail}
                      onChange={e => setProbeEmail(e.target.value)}
                    />
                    <Button size="sm" variant="outline" onClick={probeUrl} disabled={probing || !customUrl}>
                      {probing ? 'Wczytywanie…' : 'Podejrzyj odpowiedź'}
                    </Button>
                  </div>

                  {probeResult && (
                    <div className="mt-3 rounded-lg bg-gray-100 dark:bg-gray-900 border text-xs font-mono p-3 overflow-x-auto max-h-48">
                      <p className="text-gray-500 mb-1 font-sans font-medium not-italic">
                        Odpowiedź dla <strong>{probeResult.email}</strong>:
                      </p>
                      <pre className="whitespace-pre-wrap break-all text-gray-700 dark:text-gray-300">
                        {JSON.stringify(probeResult.response, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>

                {/* ── Step 3: Field ── */}
                <div>
                  <StepLabel n={3} title="Które pole zawiera wynik?" />
                  <p className="text-xs text-gray-500 mb-2">
                    W odpowiedzi powyżej znajdź pole określające, czy adres jest prawidłowy.
                    Dla zagnieżdżonych obiektów użyj notacji z kropką, np.{' '}
                    <code className="bg-gray-200 dark:bg-gray-700 px-0.5 rounded font-mono">data.status</code>.
                  </p>
                  <input
                    type="text"
                    className="border rounded-lg px-3 py-2 text-sm w-full max-w-sm dark:bg-gray-800 dark:border-gray-600 font-mono focus:outline-none focus:ring-2 focus:ring-teal-300"
                    aria-label="Pole odpowiedzi API"
                    placeholder="status"
                    value={customField}
                    onChange={e => setCustomField(e.target.value)}
                  />
                </div>

                {/* ── Step 4: Good / Bad values ── */}
                <div>
                  <StepLabel n={4} title="Co oznaczają wartości?" />
                  <p className="text-xs text-gray-500 mb-3">
                    Wpisz dokładne wartości zwracane przez API i oddziel je przecinkami.
                    Wartości spoza listy są traktowane jako nieznane i wiadomość nadal może zostać wysłana.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="flex items-center gap-1.5 text-sm font-medium text-green-700 dark:text-green-400 mb-1">
                        <span>✓</span > Poprawny — wyślij wiadomość
                      </label>
                      <input
                        type="text"
                        className="border rounded-lg px-3 py-2 text-sm w-full dark:bg-gray-800 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-green-300"
                        aria-label="Wartości oznaczające poprawny adres"
                        placeholder="valid, ok, deliverable"
                        value={customValidValues}
                        onChange={e => setCustomValidValues(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="flex items-center gap-1.5 text-sm font-medium text-red-600 dark:text-red-400 mb-1">
                        <span>✗</span > Niepoprawny — pomiń adres
                      </label>
                      <input
                        type="text"
                        className="border rounded-lg px-3 py-2 text-sm w-full dark:bg-gray-800 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-red-300"
                        aria-label="Wartości oznaczające niepoprawny adres"
                        placeholder="invalid, blocked, risky"
                        value={customInvalidValues}
                        onChange={e => setCustomInvalidValues(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                {/* ── Step 5: Run test ── */}
                <div>
                  <StepLabel n={5} title="Przetestuj przed zapisaniem" />
                  <p className="text-xs text-gray-500 mb-2">
                    Automatycznie przetestujemy próbkę skrzynek i kontaktów. Możesz też dodać własne
                    adresy poniżej (maks. {MAX_TEST_EMAILS}), po jednym w wierszu lub oddzielone przecinkami.
                  </p>
                  <textarea
                    className="border rounded-lg px-3 py-2 text-sm w-full dark:bg-gray-800 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-teal-300 resize-none font-mono"
                    rows={3}
                    aria-label="Dodatkowe adresy testowe"
                    placeholder={`Opcjonalnie — dodaj maks. ${MAX_TEST_EMAILS} adresów\nexample@gmail.com\ntest@domain.com`}
                    value={extraEmails}
                    onChange={e => setExtraEmails(e.target.value)}
                  />
                  {(() => {
                    const n = extraEmails.split(/[\n,]+/).map(s => s.trim()).filter(Boolean).length;
                    return n > MAX_TEST_EMAILS
                      ? <p className="text-xs text-amber-600 mt-1">Przetestowane zostanie tylko pierwsze {MAX_TEST_EMAILS} adresów.</p>
                      : null;
                  })()}
                  <div className="mt-2">
                    <Button size="sm" variant="outline" onClick={runTest} disabled={customTesting || !customUrl}>
                      {customTesting ? 'Testowanie…' : 'Uruchom test'}
                    </Button>
                  </div>
                </div>

                {/* ── Test results ── */}
                {customTestResults !== null && (
                  <div>
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Wyniki — sprawdź, czy kolumna „Decyzja” odpowiada oczekiwaniu:
                    </p>
                    <div className="overflow-x-auto rounded-lg border">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-50 dark:bg-gray-800">
                          <tr>
                            <th className="px-3 py-2 text-left font-medium text-gray-500">Adres e-mail</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-500">Odpowiedź API</th>
                            <th className="px-3 py-2 text-left font-medium text-gray-500">Decyzja</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {customTestResults.map((r, i) => {
                            const s = STATUS_ICON[r.status] || { icon: '', label: r.status, cls: 'text-gray-500' };
                            return (
                              <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800/40">
                                <td className="px-3 py-2 font-mono">{r.email}</td>
                                <td className="px-3 py-2 font-mono text-gray-600 dark:text-gray-400">
                                  {r.raw_field_value != null
                                    ? String(r.raw_field_value)
                                    : <span className="text-gray-400 italic">—</span>}
                                </td>
                                <td className={`px-3 py-2 ${s.cls}`}>
                                  {s.icon} {s.label}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    {customTestResults.some(r => r.status === 'unknown') && (
                      <p className="text-xs text-amber-600 mt-2">
                        ⚠ Część adresów ma wynik nieznany — wartość zwrócona przez API nie znajduje się na liście
                        poprawnych ani niepoprawnych. Dodaj ją powyżej albo pozostaw jako przepuszczaną.
                      </p>
                    )}
                    <p className="text-xs text-gray-400 mt-1">
                      Wyniki są poprawne? Zapisz ustawienia poniżej.
                    </p>
                  </div>
                )}

              </div>
            )}
            {/* ── end custom provider wizard ── */}

            {/* ── Save / Test connection ── */}
            <div className="space-y-2">
              {savedStateRef.current != null && (
                provider !== savedStateRef.current.provider ||
                customUrl !== savedStateRef.current.customUrl ||
                customField !== savedStateRef.current.customField ||
                customValidValues !== savedStateRef.current.customValidValues ||
                customInvalidValues !== savedStateRef.current.customInvalidValues ||
                customMethod !== savedStateRef.current.customMethod ||
                !!apiKey
              ) && (
                <p className="text-xs text-amber-600 font-medium">⚠ Niezapisane zmiany — kliknij Zapisz, aby je zastosować</p>
              )}
              <div className="flex items-center gap-3 flex-wrap">
                <Button size="sm" onClick={save} disabled={saving}>
                  {saving ? 'Zapisywanie…' : 'Zapisz'}
                </Button>
                {provider !== 'custom' && (
                  <Button
                    size="sm"
                    className={(connectionTested && !credsChanged)
                      ? 'bg-green-600 text-white border-green-600 hover:bg-green-700'
                      : ''}
                    variant={(connectionTested && !credsChanged) ? undefined : 'outline'}
                    onClick={testApiKey}
                    disabled={testing}
                  >
                    {testing ? 'Testowanie…' : (connectionTested && !credsChanged) ? '✓ Połączenie sprawdzone' : 'Testuj połączenie'}
                  </Button>
                )}
                {(!connectionTested || credsChanged) && (
                  <span className="text-xs text-amber-600">Przetestuj połączenie przed włączeniem</span>
                )}
              </div>
            </div>

            {testResult && (
              <div className={`text-sm p-3 rounded-lg ${testResult.ok
                ? 'bg-green-50 text-green-700 border border-green-200'
                : 'bg-red-50 text-red-700 border border-red-200'}`}
              >
                {testResult.ok
                  ? <>Połączenie działa — status: <strong>{testResult.status || 'ok'}</strong>{testResult.message ? ` (${testResult.message})` : ''}</>
                  : <>Test nie powiódł się: {testResult.error}</>
                }
              </div>
            )}

          </div>
        </div>
      </div>
    </Card>
  );
}

/* ── small helper ── */
function StepLabel({ n, title }) {
  return (
    <div className="flex items-center gap-2 mb-1">
      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-teal-500 text-white text-[10px] font-bold flex items-center justify-center">
        {n}
      </span>
      <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">{title}</p>
    </div>
  );
}
