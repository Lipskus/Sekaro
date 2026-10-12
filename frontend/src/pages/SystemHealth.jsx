import {useOperationsLanguage} from '../context/operationsLanguage';
import { parseApiDate } from '../utils/datetime';
import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useSystemHealth } from '../context/SystemHealthContext';
import { useAppMode } from '../context/AppModeContext';
import {
  RiRefreshLine,
  RiCheckboxCircleLine,
  RiErrorWarningLine,
  RiCloseCircleLine,
  RiQuestionLine,
  RiNotificationOffLine,
  RiNotificationLine,
  RiInboxLine,
  RiRobot2Line,
  RiSettings3Line,
  RiArrowRightSLine,
  RiShieldCheckLine,
  RiTimeLine,
  RiCheckLine,
  RiGlobalLine,
  RiHardDrive2Line,
} from 'react-icons/ri';
import { PageFrame, Metric, Button, ErrorNotice, StatePanel, Panel, Badge } from '../redesign/ui';

/* ─── helpers ───────────────────────────────────────────────────────────── */

function statusColor(status) {
  switch (status) {
    case 'error':   return { dot: 'bg-red-500',    text: 'text-red-500',    border: 'border-red-200',    bg: 'bg-red-50',    badge: 'bg-red-100 text-red-700' };
    case 'warning': return { dot: 'bg-yellow-400', text: 'text-yellow-600', border: 'border-yellow-200', bg: 'bg-yellow-50', badge: 'bg-yellow-100 text-yellow-700' };
    case 'ok':      return { dot: 'bg-green-500',  text: 'text-green-600',  border: 'border-green-200',  bg: 'bg-green-50',  badge: 'bg-green-100 text-green-700' };
    default:        return { dot: 'bg-gray-400',   text: 'text-gray-500',   border: 'border-gray-200',   bg: 'bg-gray-50',   badge: 'bg-gray-100 text-gray-600' };
  }
}

function statusLabel(status) {
  switch (status) {
    case 'error':   return 'Błąd';
    case 'warning': return 'Ostrzeżenie';
    case 'ok':      return 'OK';
    default:        return 'Nieznany';
  }
}

function StatusIcon({ status, size = 18 }) {
  const cls = statusColor(status).text;
  switch (status) {
    case 'error':   return <RiCloseCircleLine    size={size} className={cls} />;
    case 'warning': return <RiErrorWarningLine   size={size} className={cls} />;
    case 'ok':      return <RiCheckboxCircleLine size={size} className={cls} />;
    default:        return <RiQuestionLine       size={size} className={cls} />;
  }
}

function IssueLevelIcon({ level }) {
  if (level === 'error')   return <RiCloseCircleLine   size={14} className="text-red-500    flex-shrink-0 mt-0.5" />;
  if (level === 'warning') return <RiErrorWarningLine  size={14} className="text-yellow-500 flex-shrink-0 mt-0.5" />;
  return                          <RiCheckLine          size={14} className="text-green-500  flex-shrink-0 mt-0.5" />;
}

function CategoryIcon({ icon, size = 20 }) {
  const cls = 'flex-shrink-0';
  switch (icon) {
    case 'inbox':       return <RiInboxLine      size={size} className={cls} />;
    case 'sync':        return <RiRefreshLine    size={size} className={cls} />;
    case 'ai':          return <RiRobot2Line     size={size} className={cls} />;
    case 'settings':    return <RiSettings3Line  size={size} className={cls} />;
    case 'verify':      return <RiShieldCheckLine size={size} className={cls} />;
    case 'domain':      return <RiGlobalLine      size={size} className={cls} />;
    case 'storage':     return <RiHardDrive2Line size={size} className={cls} />;
    default:            return <RiShieldCheckLine size={size} className={cls} />;
  }
}

