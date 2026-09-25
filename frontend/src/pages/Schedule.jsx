import { useEffect, useState, useRef } from 'react';
import { api, apiCache } from '../api';
import { useLoading } from '../context/LoadingContext';
import { useNotify } from '../context/NotificationContext';
import { useConfirm } from '../context/ConfirmContext';
import { useAppMode } from '../context/AppModeContext';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { PageFrame, Metric, Icon, StatePanel, ErrorNotice } from '../redesign/ui';
import Modal from '../redesign/Modal';
import {
  addDaysToDateKey,
  formatDateKey,
  formatDateTimeKey,
  formatTimeKey,
  normalizeTimeZone,
} from '../utils/datetime';

const DAY_NAMES = ['Pn','Wt','Śr','Cz','Pt','So','Nd'];
const SCHEDULE_DAYS_BACK = 7;
const SCHEDULE_DAYS_AHEAD = 3;
const SCHEDULE_LIMIT = 5000;

function buildQuery(path, params) {
  const query = new URLSearchParams(params).toString();
  return query ? `${path}?${query}` : path;
}

// ── Email Preview Modal for schedule items ────────────────────────────────────
function ScheduleEmailPreviewModal({ item, onClose }) {
  const isHtml = item.sequence_is_html || (item.sequence_body || '').trim().startsWith('<');
  const subject = item.subject || '(bez tematu)';
  const body = item.sequence_body || '';

  return (
    <Modal title="Podgląd wiadomości" onClose={onClose}>
      <div className="sk-schedule-preview-meta">
        <span><strong>Odbiorca:</strong> {item.lead_email}</span>
        <span><strong>Kampania:</strong> {item.campaign_name}</span>
        <span><strong>Krok sekwencji:</strong> #{(item.sequence_index ?? 0) + 1}</span>
        {item.type === 'sent' && item.sent_at && (
          <span><strong>Wysłano:</strong> {new Date(item.sent_at).toLocaleString('pl-PL')}</span>
        )}
        {item.type === 'scheduled' && item.scheduled_at && (
          <span><strong>Zaplanowano:</strong> {new Date(item.scheduled_at).toLocaleString('pl-PL')}</span>
        )}
      </div>

      <section className="sk-schedule-preview-subject">
        <small>Temat</small>
        <p>
          {!item.subject || item.subject === '(reply in thread)'
            ? <em>Odpowiedź w wątku</em>
            : subject}
        </p>
      </section>

      <section className="sk-schedule-preview-content">
        <small>Treść</small>
        {body ? (
          isHtml ? (
            <div
              className="sk-schedule-preview-body"
              dangerouslySetInnerHTML={{ __html: body }}
            />
          ) : (
            <pre className="sk-schedule-preview-body">{body}</pre>
          )
        ) : (
          <p className="sk-muted">Brak treści wiadomości.</p>
        )}
      </section>

      <div className="sk-form-actions">
        <Button variant="outline" size="sm" onClick={onClose}>Zamknij</Button>
      </div>
    </Modal>
  );
}

