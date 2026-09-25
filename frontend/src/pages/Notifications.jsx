import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
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

function timeAgo(iso) {
  const diff = Date.now() - parseApiDate(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'przed chwilą';
  if (mins < 60) return `${mins} min temu`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} godz. temu`;
  const days = Math.floor(hrs / 24);
  return `${days} d temu`;
}

function NotificationItem({ n, onRead, onDelete, onSelect, selected }) {
  const handleClick = () => {
    if (!n.read_at) onRead(n.id);
    onSelect(n.id);
  };

  return (
    <div
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
      role="button"
      aria-pressed={selected}
      tabIndex={0}
      className={`group flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
        n.read_at
          ? 'bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800'
          : 'bg-teal-50 dark:bg-teal-900/20 hover:bg-teal-100 dark:hover:bg-teal-900/30'
      }`}
    >
      <div className={`sk-notification-event-icon tone-${eventTone(n.event_type)}`}>
        {EVENT_ICONS[n.event_type] || <RiMailOpenLine size={20} />}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm ${n.read_at ? 'text-gray-700 dark:text-gray-300' : 'text-gray-900 dark:text-gray-100 font-semibold'}`}>
          {n.title}
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{n.message}</p>
        <div className="flex items-center gap-2 mt-1">
          <p className="text-[10px] text-gray-400">{timeAgo(n.created_at)}</p>
          {!n.read_at && (
            <span className="rounded-full bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300 text-[10px] font-semibold px-1.5 py-0.5 leading-none">
              Nowe
            </span>
          )}
        </div>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(n.id); }}
        onKeyDown={e => e.stopPropagation()}
        className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1 text-gray-400 hover:text-red-500 transition-opacity"
        title="Usuń"
        aria-label="Usuń powiadomienie"
      >
        <RiDeleteBinLine size={16} />
      </button>
    </div>
  );
}

