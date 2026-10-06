import {useOperationsLanguage} from '../context/operationsLanguage';
import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useConfirm } from '../context/ConfirmContext';
import { useNavigate } from 'react-router-dom';
import { parseApiDate } from '../utils/datetime';
import { api } from '../api';
import { useNotifications } from '../context/NotificationsContext';
import { useNotify } from '../context/NotificationContext';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { PageFrame, SectionTabs, StatePanel, ErrorNotice, Icon, dateTime } from '../redesign/ui';
import {
  RiMailOpenLine,
  RiMailSendLine,
  RiMailCheckLine,
  RiMailCloseLine,
  RiUserReceivedLine,
  RiUserUnfollowLine,
  RiErrorWarningLine,
  RiTimerLine,
  RiSpeedLine,
  RiKey2Line,
  RiDeleteBinLine,
  RiCheckDoubleLine,
  RiSparklingLine,
  RiEyeLine,
  RiCursorLine,
  RiSearchLine,
} from 'react-icons/ri';

// Accept event names emitted by the first demo dataset as well as API event keys.
const EVENT_ALIASES = { lead_replied: 'lead.replied', email_bounced: 'email.bounced', lead_unsubscribed: 'lead.unsubscribed' };
const eventTone = type => ['email.bounced', 'feature.error', 'token_expired'].includes(type) ? 'red' : ['daily_limit', 'rate_limit', 'lead.unsubscribed'].includes(type) ? 'amber' : 'green';

const EVENT_ICONS = {
  'email.sent': <RiMailSendLine size={20} />,
  'email.opened': <RiEyeLine size={20} />,
  'email.clicked': <RiCursorLine size={20} />,
  'email.bounced': <RiMailCloseLine size={20} />,
  'lead.replied': <RiMailCheckLine size={20} />,
  'lead.unsubscribed': <RiUserUnfollowLine size={20} />,
  'lead.status_changed': <RiUserReceivedLine size={20} />,
  'lead.interested': <RiSparklingLine size={20} />,
  'lead.not_interested': <RiUserUnfollowLine size={20} />,
  'lead.out_of_office': <RiTimerLine size={20} />,
  'lead.wrong_person': <RiUserUnfollowLine size={20} />,
  'lead.auto_reply': <RiTimerLine size={20} />,
  'feature.error': <RiErrorWarningLine size={20} />,
  'daily_limit': <RiSpeedLine size={20} />,
  'rate_limit': <RiSpeedLine size={20} />,
  'token_expired': <RiKey2Line size={20} />,
};

const EVENT_LABELS = {
  'email.sent': 'Wiadomość wysłana',
  'email.opened': 'Wiadomość otwarta',
  'email.clicked': 'Kliknięcie linku',
  'email.bounced': 'Wiadomość odbita',
  'lead.replied': 'Kontakt odpowiedział',
  'lead.unsubscribed': 'Kontakt wypisany',
  'lead.status_changed': 'Zmiana statusu',
  'lead.interested': 'Kontakt zainteresowany (AI)',
  'lead.not_interested': 'Kontakt niezainteresowany (AI)',
  'lead.out_of_office': 'Poza biurem (AI)',
  'lead.wrong_person': 'Niewłaściwy odbiorca (AI)',
  'lead.auto_reply': 'Automatyczna odpowiedź (AI)',
  'feature.error': 'Błąd funkcji',
  'daily_limit': 'Osiągnięto limit dzienny',
  'rate_limit': 'Limit szybkości',
  'token_expired': 'Token wygasł',
};

const EVENT_CATEGORIES = {
  'email': ['email.sent', 'email.opened', 'email.clicked', 'email.bounced'],
  'lead': ['lead.replied', 'lead.unsubscribed', 'lead.status_changed', 'lead.interested', 'lead.not_interested', 'lead.out_of_office', 'lead.wrong_person', 'lead.auto_reply'],
  'system': ['daily_limit', 'rate_limit', 'token_expired', 'feature.error'],
};

