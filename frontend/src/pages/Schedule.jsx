import {useOperationsLanguage} from '../context/operationsLanguage';
import {campaignWeekdays} from '../context/campaignLanguage';
import { useEffect, useState, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api, apiCache } from '../api';
import { useNotify } from '../context/NotificationContext';
import { useAppMode } from '../context/AppModeContext';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { PageFrame, Metric, Icon, StatePanel, ErrorNotice } from '../redesign/ui';
import ScheduleMessagePreview from '../redesign/ScheduleMessagePreview';
import ScheduleCalendar from '../redesign/ScheduleCalendar';
import SafeEmail from '../redesign/SafeEmail';
import {
  addDaysToDateKey,
  formatDateKey,
  formatDateTimeKey,
  formatTimeKey,
  normalizeTimeZone,
  parseApiDate,
} from '../utils/datetime';

const DAY_NAMES = ['Pn','Wt','Śr','Cz','Pt','So','Nd'];
const SCHEDULE_DAYS_BACK = 7;
const SCHEDULE_DAYS_AHEAD = 7;
const SCHEDULE_LIMIT = 5000;

function buildQuery(path, params) {
  const query = new URLSearchParams(params).toString();
  return query ? `${path}?${query}` : path;
}

export default function Schedule() {
  const {ct,language}=useOperationsLanguage();
  const notify = useNotify();
  const { isProduction } = useAppMode();

  const [sent, setSent] = useState(() => apiCache.get('/schedule/sent') || []);
  const [scheduled, setScheduled] = useState(() => apiCache.get('/schedule/scheduled') || []);
  const [stats, setStats] = useState(() => apiCache.get('/schedule/stats') || {});
  const [serverStatus, setServerStatus] = useState(() => apiCache.get('/status') || {});
  const [strategy, setStrategy] = useState(null);
  const [timeToNext, setTimeToNext] = useState('');

  const [view, setView] = useState('calendar');
  const [refreshing, setRefreshing] = useState(false);
  const fetchGeneration = useRef(0);
  const [inboxFilter, setInboxFilter] = useState('');
  const [campaignFilter, setCampaignFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [searchFilter, setSearchFilter] = useState('');

  const [pastExpanded, setPastExpanded] = useState(false);
  const [scheduledExpanded, setScheduledExpanded] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [previewItem, setPreviewItem] = useState(null);
  const hasPreview = !!previewItem;
  useEffect(() => { if (hasPreview) window.scrollTo({top: 0, behavior: 'instant'}); }, [hasPreview]);
  const [previewBusy, setPreviewBusy] = useState(false);
  const previewRequest = useRef(0);
  const [previewError, setPreviewError] = useState(null);
  const [previewTarget, setPreviewTarget] = useState(null);
  const operationLock = useRef(false);
  const [validation, setValidation] = useState(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; ++previewRequest.current; }; }, []);

  const [daysBack, setDaysBack] = useState(SCHEDULE_DAYS_BACK);
  const [daysAhead, setDaysAhead] = useState(SCHEDULE_DAYS_AHEAD);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [fetchError, setFetchError] = useState(null);

  // button states for recalc/validate so React can re-render correctly
  const [recalcState, setRecalcState] = useState({ busy: false, text: '⚡ Przelicz kampanie' });
  const [validateState, setValidateState] = useState({ busy: false, text: '🔍 Sprawdź kolejkę' });

  const filterCampaignOptions = useRef([]);

  const ensureDetail = async (item) => {
    try {
      if (item.type === 'scheduled') {
        if (item.sequence_body) return item;
        const data = await api.get(`/schedule/scheduled/${item.slot_id}`);
        const merged = { ...item, ...data };
        setScheduled(prev => prev.map(s => s.slot_id === item.slot_id ? merged : s));
        return merged;
      }
      if (item.type === 'sent') {
        if (Array.isArray(item.opens) && Array.isArray(item.clicks)) return item;
        const data = await api.get(`/schedule/sent/${item.log_id}`);
        const merged = { ...item, ...data };
        setSent(prev => prev.map(s => s.log_id === item.log_id ? merged : s));
        return merged;
      }
    } catch (e) {
      notify({ type: 'error', message: ct("Nie udało się wczytać szczegółów wiadomości.") });
      return null;
    }
    return item;
  };

  const openPreview = async item => {
    const request = ++previewRequest.current;
    setPreviewBusy(true); setPreviewError(null); setPreviewTarget(item);
    const full = await ensureDetail(item);
    if (request !== previewRequest.current) return;
    setPreviewBusy(false);
    if (full) setPreviewItem(full);
    else setPreviewError('Nie udało się wczytać wybranej wiadomości.');
  };

  const loadData = async (opts = {}) => {
    const generation = ++fetchGeneration.current;
    setRefreshing(true);
    setFetchError(null);
    try {
      const effectiveBack = opts.daysBack ?? daysBack;
      const effectiveAhead = opts.daysAhead ?? daysAhead;
    const [s, sch, st, srv, stratData] = await Promise.all([
      api.get(buildQuery('/schedule/sent', {
        days_back: effectiveBack,
        limit: SCHEDULE_LIMIT,
        offset: 0,
        include_body: true,
        include_events: false,
      })),
      api.get(buildQuery('/schedule/scheduled', {
        days_ahead: effectiveAhead,
        limit: SCHEDULE_LIMIT,
        offset: 0,
        include_body: true,
      })),
        api.get('/schedule/stats'),
        api.get('/status').catch(() => ({})),
        api.get('/settings/scheduling-strategy').catch(() => ({})),
      ]);
      if (generation !== fetchGeneration.current) return;
      setSent(s);
      setScheduled(sch);
      setStats(st);
      setServerStatus(srv);
      setStrategy(stratData.scheduling_strategy || null);
      const camps = new Map();
      // reset countdown first so stale values disappear when schedule is empty
      setTimeToNext('');
      // compute delay until next scheduled email using server timestamp (if
      // available) otherwise fall back to local clock
      if (sch && sch.length) {
        const now = srv.server_time ? parseApiDate(srv.server_time) : new Date();
        const future = sch
          .map(i => parseApiDate(i.scheduled_at))
          .filter(d => d > now)
          .sort((a,b) => a - b)[0];
        if (future) {
          const diff = future - now;
          const mins = Math.floor(diff / 60000);
          const hrs = Math.floor(mins / 60);
          const rem = mins % 60;
          setTimeToNext(`${hrs}h ${rem}m`);
        } else {
          setTimeToNext('brak');
        }
      }
      [...s, ...sch].forEach(e => {
        if (e.campaign_id && e.campaign_name) camps.set(e.campaign_id, e.campaign_name);
      });
      filterCampaignOptions.current = [...camps.entries()].sort((a,b) => a[1].localeCompare(b[1]));
    } catch (e) {
      if (generation === fetchGeneration.current) setFetchError('Nie udało się wczytać harmonogramu. Spróbuj ponownie.');
    } finally {
      if (generation === fetchGeneration.current) { setRefreshing(false); setInitialLoaded(true); }
    }
  };

  useEffect(() => {
    loadData();
    // auto-refresh every 30s, similar to template UI
    const id = setInterval(loadData, 30000);
    return () => { clearInterval(id); fetchGeneration.current += 1; };
  }, [daysBack, daysAhead]);

  const showRange = useCallback((first, last) => {
    const today = new Date();
    const back = Math.ceil((today - new Date(`${first}T00:00:00Z`)) / 86400000) + 2;
    const ahead = Math.ceil((new Date(`${last}T23:59:59Z`) - today) / 86400000) + 2;
    setDaysBack(value => Math.min(3650, Math.max(value, back)));
    setDaysAhead(value => Math.min(3650, Math.max(value, ahead)));
  }, []);

  const clearFilters = () => {
    setCampaignFilter('');
    setInboxFilter('');
    setStatusFilter('');
    setSearchFilter('');
  };

  const matchesFilter = item => {
    if (campaignFilter && String(item.campaign_id) !== campaignFilter) return false;
    if (inboxFilter && String(item.inbox_id) !== inboxFilter) return false;
    if (statusFilter && item.type !== statusFilter) return false;
    if (searchFilter) {
      const hay = [item.lead_email, item.lead_name, item.subject, item.campaign_name, item.inbox_email].join(' ').toLowerCase();
      if (!hay.includes(searchFilter.toLowerCase())) return false;
    }
    return true;
  };

  const filteredSent = sent.filter(matchesFilter);
  const filteredScheduled = scheduled.filter(matchesFilter);

  const fmtTime = (iso, tz) => {
    if (!iso) return '';
    return formatTimeKey(iso, normalizeTimeZone(tz), !isProduction);
  };
  const fmtDateTime = (iso, tz) => {
    if (!iso) return '—';
    return formatDateTimeKey(iso, normalizeTimeZone(tz), !isProduction);
  };
  const renderLastRun = iso => {
    if (!iso) return '—';
    const d = parseApiDate(iso); const now = new Date(); const diff = Math.floor((now-d)/60000);
    if (!Number.isFinite(diff)) return '—';
    return diff < 1 ? ct('Przed chwilą') : new Intl.RelativeTimeFormat(language,{numeric:'always'}).format(-diff,'minute');
  };
  const recalculateAll = async () => {
    if (operationLock.current) return;
    operationLock.current = true;
    setRecalcState({ busy: true, text: 'Przeliczanie…' });
    try {
      const baseline = await api.get('/schedule/stats');
      const data = await api.post('/schedule/recalculate-all');
      if (data.accepted) {
        const deadline = Date.now() + 120000;
        let completed = false;
        while (mounted.current && Date.now() < deadline) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          if (!mounted.current) return;
          const result = await api.get('/schedule/stats');
          if (result.global_recalc_finished_at && result.global_recalc_finished_at !== baseline.global_recalc_finished_at) { completed = true; break; }
        }
        if (!mounted.current) return;
        if (!completed) throw new Error('Serwer przyjął zadanie, ale nie potwierdził zakończenia w ciągu 2 minut. Odśwież kolejkę, aby sprawdzić wynik.');
      }
      if (mounted.current) { await loadData(); notify({ type: 'success', message: ct("Przeliczanie kampanii zakończone.") }); }
    } catch (e) { if (mounted.current) notify({ type: 'error', message: ct(e.message) }); }
    finally { operationLock.current = false; if (mounted.current) setRecalcState({ busy: false, text: '⚡ Przelicz kampanie' }); }
  };
  const validateQueue = async () => {
    if (operationLock.current) return;
    operationLock.current = true;
    setValidateState({ busy: true, text: 'Sprawdzanie…' });
    try {
      const result = await api.post('/schedule/validate-queue');
      if (mounted.current) { setValidation(result); await loadData(); }
    } catch (e) { if (mounted.current) notify({ type: 'error', message:ct('Sprawdzanie kolejki nie powiodło się: {error}',{error:e.message}) }); }
    finally { operationLock.current = false; if (mounted.current) setValidateState({ busy: false, text: '🔍 Sprawdź kolejkę' }); }
  };

  const groupByDate = (items, reverse=false) => {
    const by = {};
    items.forEach(i => {
      const tz = normalizeTimeZone(i.campaign_timezone);
      const dateSource = reverse ? i.sent_at : i.scheduled_at;
      const dateKey = formatDateKey(dateSource || (reverse ? i.sent_date : i.scheduled_date), tz);
      const groupKey = `${tz}|${dateKey}`;
      if (!by[groupKey]) by[groupKey] = { tz, dateKey, items: [] };
      by[groupKey].items.push(i);
    });
    const ordered = Object.values(by).sort((a,b) => {
      if (a.dateKey === b.dateKey) return a.tz.localeCompare(b.tz);
      return a.dateKey.localeCompare(b.dateKey);
    });
    if (reverse) ordered.reverse();
    return ordered;
  };

  const renderRow = (item, uid) => {
    const isSent = item.type === 'sent';
    const tz = normalizeTimeZone(item.campaign_timezone);
    const time = isSent ? fmtTime(item.sent_at, tz) : fmtTime(item.scheduled_at, tz);
    const statusCls = isSent ? 'sent' : 'scheduled';
    const statusLabel = isSent ? ct("Wysłano") : ct("Zaplanowano");
    const subject = item.subject || ct("(bez tematu)");
    const inboxLabel = item.inbox_email || '—';
    const isExpanded = expandedId === uid;
    const toggleExpanded = async () => {
      if (isExpanded) {
        setExpandedId(null);
        return;
      }
      setExpandedId(uid);
      await ensureDetail(item);
    };
    return (
      <div key={uid}>
        <div
          className={`email-row${isExpanded?' expanded':''}`}
          onClick={toggleExpanded}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              toggleExpanded();
            }
          }}
          role="button"
          tabIndex={0}
          aria-expanded={isExpanded}
        >
          <div className="time-col">{time}</div>
          <div className="status-col"><span className={`badge-status ${statusCls}`}>{statusLabel}</span></div>
          <div className="lead-col" title={item.lead_email}>
            {item.lead_email}
          </div>
          <div className="subj-col" title={subject}>{subject}</div>
          <div className="camp-col" title={item.campaign_name}>{item.campaign_name}</div>
          <div className="inbox-col" title={inboxLabel}>{inboxLabel}</div>
        </div>
        {isExpanded && (
          <div className="detail-panel open">
            <div className="dp-grid">
              <div><span className="dp-label">{ct("Status")}</span><br/><span className={`badge-status ${statusCls}`} style={{fontSize:'0.8rem'}}>{statusLabel}</span></div>
              {isSent ? (
                <div><span className="dp-label">{ct("Wysłano")}</span><br/><span className="dp-val">{fmtDateTime(item.sent_at, tz)}</span></div>
              ) : (
                <div><span className="dp-label">{ct("Zaplanowano na")}</span><br/><span className="dp-val">{fmtDateTime(item.scheduled_at, tz)}</span></div>
              )}
              <div><span className="dp-label">{ct("Kontakt")}</span><br/><span className="dp-val mono">{item.lead_email}</span>{item.lead_name ? ` (${item.lead_name})` : ''}<br/><span className={`badge ${item.lead_status}`}>{item.lead_status}</span></div>
              <div><span className="dp-label">{ct("Kampania")}</span><br/><span className="dp-val"><a href={`/campaigns/${item.campaign_id}`}>{item.campaign_name}</a></span></div>
              <div><span className="dp-label">{ct("Krok sekwencji")}</span><br/><span className="dp-val">{item.sequence_index+1}</span></div>
              <div><span className="dp-label">{ct("Przerwa po poprzedniej")}</span><br/><span className="dp-val">{ct('{count} dni',{count:item.sequence_wait_days??0})}</span></div>
              <div className="dp-full"><span className="dp-label">{ct("Temat")}</span><br/><span className="dp-val">{subject}</span></div>
              {!isSent && (
                <>
                  <div><span className="dp-label">{ct("Skrzynka")}</span><br/><span className="dp-val mono">{inboxLabel}</span>{item.inbox_display_name ? ` (${item.inbox_display_name})` : ''}</div>
                  <div><span className="dp-label">{ct("Metoda wysyłki")}</span><br/><span className="dp-val">{(item.inbox_provider||'').toUpperCase()}</span></div>
                  <div><span className="dp-label">{ct("Limit skrzynki/dzień")}</span><br/><span className="dp-val">{item.inbox_max_per_day??'—'}</span></div>
                  <div><span className="dp-label">{ct("Pozycja w dniu")}</span><br/><span className="dp-val">#{item.position_in_day??'—'}</span></div>
                </>
              )}
              {item.has_variants && (
                <div><span className="dp-label">{ct("Wariant A/B")}</span><br/><span className="dp-val">{item.variant_id ? ct('Wariant #{id}',{id:item.variant_id}) : ct("Domyślny")}{item.has_variants ? <span className="badge-status" style={{marginLeft:'0.3rem',fontSize:'0.7rem',padding:'0.1rem 0.4rem',background:'#e0f2fe',color:'#0369a1'}}>{ct("A/B aktywne")}</span> : ''}</span></div>
              )}
              {isSent && item.message_id && (
                <div className="dp-full"><span className="dp-label">{ct("ID wiadomości")}</span><br/><span className="dp-val mono" style={{fontSize:'0.78rem'}}>{item.message_id}</span></div>
              )}
              <div><span className="dp-label">{ct("Okno wysyłki")}</span><br/><span className="dp-val">{item.campaign_hours_start} – {item.campaign_hours_end}</span></div>
              <div><span className="dp-label">{ct("Dni wysyłki")}</span><br/><span className="dp-val">{(item.campaign_sending_days||[]).map(d=>campaignWeekdays(language,DAY_NAMES)[d]).join(', ')}</span></div>
              <div><span className="dp-label">{ct("Zatrzymaj po odpowiedzi")}</span><br/><span className="dp-val">{item.campaign_stop_on_reply?ct("Tak"):ct("Nie")}</span></div>
              {item.sequence_body && (
                <div className="dp-full"><span className="dp-label">{ct("Treść wiadomości")}</span>
                  <div className="flex items-center gap-2 mt-1 mb-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async e => {
                        e.stopPropagation();
                        await openPreview(item);
                      }}
                    > {ct("Pełny podgląd")} </Button>
                  </div>
                  <div className="body-preview">{item.sequence_is_html || item.sequence_body.trim().startsWith('<') ? <SafeEmail html={item.sequence_body} /> : <pre>{item.sequence_body}</pre>}</div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderSection = () => {
    // add header row before items
    const header = (
      <div className="email-row header" key="header">
        <div className="time-col">{ct("Czas")}</div>
        <div className="status-col">{ct("Status")}</div>
        <div className="lead-col">{ct("Kontakt")}</div>
        <div className="subj-col">{ct("Temat")}</div>
        <div className="camp-col">{ct("Kampania")}</div>
        <div className="inbox-col">{ct("Skrzynka")}</div>
      </div>
    );
    const todayByTz = new Map();
    const tomorrowByTz = new Map();
    const parts = [];
    if (filteredSent.length) {
      const totalSent = filteredSent.length;
      parts.push(
        <div key="past">
          <button type="button" className="section-hdr" aria-expanded={pastExpanded} onClick={() => setPastExpanded(pe=>!pe)}>
            <span className={`arrow ${pastExpanded?'open':''}`}>&#9654;</span> {ct('Wysłane ({count} wiadomości w widocznym zakresie)',{count:totalSent})}
          </button>
          {pastExpanded && groupByDate(filteredSent,true).map(group => (
            <div key={`${group.tz}-${group.dateKey}`}>
              <div className="date-hdr">
                {group.dateKey}
                <span className="ml-2 text-xs text-gray-400">{group.tz}</span>
              </div>
              {group.items.map(i=>renderRow(i,`sent-${i.log_id}`))}
            </div>
          ))}
        </div>
      );
    }
    if (filteredScheduled.length) {
      const totalScheduled = filteredScheduled.length;
      parts.push(
        <div key="upcoming">
          <button type="button" className="section-hdr" aria-expanded={scheduledExpanded} onClick={() => setScheduledExpanded(se => !se)}>
            <span className={`arrow ${scheduledExpanded ? 'open' : ''}`}>&#9654;</span> {ct('Zaplanowane ({count} wiadomości w widocznym zakresie)',{count:totalScheduled})}
          </button>
          {scheduledExpanded && groupByDate(filteredScheduled,false).map(group => {
            if (!todayByTz.has(group.tz)) {
              const todayKey = formatDateKey(new Date(), group.tz);
              todayByTz.set(group.tz, todayKey);
              tomorrowByTz.set(group.tz, addDaysToDateKey(todayKey, 1));
            }
            const todayKey = todayByTz.get(group.tz);
            const tomorrowKey = tomorrowByTz.get(group.tz);
            return (
              <div key={`${group.tz}-${group.dateKey}`}>
                <div className="date-hdr">
                  {group.dateKey}
                  <span className="ml-2 text-xs text-gray-400">{group.tz}</span>
                  {group.dateKey === todayKey && (
                    <span style={{color:'var(--sk-success)',fontWeight:500,fontSize:'0.8rem',marginLeft:'0.5rem'}}>{ct("dzisiaj")}</span>
                  )}
                  {group.dateKey === tomorrowKey && (
                    <span style={{color:'var(--sk-info)',fontWeight:500,fontSize:'0.8rem',marginLeft:'0.5rem'}}>{ct("jutro")}</span>
                  )}
                </div>
                {group.items
                  .sort((a,b)=>(a.scheduled_at||'').localeCompare(b.scheduled_at||'')||((a.position_in_day||0)-(b.position_in_day||0)))
                  .map(i=>renderRow(i,`sched-${i.slot_id}`))}
              </div>
            );
          })}
        </div>
      );
    }
    if (parts.length) {
      // add header bar at top of list
      parts.unshift(header);
    }
    if (!parts.length) return <StatePanel icon="calendar" title={ct("Brak wiadomości")} description={ct("Żadne wiadomości nie pasują do bieżących filtrów.")} />;
    return parts;
  };

  const filters = (<div className="sk-schedule-toolbar">
        <label>{ct("Kampania")}<select aria-label={ct("Kampania")} value={campaignFilter} onChange={e=>setCampaignFilter(e.target.value)} className="border rounded p-1 text-sm">
          <option value="">{ct("Wszystkie kampanie")}</option>
          {filterCampaignOptions.current.map(([id,name])=> <option key={id} value={id}>{name}</option>)}
        </select></label>
        <label>{ct("Skrzynka")}<select aria-label={ct("Skrzynka")} value={inboxFilter} onChange={e => setInboxFilter(e.target.value)}>
          <option value="">{ct("Wszystkie skrzynki")}</option>
          {[...new Map([...sent, ...scheduled].filter(i => i.inbox_id).map(i => [i.inbox_id, i.inbox_email])).entries()].map(([id, email]) => <option key={id} value={id}>{email || ct('Skrzynka #{id}',{id})}</option>)}
        </select></label>
        <label>{ct("Status wiadomości")}<select aria-label={ct("Status wiadomości")} value={statusFilter} onChange={e=>setStatusFilter(e.target.value)} className="border rounded p-1 text-sm">
          <option value="">{ct("Wszystkie statusy")}</option>
          <option value="sent">{ct("Wysłane")}</option>
          <option value="scheduled">{ct("Zaplanowane")}</option>
        </select></label>
        <input type="search" aria-label={ct("Szukaj w kolejce")} value={searchFilter} onChange={e=>setSearchFilter(e.target.value)} placeholder={ct("Szukaj kontaktu lub tematu…")} className="border rounded p-1 text-sm" style={{maxWidth:'240px'}} />
        <Button size="sm" variant="outline" onClick={clearFilters}>{ct("Wyczyść")}</Button>
        {!isProduction && (
          <>
            <Button
              id="validate-queue-btn"
              size="sm"
              variant="outline"
              onClick={validateQueue}
              disabled={validateState.busy || recalcState.busy}
            >
              {ct(validateState.text)}
            </Button>
            <Button
              id="recalc-all-btn"
              size="sm"
              variant="outline"
              onClick={recalculateAll}
              disabled={validateState.busy || recalcState.busy}
            >
              {ct(recalcState.text)}
            </Button>
          </>
        )}
      </div>);

  return (
    <PageFrame
      className="sk-schedule-page"
      title={previewItem ? ct("Podgląd wiadomości w kolejce") : ct("Harmonogram i kolejka")}
      description={ct("Monitoruj zaplanowane i wysłane wiadomości w strefach czasowych kampanii.")}
      actions={previewItem ? <Button variant="outline" onClick={() => { previewRequest.current += 1; setPreviewBusy(false); setPreviewItem(null); setPreviewError(null); setPreviewTarget(null); }}>{ct("Wróć do harmonogramu")}</Button> : <><Button size="sm" variant="outline" onClick={() => setView(v => v === 'calendar' ? 'queue' : 'calendar')}>{view === 'calendar' ? ct("Lista wiadomości") : ct("Kalendarz")}</Button><Button size="sm" variant="outline" disabled={refreshing} onClick={() => loadData()}>{ct("↻ Odśwież")}</Button></>}
    >
      <div hidden={!!previewItem}>
      {initialLoaded && !fetchError && <Card className="sk-schedule-statusbar flex flex-wrap justify-between items-center mb-4 p-2">
        <div className="flex flex-wrap gap-4 items-center">
          {!isProduction && (
            <>
              <div>
                <span className="text-sm text-gray-500">{ct("Tryb testowy:")}</span> <span className={typeof serverStatus.test_mode !== 'boolean' ? 'sk-muted' : serverStatus.test_mode?'text-red-600':'text-green-600'}>{typeof serverStatus.test_mode !== 'boolean' ? ct("Brak danych") : serverStatus.test_mode?ct("WŁ."):ct("WYŁ.")}</span>
              </div>
              <div title={ct("Zegar serwera (UTC). Okna wysyłki kampanii są interpretowane w skonfigurowanej strefie czasowej, zapisywane jako UTC i wyświetlane tutaj w lokalnym czasie przeglądarki.")}>
                <span className="text-sm text-gray-500">{ct("Serwer (UTC):")}</span>{' '}
                <span className="font-mono text-xs">
                  {serverStatus.server_time
                    ? parseApiDate(serverStatus.server_time).toISOString().replace('T',' ').slice(0,19) + ' UTC'
                    : '—'}
                </span>
                {serverStatus.server_time && (
                  <span className="ml-1 text-xs text-gray-400">
                    = {parseApiDate(serverStatus.server_time).toLocaleTimeString(language)} {ct("lokalnie")} </span>
                )}
              </div>
              <div title={ct("Czas do następnej zaplanowanej wiadomości, obliczony na podstawie czasu UTC serwera.")}>
                <span className="text-sm text-gray-500">{ct("Następna wiadomość za:")}</span>{' '}
                <span className="font-semibold">{ct(timeToNext) || '—'}</span>
              </div>
            </>
          )}
          <div>
            <span className="text-sm text-gray-500">{ct("Harmonogram:")}</span> <span className={typeof serverStatus.schedule_running !== 'boolean' ? 'sk-muted' : serverStatus.schedule_running ? 'text-green-600' : 'text-red-600'}>{typeof serverStatus.schedule_running !== 'boolean' ? ct("Brak danych") : serverStatus.schedule_running ? ct("Działa") : ct("Zatrzymany")}</span>
          </div>
          <div>
            <span className="text-sm text-gray-500">{ct("Ostatnie uruchomienie:")}</span> <span className="font-semibold">{renderLastRun(serverStatus.last_send_job_run)}</span>
          </div>
          <div>
            <span className="text-sm text-gray-500">{ct("Wysłano ostatnio:")}</span> <span className="font-semibold">{serverStatus.last_send_job_sent_count ?? '—'}</span>
          </div>
          <div>
            <span className="text-sm text-gray-500">{ct("Strategia:")}</span> <Link to="/settings#general" title={ct("Zmień w ustawieniach")}>{strategy==='priority'?ct("Priorytet"):strategy==='round_robin'?ct("Równomiernie"):ct("Brak danych")}</Link>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">{ct("Auto-odświeżanie: 30 s")}</span>
        </div>
      </Card>}
      {view === 'queue' && initialLoaded && !fetchError && <div className="sk-schedule-metrics">
        <Metric icon="send" title={ct("Wysłane")} value={(stats.total_sent||0).toLocaleString(language)} detail={ct("łącznie w historii wysyłki")} tone="blue" />
        <Metric icon="calendar" title={ct("Zaplanowane")} value={(stats.total_scheduled||0).toLocaleString(language)} detail={timeToNext ? ct('następna za {time}',{time:ct(timeToNext)}) : ct("oczekujące w kolejce")} tone="green" />
        <Metric icon="campaign" title={ct("Kampanie")} value={stats.total_campaigns||0} detail={strategy==='priority'?ct("strategia priorytetowa"):strategy==='round_robin'?ct("równomierny podział"):ct("brak danych o strategii")} tone="purple" />
        <Metric icon="server" title={ct("Scheduler")} value={typeof serverStatus.schedule_running !== 'boolean' ? '—' : serverStatus.schedule_running ? ct('Działa') : ct('Zatrzymany')} detail={ct('ostatni przebieg: {time}',{time:renderLastRun(serverStatus.last_send_job_run)})} tone={typeof serverStatus.schedule_running !== 'boolean' ? 'neutral' : serverStatus.schedule_running ? 'green' : 'red'} />
      </div>}
      {validation && <section className="sk-schedule-validation" aria-label={ct("Wynik sprawdzania kolejki")}><h2>{ct('Sprawdzono {count} pozycji · problemy: {issues}',{count:validation.total_slots_checked,issues:validation.issues?.length||0})}</h2><ul>{(validation.issues || []).map((issue, index) => <li key={index}><strong>{issue.campaign_name || ct("Kampania")} · {issue.lead_email || '—'}</strong><p>{issue.details}</p></li>)}</ul><Button variant="outline" onClick={() => setValidation(null)}>{ct("Zamknij wynik")}</Button></section>}
      {view === 'queue' && filters}
      <ErrorNotice error={ct(fetchError)} onRetry={() => loadData()} />
      {!initialLoaded ? <StatePanel icon="refresh" title={ct("Ładowanie harmonogramu")} description={ct("Pobieramy kolejkę wysyłki.")} /> : !fetchError && view === 'calendar' && <ScheduleCalendar
        items={[...filteredSent, ...filteredScheduled]} filters={filters} busy={refreshing}
        onRangeChange={showRange} onOpenQueue={() => setView('queue')}
        onPreview={openPreview}
      />}
      {!fetchError && (sent.length >= SCHEDULE_LIMIT || scheduled.length >= SCHEDULE_LIMIT) && <p className="sk-notice tone-amber">{ct("Osiągnięto limit 5000 rekordów. Widok może nie zawierać wszystkich wiadomości w tym okresie.")}</p>}
      {view === 'queue' && initialLoaded && !fetchError && <Card className="sk-schedule-list p-4" id="schedule-body">
        {renderSection()}
        <div className="sk-form-actions"><Button variant="outline" disabled={refreshing || daysBack >= 3650} onClick={() => setDaysBack(v => Math.min(3650, v + 7))}>{ct("Starsze wiadomości")}</Button><Button variant="outline" disabled={refreshing || daysAhead >= 3650} onClick={() => setDaysAhead(v => Math.min(3650, v + 7))}>{ct("Kolejne 7 dni")}</Button></div>
      </Card>}

      </div>
      <ErrorNotice error={ct(previewError)} onRetry={previewBusy ? undefined : () => openPreview(previewTarget)} />
      {previewBusy && !previewItem && <p role="status">{ct("Wczytywanie podglądu wiadomości…")}</p>}
      {previewItem && <ScheduleMessagePreview item={previewItem} items={[...filteredScheduled, ...filteredSent]} onSelect={openPreview} busy={previewBusy} />}
    </PageFrame>
  );
}
