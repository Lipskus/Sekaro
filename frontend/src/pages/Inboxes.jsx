import { useState, useEffect, useRef, useMemo } from 'react';
import { api, apiCache } from '../api';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { useAppMode } from '../context/AppModeContext';
import { useConfirm } from '../context/ConfirmContext';
import { useNotify } from '../context/NotificationContext';

/** Backend stores jitter in seconds (cap 600). Forms show minutes and convert on change / save. */
const JITTER_MAX_MINUTES = 10;

/** Full Beacon setup guide in the Sekaro repo (INSTALL.md). */
const BEACON_SETUP_DOCS_URL =
  'https://github.com/Lipskus/Sekaro/blob/main/docs/INSTALL.md#quickly-beacon-recommended-custom-tracking-hostnames';

function CollapsibleInfo({ children }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-xs font-medium text-gray-600 hover:text-gray-900 flex items-center gap-1.5 text-left"
        aria-expanded={open}
      >
        <svg
          className={`w-3.5 h-3.5 shrink-0 text-gray-500 transition-transform ${open ? 'rotate-90' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        {open ? 'Ukryj informacje' : 'Pokaż informacje'}
      </button>
      {open && (
        <div className="mt-2 pl-1 space-y-2 text-xs text-gray-600 border-l-2 border-gray-200 ml-0.5 py-0.5">
          {children}
        </div>
      )}
    </div>
  );
}

function clampJitterSeconds(s) {
  const n = Number(s);
  if (!Number.isFinite(n)) return 0;
  return Math.min(600, Math.max(0, Math.round(n)));
}

function jitterInputMinutesFromSeconds(sec) {
  return clampJitterSeconds(sec ?? 0) / 60;
}

function jitterSecondsFromInputMinutes(minVal) {
  const v = parseFloat(minVal);
  if (!Number.isFinite(v) || v < 0) return 0;
  return clampJitterSeconds(Math.min(JITTER_MAX_MINUTES, v) * 60);
}

function formatJitterMinutesLabel(seconds) {
  const s = clampJitterSeconds(seconds ?? 0);
  if (s <= 0) return null;
  const min = s / 60;
  const t = Number.isInteger(min) ? String(min) : (Math.round(min * 10) / 10).toString();
  return `up to ${t} min random`;
}

/**
 * Śledzenie: three choices — app URL, Beacon (setup URL + Połącz), or Konfiguracja DNS (CNAME + Sprawdź).
 * Long-form help is behind “Pokaż informacje” for each option.
 */
function InboxTrackingOptions({
  variant,
  wrapClassName = 'space-y-4',
  radioName,
  cnameUiEnabled,
  cnameTarget,
  uiMode,
  onUiModeChange,
  trackingDomain,
  onTrackingDomainChange,
  onDnsVerifyChange,
  beaconConnected,
  beaconBaseUrl,
  beaconSetupUrl,
  onBeaconSetupUrlChange,
  onConnectBeacon,
  onDisconnectBeacon,
  beaconConnecting,
  siblingInboxesForReuse = [],
  currentInboxId = null,
  onBeaconConnectFromSibling,
  onReuseDnsDomain,
  dnsAutoVerifyTrigger = 0,
}) {
  const hostHint = cnameTarget || (typeof window !== 'undefined' ? window.location.hostname : '');
  const dnsActive = uiMode === 'dns';
  const beaconActive = uiMode === 'beacon';
  const [verifyState, setVerifyState] = useState(null);
  const [verifyMsg, setVerifyMsg] = useState('');
  const abortRef = useRef(false);
  const [reuseOpen, setReuseOpen] = useState(false);
  const [reuseSearch, setReuseSearch] = useState('');
  const [reuseBusyKey, setReuseBusyKey] = useState(null);

  const reuseRowsAll = useMemo(() => {
    const list = Array.isArray(siblingInboxesForReuse) ? siblingInboxesForReuse : [];
    return list
      .filter((i) => i.id !== currentInboxId)
      .flatMap((i) => {
        const label = (i.display_name || '').trim() || i.email || `Inbox #${i.id}`;
        const rows = [];
        if (!beaconConnected && i.beacon_connected && (i.beacon_base_url || '').trim()) {
          const primary = (i.beacon_base_url || '').trim();
          const hay = `${primary} ${label} ${i.email || ''}`.toLowerCase();
          rows.push({
            key: `beacon-${i.id}`,
            kind: 'beacon',
            inboxId: i.id,
            primary,
            secondary: label,
            hay,
          });
        }
        if (
          !beaconConnected
          && cnameUiEnabled
          && (i.tracking_domain || '').trim()
          && !i.beacon_connected
        ) {
          const primary = (i.tracking_domain || '').trim();
          const hay = `${primary} ${label} ${i.email || ''}`.toLowerCase();
          rows.push({
            key: `dns-${i.id}`,
            kind: 'dns',
            inboxId: i.id,
            primary,
            secondary: label,
            hay,
          });
        }
        return rows;
      });
  }, [siblingInboxesForReuse, currentInboxId, beaconConnected, cnameUiEnabled]);

  const reuseRows = useMemo(() => {
    const q = (reuseSearch || '').trim().toLowerCase();
    return reuseRowsAll.filter((r) => !q || r.hay.includes(q));
  }, [reuseRowsAll, reuseSearch]);

  const hasReuseOptions = variant === 'edit' && currentInboxId != null && reuseRowsAll.length > 0;

  const handleDnsValue = (v) => {
    abortRef.current = true;
    setVerifyState(null);
    setVerifyMsg('');
    onDnsVerifyChange?.(false);
    onTrackingDomainChange(v);
  };

  const verifyDns = async () => {
    const domain = (trackingDomain || '').trim();
    if (!domain) return;
    abortRef.current = false;
    setVerifyState('checking');
    setVerifyMsg('Registering domain…');
    try {
      await api.post('/settings/register-tracking-domain-pending', { domain });
    } catch (_) { /* non-fatal */ }
    if (abortRef.current) return;
    const MAX_ATTEMPTS = 5;
    const RETRY_DELAY_MS = 8000;
    let lastError = 'Timed out waiting for SSL certificate to be provisioned';
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      if (abortRef.current) return;
      setVerifyMsg(attempt === 0 ? 'Provisioning SSL certificate…' : `Waiting for SSL certificate… (attempt ${attempt + 1}/${MAX_ATTEMPTS})`);
      try {
        const data = await api.get(
          `/settings/verify-tracking-domain?domain=${encodeURIComponent(domain)}`
        );
        if (abortRef.current) return;
        if (data.ok) {
          setVerifyState('ok');
          setVerifyMsg('');
          onDnsVerifyChange?.(true);
          return;
        }
        lastError = data.error || 'Unknown error';
      } catch (e) {
        if (abortRef.current) return;
        lastError = e.message;
      }
      if (attempt < MAX_ATTEMPTS - 1) {
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
      }
    }
    if (!abortRef.current) {
      setVerifyState({ error: lastError });
      setVerifyMsg('');
      onDnsVerifyChange?.(false);
    }
  };

  useEffect(() => {
    if (uiMode !== 'dns') {
      abortRef.current = true;
      setVerifyState(null);
      setVerifyMsg('');
    }
  }, [uiMode]);

  useEffect(() => {
    if (variant !== 'edit' || !dnsAutoVerifyTrigger) return;
    if (uiMode !== 'dns' || !(trackingDomain || '').trim()) return;
    verifyDns();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: run once per trigger after DNS mode + domain applied
  }, [dnsAutoVerifyTrigger]);

  const dnsInputDisabled = !dnsActive;
  const beaconInputDisabled = variant === 'add' || !beaconActive || beaconConnected;
  const canVerifyDns = dnsActive && (trackingDomain || '').trim().length > 0;

  return (
    <div className={`${wrapClassName} min-w-0 max-w-full`}>
      {variant === 'edit' && currentInboxId != null && (
        <div className="rounded-md border border-gray-200 bg-white overflow-hidden min-w-0 max-w-full">
          <button
            type="button"
            onClick={() => setReuseOpen((o) => !o)}
            className="w-full flex items-center gap-2 text-left px-3 py-2 text-xs font-medium text-gray-800 hover:bg-gray-50"
            aria-expanded={reuseOpen}
          >
            <svg
              className={`w-3.5 h-3.5 shrink-0 text-gray-500 transition-transform ${reuseOpen ? 'rotate-90' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            Use a tracker already linked to another inbox
            {!reuseOpen && hasReuseOptions && (
              <span className="ml-auto text-[10px] font-normal text-gray-500">{reuseRowsAll.length} available</span>
            )}
          </button>
          {reuseOpen && (
            <div className="px-3 pb-3 pt-0 border-t border-gray-100 space-y-2 min-w-0 max-w-full">
              {!hasReuseOptions ? (
                <p className="text-xs text-gray-500 pt-2">
                  Żadna inna skrzynka nie ma jeszcze skonfigurowanego Beacon ani domeny DNS. Najpierw skonfiguruj jedną skrzynkę albo wklej adres konfiguracji poniżej.
                </p>
              ) : (
                <>
                  <input
                    type="search"
                    value={reuseSearch}
                    onChange={(e) => setReuseSearch(e.target.value)}
                    placeholder="Search by URL, domain, or inbox…"
                    className="w-full min-w-0 max-w-full box-border border rounded px-2 py-1.5 text-xs bg-white"
                  />
                  {reuseSearch.trim() && reuseRows.length === 0 && reuseRowsAll.length > 0 ? (
                    <p className="text-xs text-gray-500">No matches — clear search to see all {reuseRowsAll.length} tracker(s).</p>
                  ) : null}
                  <ul className="max-h-40 overflow-y-auto space-y-1.5 min-w-0">
                    {reuseRows.map((r) => (
                      <li
                        key={r.key}
                        className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between rounded border border-gray-100 bg-gray-50/80 px-2 py-1.5 min-w-0"
                      >
                        <div className="min-w-0 text-xs">
                          <span className="font-medium text-gray-700">
                            {r.kind === 'beacon' ? 'Beacon' : 'DNS'}
                          </span>
                          <code className="block mt-0.5 font-mono text-[11px] text-teal-900 break-all [overflow-wrap:anywhere]">
                            {r.primary}
                          </code>
                          <span className="text-gray-500 text-[11px]">{r.secondary}</span>
                        </div>
                        <button
                          type="button"
                          disabled={
                            beaconConnecting
                            || reuseBusyKey === r.key
                            || (r.kind === 'beacon' && !onBeaconConnectFromSibling)
                            || (r.kind === 'dns' && !onReuseDnsDomain)
                          }
                          onClick={async () => {
                            if (r.kind === 'beacon' && onBeaconConnectFromSibling) {
                              setReuseBusyKey(r.key);
                              try {
                                await onBeaconConnectFromSibling(r.inboxId);
                              } finally {
                                setReuseBusyKey(null);
                              }
                            } else if (r.kind === 'dns' && onReuseDnsDomain) {
                              onReuseDnsDomain(r.primary);
                            }
                          }}
                          className="shrink-0 self-start sm:self-center px-2 py-1 text-[11px] rounded border border-teal-600 bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50 disabled:hover:bg-teal-600"
                        >
                          {r.kind === 'beacon'
                            ? beaconConnecting && reuseBusyKey === r.key
                              ? 'Łączenie…'
                              : 'Połącz'
                            : 'Use & verify'}
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Użyj domeny aplikacji */}
      <div className="space-y-2 min-w-0 max-w-full">
        <label className="flex items-start gap-2 cursor-pointer text-sm">
          <input
            type="radio"
            name={radioName}
            className="mt-0.5 shrink-0"
            checked={uiMode === 'app'}
            onChange={() => onUiModeChange('app')}
          />
          <span className="font-medium text-gray-800">Użyj domeny aplikacji</span>
        </label>
        <div className="ml-6 min-w-0 max-w-full border-l-2 border-gray-200 pl-3 py-0.5">
          <CollapsibleInfo>
            <p>
              Open, click, and unsubscribe links use your Sekaro app URL{' '}
              <span className="text-gray-500 font-mono break-all">({hostHint})</span>. No Beacon service and no extra DNS records are required.
            </p>
          </CollapsibleInfo>
        </div>
      </div>

      {/* Beacon */}
      <div className="space-y-2 min-w-0 max-w-full">
        <label className="flex items-start gap-2 cursor-pointer text-sm min-w-0">
          <input
            type="radio"
            name={radioName}
            className="mt-0.5 shrink-0"
            checked={uiMode === 'beacon'}
            onChange={() => onUiModeChange('beacon')}
          />
          <span className="font-medium text-gray-800">Beacon (zalecane)</span>
        </label>
        <div className="ml-6 min-w-0 max-w-full space-y-2 border-l-2 border-gray-200 pl-3 py-0.5 box-border">
          <div className="w-full min-w-0 max-w-full space-y-2">
            {beaconConnected ? (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between w-full min-w-0">
                <p className="text-xs text-gray-700 min-w-0 break-words [overflow-wrap:anywhere]">
                  Połączono: <code className="text-teal-800 break-all">{beaconBaseUrl || ''}</code>
                </p>
                <Button type="button" size="sm" variant="outline" className="shrink-0 self-start" onClick={onDisconnectBeacon}>
                  Rozłącz
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-2 w-full min-w-0 max-w-full">
                <input
                  type="url"
                  disabled={beaconInputDisabled}
                  className="w-full min-w-0 max-w-full box-border border rounded px-2 py-1.5 font-mono text-xs bg-white disabled:bg-gray-100 disabled:text-gray-500"
                  placeholder="https://track.example.com/?token=…"
                  value={beaconSetupUrl}
                  onChange={e => onBeaconSetupUrlChange(e.target.value)}
                />
                <button
                  type="button"
                  disabled={beaconInputDisabled || !beaconSetupUrl.trim() || beaconConnecting}
                  onClick={onConnectBeacon}
                  className="self-start shrink-0 px-2 py-1 text-xs rounded border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50"
                >
                  {beaconConnecting ? 'Łączenie…' : 'Połącz'}
                </button>
              </div>
            )}
          </div>
          {variant === 'add' && (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded px-2 py-1">
              Beacon można połączyć po utworzeniu skrzynki — najpierw dodaj skrzynkę, a następnie otwórz jej edycję.
            </p>
          )}
          <CollapsibleInfo>
            <p className="font-medium text-gray-700">How Beacon works</p>
            <p>
              Run the Beacon service on the HTTPS hostname you want for tracking links. While Sekaro is not connected yet, open Beacon&apos;s root URL in a browser and copy the <strong>setup URL</strong> (it includes{' '}
              <code className="bg-gray-100 px-0.5 rounded">?token=</code>
              ). Wklej adres powyżej i kliknij Połącz. On Beacon, set{' '}
              <code className="bg-gray-100 px-0.5 rounded">BEACON_PUBLIC_BASE_URL</code>
              {' '}if printed links should use a specific public origin.
            </p>
            <p>
              <a
                href={BEACON_SETUP_DOCS_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-700 hover:underline break-all"
              >
                Full setup guide (Sekaro repo → INSTALL.md)
              </a>
            </p>
          </CollapsibleInfo>
        </div>
      </div>

      {/* Konfiguracja DNS */}
      {cnameUiEnabled && (
        <div className="space-y-2 min-w-0 max-w-full">
          <label className="flex items-start gap-2 cursor-pointer text-sm min-w-0">
            <input
              type="radio"
              name={radioName}
              className="mt-0.5 shrink-0"
              checked={dnsActive}
              onChange={() => onUiModeChange('dns')}
            />
            <span className="font-medium text-gray-800">Konfiguracja DNS</span>
          </label>
          <div className="ml-6 min-w-0 max-w-full space-y-2 border-l-2 border-gray-200 pl-3 py-0.5 box-border">
            <div className="flex flex-col gap-2 w-full min-w-0 max-w-full">
              <input
                type="text"
                disabled={dnsInputDisabled}
                className="w-full min-w-0 max-w-full box-border border rounded px-2 py-1.5 font-mono text-sm bg-white disabled:bg-gray-100 disabled:text-gray-500"
                placeholder="mail.yourdomain.com"
                value={trackingDomain || ''}
                onChange={e => handleDnsValue(e.target.value)}
                onFocus={() => {
                  if (!dnsActive) onUiModeChange('dns');
                }}
              />
              <button
                type="button"
                disabled={!canVerifyDns || verifyState === 'checking'}
                onClick={verifyDns}
                className="self-start shrink-0 px-2 py-1 text-xs rounded border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50"
              >
                {verifyState === 'checking' ? 'Sprawdzanie…' : 'Sprawdź'}
              </button>
            </div>
            {verifyState === 'checking' && verifyMsg && (
              <p className="text-xs text-blue-600 flex items-center gap-1">
                <span className="inline-block w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                {verifyMsg}
              </p>
            )}
            {verifyState === 'ok' && (
              <p className="text-xs text-green-600 font-medium">✓ Domain is reachable and pointing to this server</p>
            )}
            {verifyState && verifyState !== 'checking' && verifyState !== 'ok' && (
              <p className="text-xs text-red-600">✗ {verifyState.error}</p>
            )}
            <CollapsibleInfo>
              <p className="font-medium text-gray-700">Konfiguracja DNS (CNAME)</p>
              <p>Add a <code>CNAME</code> at your DNS host pointing your tracking hostname at this Sekaro server:</p>
              <pre className="bg-white border rounded p-2 overflow-x-auto whitespace-pre-wrap break-all text-gray-700 text-[11px]">
                {`${(trackingDomain || '').trim() || 'mail.yourdomain.com'}  CNAME  ${cnameTarget || 'your-app-host'}.`}
              </pre>
              <p>
                Caddy requests a certificate on the first HTTPS hit. Select <strong>Konfiguracja DNS</strong>, enter the hostname, run <strong>Sprawdź</strong>, then save the inbox.
              </p>
            </CollapsibleInfo>
          </div>
        </div>
      )}

      {!cnameUiEnabled && (trackingDomain || '').trim() && !beaconConnected && (
        <div className="text-xs text-amber-800 space-y-2 bg-amber-50 border border-amber-200 rounded p-2">
          <p>
            Legacy CNAME tracking domain saved:{' '}
            <code className="font-mono">{(trackingDomain || '').trim()}</code>. Prefer Beacon for new setups.
          </p>
          <button
            type="button"
            className="text-xs px-2 py-1 rounded border border-amber-300 bg-white hover:bg-amber-100"
            onClick={() => { onTrackingDomainChange(''); onDnsVerifyChange?.(false); }}
          >
            Usuń zapisaną domenę
          </button>
        </div>
      )}
    </div>
  );
}

export default function Inboxes() {
  const [inboxes, setInboxes] = useState(() => apiCache.get('/inboxes') || []);
  const [cnameTarget, setCnameTarget] = useState('');
  const [customTrackingCnameUiEnabled, setCustomTrackingCnameUiEnabled] = useState(true);
  // state used for both add and edit forms
  const initialForm = {
    provider: 'smtp',
    email: '',
    display_name: '',
    reply_to: '',
    max_emails_per_day: 50,
    wait_minutes_between: 5,
    max_jitter_seconds: 180,
    tracking_domain: '',
    ramp_up_enabled: false,
    ramp_up_period_days: 42,
    ramp_up_start: 1,
    ramp_up_step_size: 1,
  };
  const [form, setForm] = useState(initialForm);
  const [message, setMessage] = useState(null);
  // Generic SMTP / IMAP credentials for the Add form (used when provider === 'smtp')
  const initialSmtpForm = {
    smtp_host: '',
    smtp_port: 587,
    smtp_username: '',
    smtp_password: '',
    smtp_use_tls: true,
    smtp_use_ssl: false,
    imap_host: '',
    imap_port: 993,
    imap_username: '',
    imap_password: '',
    imap_use_ssl: true,
  };
  const [smtpForm, setSmtpForm] = useState(initialSmtpForm);
  // SMTP credentials for the Edit panel (loaded on demand per inbox)
  const [editingSmtp, setEditingSmtp] = useState(null);
  const [smtpTesting, setSmtpTesting] = useState(false);
  const [smtpTestMsg, setSmtpTestMsg] = useState(null);
  const [editing, setEditing] = useState(null); // inbox being edited
  const [editDirty, setEditDirty] = useState(false);
  const [showEditWarning, setShowEditWarning] = useState(false);
  const [editWarningCloseSidebar, setEditWarningCloseSidebar] = useState(false);
  const [editMsg, setEditMsg] = useState(null);
  // Tracks the saved tracking domain at the moment editing opened, so we only
  // require re-verification when the user actually changes the domain.
  const editOriginalDomain = useRef('');
  const [editDomainVerified, setEditDomainVerified] = useState(false);
  const [beaconSetupUrl, setBeaconSetupUrl] = useState('');
  const [beaconConnecting, setBeaconConnecting] = useState(false);
  const [dnsAutoVerifyTrigger, setDnsAutoVerifyTrigger] = useState(0);
  const [editTrackingMode, setEditTrackingMode] = useState('app');
  const [addTrackingMode, setAddTrackingMode] = useState('app');
  const [addDomainVerified, setAddDomainVerified] = useState(false);
  const [showAdd, setShowAdd] = useState(false); // controls add modal
  const confirm = useConfirm();
  const addBackdropDown = useRef(false);
  const notify = useNotify();
  const { mode } = useAppMode();
  /** Development-only: count of open/click/unsub rows synced to Beacon on connect (from server). */
  const [devBeaconRegCount, setDevBeaconRegCount] = useState(null);

  useEffect(() => {
    if (!editing?.id || mode !== 'development') {
      setDevBeaconRegCount(null);
      return;
    }
    let cancelled = false;
    api
      .get(`/inboxes/${editing.id}/beacon/pending-registration-count`)
      .then((d) => {
        if (!cancelled) setDevBeaconRegCount(typeof d.count === 'number' ? d.count : null);
      })
      .catch(() => {
        if (!cancelled) setDevBeaconRegCount(null);
      });
    return () => {
      cancelled = true;
    };
  }, [editing?.id, mode]);

  // ---- Pause modal state ----
  const [showPauseModal, setShowPauseModal] = useState(false);
  const [pausingInbox, setPausingInbox] = useState(null);
  const [pauseAction, setPauseAction] = useState('pause_leads');

  // ---- Detail panel state ----
  const [selectedInbox, setSelectedInbox] = useState(null);

  // Auto-open inbox detail panel when ?inbox=<id> is in the URL
  const autoOpenHandledRef = useRef(false);

  const load = async () => {
    try {
      const data = await api.get('/inboxes');
      setInboxes(data);
      setSelectedInbox(prev => prev ? (data.find(i => i.id === prev.id) || null) : null);
    } catch (e) {
      console.error(e);
    }
  };
  useEffect(() => {
    load();
    // get server hostname for DNS instructions
    fetch('/api/settings/server-info')
      .then(r => r.json())
      .then((d) => {
        setCnameTarget(d.cname_target || window.location.hostname);
        if (typeof d.custom_tracking_cname_ui_enabled === 'boolean') {
          setCustomTrackingCnameUiEnabled(d.custom_tracking_cname_ui_enabled);
        }
      })
      .catch(() => setCnameTarget(window.location.hostname));
  }, []);

  // Open inbox detail panel when ?inbox=<id> is in the URL (from System Health "Fix it" link)
  useEffect(() => {
    if (autoOpenHandledRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const inboxId = params.get('inbox');
    if (!inboxId) return;
    const numId = Number(inboxId);
    if (!Number.isFinite(numId)) return;
    const inbox = inboxes.find(i => i.id === numId);
    if (inbox) {
      autoOpenHandledRef.current = true;
      setSelectedInbox(inbox);
      if (editing) closeEdit();
      const clean = window.location.pathname + window.location.hash;
      window.history.replaceState({}, '', clean);
    }
  }, [inboxes]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleChange = (e) => {
    const { name, value, type } = e.target;
    setForm(f => ({ ...f, [name]: type === 'number' ? +value : value }));
  };

  const canSubmit = () =>
    form.email.trim() !== '' &&
    smtpForm.smtp_host.trim() !== '' &&
    smtpForm.smtp_username.trim() !== '' &&
    smtpForm.smtp_password !== '';

  const submitSmtp = async (inboxPayload) => {
    // 1. create the inbox row, 2. save credentials, 3. test the connection
    const created = await api.post('/inboxes', inboxPayload);
    try {
      await api.put(`/smtp/inboxes/${created.id}`, { ...smtpForm, smtp_port: +smtpForm.smtp_port, imap_port: +smtpForm.imap_port });
    } catch (e) {
      setMessage({ type: 'error', text: `Inbox created but SMTP credentials failed to save: ${e.message}` });
      setForm(initialForm);
      setSmtpForm(initialSmtpForm);
      load();
      setShowAdd(false);
      return;
    }
    try {
      const res = await api.post(`/smtp/inboxes/${created.id}/test`, {});
      if (res.ok) {
        setMessage({ type: 'success', text: 'SMTP inbox added and connection verified' });
      } else {
        const details = [res.smtp?.error, res.imap?.error].filter(Boolean).join(' ');
        setMessage({ type: 'error', text: `Inbox added but connection test failed: ${details || 'unknown error'}` });
      }
    } catch (e) {
      setMessage({ type: 'error', text: `Inbox added but connection test failed: ${e.message}` });
    }
    setForm(initialForm);
    setSmtpForm(initialSmtpForm);
    setAddTrackingMode('app');
    setAddDomainVerified(false);
    load();
    setShowAdd(false);
  };

  const submit = async (e) => {
    e.preventDefault();
    setMessage(null);
    if (form.provider === 'smtp') {
      if (!form.email.trim()) {
        setMessage({ type: 'error', text: 'Email address is required for SMTP inboxes.' });
        return;
      }
      if (!smtpForm.smtp_host.trim() || !smtpForm.smtp_username.trim() || !smtpForm.smtp_password) {
        setMessage({ type: 'error', text: 'Host SMTP, username, and password are required.' });
        return;
      }
      const addDomain = addTrackingMode === 'dns' ? form.tracking_domain.trim() : '';
      if (addDomain && !addDomainVerified) {
        setMessage({ type: 'error', text: 'Please verify the DNS tracking domain before saving.' });
        return;
      }
      try {
        await submitSmtp({ ...form, tracking_domain: addDomain || null });
      } catch (e) {
        setMessage({ type: 'error', text: e.message });
      }
      return;
    }
    const addDomain = addTrackingMode === 'dns' ? form.tracking_domain.trim() : '';
    if (addDomain && !addDomainVerified) {
      setMessage({ type: 'error', text: 'Please verify the DNS tracking domain before saving.' });
      return;
    }
    try {
      await api.post('/inboxes', {
        ...form,
        tracking_domain: addDomain || null,
      });
      setMessage({ type: 'success', text: 'Inbox added' });
      setForm(initialForm);
      setAddTrackingMode('app');
      setAddDomainVerified(false);
      load();
      setShowAdd(false);
    } catch (e) {
      setMessage({ type: 'error', text: e.message });
    }
  };

  const openEdit = (inbox) => {
    setEditing({ ...inbox });
    setEditDirty(false);
    setEditMsg(null);
    setEditingSmtp(null);
    setSmtpTestMsg(null);
    if (inbox.provider === 'smtp') {
      api.get(`/smtp/inboxes/${inbox.id}`)
        .then((d) => setEditingSmtp({
          smtp_host: d.smtp_host || '',
          smtp_port: d.smtp_port || 587,
          smtp_username: d.smtp_username || '',
          smtp_password: '',
          smtp_use_tls: d.smtp_use_tls !== false,
          smtp_use_ssl: !!d.smtp_use_ssl,
          imap_host: d.imap_host || '',
          imap_port: d.imap_port || 993,
          imap_username: d.imap_username || '',
          imap_password: '',
          imap_use_ssl: d.imap_use_ssl !== false,
          _meta: d,
        }))
        .catch(() => setEditingSmtp({
          smtp_host: '', smtp_port: 587, smtp_username: '', smtp_password: '',
          smtp_use_tls: true, smtp_use_ssl: false,
          imap_host: '', imap_port: 993, imap_username: '', imap_password: '',
          imap_use_ssl: true, _meta: null,
        }));
    }
    editOriginalDomain.current = inbox.tracking_domain || '';
    setEditDomainVerified(false);
    setBeaconSetupUrl('');
    setDnsAutoVerifyTrigger(0);
    setEditTrackingMode(
      inbox.beacon_connected
        ? 'beacon'
        : (customTrackingCnameUiEnabled && (inbox.tracking_domain || '').trim() ? 'dns' : 'app'),
    );
  };
  const closeEdit = () => {
    setEditing(null);
    setEditDirty(false);
    setEditingSmtp(null);
    setSmtpTestMsg(null);
  };
  const tryCloseEdit = () => {
    if (editDirty) {
      setEditWarningCloseSidebar(false);
      setShowEditWarning(true);
    } else {
      closeEdit();
    }
  };
  const tryCloseSidebar = () => {
    if (editing && editDirty) {
      setEditWarningCloseSidebar(true);
      setShowEditWarning(true);
    } else {
      closeEdit();
      setSelectedInbox(null);
    }
  };
  const applyEditTrackingMode = (mode) => {
    if (!editing) return;
    if (editing.beacon_connected && mode !== 'beacon') {
      setEditMsg({ type: 'error', text: 'Najpierw rozłącz Beacon, zanim wybierzesz inną metodę śledzenia.' });
      return;
    }
    setEditMsg(null);
    setEditTrackingMode(mode);
    if (mode === 'app' || mode === 'beacon') {
      setEditing(prev => ({ ...prev, tracking_domain: '' }));
      setEditDomainVerified(false);
    }
    setEditDirty(true);
  };

  const applyAddTrackingMode = (mode) => {
    setAddTrackingMode(mode);
    if (mode === 'app' || mode === 'beacon') {
      setForm(f => ({ ...f, tracking_domain: '' }));
      setAddDomainVerified(false);
    }
  };

  const doSave = async () => {
    if (!editing) return;
    const newDomain = editTrackingMode === 'dns' ? (editing.tracking_domain || '').trim() : '';
    const domainChanged = newDomain !== editOriginalDomain.current;
    if (editTrackingMode === 'dns' && newDomain && domainChanged && !editDomainVerified) {
      setEditMsg({ type: 'error', text: 'Please verify the DNS tracking domain before saving.' });
      return;
    }
    setEditDirty(false); // save in progress — don't treat as unsaved
    try {
      const body = {
        display_name: editing.display_name,
        reply_to: (editing.reply_to || '').trim() || null,
        provider: editing.provider,
        max_emails_per_day: editing.max_emails_per_day,
        wait_minutes_between: editing.wait_minutes_between,
        max_jitter_seconds: clampJitterSeconds(editing.max_jitter_seconds ?? 180),
        tracking_domain: newDomain || null,
        ramp_up_enabled: editing.ramp_up_enabled,
        ramp_up_period_days: editing.ramp_up_period_days,
        ramp_up_start: editing.ramp_up_start ?? 1,
        ramp_up_step_size: editing.ramp_up_step_size ?? 1,
      };
      await api.patch(`/inboxes/${editing.id}`, body);
      setEditMsg({ type: 'success', text: 'Skrzynka zaktualizowana' });
      setTimeout(() => { closeEdit(); load(); }, 1000);
    } catch (err) {
      setEditMsg({ type: 'error', text: err.message });
    }
  };
  const saveEdit = async (e) => {
    e.preventDefault();
    await doSave();
  };

  const saveEditingSmtp = async () => {
    if (!editing || !editingSmtp) return;
    setSmtpTestMsg(null);
    try {
      const { _meta, ...payload } = editingSmtp;
      if (!payload.smtp_password && !(_meta?.has_smtp_password)) {
        setSmtpTestMsg({ type: 'error', text: 'SMTP password is required.' });
        return;
      }
      const saved = await api.put(`/smtp/inboxes/${editing.id}`, {
        ...payload, smtp_port: +payload.smtp_port, imap_port: +payload.imap_port,
      });
      setEditingSmtp((prev) => ({ ...prev, smtp_password: '', imap_password: '', _meta: saved }));
      setSmtpTestMsg({ type: 'success', text: 'Ustawienia SMTP zapisane' });
      // SMTP credentials are saved independently of the outer inbox form —
      // don't mark the edit as dirty, or closing the modal would trigger a
      // false "unsaved changes" prompt.
    } catch (err) {
      setSmtpTestMsg({ type: 'error', text: err.message });
    }
  };

  const testEditingSmtp = async () => {
    if (!editing) return;
    setSmtpTesting(true);
    setSmtpTestMsg(null);
    try {
      const res = await api.post(`/smtp/inboxes/${editing.id}/test`, {});
      if (res.ok) {
        setSmtpTestMsg({ type: 'success', text: 'Test połączenia zakończony powodzeniem (SMTP' + (res.imap?.detail?.includes('skipped') ? '' : ' + IMAP') + ')' });
      } else {
        const details = [res.smtp?.error, res.imap?.error].filter(Boolean).join(' ');
        setSmtpTestMsg({ type: 'error', text: `Test połączenia nie powiódł się: ${details || 'unknown error'}` });
      }
      await refreshEditingInbox(editing.id);
    } catch (err) {
      setSmtpTestMsg({ type: 'error', text: err.message });
    } finally {
      setSmtpTesting(false);
    }
  };

  const refreshEditingInbox = async (inboxId) => {
    const data = await api.get('/inboxes');
    setInboxes(data);
    const fresh = data.find((i) => i.id === inboxId);
    if (fresh) {
      setEditing({ ...fresh });
      editOriginalDomain.current = fresh.tracking_domain || '';
      setSelectedInbox((prev) => (prev?.id === fresh.id ? fresh : prev));
    }
  };

  const connectBeacon = async () => {
    if (!editing) return;
    const url = beaconSetupUrl.trim();
    if (!url) {
      setEditMsg({ type: 'error', text: 'Paste the full Beacon setup URL (includes ?token=…).' });
      return;
    }
    setBeaconConnecting(true);
    try {
      await api.post(`/inboxes/${editing.id}/beacon/connect`, { setup_url: url });
      setEditMsg({ type: 'success', text: 'Beacon connected. Custom Caddy tracking domain was cleared.' });
      setBeaconSetupUrl('');
      setEditTrackingMode('beacon');
      await refreshEditingInbox(editing.id);
    } catch (err) {
      setEditMsg({ type: 'error', text: err.message });
    } finally {
      setBeaconConnecting(false);
    }
  };

  const connectBeaconFromSibling = async (sourceInboxId) => {
    if (!editing) return;
    setBeaconConnecting(true);
    setEditMsg(null);
    try {
      await api.post(`/inboxes/${editing.id}/beacon/connect-from`, { source_inbox_id: sourceInboxId });
      setEditMsg({ type: 'success', text: 'Beacon connected using another inbox’s tracker.' });
      setBeaconSetupUrl('');
      setEditTrackingMode('beacon');
      await refreshEditingInbox(editing.id);
    } catch (err) {
      setEditMsg({ type: 'error', text: err.message });
    } finally {
      setBeaconConnecting(false);
    }
  };

  const reuseDnsFromSibling = (domain) => {
    if (!editing || editing.beacon_connected) return;
    const d = (domain || '').trim();
    if (!d) return;
    setEditMsg(null);
    setEditTrackingMode('dns');
    setEditing((prev) => ({ ...prev, tracking_domain: d }));
    setEditDomainVerified(false);
    setEditDirty(true);
    setDnsAutoVerifyTrigger((n) => n + 1);
  };

  const disconnectBeacon = async () => {
    if (!editing) return;
    const ok = await confirm(
      customTrackingCnameUiEnabled
        ? 'Rozłączyć Beacon? Linki śledzące ponownie użyją domeny aplikacji lub własnej domeny CNAME.'
        : 'Rozłączyć Beacon? Linki śledzące będą używać domeny aplikacji do czasu ponownego połączenia Beacon.',
    );
    if (!ok) return;
    try {
      await api.post(`/inboxes/${editing.id}/beacon/disconnect`);
      setEditMsg({ type: 'success', text: 'Beacon disconnected.' });
      setEditTrackingMode('app');
      await refreshEditingInbox(editing.id);
    } catch (err) {
      setEditMsg({ type: 'error', text: err.message });
    }
  };

  // Escape to close modals
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (showEditWarning) { setShowEditWarning(false); }
      else if (showAdd) { setShowAdd(false); setMessage(null); setAddTrackingMode('app'); }
      else if (editing) tryCloseEdit();
      else if (selectedInbox) setSelectedInbox(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showEditWarning, showAdd, editing]); // eslint-disable-line react-hooks/exhaustive-deps

  const deleteInbox = async (id, email) => {
    const ok = await confirm(`Usuń skrzynkę "${email}"?`);
    if (!ok) return;

    const tryDelete = async (reassign = false) => {
      const url = `/inboxes/${id}` + (reassign ? '?reassign=true' : '');
      // helper exposes `del` method for DELETE
      await api.del(url);
    };

    try {
      await tryDelete();
      notify({ type: 'success', message: `Inbox "${email}" deleted` });
      load();
    } catch (e) {
      const msg = e.message || '';
      if (msg.includes('assigned to one or more campaigns') || msg.includes('pending queue slots')) {
        const again = await confirm(
          'Inbox is currently in use.\n' +
          'Assigned leads will be reassigned to other inboxes.'
        );
        if (again) {
          try {
            await tryDelete(true);
            notify({ type: 'success', message: `Inbox "${email}" paused & deleted` });
            load();
            return;
          } catch (e2) {
            notify({ type: 'error', message: 'Error deleting inbox after reassign: ' + e2.message });
            return;
          }
        }
      }
      notify({ type: 'error', message: 'Error deleting inbox: ' + msg });
    }
  };

  const openPauseModal = async (inbox) => {
    if (!inbox.pending_leads) {
      // No pending leads to handle — pause silently without a dialog
      try {
        await api.post(`/inboxes/${inbox.id}/pause`, { action: 'pause_leads' });
        notify({ type: 'success', message: `Skrzynka "${inbox.email}" została wstrzymana` });
        load();
      } catch (e) {
        notify({ type: 'error', message: 'Błąd podczas wstrzymywania skrzynki: ' + e.message });
      }
      return;
    }
    setPausingInbox(inbox);
    setPauseAction('reassign');
    setShowPauseModal(true);
  };

  const confirmPause = async () => {
    if (!pausingInbox) return;
    try {
      await api.post(`/inboxes/${pausingInbox.id}/pause`, {
        action: pauseAction,
      });
      notify({ type: 'success', message: `Skrzynka "${pausingInbox.email}" została wstrzymana` });
      setShowPauseModal(false);
      load();
    } catch (e) {
      notify({ type: 'error', message: 'Błąd podczas wstrzymywania skrzynki: ' + e.message });
    }
  };

  const resumeInbox = async (id, email) => {
    try {
      await api.post(`/inboxes/${id}/unpause`, {});
      notify({ type: 'success', message: `Skrzynka "${email}" została wznowiona` });
      load();
    } catch (e) {
      notify({ type: 'error', message: 'Błąd podczas wznawiania skrzynki: ' + e.message });
    }
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-8">
      {/* header with add button */}
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">Skrzynki</h1>
        <Button variant="default" onClick={() => { setForm(initialForm); setSmtpForm(initialSmtpForm); setAddTrackingMode('app'); setMessage(null); setShowAdd(true); }}>
          Dodaj skrzynkę
        </Button>
      </div>

      {inboxes.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mb-4">
            <svg className="w-7 h-7 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <p className="text-gray-500 text-sm">No inboxes yet. Click <span className="font-medium text-gray-700">Add Inbox</span> to get started.</p>
        </div>
      )}
      {inboxes.length > 0 && (
        <div className="flex gap-5 items-start" style={{ alignItems: 'flex-start' }}>
          {/* ── Inbox card list ── */}
          <div className="flex-1 min-w-0 space-y-2">
            {inboxes.map(inbox => {
              const isSelected = selectedInbox?.id === inbox.id;
              const sentDzisiaj = inbox.sent_today || 0;
              const maxDzisiaj = inbox.effective_max_per_day || inbox.max_emails_per_day;
              const warmupActive = inbox.ramp_up_enabled && inbox.effective_max_per_day < inbox.max_emails_per_day;
              const avatarLetter = (inbox.email || inbox.display_name || 'I')[0].toUpperCase();
              return (
                <button
                  key={inbox.id}
                  onClick={() => { if (isSelected) { tryCloseSidebar(); } else { setSelectedInbox(inbox); } }}
                  className={`w-full text-left rounded-xl border px-5 py-4 transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-blue-400 ${
                    isSelected
                      ? 'border-blue-400 bg-blue-50 shadow-sm'
                      : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
                  }`}
                >
                  <div className="flex items-center justify-between gap-4">
                    {/* Left: avatar + email */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-sm font-semibold shrink-0">
                        {avatarLetter}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 text-sm leading-tight truncate">
                          {inbox.email || '(połączone konto)'}
                        </p>
                        {inbox.display_name && (
                          <p className="text-xs text-gray-500 leading-tight mt-0.5 truncate">{inbox.display_name}</p>
                        )}
                      </div>
                    </div>
                    {/* Right: badges + sent count */}
                    <div className="flex items-center gap-2 shrink-0">
                      {warmupActive && (
                        <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                          Stage {inbox.effective_max_per_day}/{inbox.max_emails_per_day}
                        </span>
                      )}
                      <span className="text-xs text-gray-500">
                        <span className="font-semibold text-gray-800">{sentDzisiaj}</span>
                        <span className="text-gray-400"> / {maxDzisiaj} sent</span>
                      </span>
                      {inbox.paused
                        ? <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">Paused</span>
                        : <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">Aktywna</span>
                      }
                      <svg className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${isSelected ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* ── Detail panel ── */}
          {selectedInbox && (
            <div className="w-[min(28rem,calc(100vw-2.5rem))] shrink-0 bg-white border border-gray-200 rounded-xl shadow-sm flex flex-col overflow-hidden sticky top-4" style={{ maxHeight: 'calc(100vh - 8rem)' }}>
              {editing && editing.id === selectedInbox.id ? (
                <>
                  {/* Edit panel header */}
                  <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                    <h3 className="font-semibold text-gray-900 text-sm">Edit Inbox</h3>
                    <button
                      onClick={tryCloseEdit}
                      className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                      aria-label="Anuluj edycję"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  {/* Edit form */}
                  <div className="px-5 py-4 overflow-y-auto flex-1 min-w-0">
                    {editMsg && <div className={`mb-3 text-sm ${editMsg.type === 'error' ? 'text-red-600' : 'text-green-600'}`}>{editMsg.text}</div>}
                    <form onSubmit={saveEdit} className="space-y-4 min-w-0 max-w-full">
                      <div>
                        <label className="block text-xs font-medium text-gray-700">Email (read-only)</label>
                        <input type="email" value={editing.email} disabled className="mt-1 block w-full border-gray-300 rounded-md bg-gray-100 text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700">Nazwa nadawcy</label>
                        <input type="text" name="display_name" value={editing.display_name || ''} onChange={e => { setEditing(prev => ({ ...prev, display_name: e.target.value })); setEditDirty(true); }} className="mt-1 block w-full border-gray-300 rounded-md text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700">Reply-To</label>
                        <input
                          type="email"
                          value={editing.reply_to || ''}
                          onChange={e => { setEditing(prev => ({ ...prev, reply_to: e.target.value })); setEditDirty(true); }}
                          placeholder={editing.email || 'odpowiedzi@twojadomena.pl'}
                          className="mt-1 block w-full border-gray-300 rounded-md text-sm"
                        />
                        <p className="mt-1 text-[11px] text-gray-400">Opcjonalny adres, na który mają trafiać odpowiedzi. Pozostaw puste, aby użyć adresu skrzynki.</p>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700">Typ skrzynki</label>
                        <select name="provider" value="smtp" className="mt-1 block w-full border-gray-300 rounded-md bg-gray-100 text-sm" disabled>
                          <option value="smtp">SMTP / IMAP</option>
                        </select>
                      </div>
                      {editing.provider === 'smtp' && (
                        <div className="border rounded p-3 space-y-3 bg-gray-50 min-w-0 max-w-full overflow-hidden">
                          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">SMTP / IMAP</p>
                          {smtpTestMsg && <div className={`text-sm ${smtpTestMsg.type === 'error' ? 'text-red-600' : 'text-green-600'}`}>{smtpTestMsg.text}</div>}
                          {!editingSmtp ? (
                            <p className="text-xs text-gray-400">Wczytywanie ustawień SMTP…</p>
                          ) : (
                            <>
                              <div className="grid grid-cols-3 gap-2">
                                <div className="col-span-2">
                                  <label className="block text-xs font-medium text-gray-700">Host SMTP</label>
                                  <input type="text" value={editingSmtp.smtp_host} onChange={e => setEditingSmtp(prev => ({ ...prev, smtp_host: e.target.value }))} className="mt-1 block w-full border-gray-300 rounded-md text-sm" />
                                </div>
                                <div>
                                  <label className="block text-xs font-medium text-gray-700">Port</label>
                                  <input type="number" value={editingSmtp.smtp_port} onChange={e => setEditingSmtp(prev => ({ ...prev, smtp_port: +e.target.value }))} min={1} max={65535} className="mt-1 block w-full border-gray-300 rounded-md text-sm" />
                                </div>
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-700">SMTP username</label>
                                <input type="text" value={editingSmtp.smtp_username} onChange={e => setEditingSmtp(prev => ({ ...prev, smtp_username: e.target.value }))} autoComplete="off" className="mt-1 block w-full border-gray-300 rounded-md text-sm" />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-700">SMTP password {editingSmtp._meta?.has_smtp_password && <span className="text-gray-400 font-normal">(saved — re-enter to change)</span>}</label>
                                <input type="password" value={editingSmtp.smtp_password} onChange={e => setEditingSmtp(prev => ({ ...prev, smtp_password: e.target.value }))} autoComplete="new-password" placeholder={editingSmtp._meta?.has_smtp_password ? '••••••••' : ''} className="mt-1 block w-full border-gray-300 rounded-md text-sm" />
                              </div>
                              <div className="flex gap-4 text-sm text-gray-700">
                                <label className="flex items-center gap-1.5 cursor-pointer text-xs">
                                  <input type="checkbox" checked={!!editingSmtp.smtp_use_tls} onChange={e => setEditingSmtp(prev => ({ ...prev, smtp_use_tls: e.target.checked, smtp_use_ssl: e.target.checked ? false : prev.smtp_use_ssl }))} />
                                  STARTTLS (587)
                                </label>
                                <label className="flex items-center gap-1.5 cursor-pointer text-xs">
                                  <input type="checkbox" checked={!!editingSmtp.smtp_use_ssl} onChange={e => setEditingSmtp(prev => ({ ...prev, smtp_use_ssl: e.target.checked, smtp_use_tls: e.target.checked ? false : prev.smtp_use_tls }))} />
                                  SSL (465)
                                </label>
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-700">IMAP host (optional — reply sync)</label>
                                <input type="text" value={editingSmtp.imap_host} onChange={e => setEditingSmtp(prev => ({ ...prev, imap_host: e.target.value }))} placeholder="Pozostaw puste tylko dla skrzynki wysyłkowej" className="mt-1 block w-full border-gray-300 rounded-md text-sm" />
                              </div>
                              {editingSmtp.imap_host.trim() !== '' && (
                                <>
                                  <div className="grid grid-cols-3 gap-2">
                                    <div>
                                      <label className="block text-xs font-medium text-gray-700">Port</label>
                                      <input type="number" value={editingSmtp.imap_port} onChange={e => setEditingSmtp(prev => ({ ...prev, imap_port: +e.target.value }))} min={1} max={65535} className="mt-1 block w-full border-gray-300 rounded-md text-sm" />
                                    </div>
                                    <div className="col-span-2">
                                      <label className="block text-xs font-medium text-gray-700">Login</label>
                                      <input type="text" value={editingSmtp.imap_username} onChange={e => setEditingSmtp(prev => ({ ...prev, imap_username: e.target.value }))} autoComplete="off" className="mt-1 block w-full border-gray-300 rounded-md text-sm" />
                                    </div>
                                  </div>
                                  <div>
                                    <label className="block text-xs font-medium text-gray-700">IMAP password {editingSmtp._meta?.has_imap_password && <span className="text-gray-400 font-normal">(saved — re-enter to change)</span>}</label>
                                    <input type="password" value={editingSmtp.imap_password} onChange={e => setEditingSmtp(prev => ({ ...prev, imap_password: e.target.value }))} autoComplete="new-password" placeholder={editingSmtp._meta?.has_imap_password ? '••••••••' : ''} className="mt-1 block w-full border-gray-300 rounded-md text-sm" />
                                  </div>
                                </>
                              )}
                              {editingSmtp._meta?.last_tested_at && (
                                <p className={`text-xs ${editingSmtp._meta.last_test_ok ? 'text-green-600' : 'text-red-600'}`}>
                                  Last test: {editingSmtp._meta.last_test_ok ? 'passed' : `failed — ${editingSmtp._meta.last_test_error || 'unknown error'}`}
                                </p>
                              )}
                              <div className="flex gap-2">
                                <Button type="button" size="sm" variant="outline" onClick={saveEditingSmtp}>Zapisz SMTP</Button>
                                <Button type="button" size="sm" variant="outline" onClick={testEditingSmtp} disabled={smtpTesting}>{smtpTesting ? 'Testing…' : 'Testuj połączenie'}</Button>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                      <div>
                        <label className="block text-xs font-medium text-gray-700">Maks. wiadomości dziennie</label>
                        <input type="number" name="max_emails_per_day" value={editing.max_emails_per_day} onChange={e => { setEditing(prev => ({ ...prev, max_emails_per_day: +e.target.value })); setEditDirty(true); }} min={1} max={1000} className="mt-1 block w-full border-gray-300 rounded-md text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700">Odstęp między wiadomościami (minuty)</label>
                        <input type="number" name="wait_minutes_between" value={editing.wait_minutes_between || 5} onChange={e => { setEditing(prev => ({ ...prev, wait_minutes_between: +e.target.value })); setEditDirty(true); }} min={1} max={120} className="mt-1 block w-full border-gray-300 rounded-md text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700">Losowy odstęp wysyłki (minuty)</label>
                        <input
                          type="number"
                          value={jitterInputMinutesFromSeconds(editing.max_jitter_seconds)}
                          onChange={e => { setEditing(prev => ({ ...prev, max_jitter_seconds: jitterSecondsFromInputMinutes(e.target.value) })); setEditDirty(true); }}
                          min={0}
                          max={JITTER_MAX_MINUTES}
                          step={0.5}
                          className="mt-1 block w-full border-gray-300 rounded-md text-sm"
                        />
                        <p className="mt-1 text-xs text-gray-400">Random 0–N minute delay per send (stored as seconds on the server). Set to 0 to disable.</p>
                      </div>
                      <div className="border rounded p-3 space-y-4 bg-gray-50 min-w-0 max-w-full overflow-hidden">
                        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                          Śledzenie
                          {mode === 'development' && devBeaconRegCount !== null && (
                            <span className="normal-case font-normal text-gray-400">
                              {' '}
                              ({devBeaconRegCount} {devBeaconRegCount === 1 ? 'link' : 'links'})
                            </span>
                          )}
                        </p>
                        <InboxTrackingOptions
                          key={editing.id}
                          variant="edit"
                          wrapClassName="space-y-4"
                          radioName="inbox-tracking-edit"
                          cnameUiEnabled={customTrackingCnameUiEnabled}
                          cnameTarget={cnameTarget}
                          uiMode={editTrackingMode}
                          onUiModeChange={applyEditTrackingMode}
                          trackingDomain={editing.tracking_domain || ''}
                          onTrackingDomainChange={(val) => { setEditing(prev => ({ ...prev, tracking_domain: val })); setEditDirty(true); }}
                          onDnsVerifyChange={setEditDomainVerified}
                          beaconConnected={!!editing.beacon_connected}
                          beaconBaseUrl={editing.beacon_base_url}
                          beaconSetupUrl={beaconSetupUrl}
                          onBeaconSetupUrlChange={(v) => { setBeaconSetupUrl(v); setEditDirty(true); }}
                          onConnectBeacon={connectBeacon}
                          onDisconnectBeacon={disconnectBeacon}
                          beaconConnecting={beaconConnecting}
                          siblingInboxesForReuse={inboxes}
                          currentInboxId={editing.id}
                          onBeaconConnectFromSibling={connectBeaconFromSibling}
                          onReuseDnsDomain={reuseDnsFromSibling}
                          dnsAutoVerifyTrigger={dnsAutoVerifyTrigger}
                        />
                      </div>
                      <div className="border rounded p-3 space-y-3 bg-gray-50 min-w-0 max-w-full overflow-hidden">
                        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Rozgrzewanie</p>
                        <div className="space-y-2">
                          <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-gray-700">
                            <input
                              type="checkbox"
                              checked={!!editing.ramp_up_enabled}
                              onChange={e => { setEditing(prev => ({ ...prev, ramp_up_enabled: e.target.checked })); setEditDirty(true); }}
                            />
                            Włącz stopniowe zwiększanie limitu
                          </label>
                          {editing.ramp_up_enabled && (
                            <div className="space-y-2">
                              <div>
                                <label className="block text-xs font-medium text-gray-700">Początkowa liczba wiadomości dziennie</label>
                                <input
                                  type="number"
                                  value={editing.ramp_up_start ?? 1}
                                  onChange={e => { setEditing(prev => ({ ...prev, ramp_up_start: Math.max(1, +e.target.value) })); setEditDirty(true); }}
                                  min={1}
                                  max={editing.max_emails_per_day}
                                  className="mt-1 block w-full border-gray-300 rounded-md text-sm"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-700">Przyrost dzienny</label>
                                <input
                                  type="number"
                                  value={editing.ramp_up_step_size ?? 1}
                                  onChange={e => { setEditing(prev => ({ ...prev, ramp_up_step_size: Math.max(1, +e.target.value) })); setEditDirty(true); }}
                                  min={1}
                                  max={100}
                                  className="mt-1 block w-full border-gray-300 rounded-md text-sm"
                                />
                              </div>
                              <p className="text-xs text-gray-500">
                                Starts at {editing.ramp_up_start ?? 1} email{(editing.ramp_up_start ?? 1) !== 1 ? 's' : ''} on day one, adds {editing.ramp_up_step_size ?? 1} more each day, and turns off automatically once it reaches {editing.max_emails_per_day}.
                                Dzisiaj's limit: <strong>{editing.effective_max_per_day ?? editing.ramp_up_start ?? 1}</strong> / {editing.max_emails_per_day}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2 pt-1">
                        <Button type="submit" size="sm" variant="default">Zapisz</Button>
                        <Button type="button" size="sm" variant="outline" onClick={tryCloseEdit}>Anuluj</Button>
                      </div>
                    </form>
                  </div>
                </>
              ) : (
                <>
                  {/* Panel header */}
                  <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-sm font-semibold shrink-0">
                        {(selectedInbox.email || selectedInbox.display_name || 'I')[0].toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900 text-sm leading-tight truncate">{selectedInbox.email || '(połączone konto)'}</p>
                        {selectedInbox.display_name && (
                          <p className="text-xs text-gray-500 truncate leading-tight mt-0.5">{selectedInbox.display_name}</p>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => setSelectedInbox(null)}
                      className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                      aria-label="Close panel"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  {/* Scrollable content */}
                  <div className="px-5 py-4 space-y-4 overflow-y-auto flex-1">
                    {/* Status + Typ skrzynki row */}
                    <div className="flex items-center justify-between">
                      {selectedInbox.paused
                        ? <span className="text-xs bg-orange-100 text-orange-700 px-2.5 py-1 rounded-full font-medium">Paused</span>
                        : <span className="text-xs bg-green-100 text-green-700 px-2.5 py-1 rounded-full font-medium">Aktywna</span>
                      }
                      <span className="text-xs bg-sky-100 text-sky-700 px-2.5 py-1 rounded-full font-medium capitalize">{selectedInbox.provider || 'smtp'}</span>
                    </div>

                    {/* Sent today */}
                    <div>
                      <div className="flex justify-between items-center mb-1.5">
                        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Dzisiaj</span>
                        <span className="text-sm font-semibold text-gray-900">
                          {selectedInbox.sent_today || 0}
                          <span className="text-gray-400 font-normal"> / {selectedInbox.effective_max_per_day || selectedInbox.max_emails_per_day}</span>
                        </span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-1.5">
                        <div
                          className="bg-blue-500 h-1.5 rounded-full transition-all"
                          style={{ width: `${Math.min(100, ((selectedInbox.sent_today || 0) / (selectedInbox.effective_max_per_day || selectedInbox.max_emails_per_day || 1)) * 100)}%` }}
                        />
                      </div>
                    </div>

                    <hr className="border-gray-100" />

                    {/* Settings */}
                    <div className="space-y-2.5">
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Settings</p>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Max per day</span>
                        <span className="font-medium text-gray-900">{selectedInbox.max_emails_per_day}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Wait between sends</span>
                        <span className="font-medium text-gray-900">{selectedInbox.wait_minutes_between || 5} min</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Send jitter</span>
                        <span className="font-medium text-gray-900">
                          {formatJitterMinutesLabel(selectedInbox.max_jitter_seconds)
                            ?? <span className="text-gray-400">disabled</span>}
                        </span>
                      </div>
                    </div>

                    {/* Rozgrzewanie */}
                    {selectedInbox.ramp_up_enabled && (
                      <>
                        <hr className="border-gray-100" />
                        <div className="space-y-2.5">
                          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Rozgrzewanie</p>
                          {selectedInbox.effective_max_per_day < selectedInbox.max_emails_per_day ? (
                            <>
                              <div className="flex justify-between text-sm">
                                <span className="text-gray-600">Dzisiaj's stage</span>
                                <span className="font-medium text-amber-700">{selectedInbox.effective_max_per_day} / {selectedInbox.max_emails_per_day}</span>
                              </div>
                              <div className="w-full bg-amber-100 rounded-full h-1.5">
                                <div
                                  className="bg-amber-500 h-1.5 rounded-full"
                                  style={{ width: `${Math.min(100, (selectedInbox.effective_max_per_day / (selectedInbox.max_emails_per_day || 1)) * 100)}%` }}
                                />
                              </div>
                            </>
                          ) : (
                            <p className="text-sm text-green-700 font-medium">Complete ✓</p>
                          )}
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-600">Ramp period</span>
                            <span className="font-medium text-gray-900">{Math.ceil((selectedInbox.max_emails_per_day - (selectedInbox.ramp_up_start || 1)) / (selectedInbox.ramp_up_step_size || 1))} days</span>
                          </div>
                        </div>
                      </>
                    )}

                    <hr className="border-gray-100" />

                    {/* Śledzenie domain / Beacon */}
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-600">Śledzenie</span>
                      <span className="font-mono text-xs text-right max-w-[180px] truncate">
                        {selectedInbox.beacon_connected && selectedInbox.beacon_base_url
                          ? <span className="text-indigo-700" title={selectedInbox.beacon_base_url}>Beacon</span>
                          : selectedInbox.tracking_domain
                            ? <span className="text-teal-700">{selectedInbox.tracking_domain}</span>
                            : <span className="text-gray-400">app default</span>}
                      </span>
                    </div>
                    {selectedInbox.beacon_connected && selectedInbox.beacon_base_url && (
                      <p className="text-xs text-gray-500 break-all">{selectedInbox.beacon_base_url}</p>
                    )}

                    {/* Created */}
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-600">Added</span>
                      <span className="text-gray-900">{new Date(selectedInbox.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="px-5 py-4 border-t border-gray-100 space-y-2">
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="flex-1" onClick={() => openEdit(selectedInbox)}>Edit</Button>
                      {selectedInbox.paused
                        ? <Button variant="outline" size="sm" className="flex-1 bg-green-50 text-green-700 border-green-300 hover:bg-green-100" onClick={() => resumeInbox(selectedInbox.id, selectedInbox.email)}>Wznów</Button>
                        : <Button variant="outline" size="sm" className="flex-1 bg-orange-50 text-orange-700 border-orange-300 hover:bg-orange-100" onClick={() => openPauseModal(selectedInbox)}>Wstrzymaj</Button>
                      }
                    </div>
                    <Button variant="danger" size="sm" className="w-full" onClick={() => deleteInbox(selectedInbox.id, selectedInbox.email)}>Usuń skrzynkę</Button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* add modal */}
      {showAdd && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onMouseDown={e => { addBackdropDown.current = e.target === e.currentTarget; }}
          onClick={() => { if (addBackdropDown.current) { setShowAdd(false); setMessage(null); setAddTrackingMode('app'); } }}
        >
          <div data-darkreader-ignore className="p-6 rounded-xl shadow-lg w-full min-w-0 max-w-md max-h-[90vh] overflow-y-auto overflow-x-hidden mx-auto" style={{ backgroundColor: 'white' }} onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-semibold mb-2">Dodaj skrzynkę</h2>
            {message && <div className={message.type === 'error' ? 'text-red-600' : 'text-green-600'}>{message.text}</div>}
            <form onSubmit={submit} className="space-y-4 min-w-0 max-w-full">
              <div>
                <label className="block text-sm font-medium text-gray-700">Typ skrzynki</label>
                <select name="provider" value="smtp" className="mt-1 block w-full border-gray-300 rounded-md bg-gray-100" disabled>
                  <option value="smtp">SMTP / IMAP</option>
                </select>
                <p className="mt-1 text-xs text-gray-400">Sekaro działa z dowolnym dostawcą obsługującym SMTP, a odbiór odpowiedzi realizuje przez IMAP.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Adres e-mail</label>
                <input type="email" name="email" value={form.email} onChange={handleChange} placeholder="ty@twojadomena.pl" className="mt-1 block w-full border-gray-300 rounded-md" />
                <p className="mt-1 text-xs text-gray-400">Adres nadawcy. Powinien odpowiadać kontu używanemu do SMTP.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Nazwa nadawcy</label>
                <input type="text" name="display_name" value={form.display_name} onChange={handleChange} className="mt-1 block w-full border-gray-300 rounded-md" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Reply-To</label>
                <input
                  type="email"
                  name="reply_to"
                  value={form.reply_to}
                  onChange={handleChange}
                  placeholder={form.email || 'odpowiedzi@twojadomena.pl'}
                  className="mt-1 block w-full border-gray-300 rounded-md"
                />
                <p className="mt-1 text-xs text-gray-400">Opcjonalne. Jeśli puste, odpowiedzi trafią na adres nadawcy.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Maks. wiadomości dziennie</label>
                <input type="number" name="max_emails_per_day" value={form.max_emails_per_day} onChange={handleChange} min={1} max={1000} className="mt-1 block w-full border-gray-300 rounded-md" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Odstęp między wiadomościami (minuty)</label>
                <input type="number" name="wait_minutes_between" value={form.wait_minutes_between} onChange={handleChange} min={1} max={120} className="mt-1 block w-full border-gray-300 rounded-md" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Losowy odstęp wysyłki (minuty)</label>
                <input
                  type="number"
                  value={jitterInputMinutesFromSeconds(form.max_jitter_seconds)}
                  onChange={e => setForm(f => ({ ...f, max_jitter_seconds: jitterSecondsFromInputMinutes(e.target.value) }))}
                  min={0}
                  max={JITTER_MAX_MINUTES}
                  step={0.5}
                  className="mt-1 block w-full border-gray-300 rounded-md"
                />
                <p className="mt-1 text-xs text-gray-400">Random 0–N minute delay per send (default 3 min). Set to 0 to disable.</p>
              </div>
              {form.provider === 'smtp' && (
                <div className="border rounded p-3 space-y-3 bg-gray-50 min-w-0 max-w-full overflow-hidden">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">SMTP (outbound)</p>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2">
                      <label className="block text-xs font-medium text-gray-700">Host</label>
                      <input type="text" value={smtpForm.smtp_host} onChange={e => setSmtpForm(f => ({ ...f, smtp_host: e.target.value }))} placeholder="mail.yourdomain.com" className="mt-1 block w-full border-gray-300 rounded-md text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700">Port</label>
                      <input type="number" value={smtpForm.smtp_port} onChange={e => setSmtpForm(f => ({ ...f, smtp_port: +e.target.value }))} min={1} max={65535} className="mt-1 block w-full border-gray-300 rounded-md text-sm" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700">Login</label>
                    <input type="text" value={smtpForm.smtp_username} onChange={e => setSmtpForm(f => ({ ...f, smtp_username: e.target.value }))} autoComplete="off" className="mt-1 block w-full border-gray-300 rounded-md text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700">Hasło</label>
                    <input type="password" value={smtpForm.smtp_password} onChange={e => setSmtpForm(f => ({ ...f, smtp_password: e.target.value }))} autoComplete="new-password" className="mt-1 block w-full border-gray-300 rounded-md text-sm" />
                  </div>
                  <div className="flex gap-4 text-sm text-gray-700">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="checkbox" checked={!!smtpForm.smtp_use_tls} onChange={e => setSmtpForm(f => ({ ...f, smtp_use_tls: e.target.checked, smtp_use_ssl: e.target.checked ? false : f.smtp_use_ssl }))} />
                      STARTTLS (587)
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="checkbox" checked={!!smtpForm.smtp_use_ssl} onChange={e => setSmtpForm(f => ({ ...f, smtp_use_ssl: e.target.checked, smtp_use_tls: e.target.checked ? false : f.smtp_use_tls }))} />
                      SSL (465)
                    </label>
                  </div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide pt-1">IMAP (inbound replies — optional)</p>
                  <div>
                    <label className="block text-xs font-medium text-gray-700">Host</label>
                    <input type="text" value={smtpForm.imap_host} onChange={e => setSmtpForm(f => ({ ...f, imap_host: e.target.value }))} placeholder="Pozostaw puste tylko dla skrzynki wysyłkowej" className="mt-1 block w-full border-gray-300 rounded-md text-sm" />
                  </div>
                  {smtpForm.imap_host.trim() !== '' && (
                    <>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="block text-xs font-medium text-gray-700">Port</label>
                          <input type="number" value={smtpForm.imap_port} onChange={e => setSmtpForm(f => ({ ...f, imap_port: +e.target.value }))} min={1} max={65535} className="mt-1 block w-full border-gray-300 rounded-md text-sm" />
                        </div>
                        <div className="col-span-2">
                          <label className="block text-xs font-medium text-gray-700">Login</label>
                          <input type="text" value={smtpForm.imap_username} onChange={e => setSmtpForm(f => ({ ...f, imap_username: e.target.value }))} autoComplete="off" className="mt-1 block w-full border-gray-300 rounded-md text-sm" />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700">Hasło</label>
                        <input type="password" value={smtpForm.imap_password} onChange={e => setSmtpForm(f => ({ ...f, imap_password: e.target.value }))} autoComplete="new-password" className="mt-1 block w-full border-gray-300 rounded-md text-sm" />
                      </div>
                      <label className="flex items-center gap-1.5 cursor-pointer text-sm text-gray-700">
                        <input type="checkbox" checked={!!smtpForm.imap_use_ssl} onChange={e => setSmtpForm(f => ({ ...f, imap_use_ssl: e.target.checked }))} />
                        SSL/TLS (zwykle 993); odznaczone = STARTTLS
                      </label>
                    </>
                  )}
                  <p className="text-xs text-gray-400">Połączenie zostanie automatycznie przetestowane po dodaniu skrzynki.</p>
                </div>
              )}
              <div className="border rounded p-3 space-y-4 bg-gray-50 min-w-0 max-w-full overflow-hidden">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Śledzenie</p>
                <InboxTrackingOptions
                  variant="add"
                  wrapClassName="space-y-4"
                  radioName="inbox-tracking-add"
                  cnameUiEnabled={customTrackingCnameUiEnabled}
                  cnameTarget={cnameTarget}
                  uiMode={addTrackingMode}
                  onUiModeChange={applyAddTrackingMode}
                  trackingDomain={form.tracking_domain}
                  onTrackingDomainChange={(val) => { setForm(f => ({ ...f, tracking_domain: val })); setAddDomainVerified(false); }}
                  onDnsVerifyChange={setAddDomainVerified}
                  beaconConnected={false}
                  beaconBaseUrl=""
                  beaconSetupUrl=""
                  onBeaconSetupUrlChange={() => {}}
                  onConnectBeacon={() => {}}
                  onDisconnectBeacon={() => {}}
                  beaconConnecting={false}
                />
              </div>
              <div className="border rounded p-3 space-y-3 bg-gray-50 min-w-0 max-w-full overflow-hidden">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Rozgrzewanie</p>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-gray-700">
                    <input
                      type="checkbox"
                      checked={!!form.ramp_up_enabled}
                      onChange={e => setForm(f => ({ ...f, ramp_up_enabled: e.target.checked }))}
                    />
                    Włącz stopniowe zwiększanie limitu
                  </label>
                  {form.ramp_up_enabled && (
                    <div className="space-y-2">
                      <div>
                        <label className="block text-xs font-medium text-gray-700">Początkowa liczba wiadomości dziennie</label>
                        <input
                          type="number"
                          value={form.ramp_up_start}
                          onChange={e => setForm(f => ({ ...f, ramp_up_start: Math.max(1, +e.target.value) }))}
                          min={1}
                          max={form.max_emails_per_day}
                          className="mt-1 block w-full border-gray-300 rounded-md text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700">Przyrost dzienny</label>
                        <input
                          type="number"
                          value={form.ramp_up_step_size}
                          onChange={e => setForm(f => ({ ...f, ramp_up_step_size: Math.max(1, +e.target.value) }))}
                          min={1}
                          max={100}
                          className="mt-1 block w-full border-gray-300 rounded-md text-sm"
                        />
                      </div>
                      <p className="text-xs text-gray-500">
                        Starts at {form.ramp_up_start} email{form.ramp_up_start !== 1 ? 's' : ''} on day one, adds {form.ramp_up_step_size} more each day, and turns off automatically once it reaches {form.max_emails_per_day}.
                      </p>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={!canSubmit()} variant="default">
                  Dodaj skrzynkę
                </Button>
                <Button type="button" variant="outline" onClick={() => { setShowAdd(false); setMessage(null); setAddTrackingMode('app'); }}>
                  Anuluj
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}



      {/* Unsaved changes warning for inbox edit */}
      {showEditWarning && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
          <div data-darkreader-ignore className="rounded-xl shadow-lg p-6 w-full max-w-sm mx-auto" style={{ backgroundColor: 'white' }}>
            <h3 className="font-semibold text-gray-800 mb-1">Zapisać zmiany?</h3>
            <p className="text-sm text-gray-500 mb-4">Masz niezapisane zmiany w tej skrzynce.</p>
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="outline" onClick={() => { setShowEditWarning(false); setEditWarningCloseSidebar(false); }}>Kontynuuj edycję</Button>
              <Button size="sm" variant="destructive" onClick={() => { setShowEditWarning(false); closeEdit(); if (editWarningCloseSidebar) { setSelectedInbox(null); setEditWarningCloseSidebar(false); } }}>Odrzuć</Button>
              <Button size="sm" variant="default" onClick={async () => { setShowEditWarning(false); setEditWarningCloseSidebar(false); await doSave(); }}>Zapisz</Button>
            </div>
          </div>
        </div>
      )}

      {/* Wstrzymaj inbox modal */}
      {showPauseModal && pausingInbox && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div data-darkreader-ignore className="bg-white p-6 rounded-xl shadow-lg w-full max-w-md mx-auto">
            <h2 className="text-xl font-semibold mb-1">Wstrzymaj skrzynkę</h2>
            <p className="text-sm text-gray-500 mb-4">
              Wstrzymujesz <span className="font-mono font-medium">{pausingInbox.email}</span>. Co zrobić z kontaktami przypisanymi do tej skrzynki?
            </p>

            <div className="space-y-3 mb-5">
              <label className="flex items-start gap-3 cursor-pointer p-3 border rounded-lg hover:bg-gray-50 transition-colors">
                <input
                  type="radio"
                  className="mt-0.5 shrink-0"
                  checked={pauseAction === 'reassign'}
                  onChange={() => setPauseAction('reassign')}
                />
                <div>
                  <p className="text-sm font-medium text-gray-800">Przypisz do innej skrzynki</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Kolejka zostanie przeliczona, a kontakty automatycznie rozdzielone pomiędzy pozostałe aktywne skrzynki.
                  </p>
                </div>
              </label>

              <label className="flex items-start gap-3 cursor-pointer p-3 border rounded-lg hover:bg-gray-50 transition-colors">
                <input
                  type="radio"
                  className="mt-0.5 shrink-0"
                  checked={pauseAction === 'pause_leads'}
                  onChange={() => setPauseAction('pause_leads')}
                />
                <div>
                  <p className="text-sm font-medium text-gray-800">Wstrzymaj wszystkie przypisane kontakty</p>
                  <p className="text-xs text-gray-500 mt-0.5">Wysyłka zostanie wstrzymana dla kontaktów, których następna wiadomość miała wyjść z tej skrzynki. Możesz wznowić je później.</p>
                </div>
              </label>
            </div>

            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="outline" onClick={() => setShowPauseModal(false)}>Anuluj</Button>
              <Button
                size="sm"
                variant="default"
                onClick={confirmPause}
              >
                Wstrzymaj skrzynkę
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
