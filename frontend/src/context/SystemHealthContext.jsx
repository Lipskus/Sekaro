import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../api';
import { useAuth } from './AuthContext';

const SystemHealthContext = createContext(null);

const MUTE_KEY = 'sekaro_health_muted_v1';
const AUTO_REFRESH_MS = 5 * 60 * 1000;

function formatBytes(value) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  const gb = bytes / (1024 ** 3);
  if (gb >= 1) return `${gb.toLocaleString('pl-PL', { maximumFractionDigits: gb >= 100 ? 0 : 1 })} GB`;
  const mb = bytes / (1024 ** 2);
  return `${mb.toLocaleString('pl-PL', { maximumFractionDigits: 0 })} MB`;
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

function buildChecks(d) {
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
    label: 'Szyfrowanie haseł skrzynek',
    icon: 'verify',
    status: externalEncryptionKey ? 'ok' : 'warning',
    issues: externalEncryptionKey
      ? []
      : [{
          level: 'warning',
          text: 'SEKARO_ENCRYPTION_KEY nie jest ustawiony w środowisku serwera.',
          fix: smtpAccountCount > 0
            ? 'Skrzynki już istnieją — nie zmieniaj klucza w ciemno. Przed rotacją wykonaj kopię i migrację sekretów.'
            : 'Przed dodaniem pierwszej skrzynki ustaw losowy SEKARO_ENCRYPTION_KEY w pliku .env i zrestartuj aplikację.',
        }],
    meta: { externalEncryptionKey, smtpAccountCount },
    detail: externalEncryptionKey
      ? 'Klucz szyfrowania jest oddzielony od bazy danych'
      : 'Tryb kompatybilności — klucz nie jest dostarczony z .env',
  });

  /* ── SMTP / IMAP ─────────────────────────────────────────────── */
  const smtpAccounts = smtp?.accounts || [];
  let smtpStatus = 'ok';
  const smtpIssues = [];

  if (smtpAccounts.length === 0) {
    smtpStatus = 'error';
    smtpIssues.push({
      level: 'error',
      text: 'Nie skonfigurowano jeszcze żadnej skrzynki SMTP/IMAP.',
      fix: 'Dodaj skrzynkę, aby Sekaro mogło wysyłać wiadomości i synchronizować odpowiedzi.',
      action: { label: 'Dodaj skrzynkę', to: '/inboxes' },
    });
  }

  smtpAccounts.forEach(acc => {
    const label = acc.inbox_display_name || acc.inbox_email || `Skrzynka #${acc.inbox_id}`;
    const inboxLink = `/inboxes?inbox=${acc.inbox_id}`;

    if (!acc.last_tested_at) {
      if (smtpStatus === 'ok') smtpStatus = 'warning';
      smtpIssues.push({
        level: 'warning',
        text: `Połączenie skrzynki „${label}” nie zostało jeszcze przetestowane.`,
        fix: 'Uruchom test połączenia SMTP/IMAP w ustawieniach skrzynki.',
        action: { label: 'Otwórz skrzynkę', to: inboxLink },
      });
    } else if (!acc.last_test_ok) {
      smtpStatus = 'error';
      smtpIssues.push({
        level: 'error',
        text: `Test połączenia skrzynki „${label}” zakończył się błędem.`,
        fix: acc.last_test_error || 'Sprawdź host, port, login, hasło i ustawienia TLS/SSL.',
        action: { label: 'Napraw', to: inboxLink },
      });
    }

    if (!acc.imap_configured) {
      if (smtpStatus === 'ok') smtpStatus = 'warning';
      smtpIssues.push({
        level: 'warning',
        text: `Skrzynka „${label}” nie ma skonfigurowanego IMAP.`,
        fix: 'Bez IMAP Sekaro może wysyłać pocztę, ale nie będzie widziało odpowiedzi w Odebranych.',
        action: { label: 'Skonfiguruj IMAP', to: inboxLink },
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
      ? 'Brak skonfigurowanych skrzynek'
      : `${smtpAccounts.length} skrzyn${smtpAccounts.length === 1 ? 'ka' : 'ki'} skonfigurowane`,
  });

  /* ── Inbox Status ─────────────────────────────────────────────── */
  let inboxStatLvl = 'ok';
  const inboxIssues = [];

  inboxList.forEach(inbox => {
    if (inbox.paused) {
      if (inboxStatLvl === 'ok') inboxStatLvl = 'warning';
      inboxIssues.push({
        level: 'warning',
        text: `„${inbox.display_name || inbox.email}” jest wstrzymana.`,
        fix: 'Wznów skrzynkę, gdy chcesz ponownie uruchomić wysyłkę.',
        action: { label: 'Otwórz skrzynki', to: '/inboxes' },
      });
    }
  });

  if (inboxList.length > 0) {
    checks.push({
      id: 'inbox_status',
      label: 'Stan skrzynek',
      icon: 'inbox',
      status: inboxStatLvl,
      issues: inboxIssues,
      meta: { inboxList },
      detail: `${inboxList.length} skrzynek — ${inboxList.filter(i => !i.paused).length} aktywnych`,
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
          text: `Domena śledząca „${inbox.tracking_domain}” dla „${name}” nie odpowiada poprawnie po HTTPS.`,
          fix: 'Sprawdź rekord DNS oraz obsługę HTTPS dla domeny śledzącej.',
          action: { label: 'Otwórz skrzynki', to: '/inboxes' },
        });
      }
    });

    checks.push({
      id: 'tracking_domains',
      label: 'Domeny śledzące',
      icon: 'domain',
      status: domainStatus,
      issues: domainIssues,
      meta: { inboxesWithDomains },
      detail: inboxesWithDomains.length === 1
        ? `1 domena — ${inboxesWithDomains[0].tracking_domain}`
        : `${inboxesWithDomains.length} domen`,
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
          text: `Beacon „${inbox.beacon_base_url}” dla „${name}” nie odpowiada poprawnie.`,
          fix: 'Sprawdź usługę Beacon i połączenie z Sekaro.',
          action: { label: 'Otwórz skrzynki', to: '/inboxes' },
        });
        return;
      }
      if (inbox.beacon_registration_ok === false) {
        if (beaconStatus === 'ok') beaconStatus = 'warning';
        beaconIssues.push({
          level: 'warning',
          text: `Liczba rejestracji Beacon dla „${name}” nie zgadza się ze stanem Sekaro.`,
          fix: 'Sekaro wykonało ponowną synchronizację. Jeśli ostrzeżenie pozostaje, sprawdź logi Beacon.',
          action: { label: 'Otwórz skrzynki', to: '/inboxes' },
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
        ? `1 host — ${inboxesWithBeacon[0].beacon_base_url}`
        : `${inboxesWithBeacon.length} hostów Beacon`,
    });
  }

  /* ── Inbox synchronization ───────────────────────────────────── */
  const syncInProgress = Boolean(unibox_sync?.initial_list_sync_in_progress);
  if (inboxList.length > 0 || smtpAccounts.length > 0) {
    checks.push({
      id: 'unibox_sync',
      label: 'Synchronizacja poczty',
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
        ? 'Synchronizacja w toku'
        : `Odpytywanie IMAP co około ${unibox_sync?.sync_interval_minutes ?? 5} min`,
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
        text: `„${f.label}” jest włączone, ale nie ma skonfigurowanego klucza API.`,
        fix: 'Uzupełnij konfigurację w Ustawienia → Funkcje.',
        action: { label: 'Otwórz ustawienia', to: '/settings#features' },
      });
    } else if (f.last_error) {
      aiStatus = 'error';
      aiIssues.push({
        level: 'error',
        text: `„${f.label}” zgłosiło błąd: ${f.last_error}`,
        fix: 'Sprawdź klucz API, limity i konfigurację dostawcy.',
        action: { label: 'Otwórz ustawienia', to: '/settings#features' },
      });
    } else if (!f.connection_tested) {
      if (aiStatus === 'ok') aiStatus = 'warning';
      aiIssues.push({
        level: 'warning',
        text: `Połączenie dla „${f.label}” nie zostało przetestowane.`,
        fix: 'Uruchom test połączenia w Ustawienia → Funkcje.',
        action: { label: 'Otwórz ustawienia', to: '/settings#features' },
      });
    }
  });

  checks.push({
    id: 'ai_features',
    label: 'Funkcje AI',
    icon: 'ai',
    status: aiStatus,
    issues: aiIssues,
    meta: { enabledFeatures: enabledAiFeatures, allFeatures: rawAi },
    detail: enabledAiFeatures.length === 0
      ? 'Funkcje AI są wyłączone'
      : `${enabledAiFeatures.length} aktywnych funkcji`,
  });

  /* ── Email verification ──────────────────────────────────────── */
  let evStatus = 'ok';
  const evIssues = [];

  if (evData?.enabled && evData.last_error) {
    evStatus = 'error';
    evIssues.push({
      level: 'error',
      text: `Weryfikacja adresów zgłosiła błąd: ${evData.last_error}`,
      fix: 'Sprawdź konfigurację dostawcy weryfikacji.',
      action: { label: 'Otwórz ustawienia', to: '/settings#features' },
    });
  } else if (evData?.enabled && !evData.connection_tested) {
    evStatus = 'warning';
    evIssues.push({
      level: 'warning',
      text: 'Weryfikacja adresów jest włączona, ale połączenie nie zostało przetestowane.',
      fix: 'Uruchom test połączenia w Ustawienia → Funkcje.',
      action: { label: 'Otwórz ustawienia', to: '/settings#features' },
    });
  }

  checks.push({
    id: 'email_verification',
    label: 'Weryfikacja adresów',
    icon: 'verify',
    status: evStatus,
    issues: evIssues,
    meta: { emailVerification: evData },
    detail: !evData || !evData.enabled
      ? 'Wyłączona'
      : evData.connection_tested
        ? `Aktywna — ${evData.provider}`
        : 'Włączona, ale nieprzetestowana',
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
          ? 'Na dysku pozostało bardzo mało wolnego miejsca.'
          : 'Kończy się wolne miejsce na dysku.',
        fix: 'Usuń niepotrzebne pliki lub zwiększ przestrzeń dostępną dla danych Sekaro.',
      });
    }
    checks.push({
      id: 'storage',
      label: 'Miejsce na dane',
      icon: 'storage',
      status: storageStatus,
      issues: storageIssues,
      meta: { storage },
      detail: `${formatBytes(storage.free_bytes)} wolne z ${formatBytes(storage.total_bytes)}`,
    });
  }

  /* ── Active settings ─────────────────────────────────────────── */
  const flagsIssues = [];
  let flagsStatus = 'ok';
  if (flags?.test_mode) {
    flagsStatus = 'warning';
    flagsIssues.push({
      level: 'warning',
      text: 'Tryb testowy jest aktywny — wiadomości nie są wysyłane do rzeczywistych odbiorców.',
      fix: 'Wyłącz tryb testowy, gdy będziesz gotowy do realnej wysyłki.',
      action: { label: 'Otwórz ustawienia', to: '/settings#dev' },
    });
  }

  checks.push({
    id: 'active_settings',
    label: 'Tryb pracy',
    icon: 'settings',
    status: flagsStatus,
    issues: flagsIssues,
    meta: { testMode: flags?.test_mode },
    detail: flags?.test_mode ? 'Tryb testowy' : 'Normalna praca',
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
  const [checks, setChecks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [lastChecked, setLastChecked] = useState(null);
  const [fetchError, setFetchError] = useState(null);
  const [muted, setMutedState] = useState(loadMuted);
  const { user } = useAuth();
  const refreshTimerRef = useRef(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const data = await fetchAllHealthData();
      setRawData(data);
      setChecks(buildChecks(data));
      setLastChecked(new Date());
    } catch (e) {
      setFetchError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    setLastChecked(null);
  }, [refresh, user]);

  useEffect(() => {
    if (!user) {
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
      return;
    }

    refresh();
    refreshTimerRef.current = setInterval(refresh, AUTO_REFRESH_MS);

    return () => {
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, [refresh, user]);

  const toggleMute = useCallback((checkId) => {
    setMutedState(prev => {
      const next = new Set(prev);
      if (next.has(checkId)) next.delete(checkId);
      else next.add(checkId);
      saveMuted(next);
      return next;
    });
  }, []);

  const overallStatus = computeOverall(checks);

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