function timeAgo(iso, language, ct) {
  const date = iso && parseApiDate(iso);
  if (!date || !Number.isFinite(+date)) return ct('Brak daty');
  const minutes = Math.floor(Math.max(0, Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return ct('przed chwilą');
  const formatter = new Intl.RelativeTimeFormat(language, {numeric:'always'});
  if (minutes < 60) return formatter.format(-minutes, 'minute');
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? formatter.format(-hours, 'hour') : formatter.format(-Math.floor(hours/24), 'day');
}

function NotificationItem({ n, onDelete, onSelect, selected, busy }) {
  const {ct,language}=useOperationsLanguage();
  return <div className={`sk-notification-row ${selected ? 'is-selected' : ''} ${!n.read_at ? 'is-unread' : ''}`}>
    <button type="button" className="sk-notification-select" onClick={() => onSelect(n)} aria-pressed={selected}>
      <span className={`sk-notification-event-icon tone-${eventTone(n.event_type)}`}>{EVENT_ICONS[n.event_type] || <RiMailOpenLine size={20} />}</span>
      <span className="sk-notification-copy"><strong>{n.title}</strong><span>{n.message}</span><small>{timeAgo(n.created_at,language,ct)}{!n.read_at && <b>{ct("Nowe")}</b>}</small></span>
    </button>
    <button type="button" className="sk-notification-delete" onClick={() => onDelete(n.id)} disabled={busy} aria-label={ct("Usuń powiadomienie")} title={ct("Usuń powiadomienie")}><RiDeleteBinLine size={16} /></button>
  </div>;
}

export default function Notifications() {
  const {ct,language}=useOperationsLanguage();
  const navigate = useNavigate();
  const { refresh: refreshBadge } = useNotifications();
  const notify = useNotify();
  const confirm = useConfirm();
  const mutationLock = useRef(false), savingLock = useRef(false), leaveLock = useRef(false), configGen = useRef(0);
  const [mutating, setMutating] = useState(false);
  const [savedConfig, setSavedConfig] = useState(null);
  const [saveError, setSaveError] = useState(null);
  const offsetRef = useRef(0);
  const fetchGenRef = useRef(0);

  const [activeTab, setActiveTab] = useState('all');
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [eventTypes, setEventTypes] = useState([]);
  const [notifConfig, setNotifConfig] = useState({ enabled: false, notification_email: '', events: [], rate_limit_per_hour: 10 });
  const [configSaving, setConfigSaving] = useState(false);
  const [configLoading, setConfigLoading] = useState(true);
  const [configError, setConfigError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState(null);
  const limit = 50;
  const dirty = savedConfig !== null && JSON.stringify(savedConfig) !== JSON.stringify(notifConfig);
  const matchingTotal = activeTab === 'unread' ? unread : total;

  const fetchNotifications = useCallback(async (reset = false) => {
    const gen = ++fetchGenRef.current;
    if (reset) {
      setItems([]);
      setTotal(0);
      offsetRef.current = 0;
    }
    setLoading(true);
    setFetchError('');
    try {
      const params = new URLSearchParams();
      if (activeTab === 'unread') params.set('unread_only', 'true');
      params.set('limit', String(limit));
      params.set('offset', String(offsetRef.current));
      const data = await api.get(`/notifications?${params.toString()}`);
      if (gen !== fetchGenRef.current) return;
      const normalized = data.items.map(n => ({ ...n, event_type: EVENT_ALIASES[n.event_type] || n.event_type }));
      setItems(reset ? normalized : prev => [...prev, ...normalized]);
      setTotal(data.total);
      setUnread(data.unread);
      if (data.items.length > 0) {
        offsetRef.current += data.items.length;
      }
    } catch (e) {
      if (gen === fetchGenRef.current) setFetchError(e);
    } finally {
      if (gen === fetchGenRef.current) setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    setSearchQuery('');
    setFilterCategory(null);
    setSelected(null);
    if (activeTab !== 'preferences') fetchNotifications(true);
    return () => { ++fetchGenRef.current; };
  }, [activeTab, fetchNotifications]);

  const loadConfig = useCallback(async () => {
    const gen = ++configGen.current;
    setConfigLoading(true);
    setConfigError(null);
    try {
      const [events, config] = await Promise.all([api.get('/settings/webhooks/events'), api.get('/notifications/config')]);
      if (gen !== configGen.current) return;
      setSavedConfig(config);
      setEventTypes(events.events || []);
      setNotifConfig(config);
    } catch (e) {
      if (gen === configGen.current) setConfigError(e);
    } finally {
      if (gen === configGen.current) setConfigLoading(false);
    }
  }, []);
  useEffect(() => { loadConfig(); return () => { ++configGen.current; }; }, [loadConfig]);
  useEffect(() => {
    const unload = e => { if (dirty || configSaving) { e.preventDefault(); e.returnValue = ''; } };
    const leave = async e => {
      const link = e.target.closest?.('a[href]');
      if (!link || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || link.target === '_blank' || (!dirty && !configSaving)) return;
      const url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return;
      e.preventDefault(); e.stopPropagation();
      if (savingLock.current || leaveLock.current) return;
      leaveLock.current = true;
      try { if (await confirm(ct('Odrzucić niezapisane preferencje powiadomień?'))) navigate(url.pathname + url.search + url.hash); }
      finally { leaveLock.current = false; }
    };
    window.addEventListener('beforeunload', unload); document.addEventListener('click', leave, true);
    return () => { window.removeEventListener('beforeunload', unload); document.removeEventListener('click', leave, true); };
  }, [dirty, configSaving, confirm, navigate, ct]);

  // Mutations refetch from offset zero: deleting/reading changes unread pagination.
  const mutate = async (operation, message, updateSelection) => {
    if (mutationLock.current || loading) return;
    mutationLock.current = true; setMutating(true);
    const gen = ++fetchGenRef.current;
    try {
      await operation();
      if (gen !== fetchGenRef.current) return;
      updateSelection?.();
      refreshBadge();
      await fetchNotifications(true);
    } catch (e) {
      if (gen === fetchGenRef.current) notify({ type: 'error', message:ct(message) });
    } finally { mutationLock.current = false; setMutating(false); }
  };
  const markRead = id => mutate(() => api.patch(`/notifications/${id}/read`), 'Nie udało się oznaczyć powiadomienia jako przeczytane.', () => setSelected(n => n?.id === id ? {...n, read_at: new Date().toISOString()} : n));
  const markAllRead = () => mutate(() => api.post('/notifications/read-all'), 'Nie udało się oznaczyć powiadomień jako przeczytane.', () => setSelected(n => n ? {...n, read_at: new Date().toISOString()} : n));
  const dismiss = id => mutate(() => api.del(`/notifications/${id}`), 'Nie udało się usunąć powiadomienia.', () => setSelected(n => n?.id === id ? null : n));

  const toggleEvent = (evt) => {
    setNotifConfig(prev => ({
      ...prev,
      events: prev.events.includes(evt) ? prev.events.filter(e => e !== evt) : [...prev.events, evt],
    }));
  };

  const saveConfig = async e => {
    e.preventDefault();
    if (savingLock.current || !dirty) return;
    savingLock.current = true; setSaveError(null);
    setConfigSaving(true);
    try {
      const res = await api.put('/notifications/config', notifConfig);
      setNotifConfig(res);
      setSavedConfig(res);
      notify({ message: ct("Preferencje powiadomień zapisane."), type: 'success' });
    } catch (e) {
      setSaveError(e);
      notify({ message: ct("Nie udało się zapisać preferencji."), type: 'error' });
    } finally {
      savingLock.current = false;
      setConfigSaving(false);
    }
  };

  const loadMore = () => {
    if (!loading && !mutationLock.current && items.length < matchingTotal) {
      fetchNotifications(false);
    }
  };

  const filteredItems = useMemo(() => {
    let result = items;
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(n =>
        (n.title && n.title.toLowerCase().includes(q)) ||
        (n.message && n.message.toLowerCase().includes(q))
      );
    }
    if (filterCategory) {
      const catEvents = EVENT_CATEGORIES[filterCategory] || [];
      result = result.filter(n => catEvents.includes(n.event_type));
    }
    return result;
  }, [items, searchQuery, filterCategory]);

  const filterCategories = [
    { key: null, label: 'Wszystkie' },
    { key: 'email', label: 'E-mail' },
    { key: 'lead', label: 'Kontakty' },
    { key: 'system', label: 'System' },
  ];

  const isFiltered = searchQuery.trim() || filterCategory;
  const openRelated = async n => {
    if (savingLock.current || leaveLock.current) return;
    if (dirty) {
      leaveLock.current = true;
      try { if (!await confirm(ct('Odrzucić niezapisane preferencje powiadomień?'))) return; }
      finally { leaveLock.current = false; }
    }
    if (n.lead_id) navigate(`/leads/${n.lead_id}`);
    else if (n.campaign_id) navigate(`/campaigns/${n.campaign_id}`);
    else if (n.inbox_id) navigate(`/inboxes?inbox=${n.inbox_id}`);
    else if (n.event_type.startsWith('email.')) navigate('/analytics');
    else navigate('/system-health');
  };

  return (
    <PageFrame
      className="sk-notifications-page"
      title={activeTab === 'preferences' ? ct("Preferencje powiadomień") : ct("Powiadomienia")}
      description={ct("Śledź odpowiedzi, zdarzenia kampanii i alerty systemowe.")}
      actions={activeTab !== 'preferences' && unread > 0 ? (
        <Button size="sm" variant="outline" onClick={markAllRead} disabled={mutating || loading}>
          <RiCheckDoubleLine className="mr-1" size={16} /> {ct("Oznacz wszystkie jako przeczytane")} </Button>
      ) : null}
    >
      <SectionTabs
        value={activeTab}
        onChange={id => { if (mutationLock.current) return; setSearchQuery(''); setFilterCategory(null); setActiveTab(id); }}
        ariaLabel={ct("Sekcje powiadomień")}
        items={[
          { id: 'all', label: ct('Wszystkie ({count})',{count:total}), icon: 'bell' },
          { id: 'unread', label: ct('Nieprzeczytane ({count})',{count:unread}), icon: 'mail' },
          { id: 'preferences', label: ct('Preferencje'), icon: 'settings' },
        ]}
      />

      <div className="sk-notifications-content">
        {activeTab !== 'preferences' && (
          <>
            {/* Search and filter bar */}
            <div className="sk-notification-filterbar">
              <div className="sk-notification-search">
                <RiSearchLine className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                <input
                  type="search"
                  aria-label={ct("Szukaj we wczytanych powiadomieniach")}
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder={ct("Szukaj we wczytanych powiadomieniach…")}
                  className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 dark:text-gray-100 focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none placeholder:text-gray-400 dark:placeholder:text-gray-500"
                />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {filterCategories.map(cat => (
                  <button
                    key={cat.key ?? 'all'}
                    type="button"
                    onClick={() => setFilterCategory(cat.key)}
                    aria-pressed={filterCategory === cat.key}
                    className={filterCategory === cat.key ? 'is-active' : ''}
                  >
                    {ct(cat.label)}
                  </button>
                ))}
              </div>
            </div>

            {items.length < matchingTotal && <p className="sk-muted sk-small">{ct("Wyszukiwanie i kategorie obejmują wczytane powiadomienia. Wczytaj więcej, aby rozszerzyć wyniki.")}</p>}
            <ErrorNotice error={ct(fetchError)} onRetry={() => fetchNotifications(true)} />

            {/* Loading state — first load */}
            {loading && items.length === 0 && (
              <StatePanel
                tone="info"
                icon="refresh"
                title={ct("Ładowanie powiadomień")}
                description={ct("Pobieramy najnowsze zdarzenia z Sekaro.")}
              />
            )}

            {/* Empty state */}
            {!loading && !fetchError && filteredItems.length === 0 && !selected && (
              <StatePanel
                tone="success"
                icon="mail"
                title={isFiltered ? ct("Brak pasujących powiadomień") : activeTab === 'unread' ? ct("Wszystko przeczytane") : ct("Brak powiadomień")}
                description={isFiltered ? ct("Zmień wyszukiwanie lub filtr.") : ct("Nowe zdarzenia pojawią się tutaj automatycznie.")}
              />
            )}

            {/* Notification list */}
            {(filteredItems.length > 0 || selected) && (
              <>
                <p className="sk-notification-count">
                  {isFiltered
                    ? ct('Wyświetlono {shown} z {loaded} wczytanych',{shown:filteredItems.length,loaded:items.length})
                    : ct('Wyświetlono {shown} z {total} powiadomień',{shown:items.length,total:matchingTotal})}
                </p>
                <div className="sk-notification-workspace">
                <div className="sk-notification-list">
                  {filteredItems.map(n => (
                    <NotificationItem
                      key={n.id}
                      n={n}
                      onDelete={dismiss}
                      onSelect={setSelected}
                      selected={selected?.id === n.id}
                      busy={mutating || loading}
                    />
                  ))}
                </div>
                <aside className="sk-notification-detail" aria-label={ct("Szczegóły powiadomienia")}>
                  {selected ? <>
                    <button type="button" className="sk-notification-detail-close" aria-label={ct("Zamknij szczegóły powiadomienia")} onClick={() => setSelected(null)}>×</button><span className={`sk-badge tone-${eventTone(selected.event_type)}`}>{ct(EVENT_LABELS[selected.event_type] || selected.event_type)}</span>
                    <h2>{selected.title}</h2>
                    <time dateTime={selected.created_at}>{dateTime(selected.created_at,{},language)}</time>
                    <p>{selected.message}</p>
                    <div className="sk-notification-detail-actions">{!selected.read_at && <Button disabled={mutating || loading} onClick={() => markRead(selected.id)}>{ct("Oznacz jako przeczytane")}</Button>}<Button onClick={() => openRelated(selected)}>{ct("Otwórz powiązany widok")}</Button></div>
                  </> : <StatePanel icon="bell" title={ct("Wybierz powiadomienie")} description={ct("Pełna treść i powiązane działania pojawią się tutaj.")} />}
                </aside>
                </div>
              </>
            )}

            {/* Wczytaj więcej — only on All tab */}
            {items.length < matchingTotal && !loading && !fetchError && (
              <div className="sk-notification-load-more">
                <Button size="sm" variant="outline" onClick={loadMore} disabled={mutating}> {ct("Wczytaj więcej")} </Button>
              </div>
            )}

            {/* Loading more indicator */}
            {loading && items.length > 0 && (
              <div className="sk-notification-loading-more">
                <div className="inline-block h-4 w-4 border-2 border-teal-500 border-t-transparent rounded-full animate-spin mr-2 align-middle" /> {ct("Wczytywanie…")} </div>
            )}
          </>
        )}

        {activeTab === 'preferences' && <ErrorNotice error={configError} onRetry={loadConfig} />}
        {activeTab === 'preferences' && configLoading && <StatePanel icon="refresh" title={ct("Ładowanie preferencji")} />}
        {activeTab === 'preferences' && !configLoading && !configError && (
          <form onSubmit={saveConfig}><fieldset disabled={configSaving} className="sk-notification-preferences">
            <section className="sk-notification-pref-card">
              <h2>{ct("Kanały powiadomień")}</h2><p className="sk-muted sk-small">{ct("W aplikacji powiadomienia są zawsze aktywne. E-mail to dodatkowy kanał dostarczania.")}</p>
              <div className="space-y-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={notifConfig.enabled}
                    onChange={e => setNotifConfig(prev => ({ ...prev, enabled: e.target.checked }))}
                    className="rounded"
                  />
                  <span className="text-sm">{ct("Wysyłaj powiadomienia e-mail")}</span>
                </label>
                {notifConfig.enabled && (
                  <>
                    <Input
                      label={ct("Adres powiadomień (opcjonalny)")}
                      aria-label={ct("Adres powiadomień (opcjonalny)")}
                      type="email"
                      value={notifConfig.notification_email}
                      onChange={e => setNotifConfig(prev => ({ ...prev, notification_email: e.target.value }))}
                      placeholder={ct("Pozostaw puste, aby użyć adresu konta")}
                      size="sm"
                      className="max-w-md dark:bg-gray-800 dark:text-gray-100 dark:border-gray-600"
                    />
                    <Input
                      label={ct("Limit powiadomień na godzinę")}
                      aria-label={ct("Limit powiadomień na godzinę")}
                      type="number"
                      min={1}
                      max={100}
                      required
                      step={1}
                      value={notifConfig.rate_limit_per_hour}
                      onChange={e => setNotifConfig(prev => ({ ...prev, rate_limit_per_hour: e.target.value === '' ? '' : Number(e.target.value) }))}
                      size="sm"
                      className="w-24 dark:bg-gray-800 dark:text-gray-100 dark:border-gray-600"
                    />
                  </>
                )}
              </div>
            </section>

            <section className="sk-notification-pref-card">
              <h2>{ct("Typy zdarzeń")}</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3"> {ct("Wybierz zdarzenia generujące powiadomienia. Powiadomienia w aplikacji są zawsze tworzone; e-mail jest wysyłany tylko po włączeniu kanału powyżej.")} </p>
              <div className="sk-notification-event-options">
                {eventTypes.map(evt => (
                  <label key={evt} className="flex items-center gap-2 cursor-pointer py-1">
                    <input
                      type="checkbox"
                      checked={notifConfig.events.includes(evt)}
                      onChange={() => toggleEvent(evt)}
                      className="rounded"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">{ct(EVENT_LABELS[evt] || evt)}</span>
                  </label>
                ))}
                {eventTypes.length === 0 && (
                  <p className="text-sm text-gray-400">{ct("Brak dostępnych typów zdarzeń.")}</p>
                )}
              </div>
              {notifConfig.events.length === 0 && (
                <p className="text-xs text-amber-600 mt-2">{ct("Brak filtra — wszystkie zdarzenia są dozwolone.")}</p>
              )}
            </section>

            <div className="sk-notification-savebar">
              <ErrorNotice error={saveError} />
              <span role="status">{configSaving ? ct("Zapisywanie…") : dirty ? ct("Niezapisane zmiany") : ct("Brak niezapisanych zmian")}</span>
              <Button type="button" variant="outline" disabled={configSaving || !dirty} onClick={async () => { if (await confirm(ct('Odrzucić niezapisane preferencje powiadomień?'))) { setNotifConfig(savedConfig); setSaveError(null); } }}>{ct("Odrzuć zmiany")}</Button>
              <Button type="submit" disabled={configSaving || !dirty}>
                {configSaving ? ct("Zapisywanie…") : ct("Zapisz preferencje")}
              </Button>
            </div>
          </fieldset></form>
        )}
      </div>
    </PageFrame>
  );
}