function escapeHtml(s){
  return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

export default function Schedule() {
  const loading = useLoading();
  const notify = useNotify();
  const { isProduction } = useAppMode();

  const [sent, setSent] = useState(() => apiCache.get('/schedule/sent') || []);
  const [scheduled, setScheduled] = useState(() => apiCache.get('/schedule/scheduled') || []);
  const [stats, setStats] = useState(() => apiCache.get('/schedule/stats') || {});
  const [serverStatus, setServerStatus] = useState(() => apiCache.get('/status') || {});
  const [strategy, setStrategy] = useState('priority');
  const [timeToNext, setTimeToNext] = useState('');
  const confirm = useConfirm();

  const [campaignFilter, setCampaignFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [searchFilter, setSearchFilter] = useState('');

  const [pastExpanded, setPastExpanded] = useState(false);
  const [scheduledExpanded, setScheduledExpanded] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [previewItem, setPreviewItem] = useState(null);

  const [daysBack, setDaysBack] = useState(SCHEDULE_DAYS_BACK);
  const [daysAhead, setDaysAhead] = useState(SCHEDULE_DAYS_AHEAD);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [fetchError, setFetchError] = useState(null);
  const sentinelRef = useRef(null);
  const isLoadingMoreRef = useRef(false);

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
        if (item.sequence_body || (item.opens && item.clicks)) return item;
        const data = await api.get(`/schedule/sent/${item.log_id}`);
        const merged = { ...item, ...data };
        setSent(prev => prev.map(s => s.log_id === item.log_id ? merged : s));
        return merged;
      }
    } catch (e) {
      notify({ type: 'error', message: 'Nie udało się wczytać szczegółów wiadomości.' });
    }
    return item;
  };

  const loadData = async (opts = {}) => {
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
      setSent(s);
      setScheduled(sch);
      setStats(st);
      setServerStatus(srv);
      setStrategy(stratData.scheduling_strategy || 'priority');
      const camps = new Map();
      // reset countdown first so stale values disappear when schedule is empty
      setTimeToNext('');
      // compute delay until next scheduled email using server timestamp (if
      // available) otherwise fall back to local clock
      if (sch && sch.length) {
        const now = srv.server_time ? new Date(srv.server_time) : new Date();
        const future = sch
          .map(i => new Date(i.scheduled_at))
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
      setFetchError('Nie udało się wczytać harmonogramu. Spróbuj ponownie.');
    } finally {
      // loading.stop();
    }
  };

  useEffect(() => {
    loadData().then(() => setInitialLoaded(true));
    // auto-refresh every 30s, similar to template UI
    const id = setInterval(loadData, 30000);
    return () => clearInterval(id);
  }, [daysBack, daysAhead]);

  useEffect(() => {
    if (!initialLoaded) return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      async ([entry]) => {
        if (!entry.isIntersecting || isLoadingMoreRef.current) return;
        isLoadingMoreRef.current = true;
        setIsLoadingMore(true);
        const nextAhead = daysAhead + SCHEDULE_DAYS_AHEAD;
        setDaysAhead(nextAhead);
        await loadData({ daysAhead: nextAhead });
        setIsLoadingMore(false);
        isLoadingMoreRef.current = false;
      },
      { threshold: 0.1 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [daysAhead, initialLoaded]);

  const clearFilters = () => {
    setCampaignFilter('');
    setStatusFilter('');
    setSearchFilter('');
  };

  const matchesFilter = item => {
    if (campaignFilter && String(item.campaign_id) !== campaignFilter) return false;
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
    const d = new Date(iso); const now = new Date(); const diff = Math.floor((now-d)/60000);
    return diff < 1 ? 'Przed chwilą' : `${diff} min temu`;
  };
  const recalculateAll = async () => {
    setRecalcState({ busy: true, text: '⚡ Przeliczanie…' });
    const baselineStats = await api.get('/schedule/stats').catch(() => ({}));
    try {
      const res = await fetch('/api/schedule/recalculate-all',{method:'POST'});
      if (res.ok) {
        const data = await res.json();
        const stratLabel = strategy==='priority'?'Priorytet':'Równomiernie';
        if (data.accepted) {
          setRecalcState({ busy: true, text: '⚡ Trwa przeliczanie…' });
          // Server sets global_recalc_finished_at when the job completes; polling
          // slot counts is unreliable (same total as before, or no visible "empty" window).
          const baselineToken = baselineStats?.global_recalc_finished_at ?? null;
          const deadline = Date.now() + 120000;
          for (let i = 0; Date.now() < deadline; i++) {
            const delay = i < 30 ? 350 : 1000;
            await new Promise(r => setTimeout(r, delay));
            await loadData();
            const st = await api.get('/schedule/stats').catch(() => ({}));
            const t = st.global_recalc_finished_at;
            if (t != null && t !== baselineToken) break;
          }
          await loadData();
          const finalStats = await api.get('/schedule/stats').catch(() => ({}));
          const message = `✓ Gotowe [${stratLabel}] (${finalStats.total_campaigns ?? '—'} kampanii, ${finalStats.total_scheduled ?? '—'} zaplanowanych)`;
          setRecalcState({ busy: true, text: message });
        } else {
          const message = `✓ Gotowe [${stratLabel}] (${data.campaigns_processed} kampanii, ${data.total_slots} pozycji)`;
          setRecalcState({ busy: true, text: message });
          setTimeout(loadData, 100);
        }
      } else {
        const t = await res.text();
        notify({ type: 'error', message: 'Błąd podczas przeliczania: ' + t });
        setRecalcState({ busy: false, text: '⚡ Przelicz kampanie' });
      }
    } catch(err) {
      notify({ type: 'error', message: 'Błąd: ' + err.message });
      setRecalcState({ busy: false, text: '⚡ Przelicz kampanie' });
    } finally {
      setTimeout(()=>{
        setRecalcState({ busy: false, text: '⚡ Przelicz kampanie' });
      },2000);
    }
  };
  const validateQueue = async () => {
    setValidateState({ busy: true, text: '🔍 Sprawdzanie…' });
    try {
      const res = await fetch('/api/schedule/validate-queue',{method:'POST'});
      if (res.ok) {
        const data = await res.json();
        const issues = data.issues||[];
        const txt = `✓ Sprawdzono (${data.total_slots_checked} pozycji, problemy: ${issues.length})`;
        setValidateState({ busy: true, text: txt });
        if (issues.length) {
          notify({ type: 'error', message: `Sprawdzanie zakończone — znaleziono ${issues.length} problemów. Szczegóły są w konsoli.` });
          console.log('Wynik sprawdzania kolejki:', data);
        }
        loadData();
      } else {
        const t = await res.text();
        notify({ type: 'error', message: 'Sprawdzanie kolejki nie powiodło się: ' + t });
        setValidateState({ busy: false, text: '🔍 Sprawdź kolejkę' });
      }
    } catch(err){
      notify({ type: 'error', message: 'Błąd: ' + err.message });
      setValidateState({ busy: false, text: '🔍 Sprawdź kolejkę' });
    }
    finally {
      setTimeout(()=>{
        setValidateState({ busy: false, text: '🔍 Sprawdź kolejkę' });
      },2000);
    }
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
    const statusLabel = isSent ? 'Wysłano' : 'Zaplanowano';
    const subject = item.subject || '(bez tematu)';
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
            {/* {item.lead_email}{item.lead_status && <span className={`badge ${item.lead_status}`} style={{marginLeft:'0.3rem',fontSize:'0.75rem'}}>{item.lead_status}</span>} */}
          </div>
          <div className="subj-col" title={subject}>{subject}</div>
          <div className="camp-col" title={item.campaign_name}>{item.campaign_name}</div>
          <div className="inbox-col" title={inboxLabel}>{inboxLabel}</div>
        </div>
        {isExpanded && (
          <div className="detail-panel open">
            <div className="dp-grid">
              <div><span className="dp-label">Status</span><br/><span className={`badge-status ${statusCls}`} style={{fontSize:'0.8rem'}}>{statusLabel}</span></div>
              {isSent ? (
                <div><span className="dp-label">Wysłano</span><br/><span className="dp-val">{fmtDateTime(item.sent_at, tz)}</span></div>
              ) : (
                <div><span className="dp-label">Zaplanowano na</span><br/><span className="dp-val">{fmtDateTime(item.scheduled_at, tz)}</span></div>
              )}
              <div><span className="dp-label">Kontakt</span><br/><span className="dp-val mono">{item.lead_email}</span>{item.lead_name ? ` (${item.lead_name})` : ''}<br/><span className={`badge ${item.lead_status}`}>{item.lead_status}</span></div>
              <div><span className="dp-label">Kampania</span><br/><span className="dp-val"><a href={`/campaigns/${item.campaign_id}`}>{item.campaign_name}</a></span></div>
              <div><span className="dp-label">Krok sekwencji</span><br/><span className="dp-val">{item.sequence_index+1}</span></div>
              <div><span className="dp-label">Przerwa po poprzedniej</span><br/><span className="dp-val">{item.sequence_wait_days??0} dni</span></div>
              <div className="dp-full"><span className="dp-label">Temat</span><br/><span className="dp-val">{subject}</span></div>
              {!isSent && (
                <>
                  <div><span className="dp-label">Skrzynka</span><br/><span className="dp-val mono">{inboxLabel}</span>{item.inbox_display_name ? ` (${item.inbox_display_name})` : ''}</div>
                  <div><span className="dp-label">Metoda wysyłki</span><br/><span className="dp-val">{(item.inbox_provider||'').toUpperCase()}</span></div>
                  <div><span className="dp-label">Limit skrzynki/dzień</span><br/><span className="dp-val">{item.inbox_max_per_day??'—'}</span></div>
                  <div><span className="dp-label">Pozycja w dniu</span><br/><span className="dp-val">#{item.position_in_day??'—'}</span></div>
                </>
              )}
              {item.has_variants && (
                <div><span className="dp-label">Wariant A/B</span><br/><span className="dp-val">{item.variant_id ? `Wariant #${item.variant_id}` : 'Domyślny'}{item.has_variants ? <span className="badge-status" style={{marginLeft:'0.3rem',fontSize:'0.7rem',padding:'0.1rem 0.4rem',background:'#e0f2fe',color:'#0369a1'}}>A/B aktywne</span> : ''}</span></div>
              )}
              {isSent && item.message_id && (
                <div className="dp-full"><span className="dp-label">ID wiadomości</span><br/><span className="dp-val mono" style={{fontSize:'0.78rem'}}>{item.message_id}</span></div>
              )}
              <div><span className="dp-label">Okno wysyłki</span><br/><span className="dp-val">{item.campaign_hours_start} – {item.campaign_hours_end}</span></div>
              <div><span className="dp-label">Dni wysyłki</span><br/><span className="dp-val">{(item.campaign_sending_days||[]).map(d=>DAY_NAMES[d]).join(', ')}</span></div>
              <div><span className="dp-label">Zatrzymaj po odpowiedzi</span><br/><span className="dp-val">{item.campaign_stop_on_reply?'Tak':'Nie'}</span></div>
              {item.sequence_body && (
                <div className="dp-full"><span className="dp-label">Treść wiadomości</span>
                  <div className="flex items-center gap-2 mt-1 mb-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async e => {
                        e.stopPropagation();
                        const full = await ensureDetail(item);
                        setPreviewItem(full);
                      }}
                    >
                      Pełny podgląd
                    </Button>
                  </div>
                  <div className="body-preview" dangerouslySetInnerHTML={{__html:item.sequence_body.trim().startsWith('<')?item.sequence_body:escapeHtml(item.sequence_body)}} />
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
        <div className="time-col">Czas</div>
        <div className="status-col">Status</div>
        <div className="lead-col">Kontakt</div>
        <div className="subj-col">Temat</div>
        <div className="camp-col">Kampania</div>
        <div className="inbox-col">Skrzynka</div>
      </div>
    );
    const todayByTz = new Map();
    const tomorrowByTz = new Map();
    const parts = [];
    if (filteredSent.length) {
      const totalSent = stats.total_sent ?? filteredSent.length;
      parts.push(
        <div key="past">
          <div className="section-hdr" onClick={() => setPastExpanded(pe=>!pe)}>
            <span className={`arrow ${pastExpanded?'open':''}`}>&#9654;</span> Wysłane ({totalSent} wiadomości)
          </div>
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
      const totalScheduled = stats.total_scheduled ?? filteredScheduled.length;
      parts.push(
        <div key="upcoming">
          <div className="section-hdr" onClick={() => setScheduledExpanded(se => !se)}>
            <span className={`arrow ${scheduledExpanded ? 'open' : ''}`}>&#9654;</span> Zaplanowane ({totalScheduled} wiadomości)
          </div>
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
                    <span style={{color:'var(--sk-success)',fontWeight:500,fontSize:'0.8rem',marginLeft:'0.5rem'}}>dzisiaj</span>
                  )}
                  {group.dateKey === tomorrowKey && (
                    <span style={{color:'var(--sk-info)',fontWeight:500,fontSize:'0.8rem',marginLeft:'0.5rem'}}>jutro</span>
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
    if (!parts.length) return <StatePanel icon="calendar" title="Brak wiadomości" description="Żadne wiadomości nie pasują do bieżących filtrów." />;
    return parts;
  };

  return (
    <PageFrame
      className="sk-schedule-page"
      title="Harmonogram i kolejka"
      description="Monitoruj zaplanowane i wysłane wiadomości w strefach czasowych kampanii."
      actions={<Button size="sm" variant="outline" onClick={loadData}>↻ Odśwież</Button>}
    >
      <Card className="sk-schedule-statusbar flex flex-wrap justify-between items-center mb-4 p-2">
        <div className="flex flex-wrap gap-4 items-center">
          {!isProduction && (
            <>
              <div>
                <span className="text-sm text-gray-500">Tryb testowy:</span> <span className={serverStatus.test_mode?'text-red-600':'text-green-600'}>{serverStatus.test_mode?'WŁ.':'WYŁ.'}</span>
              </div>
              <div title="Zegar serwera (UTC). Okna wysyłki kampanii są interpretowane w skonfigurowanej strefie czasowej, zapisywane jako UTC i wyświetlane tutaj w lokalnym czasie przeglądarki.">
                <span className="text-sm text-gray-500">Serwer (UTC):</span>{' '}
                <span className="font-mono text-xs">
                  {serverStatus.server_time
                    ? new Date(serverStatus.server_time).toISOString().replace('T',' ').slice(0,19) + ' UTC'
                    : '—'}
                </span>
                {serverStatus.server_time && (
                  <span className="ml-1 text-xs text-gray-400">
                    = {new Date(serverStatus.server_time).toLocaleTimeString()} lokalnie
                  </span>
                )}
              </div>
              <div title="Czas do następnej zaplanowanej wiadomości, obliczony na podstawie czasu UTC serwera.">
                <span className="text-sm text-gray-500">Następna wiadomość za:</span>{' '}
                <span className="font-semibold">{timeToNext || '—'}</span>
              </div>
            </>
          )}
          <div>
            <span className="text-sm text-gray-500">Harmonogram:</span> <span className={serverStatus.schedule_running?'text-green-600':'text-red-600'}>{serverStatus.schedule_running?'Działa':'Zatrzymany'}</span>
          </div>
          <div>
            <span className="text-sm text-gray-500">Ostatnie uruchomienie:</span> <span className="font-semibold">{renderLastRun(serverStatus.last_send_job_run)}</span>
          </div>
          <div>
            <span className="text-sm text-gray-500">Wysłano ostatnio:</span> <span className="font-semibold">{serverStatus.last_send_job_sent_count??0}</span>
          </div>
          <div>
            <span className="text-sm text-gray-500">Strategia:</span> <span className={strategy==='round_robin'?'text-teal-500':'text-gray-900'} style={{cursor:'pointer',textDecoration:'underline dotted',textUnderlineOffset:'3px'}} title="Zmień w ustawieniach" onClick={() => { window.location = '/settings#general'; }}>{strategy==='priority'?'Priorytet':'Równomiernie'}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Auto-odświeżanie: 30 s</span>
        </div>
      </Card>
      <div className="sk-schedule-metrics">
        <Metric icon="send" title="Wysłane" value={(stats.total_sent||0).toLocaleString('pl-PL')} detail="w załadowanym zakresie" tone="blue" />
        <Metric icon="calendar" title="Zaplanowane" value={(stats.total_scheduled||0).toLocaleString('pl-PL')} detail={timeToNext ? `następna za ${timeToNext}` : 'oczekujące w kolejce'} tone="green" />
        <Metric icon="campaign" title="Kampanie" value={stats.total_campaigns||0} detail={strategy==='priority'?'strategia priorytetowa':'równomierny podział'} tone="purple" />
        <Metric icon="server" title="Scheduler" value={serverStatus.schedule_running?'Online':'Stop'} detail={`ostatni przebieg: ${renderLastRun(serverStatus.last_send_job_run)}`} tone={serverStatus.schedule_running?'green':'red'} />
      </div>
      <div className="sk-schedule-toolbar">
        <select value={campaignFilter} onChange={e=>setCampaignFilter(e.target.value)} className="border rounded p-1 text-sm">
          <option value="">Wszystkie kampanie</option>
          {filterCampaignOptions.current.map(([id,name])=> <option key={id} value={id}>{name}</option>)}
        </select>
        <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)} className="border rounded p-1 text-sm">
          <option value="">Wszystkie statusy</option>
          <option value="sent">Wysłane</option>
          <option value="scheduled">Zaplanowane</option>
        </select>
        <input type="text" value={searchFilter} onChange={e=>setSearchFilter(e.target.value)} placeholder="Szukaj kontaktu lub tematu…" className="border rounded p-1 text-sm" style={{maxWidth:'240px'}} />
        <Button size="sm" variant="outline" onClick={clearFilters}>Wyczyść</Button>
        {!isProduction && (
          <>
            <Button
              id="validate-queue-btn"
              size="sm"
              variant="outline"
              onClick={validateQueue}
              disabled={validateState.busy}
            >
              {validateState.text}
            </Button>
            <Button
              id="recalc-all-btn"
              size="sm"
              variant="outline"
              onClick={recalculateAll}
              disabled={recalcState.busy}
            >
              {recalcState.text}
            </Button>
          </>
        )}
      </div>
      <Card className="sk-schedule-list p-4" id="schedule-body">
        <ErrorNotice error={fetchError} onRetry={() => loadData()} />
        {!initialLoaded ? <StatePanel icon="refresh" title="Ładowanie harmonogramu" description="Pobieramy kolejkę wysyłki." /> : !fetchError && renderSection()}
        <div ref={sentinelRef} style={{ height: 1 }} />
        {isLoadingMore && <p style={{ textAlign: 'center', padding: '0.5rem', color: 'var(--sk-muted)' }}>Wczytywanie…</p>}
      </Card>

      {/* Email preview modal */}
      {previewItem && (
        <ScheduleEmailPreviewModal item={previewItem} onClose={() => setPreviewItem(null)} />
      )}
    </PageFrame>
  );
}