function RelativeTime({ date }) {
 const {ct,language}=useOperationsLanguage();
  if (!date) return null;
  const seconds=Math.round((Date.now()-date)/1000);
  const unit=seconds<60?'second':seconds<3600?'minute':'hour';
  const amount=unit==='second'?seconds:unit==='minute'?Math.floor(seconds/60):Math.floor(seconds/3600);
  const label=seconds<10?ct('przed chwilą'):new Intl.RelativeTimeFormat(language,{numeric:'always'}).format(-amount,unit);
  return <span className="text-gray-400 text-xs">{label}</span>;
}

/* ─── Overall summary header ────────────────────────────────────────────── */

function OverallHeader({ status, loading, lastChecked, onRefresh, issueCount }) {
 const {ct,language}=useOperationsLanguage();
  const col = statusColor(status);

  const heroMessages = {
    error:   { headline: 'Wymagana reakcja',       sub: 'Co najmniej jeden element wymaga uwagi.' },
    warning: { headline: 'Wykryto ostrzeżenia',    sub: 'Niektóre elementy wymagają sprawdzenia.' },
    ok:      { headline: 'Wszystko wygląda dobrze', sub: 'Monitorowane elementy działają poprawnie.' },
    unknown: { headline: 'Stan nieznany',          sub: 'Nie udało się pobrać danych diagnostycznych.' },
  };
  const msg = loading && status === 'unknown'
    ? { headline: 'Sprawdzanie systemu', sub: 'Pobieramy aktualny stan usług i zasobów.' }
    : (heroMessages[status] || heroMessages.unknown);
  const summary = status === 'ok' || status === 'unknown'
    ? ct(msg.sub)
    : ct('Problemy: {count} — {summary}',{count:issueCount,summary:ct(msg.sub)});

  return (
    <div className={`sk-health-summary sk-health-summary-${status} rounded-xl border p-6 flex items-center justify-between gap-4`}>
      <div className="flex items-center gap-4">
        {/* animated dot */}
        <div className="relative flex-shrink-0">
          <span className={`block w-5 h-5 rounded-full ${col.dot}`} />
          {(status === 'error' || status === 'warning') && (
            <span className={`absolute inset-0 rounded-full ${col.dot} animate-ping opacity-50`} />
          )}
        </div>
        <div>
          <h2 className={`text-xl font-semibold ${col.text}`}>{ct(msg.headline)}</h2>
          <p className="text-sm text-gray-500 mt-0.5">{summary}</p>
        </div>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        {lastChecked && (
          <div className="hidden sm:flex items-center gap-1.5 text-gray-400 text-xs">
            <RiTimeLine size={13} />
            <span> {ct("Sprawdzono")} <RelativeTime date={lastChecked} /></span>
          </div>
        )}
        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={loading}
            className="sk-btn"
          >
            <RiRefreshLine size={15} className={loading ? 'animate-spin' : ''} />
            {loading ? ct("Sprawdzanie…") : ct("Odśwież")}
          </button>
        )}
      </div>
    </div>
  );
}

/* ─── Individual check card ─────────────────────────────────────────────── */

