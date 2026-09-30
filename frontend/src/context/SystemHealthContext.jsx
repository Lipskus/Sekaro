import {useOperationsLanguage} from './operationsLanguage';
import { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { api } from '../api';
import { useAuth } from './AuthContext';

const SystemHealthContext = createContext(null);

const MUTE_KEY = 'sekaro_health_muted_v1';
const AUTO_REFRESH_MS = 5 * 60 * 1000;

function formatBytes(value,language='pl') {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  const gb = bytes / (1024 ** 3);
  if (gb >= 1) return `${gb.toLocaleString(language, { maximumFractionDigits: gb >= 100 ? 0 : 1 })} GB`;
  const mb = bytes / (1024 ** 2);
  return `${mb.toLocaleString(language, { maximumFractionDigits: 0 })} MB`;
}

function loadMuted() {
  try {
    return new Set(JSON.parse(localStorage.getItem(MUTE_KEY) || '[]'));
  } catch {
    return new Set();
  }
}

function saveMuted(set) {
  localStorage.setItem(MUTE_KEY, JSON.stringify([...set]));
}

async function fetchAllHealthData() {
  return api.get('/system-health');
}

export function buildChecks(d,ct=(s,p={})=>s.replace(/\{(\w+)\}/g,(m,k)=>p[k]??m),language='pl') {
  if (!d) return [];

  const {
    security = {},
    smtp = { accounts: [] },
    inboxes: inboxList = [],
    unibox_sync,
    ai_features: rawAi = [],
    email_verification: evData = null,
    flags,
    storage = null,
    beacon_reconciliation: beaconReconciliation = null,
  } = d;

  const checks = [];

  /* ── Secrets at rest ─────────────────────────────────────────── */
  const externalEncryptionKey = Boolean(security?.external_mailbox_encryption_key);
  const smtpAccountCount = Number(security?.smtp_account_count || 0);
  checks.push({
    id: 'mailbox_encryption',
    label: ct("Szyfrowanie haseł skrzynek"),
    icon: 'verify',
    status: externalEncryptionKey ? 'ok' : 'warning',
    issues: externalEncryptionKey
      ? []
      : [{
          level: 'warning',
          text: ct("SEKARO_ENCRYPTION_KEY nie jest ustawiony w środowisku serwera."),
          fix: smtpAccountCount > 0
            ? ct("Skrzynki już istnieją — nie zmieniaj klucza w ciemno. Przed rotacją wykonaj kopię i migrację sekretów.")
            : ct("Przed dodaniem pierwszej skrzynki ustaw losowy SEKARO_ENCRYPTION_KEY w pliku .env i zrestartuj aplikację."),
        }],
    meta: { externalEncryptionKey, smtpAccountCount },
    detail: externalEncryptionKey
      ? ct("Klucz szyfrowania jest oddzielony od bazy danych")
      : ct("Tryb kompatybilności — klucz nie jest dostarczony z .env"),
  });

  /* ── SMTP / IMAP ─────────────────────────────────────────────── */
  const smtpAccounts = smtp?.accounts || [];
  let smtpStatus = 'ok';
  const smtpIssues = [];

  if (smtpAccounts.length === 0) {
    smtpStatus = 'error';
    smtpIssues.push({
      level: 'error',
      text: ct("Nie skonfigurowano jeszcze żadnej skrzynki SMTP/IMAP."),
      fix: ct("Dodaj skrzynkę, aby Sekaro mogło wysyłać wiadomości i synchronizować odpowiedzi."),
      action: { label: ct("Dodaj skrzynkę"), to: '/inboxes' },
    });
  }

  smtpAccounts.forEach(acc => {
    const label = acc.inbox_display_name || acc.inbox_email || ct('Skrzynka #{id}',{id:acc.inbox_id});
    const inboxLink = `/inboxes?inbox=${acc.inbox_id}`;

    if (!acc.last_tested_at) {
      if (smtpStatus === 'ok') smtpStatus = 'warning';
      smtpIssues.push({
        level: 'warning',
        text: ct('Połączenie skrzynki „{name}” nie zostało jeszcze przetestowane.',{name:label}),
        fix: ct("Uruchom test połączenia SMTP/IMAP w ustawieniach skrzynki."),
        action: { label: ct("Otwórz skrzynkę"), to: inboxLink },
      });
    } else if (!acc.last_test_ok) {
      smtpStatus = 'error';
      smtpIssues.push({
        level: 'error',
        text: ct('Test połączenia skrzynki „{name}” zakończył się błędem.',{name:label}),
        fix: acc.last_test_error || ct("Sprawdź host, port, login, hasło i ustawienia TLS/SSL."),
        action: { label: ct('Napraw'), to: inboxLink },
      });
    }

    if (!acc.imap_configured) {
      if (smtpStatus === 'ok') smtpStatus = 'warning';
      smtpIssues.push({
        level: 'warning',
        text: ct('Skrzynka „{name}” nie ma skonfigurowanego IMAP.',{name:label}),
        fix: ct("Bez IMAP Sekaro może wysyłać pocztę, ale nie będzie widziało odpowiedzi w Odebranych."),
        action: { label: ct("Skonfiguruj IMAP"), to: inboxLink },
      });
    }
  });

  checks.push({
    id: 'smtp_imap',
    label: 'SMTP / IMAP',
    icon: 'inbox',
    status: smtpStatus,
    issues: smtpIssues,
    meta: { accounts: smtpAccounts },
    detail: smtpAccounts.length === 0
      ? ct("Brak skonfigurowanych skrzynek")
      : ct('Skonfigurowane skrzynki: {count}',{count:smtpAccounts.length}),
  });

  /* ── Inbox Status ─────────────────────────────────────────────── */
  let inboxStatLvl = 'ok';
  const inboxIssues = [];

  inboxList.forEach(inbox => {
    if (inbox.paused) {
      if (inboxStatLvl === 'ok') inboxStatLvl = 'warning';
      inboxIssues.push({
        level: 'warning',
        text: ct('„{name}” jest wstrzymana.',{name:inbox.display_name||inbox.email}),
        fix: ct("Wznów skrzynkę, gdy chcesz ponownie uruchomić wysyłkę."),
        action: { label: ct("Otwórz skrzynki"), to: '/inboxes' },
      });
    }
  });

  if (inboxList.length > 0) {
    checks.push({
      id: 'inbox_status',
      label: ct("Stan skrzynek"),
      icon: 'inbox',
      status: inboxStatLvl,
      issues: inboxIssues,
      meta: { inboxList },
      detail: ct('Skrzynki: {count} — aktywne: {active}',{count:inboxList.length,active:inboxList.filter(i=>!i.paused).length}),
    });
  }

  /* ── Custom Tracking Domains ─────────────────────────────────── */
  const inboxesWithDomains = inboxList.filter(i => i.tracking_domain);
  if (inboxesWithDomains.length > 0) {
    let domainStatus = 'ok';
    const domainIssues = [];

    inboxesWithDomains.forEach(inbox => {
      if (inbox.tracking_domain_status !== 'ok') {
        domainStatus = 'error';
        const name = inbox.display_name || inbox.email;
        domainIssues.push({
          level: 'error',
          text: ct('Domena śledząca „{domain}” dla „{name}” nie odpowiada poprawnie po HTTPS.',{domain:inbox.tracking_domain,name}),
          fix: ct("Sprawdź rekord DNS oraz obsługę HTTPS dla domeny śledzącej."),
          action: { label: ct("Otwórz skrzynki"), to: '/inboxes' },
        });
      }
    });

    checks.push({
      id: 'tracking_domains',
      label: ct("Domeny śledzące"),
      icon: 'domain',
      status: domainStatus,
      issues: domainIssues,
      meta: { inboxesWithDomains },
      detail: inboxesWithDomains.length === 1
        ? ct('Domeny: {count}',{count:1})+' — '+inboxesWithDomains[0].tracking_domain
        : ct('Domeny: {count}',{count:inboxesWithDomains.length}),
    });
  }

  /* ── Beacon ──────────────────────────────────────────────────── */
  const inboxesWithBeacon = inboxList.filter(i => i.beacon_connected && i.beacon_base_url);
  if (inboxesWithBeacon.length > 0) {
    let beaconStatus = 'ok';
    const beaconIssues = [];

    inboxesWithBeacon.forEach(inbox => {
      const name = inbox.display_name || inbox.email;
      if (inbox.beacon_status !== 'ok') {
        beaconStatus = 'error';
        beaconIssues.push({
          level: 'error',
          text: ct('Beacon „{url}” dla „{name}” nie odpowiada poprawnie.',{url:inbox.beacon_base_url,name}),
          fix: ct("Sprawdź usługę Beacon i połączenie z Sekaro."),
          action: { label: ct("Otwórz skrzynki"), to: '/inboxes' },
        });
        return;
      }
      if (inbox.beacon_registration_ok === false) {
        if (beaconStatus === 'ok') beaconStatus = 'warning';
        beaconIssues.push({
          level: 'warning',
          text: ct('Liczba rejestracji Beacon dla „{name}” nie zgadza się ze stanem Sekaro.',{name}),
          fix: ct("Sekaro wykonało ponowną synchronizację. Jeśli ostrzeżenie pozostaje, sprawdź logi Beacon."),
          action: { label: ct("Otwórz skrzynki"), to: '/inboxes' },
        });
      }
    });

    checks.push({
      id: 'beacon_tracking',
      label: 'Beacon',
      icon: 'domain',
      status: beaconStatus,
      issues: beaconIssues,
      meta: { inboxesWithBeacon, beaconReconciliation },
      detail: inboxesWithBeacon.length === 1
        ? ct('Hosty Beacon: {count}',{count:1})+' — '+inboxesWithBeacon[0].beacon_base_url
        : ct('Hosty Beacon: {count}',{count:inboxesWithBeacon.length}),
    });
  }

  /* ── Inbox synchronization ───────────────────────────────────── */
  const syncInProgress = Boolean(unibox_sync?.initial_list_sync_in_progress);
  if (inboxList.length > 0 || smtpAccounts.length > 0) {
    checks.push({
      id: 'unibox_sync',
      label: ct("Synchronizacja poczty"),
      icon: 'sync',
      status: 'ok',
      issues: [],
      meta: {
        syncInProgress,
        pushEnabled: Boolean(unibox_sync?.push_enabled),
        inflightIds: unibox_sync?.inflight_inbox_ids || [],
        syncIntervalMinutes: unibox_sync?.sync_interval_minutes ?? 5,
      },
      detail: syncInProgress
        ? ct("Synchronizacja w toku")
        : ct('Odpytywanie IMAP co około {minutes} min',{minutes:unibox_sync?.sync_interval_minutes??5}),
    });
  }

  /* ── AI Features ─────────────────────────────────────────────── */
  const enabledAiFeatures = rawAi.filter(f => f.enabled);
  let aiStatus = 'ok';
  const aiIssues = [];

  enabledAiFeatures.forEach(f => {
    if (!f.api_key_set) {
      if (aiStatus === 'ok') aiStatus = 'warning';
      aiIssues.push({
        level: 'warning',
        text: ct('„{name}” jest włączone, ale nie ma skonfigurowanego klucza API.',{name:f.label}),
        fix: ct("Uzupełnij konfigurację w Ustawienia → Funkcje."),
        action: { label: ct("Otwórz ustawienia"), to: '/settings#features' },
      });
    } else if (f.last_error) {
      aiStatus = 'error';
      aiIssues.push({
        level: 'error',
        text: ct('„{name}” zgłosiło błąd: {error}',{name:f.label,error:f.last_error}),
        fix: ct("Sprawdź klucz API, limity i konfigurację dostawcy."),
        action: { label: ct("Otwórz ustawienia"), to: '/settings#features' },
      });
    } else if (!f.connection_tested) {
      if (aiStatus === 'ok') aiStatus = 'warning';
      aiIssues.push({
        level: 'warning',
        text: ct('Połączenie dla „{name}” nie zostało przetestowane.',{name:f.label}),
        fix: ct("Uruchom test połączenia w Ustawienia → Funkcje."),
        action: { label: ct("Otwórz ustawienia"), to: '/settings#features' },
      });
    }
  });

  checks.push({
    id: 'ai_features',
    label: ct("Funkcje AI"),
    icon: 'ai',
    status: aiStatus,
    issues: aiIssues,
    meta: { enabledFeatures: enabledAiFeatures, allFeatures: rawAi },
    detail: enabledAiFeatures.length === 0
      ? ct("Funkcje AI są wyłączone")
      : ct('Aktywne funkcje: {count}',{count:enabledAiFeatures.length}),
  });

  /* ── Email verification ──────────────────────────────────────── */
  let evStatus = 'ok';
  const evIssues = [];

  if (evData?.enabled && evData.last_error) {
    evStatus = 'error';
    evIssues.push({
      level: 'error',
      text: ct('Weryfikacja adresów zgłosiła błąd: {error}',{error:evData.last_error}),
      fix: ct("Sprawdź konfigurację dostawcy weryfikacji."),
      action: { label: ct("Otwórz ustawienia"), to: '/settings#features' },
    });
  } else if (evData?.enabled && !evData.connection_tested) {
    evStatus = 'warning';
    evIssues.push({
      level: 'warning',
      text: ct("Weryfikacja adresów jest włączona, ale połączenie nie zostało przetestowane."),
      fix: ct("Uruchom test połączenia w Ustawienia → Funkcje."),
      action: { label: ct("Otwórz ustawienia"), to: '/settings#features' },
    });
  }

  checks.push({
    id: 'email_verification',
    label: ct("Weryfikacja adresów"),
    icon: 'verify',
    status: evStatus,
    issues: evIssues,
    meta: { emailVerification: evData },
    detail: !evData || !evData.enabled
      ? ct("Wyłączona")
      : evData.connection_tested
        ? ct('Aktywna — {provider}',{provider:evData.provider})
        : ct("Włączona, ale nieprzetestowana"),
  });

  /* ── Local storage ───────────────────────────────────────────── */
  if (storage?.available && Number.isFinite(Number(storage.used_percent))) {
    const usedPercent = Number(storage.used_percent);
    const storageStatus = usedPercent >= 95 ? 'error' : usedPercent >= 85 ? 'warning' : 'ok';
    const storageIssues = [];
    if (storageStatus !== 'ok') {
      storageIssues.push({
        level: storageStatus,
        text: storageStatus === 'error'
          ? ct("Na dysku pozostało bardzo mało wolnego miejsca.")
          : ct("Kończy się wolne miejsce na dysku."),
        fix: ct("Usuń niepotrzebne pliki lub zwiększ przestrzeń dostępną dla danych Sekaro."),
      });
    }
    checks.push({
      id: 'storage',
      label: ct("Miejsce na dane"),
      icon: 'storage',
      status: storageStatus,
      issues: storageIssues,
      meta: { storage },
      detail: ct('{free} wolne z {total}',{free:formatBytes(storage.free_bytes,language),total:formatBytes(storage.total_bytes,language)}),
    });
  }

  /* ── Active settings ─────────────────────────────────────────── */
  const flagsIssues = [];
  let flagsStatus = 'ok';
  if (flags?.test_mode) {
    flagsStatus = 'warning';
    flagsIssues.push({
      level: 'warning',
      text: ct("Tryb testowy jest aktywny — wiadomości nie są wysyłane do rzeczywistych odbiorców."),
      fix: ct("Wyłącz tryb testowy, gdy będziesz gotowy do realnej wysyłki."),
      action: { label: ct("Otwórz ustawienia"), to: '/settings#dev' },
    });
  }

  checks.push({
    id: 'active_settings',
    label: ct("Tryb pracy"),
    icon: 'settings',
    status: flagsStatus,
    issues: flagsIssues,
    meta: { testMode: flags?.test_mode },
    detail: flags?.test_mode ? ct("Tryb testowy") : ct("Normalna praca"),
  });

  return checks;
}

const STATUS_RANK = { error: 3, warning: 2, ok: 1, unknown: 0 };

function computeOverall(checks) {
  if (!checks?.length) return 'unknown';
  return checks.reduce((worst, check) => {
    const rank = STATUS_RANK[check.status] ?? 0;
    if (rank > (STATUS_RANK[worst] ?? 0)) return check.status;
    return worst;
  }, 'ok');
}

export function SystemHealthProvider({ children }) {
  const [rawData, setRawData] = useState(null);
  const {ct,language}=useOperationsLanguage();
  const checks=useMemo(()=>buildChecks(rawData,ct,language),[rawData,ct,language]);
  const [loading, setLoading] = useState(false);
  const [lastChecked, setLastChecked] = useState(null);
  const [fetchError, setFetchError] = useState(null);
  const [muted, setMutedState] = useState(loadMuted);
  const { user } = useAuth();
  const refreshTimerRef = useRef(null);

  const generation = useRef(0), pending = useRef(null);
  const refresh = useCallback(() => {
    if (pending.current) return pending.current;
    const request = ++generation.current;
    setLoading(true);
    // Preserve an existing error until a successful retry replaces it.
    const promise = fetchAllHealthData().then(data => {
      if (request !== generation.current) return;
      setRawData(data);
      setLastChecked(new Date()); setFetchError(null);
    }).catch(e => {
      if (request === generation.current) setFetchError(e.message || 'Diagnostyka niedostępna');
    }).finally(() => {
      if (request === generation.current) { pending.current = null; setLoading(false); }
    });
    pending.current = promise;
    return promise;
  }, []);

  useEffect(() => {
    setRawData(null); setLastChecked(null); setFetchError(null); setLoading(false);
    if (user) {
      refresh();
      refreshTimerRef.current = setInterval(refresh, AUTO_REFRESH_MS);
    }
    return () => {
      ++generation.current; pending.current = null;
      clearInterval(refreshTimerRef.current); refreshTimerRef.current = null;
    };
  }, [refresh, user?.id]);

  const toggleMute = useCallback((checkId) => {
    setMutedState(prev => {
      const next = new Set(prev);
      if (next.has(checkId)) next.delete(checkId);
      else next.add(checkId);
      saveMuted(next);
      return next;
    });
  }, []);

  const overallStatus = fetchError ? 'unknown' : computeOverall(checks);

  return (
    <SystemHealthContext.Provider
      value={{ checks, loading, lastChecked, fetchError, refresh, muted, toggleMute, overallStatus, rawData }}
    >
      {children}
    </SystemHealthContext.Provider>
  );
}

export function useSystemHealth() {
  const ctx = useContext(SystemHealthContext);
  if (!ctx) throw new Error('useSystemHealth must be used inside SystemHealthProvider');
  return ctx;
}