export default function Notifications() {
  const navigate = useNavigate();
  const { refresh: refreshBadge } = useNotifications();
  const notify = useNotify();
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
  const [selectedId, setSelectedId] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState(null);
  const limit = 50;

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
        offsetRef.current += limit;
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
    setSelectedId(null);
    if (activeTab === 'preferences') return;
    fetchNotifications(true);
  }, [activeTab]);

  const loadConfig = useCallback(async () => {
    setConfigLoading(true);
    setConfigError(null);
    try {
      const [events, config] = await Promise.all([api.get('/settings/webhooks/events'), api.get('/notifications/config')]);
      setEventTypes(events.events || []);
      setNotifConfig(config);
    } catch (e) {
      setConfigError(e);
    } finally {
      setConfigLoading(false);
    }
  }, []);
  useEffect(() => { loadConfig(); }, [loadConfig]);

  const markRead = async (id) => {
    try {
      await api.patch(`/notifications/${id}/read`);
      setItems(prev => prev.map(n => n.id === id ? { ...n, read_at: new Date().toISOString() } : n));
      setUnread(prev => Math.max(0, prev - 1));
      refreshBadge();
    } catch (e) {
      notify({ type: 'error', message: 'Nie udało się oznaczyć powiadomienia jako przeczytane.' });
    }
  };

  const markAllRead = async () => {
    try {
      await api.post('/notifications/read-all');
      setItems(prev => prev.map(n => ({ ...n, read_at: n.read_at || new Date().toISOString() })));
      setUnread(0);
      refreshBadge();
    } catch (e) {
      notify({ type: 'error', message: 'Nie udało się oznaczyć powiadomień jako przeczytane.' });
    }
  };

  const dismiss = async (id) => {
    try {
      await api.del(`/notifications/${id}`);
      const removed = items.find(n => n.id === id);
      setItems(prev => prev.filter(n => n.id !== id));
      setTotal(prev => prev - 1);
      if (removed && !removed.read_at) setUnread(prev => Math.max(0, prev - 1));
      refreshBadge();
    } catch (e) {
      notify({ type: 'error', message: 'Nie udało się usunąć powiadomienia.' });
    }
  };

  const toggleEvent = (evt) => {
    setNotifConfig(prev => ({
      ...prev,
      events: prev.events.includes(evt) ? prev.events.filter(e => e !== evt) : [...prev.events, evt],
    }));
  };

  const saveConfig = async () => {
    setConfigSaving(true);
    try {
      const res = await api.put('/notifications/config', notifConfig);
      setNotifConfig(res);
      notify({ message: 'Preferencje powiadomień zapisane.', type: 'success' });
    } catch (e) {
      console.error(e);
      notify({ message: 'Nie udało się zapisać preferencji.', type: 'error' });
    } finally {
      setConfigSaving(false);
    }
  };

  const loadMore = () => {
    if (items.length < total) {
      fetchNotifications(false);
    }
  };

  const filteredItems = useMemo(() => {
    let result = items;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
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
  const selected = filteredItems.find(n => n.id === selectedId);
  const openRelated = n => {
    if (n.lead_id) navigate(`/leads/${n.lead_id}`);
    else if (n.campaign_id) navigate(`/campaigns/${n.campaign_id}`);
    else if (n.inbox_id) navigate(`/inboxes?inbox=${n.inbox_id}`);
    else if (n.event_type.startsWith('email.')) navigate('/analytics');
    else navigate('/system-health');
  };

  return (
    <PageFrame
      className="sk-notifications-page"
      title="Powiadomienia"
      description="Śledź odpowiedzi, zdarzenia kampanii i alerty systemowe."
      actions={unread > 0 ? (
        <Button size="sm" variant="outline" onClick={markAllRead}>
          <RiCheckDoubleLine className="mr-1" size={16} />
          Oznacz wszystkie jako przeczytane
        </Button>
      ) : null}
    >
      <SectionTabs
        value={activeTab}
        onChange={id => { setSearchQuery(''); setFilterCategory(null); setActiveTab(id); }}
        ariaLabel="Sekcje powiadomień"
        items={[
          { id: 'all', label: `Wszystkie (${total})`, icon: 'bell' },
          { id: 'unread', label: `Nieprzeczytane (${unread})`, icon: 'mail' },
          { id: 'preferences', label: 'Preferencje', icon: 'settings' },
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
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Szukaj w powiadomieniach…"
                  className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 dark:text-gray-100 focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none placeholder:text-gray-400 dark:placeholder:text-gray-500"
                />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {filterCategories.map(cat => (
                  <button
                    key={cat.key ?? 'all'}
                    type="button"
                    onClick={() => setFilterCategory(cat.key)}
                    className={filterCategory === cat.key ? 'is-active' : ''}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            <ErrorNotice error={fetchError} onRetry={() => fetchNotifications(true)} />

            {/* Loading state — first load */}
            {loading && items.length === 0 && (
              <StatePanel
                tone="info"
                icon="refresh"
                title="Ładowanie powiadomień"
                description="Pobieramy najnowsze zdarzenia z Sekaro."
              />
            )}

            {/* Empty state */}
            {!loading && !fetchError && filteredItems.length === 0 && (
              <StatePanel
                tone="success"
                icon="mail"
                title={isFiltered ? 'Brak pasujących powiadomień' : activeTab === 'unread' ? 'Wszystko przeczytane' : 'Brak powiadomień'}
                description={isFiltered ? 'Zmień wyszukiwanie lub filtr.' : 'Nowe zdarzenia pojawią się tutaj automatycznie.'}
              />
            )}

            {/* Notification list */}
            {filteredItems.length > 0 && (
              <>
                <p className="sk-notification-count">
                  {isFiltered
                    ? `Wyświetlono ${filteredItems.length} z ${items.length} wczytanych`
                    : `Wyświetlono ${items.length} z ${total} powiadomień`}
                </p>
                <div className="sk-notification-workspace">
                <div className="sk-notification-list">
                  {filteredItems.map(n => (
                    <NotificationItem
                      key={n.id}
                      n={n}
                      onRead={markRead}
                      onDelete={dismiss}
                      onSelect={setSelectedId}
                      selected={selectedId === n.id}
                    />
                  ))}
                </div>
                <aside className="sk-notification-detail" aria-label="Szczegóły powiadomienia">
                  {selected ? <>
                    <span className={`sk-badge tone-${eventTone(selected.event_type)}`}>{EVENT_LABELS[selected.event_type] || selected.event_type}</span>
                    <h2>{selected.title}</h2>
                    <time dateTime={selected.created_at}>{dateTime(selected.created_at)}</time>
                    <p>{selected.message}</p>
                    <Button onClick={() => openRelated(selected)}>Otwórz powiązany widok</Button>
                  </> : <StatePanel icon="bell" title="Wybierz powiadomienie" description="Pełna treść i powiązane działania pojawią się tutaj." />}
                </aside>
                </div>
              </>
            )}

            {/* Wczytaj więcej — only on All tab */}
            {items.length < total && !loading && !fetchError && (
              <div className="sk-notification-load-more">
                <Button size="sm" variant="outline" onClick={loadMore}>
                  Wczytaj więcej
                </Button>
              </div>
            )}

            {/* Loading more indicator */}
            {loading && items.length > 0 && (
              <div className="sk-notification-loading-more">
                <div className="inline-block h-4 w-4 border-2 border-teal-500 border-t-transparent rounded-full animate-spin mr-2 align-middle" />
                Wczytywanie…
              </div>
            )}
          </>
        )}

        {activeTab === 'preferences' && <ErrorNotice error={configError} onRetry={loadConfig} />}
        {activeTab === 'preferences' && configLoading && <StatePanel icon="refresh" title="Ładowanie preferencji" />}
        {activeTab === 'preferences' && !configLoading && !configError && (
          <div className="sk-notification-preferences">
            <section className="sk-notification-pref-card">
              <h2>Powiadomienia e-mail</h2>
              <div className="space-y-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={notifConfig.enabled}
                    onChange={e => setNotifConfig(prev => ({ ...prev, enabled: e.target.checked }))}
                    className="rounded"
                  />
                  <span className="text-sm">Wysyłaj powiadomienia e-mail</span>
                </label>
                {notifConfig.enabled && (
                  <>
                    <Input
                      label="Adres powiadomień (opcjonalny)"
                      type="email"
                      value={notifConfig.notification_email}
                      onChange={e => setNotifConfig(prev => ({ ...prev, notification_email: e.target.value }))}
                      placeholder="Pozostaw puste, aby użyć adresu konta"
                      size="sm"
                      className="max-w-md dark:bg-gray-800 dark:text-gray-100 dark:border-gray-600"
                    />
                    <Input
                      label="Limit powiadomień na godzinę"
                      type="number"
                      min={1}
                      max={100}
                      value={notifConfig.rate_limit_per_hour}
                      onChange={e => setNotifConfig(prev => ({ ...prev, rate_limit_per_hour: parseInt(e.target.value) || 10 }))}
                      size="sm"
                      className="w-24 dark:bg-gray-800 dark:text-gray-100 dark:border-gray-600"
                    />
                  </>
                )}
              </div>
            </section>

            <section className="sk-notification-pref-card">
              <h2>Typy zdarzeń</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                Wybierz zdarzenia generujące powiadomienia. Powiadomienia w aplikacji są zawsze tworzone; e-mail jest wysyłany tylko po włączeniu kanału powyżej.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {eventTypes.map(evt => (
                  <label key={evt} className="flex items-center gap-2 cursor-pointer py-1">
                    <input
                      type="checkbox"
                      checked={notifConfig.events.includes(evt)}
                      onChange={() => toggleEvent(evt)}
                      className="rounded"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">{EVENT_LABELS[evt] || evt}</span>
                  </label>
                ))}
                {eventTypes.length === 0 && (
                  <p className="text-sm text-gray-400">Ładowanie typów zdarzeń…</p>
                )}
              </div>
              {notifConfig.events.length === 0 && (
                <p className="text-xs text-amber-600 mt-2">Brak filtra — wszystkie zdarzenia są dozwolone.</p>
              )}
            </section>

            <div className="pt-2">
              <Button onClick={saveConfig} disabled={configSaving}>
                {configSaving ? 'Zapisywanie…' : 'Zapisz preferencje'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </PageFrame>
  );
}