function CheckCard({ check, muted, onToggleMute }) {
 const {ct,language}=useOperationsLanguage();
  const isMuted = muted.has(check.id);
  const displayStatus = check.status;
  const col = statusColor(displayStatus);
  const isHealthy = check.status === 'ok';

  return (
    <div
      className={`sk-health-check sk-health-check-${displayStatus} rounded-xl border bg-white shadow-sm flex flex-col overflow-hidden transition-opacity ${
        isMuted ? 'opacity-60' : ''
      } ${col.border}`}
    >
      {/* Card header */}
      <div className={`sk-health-check-head flex items-center justify-between px-4 py-3 ${col.bg} border-b ${col.border}`}>
        <div className="flex items-center gap-2.5">
          <div className={col.text}>
            <CategoryIcon icon={check.icon} size={18} />
          </div>
          <span className="font-semibold text-gray-800 text-sm">{check.label}</span>
          {isMuted && (
            <span className="text-xs text-gray-400 italic"> {ct("(wyciszone)")} </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${col.badge}`}>
            {isMuted ? ct("Wyciszone") : ct(statusLabel(check.status))}
          </span>
          <button
            onClick={() => onToggleMute(check.id)}
            title={isMuted ? ct("Włącz ostrzeżenia dla tej kategorii") : ct("Wycisz tę kategorię")}
            className="text-gray-400 hover:text-gray-600 transition-colors p-0.5 rounded"
          >
            {isMuted
              ? <RiNotificationLine     size={16} />
              : <RiNotificationOffLine  size={16} />}
          </button>
        </div>
      </div>

      {/* Card body */}
      <div className="px-4 py-3 flex-1 flex flex-col gap-3">
        {/* Summary line */}
        <p className="text-sm text-gray-500">{check.detail}</p>

        {/* Issues list */}
        {check.issues.length > 0 && !isMuted ? (
          <ul className="space-y-2">
            {check.issues.map((issue, i) => (
              <li key={i} className="flex flex-col gap-1">
                <div className="flex items-start gap-1.5">
                  <IssueLevelIcon level={issue.level} />
                  <span className="text-sm text-gray-700 leading-snug">{issue.text}</span>
                </div>
                {issue.fix && (
                  <div className="ml-5 flex items-start gap-1.5 flex-wrap">
                    <span className="text-xs text-gray-400">→</span>
                    <span className="text-xs text-gray-500 leading-snug">{issue.fix}</span>
                    {issue.action && (
                      <Link
                        to={issue.action.to}
                        className="text-xs font-medium px-2 py-0.5 rounded bg-teal-100 text-teal-700 hover:bg-teal-200 border border-teal-200 inline-flex items-center gap-1 flex-shrink-0 transition-colors"
                      >
                        {issue.action.label}
                        <RiArrowRightSLine size={12} />
                      </Link>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : isHealthy || isMuted ? (
          <div className={`flex items-center gap-1.5 text-xs font-medium ${isMuted ? 'text-gray-500' : 'text-green-600'}`}>
            {isMuted ? <RiNotificationOffLine size={14} /> : <RiCheckboxCircleLine size={14} />}
            <span>{isMuted ? ct("Powiadomienia dla tej kategorii są wyciszone; stan nadal wpływa na ocenę systemu.") : ct("Nie wykryto problemów")}</span>
          </div>
        ) : null}

        {/* Extra meta for specific checks */}
        <CheckMeta check={check} />
      </div>
    </div>
  );
}

/* ─── Per-check extra metadata ──────────────────────────────────────────── */

function CheckMeta({ check }) {
 const {ct,language}=useOperationsLanguage();
  const { isProduction } = useAppMode();
  if (check.id === 'inbox_status' && check.meta.inboxList?.length > 0) {
    return (
      <div className="mt-1 space-y-1.5 border-t border-gray-100 pt-2">
        <p className="text-xs text-gray-400 font-medium uppercase tracking-wide"> {ct("Skrzynki")} </p>
        {check.meta.inboxList.map(inbox => (
          <div key={inbox.id} className="flex items-center justify-between gap-2 text-sm">
            <span className="text-gray-700 truncate">{inbox.display_name || inbox.email}</span>
            {inbox.paused
              ? <span className="text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-full font-medium"> {ct("Wstrzymana")} </span>
              : <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-medium"> {ct("Aktywna")} </span>
            }
          </div>
        ))}
      </div>
    );
  }

  if (check.id === 'unibox_sync') {
    return (
      <div className="mt-1 border-t border-gray-100 pt-2 space-y-1.5">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500"> {ct("Tryb synchronizacji")} </span>
          {check.meta.pushEnabled
            ? <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-medium"> {ct("Włączony")} </span>
            : <span className="text-xs bg-gray-100  text-gray-600  px-1.5 py-0.5 rounded-full font-medium"> {ct("Odpytywanie")} </span>
          }
        </div>
        {check.meta.syncInProgress && (
          <div className="flex items-center gap-1.5 text-xs text-blue-600">
            <RiRefreshLine size={13} className="animate-spin" />
            <span> {ct("Trwa synchronizacja skrzynek:")} {check.meta.inflightIds.length}</span>
          </div>
        )}
      </div>
    );
  }

  if (check.id === 'ai_features' && check.meta.allFeatures?.length > 0) {
    return (
      <div className="mt-1 space-y-1.5 border-t border-gray-100 pt-2">
        <p className="text-xs text-gray-400 font-medium uppercase tracking-wide"> {ct("Funkcje")} </p>
        {check.meta.allFeatures.map(f => (
          <div key={f.id} className="flex flex-col gap-0.5">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className={`truncate ${f.enabled ? 'text-gray-700' : 'text-gray-400'}`}>{f.label}</span>
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${
                !f.enabled
                  ? 'bg-gray-100 text-gray-500'
                  : !f.api_key_set
                    ? 'bg-yellow-100 text-yellow-700'
                    : f.last_error
                      ? 'bg-red-100 text-red-700'
                      : !f.connection_tested
                        ? 'bg-orange-100 text-orange-700'
                        : 'bg-green-100 text-green-700'
              }`}>
                {!f.enabled ? ct("Wyłączona") : !f.api_key_set ? ct("Brak klucza") : f.last_error ? ct("Błąd") : !f.connection_tested ? ct("Nieprzetestowana") : 'OK'}
              </span>
            </div>
            {f.enabled && f.last_error && (
              <p className="text-xs text-red-400 truncate ml-1">
                {f.last_error_at ? parseApiDate(f.last_error_at).toLocaleString(language) + ': ' : ''}{f.last_error}
              </p>
            )}
          </div>
        ))}
      </div>
    );
  }

  if (check.id === 'email_verification') {
    const ev = check.meta.emailVerification;
    if (!ev) return null;
    return (
      <div className="mt-1 border-t border-gray-100 pt-2 space-y-1.5">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500"> {ct("Status")} </span>
          {!ev.enabled
            ? <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full font-medium"> {ct("Wyłączona")} </span>
            : ev.connection_tested
              ? <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-medium"> {ct("Przetestowano ✓")} </span>
              : <span className="text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full font-medium"> {ct("Nieprzetestowano")} </span>
          }
        </div>
        {ev.enabled && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500"> {ct("Dostawca")} </span>
            <span className="text-gray-700 text-xs font-medium">{ev.provider}</span>
          </div>
        )}
        {ev.last_error && (
          <p className="text-xs text-red-400 truncate">
            {ev.last_error_at ? parseApiDate(ev.last_error_at).toLocaleString(language) + ': ' : ''}{ev.last_error}
          </p>
        )}
      </div>
    );
  }

  if (check.id === 'active_settings') {
    if (isProduction) return null;
    return (
      <div className="mt-1 border-t border-gray-100 pt-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500"> {ct("Tryb testowy")} </span>
          {check.meta.testMode
            ? <span className="text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-full font-medium"> {ct("Aktywny")} </span>
            : <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-medium"> {ct("Wyłączony")} </span>
          }
        </div>
      </div>
    );
  }

  if (check.id === 'tracking_domains' && check.meta.inboxesWithDomains?.length > 0) {
    return (
      <div className="mt-1 space-y-2 border-t border-gray-100 pt-2">
        <p className="text-xs text-gray-400 font-medium uppercase tracking-wide"> {ct("Domeny")} </p>
        {check.meta.inboxesWithDomains.map(inbox => (
          <div key={inbox.id} className="flex flex-col gap-0.5">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="text-gray-700 truncate">{inbox.display_name || inbox.email}</span>
              {inbox.tracking_domain_status === 'ok'
                ? <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-medium"> {ct("Połączona")} </span>
                : <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-medium"> {ct("Niepołączona")} </span>
              }
            </div>
            <p className="text-xs text-gray-400 ml-1">{inbox.tracking_domain}</p>
          </div>
        ))}
      </div>
    );
  }

  return null;
}

/* ─── Main page ─────────────────────────────────────────────────────────── */

export default function SystemHealth() {
 const {ct,language}=useOperationsLanguage();
  const { checks, loading, lastChecked, fetchError, refresh, muted, toggleMute, overallStatus, rawData } = useSystemHealth();

  const [filter, setFilter] = useState('all');
  const issueCount = checks.reduce((n, c) => n + c.issues.filter(issue => ['error', 'warning'].includes(issue.level)).length, 0);
  const errorChecks = checks.filter(check => check.status === 'error').length;
  const warningChecks = checks.filter(check => check.status === 'warning').length;
  const okChecks = checks.filter(check => check.status === 'ok').length;
  const diagnosticsAvailable = !!rawData && !fetchError;
  const mailboxCount = rawData?.inboxes?.length || rawData?.smtp?.accounts?.length || 0;
  const storageUsed = diagnosticsAvailable && rawData?.storage?.available && rawData.storage.used_percent != null && Number.isFinite(Number(rawData.storage.used_percent))
    ? Math.max(0, Math.min(100, Number(rawData.storage.used_percent) || 0))
    : null;

  const mutedCount = checks.filter(c => muted.has(c.id)).length;

  const STATUS_RANK = { error: 3, warning: 2, ok: 1, unknown: 0 };
  const sortedChecks = [...checks].sort((a, b) => {
    const aIsMuted = muted.has(a.id);
    const bIsMuted = muted.has(b.id);
    if (aIsMuted !== bIsMuted) return aIsMuted ? 1 : -1;
    return (STATUS_RANK[b.status] ?? 0) - (STATUS_RANK[a.status] ?? 0);
  });

  const visibleChecks = sortedChecks.filter(check => filter === 'all' || (filter === 'attention' ? ['warning', 'error'].includes(check.status) : check.status === filter));

  const unmuteAll = useCallback(() => {
    checks.forEach(c => { if (muted.has(c.id)) toggleMute(c.id); });
  }, [checks, muted, toggleMute]);

  return (
    <PageFrame
      className="sk-system-health-page"
      title={ct("Stan systemu")}
      description={ct("Stan skrzynek SMTP/IMAP, synchronizacji, śledzenia i konfiguracji funkcji Sekaro.")}
      actions={mutedCount > 0 ? <Button variant="outline" onClick={unmuteAll}>{ct('Wyłącz wyciszenie ({count})',{count:mutedCount})}</Button> : null}
    >
      <ErrorNotice error={fetchError ? ct('Nie udało się pobrać diagnostyki: {error}',{error:fetchError}) : null} onRetry={refresh} />

      <div className="sk-health-metrics">
        <Metric
          icon="shield"
          title={ct("Status systemu")}
          value={overallStatus === 'error' ? ct("Błąd") : overallStatus === 'warning' ? ct("Ostrzeżenie") : overallStatus === 'ok' ? ct("Dostępny") : ct("Nieznany")}
          detail={!diagnosticsAvailable ? ct("Oczekiwanie na dane diagnostyczne") : issueCount ? ct('Problemy do sprawdzenia: {count}',{count:issueCount}) : ct("Brak aktywnych problemów")}
          tone={overallStatus === 'error' ? 'red' : overallStatus === 'warning' ? 'amber' : overallStatus === 'ok' ? 'green' : 'neutral'}
        />
        <Metric icon="mail" title="SMTP / IMAP" value={diagnosticsAvailable ? mailboxCount : '—'} detail={!diagnosticsAvailable ? ct("brak danych o skrzynkach") : mailboxCount ? ct("skonfigurowane skrzynki") : ct("brak skrzynek — blokada")} tone={!diagnosticsAvailable ? 'neutral' : mailboxCount ? 'green' : 'red'} />
        <Metric icon="server" title={ct("Kontrole")} value={diagnosticsAvailable ? checks.length : '—'} detail={diagnosticsAvailable ? ct('{ok} OK · ostrzeżenia: {warnings} · błędy: {errors}',{ok:okChecks,warnings:warningChecks,errors:errorChecks}) : ct("brak wyników kontroli")} tone={!diagnosticsAvailable ? 'neutral' : errorChecks ? 'red' : warningChecks ? 'amber' : 'green'} />
        <Metric icon="chart" title={ct("Dysk")} value={storageUsed == null ? '—' : `${storageUsed.toFixed(0)}%`} detail={storageUsed != null ? ct("wykorzystanie magazynu danych") : ct("brak danych o pojemności")} tone={storageUsed == null ? 'neutral' : storageUsed >= 95 ? 'red' : storageUsed >= 85 ? 'amber' : 'green'} />
      </div>

      <OverallHeader
        status={overallStatus}
        loading={loading}
        lastChecked={lastChecked}
        issueCount={issueCount}
        onRefresh={refresh}
      />

      <div className="sk-health-tools">
        <Panel title={ct("Szybkie działania")} icon="settings"><div className="sk-health-action-list"><Button to="/inboxes" icon="mail"> {ct("Testy SMTP / IMAP")} </Button><Button to="/settings#backup-restore" icon="history"> {ct("Kopie zapasowe")} </Button><Button to="/domains" icon="globe"> {ct("Sprawdź domeny")} </Button><Button to="/schedule" icon="calendar"> {ct("Kolejka wysyłki")} </Button></div></Panel>
        <Panel title={ct("Legenda statusów")} icon="info"><dl className="sk-health-status-legend"><div><dt><Badge tone="green">OK</Badge></dt><dd> {ct("Kontrola nie wykryła problemów.")} </dd></div><div><dt><Badge tone="amber"> {ct("Ostrzeżenie")} </Badge></dt><dd> {ct("Konfiguracja wymaga sprawdzenia.")} </dd></div><div><dt><Badge tone="red"> {ct("Błąd")} </Badge></dt><dd> {ct("Wymagana reakcja administratora.")} </dd></div></dl></Panel>
      </div>
      {diagnosticsAvailable && <div className="sk-health-filter"><label> {ct("Wyniki kontroli")} <select value={filter} onChange={e => setFilter(e.target.value)}><option value="all"> {ct("Wszystkie")} </option><option value="attention"> {ct("Wymagające uwagi")} </option><option value="error"> {ct("Błędy")} </option><option value="warning"> {ct("Ostrzeżenia")} </option><option value="ok">OK</option></select></label><span>{ct('{visible} z {total} kontroli',{visible:visibleChecks.length,total:checks.length})}</span></div>}
      {diagnosticsAvailable && checks.length > 0 ? (
        <div className="sk-health-grid">
          {visibleChecks.map(check => (
            <CheckCard
              key={check.id}
              check={check}
              muted={muted}
              onToggleMute={toggleMute}
            />
          ))}
          {!visibleChecks.length && <StatePanel icon="shield" title={ct("Brak wyników dla tego filtra")} description={ct("Wybierz inny status kontroli.")} />}
        </div>
      ) : loading ? (
        <StatePanel tone="info" icon="refresh" title={ct("Wczytywanie diagnostyki")} description={ct("Sprawdzamy usługi, skrzynki i konfigurację Sekaro.")} />
      ) : (
        <StatePanel tone="warning" icon="warning" title={ct("Brak danych diagnostycznych")} description={lastChecked ? ct('Ostatni udany pomiar: {time}. Wyniki są nieaktualne — odśwież diagnostykę.',{time:lastChecked.toLocaleString(language)}) : ct("Uruchom ponownie diagnostykę systemu.")} actions={<Button onClick={refresh}> {ct("Sprawdź ponownie")} </Button>} />
      )}

      <p className="sk-health-footer"> {ct("Dane diagnostyczne odświeżają się automatycznie co 5 minut. Wyciszenie ukrywa szczegóły kategorii, ale nie zmienia rzeczywistej oceny stanu systemu.")} </p>
    </PageFrame>
  );
}
