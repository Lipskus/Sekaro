import {CampaignGroupPicker} from '../redesign/ContactGroups';
import {useCampaignLanguage} from '../context/campaignLanguage';
import { useParams, Link } from 'react-router-dom';
import { useState, useEffect, useCallback, useRef, useMemo, Fragment } from 'react';
import { useNotify } from '../context/NotificationContext';
import { useLoading } from '../context/LoadingContext';
import { api, apiCache } from '../api';
import { Button } from '../components/ui/Button';
import { FileUploadArea } from '../components/ui/FileUploadArea';
import { Card } from '../components/ui/Card';
import Modal from '../redesign/Modal';
import { Metric, Icon, ErrorNotice } from '../redesign/ui';
import { recipientFilters, emptyRecipientFilters, filterRecipients, recipientsCsv } from '../redesign/campaignRecipients';
import '../redesign/campaign-recipients.css';
import '../redesign/campaign-sequence.css';
import '../redesign/campaign-analytics.css';
import { analyticsRangeError, campaignDailyRows, analyticsCsv } from '../redesign/campaignAnalytics';
import {sequenceDay, sequenceExcerpt} from '../redesign/sequencePresentation';
import DatePicker from '../components/ui/DatePicker';
import { useConfirm } from '../context/ConfirmContext';
import { useAppMode } from '../context/AppModeContext';
import {
  addDaysToDateKey,
  formatDateKey,
  formatTimeKey,
  normalizeTimeZone,
} from '../utils/datetime';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import {
  ResponsiveContainer,
  AreaChart as ReAreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';

// ─── tabs ─────────────────────────────────────────────────────────────────────
const TABS = ['analytics', 'sequences', 'leads', 'queue', 'settings'];
const TAB_LABELS = {
  sequences: 'Sekwencje',
  leads: 'Kontakty',
  analytics: 'Analityka',
  queue: 'Kolejka',
  settings: 'Ustawienia',
};

// ─── Main page ────────────────────────────────────────────────────────────────
export default function CampaignDetail({ embedded = false, onQueueContact }) {
  const { id } = useParams();
  const [campaign, setCampaign] = useState(() => apiCache.get(`/campaigns/${id}`) || null);
  const [inboxes, setInboxes] = useState(() => apiCache.get('/inboxes') || []);
  const [sequences, setSequences] = useState(() => apiCache.get(`/campaigns/${id}/sequences`) || []);
  const [leads, setLeads] = useState(() => apiCache.get(`/campaigns/${id}/leads`) || []);
  const [queueData, setQueueData] = useState(() => apiCache.get(`/campaigns/${id}/queue`) || []);
  const [sentData, setSentData] = useState(() => apiCache.get(`/campaigns/${id}/sent`) || []);
  const [queueFilter, setQueueFilter] = useState(null);
  const queueRef = useRef(null);
  const [pastExpanded, setPastExpanded] = useState(false);
  const [recalcInProgress, setRecalcInProgress] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(() => !apiCache.get(`/campaigns/${id}`));
  const [activeTab, setActiveTab] = useState(() => {
    const hash = window.location.hash.replace('#', '');
    return TABS.includes(hash) ? hash : 'analytics';
  });
  const confirm = useConfirm();
  const notify = useNotify();
  const loadingCtrl = useLoading();
  const { isProduction } = useAppMode();

  // Sync hash ↔ tab
  useEffect(() => {
    window.location.hash = activeTab;
  }, [activeTab]);

  useEffect(() => {
    const onHash = () => {
      const hash = window.location.hash.replace('#', '');
      if (TABS.includes(hash)) setActiveTab(hash);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const loadAll = useCallback(async () => {
    loadingCtrl.start();
    try {
      const [camp, ibxs, seqs, lds, q, s] = await Promise.all([
        api.get(`/campaigns/${id}`),
        api.get('/inboxes'),
        api.get(`/campaigns/${id}/sequences`),
        api.get(`/campaigns/${id}/leads`),
        api.get(`/campaigns/${id}/queue`),
        api.get(`/campaigns/${id}/sent`),
      ]);
      setCampaign(camp);
      setInboxes(ibxs);
      setSequences(seqs);
      setLeads(lds);
      setQueueData(q);
      setSentData(s);
    } catch (e) {
      setError(e.message);
      notify({ type: 'error', message: 'Nie udało się wczytać danych kampanii.' });
    } finally {
      loadingCtrl.stop();
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { loadAll(); }, [id]);

  const scheduleWaitMinutes = useMemo(() => {
    const ids = campaign?.inbox_ids;
    if (!ids?.length || !inboxes?.length) return 5;
    const ib = inboxes.find((i) => i.id === ids[0]);
    return ib?.wait_minutes_between ?? 5;
  }, [campaign, inboxes]);

  /* ── queue helpers ── */
  function estimatedTime(positionInDay) {
    if (!campaign) return '';
    const start = campaign.sending_hours_start || '09:00';
    const [hStr, mStr] = start.split(':');
    let h = parseInt(hStr, 10) || 9;
    let m = parseInt(mStr, 10) || 0;
    const offset = (positionInDay - 1) * scheduleWaitMinutes;
    m += offset;
    h += Math.floor(m / 60);
    m = m % 60;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
  }

  function formatTime(isoStr) {
    if (!isoStr) return '';
    return formatTimeKey(isoStr, normalizeTimeZone(campaign?.timezone), !isProduction);
  }

  function renderQueue() {
    const filter = queueFilter;
    const sent     = filter ? sentData.filter(s => s.lead_email === filter) : sentData;
    const upcoming = filter ? queueData.filter(q => q.lead_email === filter) : queueData;
    const tz = normalizeTimeZone(campaign?.timezone);
    const today    = formatDateKey(new Date(), tz);
    const tomorrow = addDaysToDateKey(today, 1);

    if (!sent.length && !upcoming.length)
      return <p className="text-gray-500">Brak wysłanych lub zaplanowanych wiadomości.</p>;

    return (
      <>
        {sent.length > 0 && (
          <>
            <div
              className="cursor-pointer text-gray-600 font-semibold py-2 flex items-center gap-1 select-none"
              onClick={() => setPastExpanded(p => !p)}
            >
              <span className={`inline-block transition-transform ${pastExpanded ? 'rotate-90' : ''}`}>▶</span>
              Wysłane ({sent.length})
            </div>
            {pastExpanded && (
              <table className="w-full text-sm border-collapse mb-3">
                <thead>
                  <tr className="bg-gray-50">
                    {['Data','Czas','Od','Kontakt','Sekwencja','Temat'].map(h => (
                      <th key={h} className="px-3 py-2 text-left font-semibold text-gray-600">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Object.keys(sent.reduce((acc,s)=>{const d=formatDateKey(s.sent_at||s.sent_date, tz); (acc[d]=acc[d]||[]).push(s); return acc;},{})).sort()
                    .flatMap(d => sent.filter(s=>formatDateKey(s.sent_at||s.sent_date, tz)=== d).map((s,i)=>(
                      <tr key={s.log_id} className={`border-b ${!filter?'cursor-pointer hover:bg-gray-50':''}`}
                        onClick={()=>!filter&&setQueueFilter(s.lead_email)}>
                        <td className="px-3 py-1.5">{i===0?d:''}</td>
                        <td className="px-3 py-1.5">{formatTime(s.sent_at)}</td>
                        <td className="px-3 py-1.5 font-mono text-xs max-w-[200px] truncate" title={s.inbox_email || ''}>{s.inbox_email || '—'}</td>
                        <td className="px-3 py-1.5 font-mono">{s.lead_email}</td>
                        <td className="px-3 py-1.5">Sekw. {s.sequence_index+1}</td>
                        <td className="px-3 py-1.5">{s.subject||''}</td>
                      </tr>
                    )))}
                </tbody>
              </table>
            )}
          </>
        )}
        {upcoming.length > 0 && (
          <>
            <div className="text-gray-600 font-semibold py-2">Nadchodzące ({upcoming.length} zaplanowanych)</div>
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-50">
                  {['Data','Szac. czas','#','Od','Kontakt','Sekwencja'].map(h=>(
                    <th key={h} className="px-3 py-2 text-left font-semibold text-gray-600">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.keys(upcoming.reduce((acc,q)=>{const d=formatDateKey(q.scheduled_date, tz); (acc[d]=acc[d]||[]).push(q); return acc;},{})).sort()
                  .flatMap(d => upcoming
                    .filter(q=>formatDateKey(q.scheduled_date, tz)===d)
                    .sort((a,b)=>(a.scheduled_date||'').localeCompare(b.scheduled_date||'')||a.position_in_day-b.position_in_day)
                    .map((q,i)=>{
                      const isPast = d < today;
                      const t = q.scheduled_date?.includes('T') ? formatTime(q.scheduled_date) : estimatedTime(q.position_in_day);
                      return (
                        <tr key={q.slot_id} className={`border-b ${isPast?'text-gray-400':''} ${!filter?'cursor-pointer hover:bg-gray-50':''}`}
                          onClick={()=>!filter&&setQueueFilter(q.lead_email)}>
                          <td className="px-3 py-1.5">
                            {i===0 ? (
                              <>
                                {d}
                                {d === today && <span className="ml-1 text-xs text-green-600">dzisiaj</span>}
                                {d === tomorrow && <span className="ml-1 text-xs text-blue-600">jutro</span>}
                              </>
                            ) : ''}
                          </td>
                          <td className="px-3 py-1.5">{t}</td>
                          <td className="px-3 py-1.5">{q.position_in_day}</td>
                          <td className="px-3 py-1.5 font-mono text-xs max-w-[200px] truncate" title={q.inbox_email || ''}>{q.inbox_email || '—'}</td>
                          <td className="px-3 py-1.5 font-mono">{q.lead_email}</td>
                          <td className="px-3 py-1.5">Sekw. {q.sequence_index+1}</td>
                        </tr>
                      );
                    }))}
              </tbody>
            </table>
          </>
        )}
        {!upcoming.length && !sent.length && (
          <p className="text-gray-500">Brak zaplanowanych wiadomości w kolejce.</p>
        )}
      </>
    );
  }

  async function recalculateQueue() {
    setRecalcInProgress(true);
    try {
      const res = await api.post(`/campaigns/${id}/recalculate-queue`);
      if (res?.slots != null) {
        notify({ type: 'success', message: `Kolejka przeliczona (${res.slots} pozycji)` });
        const [q, s] = await Promise.all([
          api.get(`/campaigns/${id}/queue`),
          api.get(`/campaigns/${id}/sent`),
        ]);
        setQueueData(q);
        setSentData(s);
      }
    } catch (e) {
      notify({ type: 'error', message: e.message });
    } finally {
      setRecalcInProgress(false);
    }
  }

  if (error)            return <div className="min-h-0 flex-1 overflow-y-auto p-8 text-red-600">{error}</div>;
  if (loading||!campaign) return <div className="min-h-0 flex-1 overflow-y-auto p-8 text-gray-400">Wczytywanie…</div>;

  return (
    <div className="max-w-full min-h-0 min-w-0 flex-1 overflow-y-auto p-6">
      {/* header */}
      <div className={embedded ? "sk-legacy-header" : "flex items-center gap-3 mb-6"}>
        <h1 className="text-2xl font-bold flex-1 truncate">{campaign.name}</h1>
        {campaign.paused && (
          <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full text-xs font-semibold">Wstrzymana</span>
        )}
      </div>

      {/* tab bar */}
      <div className={embedded ? "sk-legacy-header" : "flex gap-1 mb-6 border-b border-gray-200"}>
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={
              'px-5 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ' +
              (activeTab === tab
                ? 'border-teal-500 text-teal-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300')
            }
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      {/* Sequences tab */}
      {activeTab === 'sequences' && (
        <SequencesTab
          sequences={sequences}
          campaignId={id}
          campaign={campaign}
          leads={leads}
          refresh={loadAll}
        />
      )}

      {/* Leads tab */}
      {activeTab === 'leads' && (
        <LeadsTab
          leads={leads}
          campaignId={id}
          refresh={loadAll}
          onViewQueue={email => {
            if (onQueueContact) { onQueueContact(email); return; }
            setQueueFilter(email);
            setActiveTab('queue');
            setTimeout(() => queueRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
          }}
        />
      )}

      {/* Analytics tab */}
      {activeTab === 'analytics' && (
        <CampaignAnalyticsTab
          campaignId={Number(id)}
          campaign={campaign}
          sentData={sentData}
          sequences={sequences}
          onRefresh={loadAll}
        />
      )}

      {/* Queue tab */}
      {activeTab === 'queue' && (
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-4" ref={queueRef}>
            <Button variant="outline" size="sm" onClick={recalculateQueue} disabled={recalcInProgress}>
              {recalcInProgress ? 'Przeliczanie…' : 'Przelicz kolejkę'}
            </Button>
            {queueFilter && (
              <span className="text-sm text-teal-600 font-medium flex items-center gap-1">
                Widok dla: {queueFilter}
                <button className="ml-1 text-gray-400 hover:text-gray-600" onClick={() => setQueueFilter(null)}>✕</button>
              </span>
            )}
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            {renderQueue()}
          </div>
        </div>
      )}

      {/* Settings tab */}
      {activeTab === 'settings' && (
        <SettingsTab
          campaign={campaign}
          inboxes={inboxes}
          onSave={loadAll}
          campaignId={id}
        />
      )}
    </div>
  );
}

// ─── Status badges ────────────────────────────────────────────────────────────
const BADGE_STYLES = {
  active:         'bg-emerald-100 text-emerald-700',
  contacted:      'bg-teal-100 text-teal-800',
  completed:      'bg-blue-100 text-blue-700',
  unsubscribed:   'bg-gray-200 text-gray-600',
  bounced:        'bg-red-100 text-red-700',
  wrong_person:   'bg-purple-100 text-purple-700',
  replied:        'bg-violet-100 text-violet-700',
  opened:         'bg-amber-100 text-amber-700',
  clicked:        'bg-orange-100 text-orange-700',
  interested:     'bg-green-100 text-green-700',
  not_interested: 'bg-rose-100 text-rose-700',
  out_of_office:  'bg-sky-100 text-sky-700',
  auto_reply:     'bg-slate-100 text-slate-600',
  paused:         'bg-yellow-100 text-yellow-700',
  // E-mail verification statuses
  valid:          'bg-emerald-100 text-emerald-700',
  invalid:        'bg-red-100 text-red-700',
  risky:          'bg-orange-100 text-orange-700',
  catch_all:      'bg-yellow-100 text-yellow-700',
  unknown:        'bg-gray-200 text-gray-600',
  pending:        'bg-blue-100 text-blue-600',
  needs_custom_email: 'bg-purple-100 text-purple-700',
};
const STATUS_LABELS = {
  active:'Aktywny', contacted:'Skontaktowany', completed:'Zakończony', unsubscribed:'Wypisany',
  bounced:'Odbity', wrong_person:'Niewłaściwa osoba', replied:'Odpowiedział', opened:'Otworzył',
  clicked:'Kliknął', interested:'Zainteresowany', not_interested:'Niezainteresowany',
  out_of_office:'Poza biurem', auto_reply:'Automatyczna odpowiedź', paused:'Wstrzymany',
  valid:'Poprawny', invalid:'Niepoprawny', risky:'Ryzykowny', catch_all:'Catch-all',
  unknown:'Nieznany', pending:'W toku', needs_custom_email:'Wymaga nowego e-maila',
};

function StatusBadge({ label }) {
  const {ct}=useCampaignLanguage();
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${BADGE_STYLES[label] || 'bg-gray-100 text-gray-600'}`}>
      {ct(STATUS_LABELS[label] || label)}
    </span>
  );
}

function deriveStatuses(lead) {
  const badges = [];
  badges.push(lead.status || 'active');
  if (lead.replied) badges.push('replied');
  if (lead.opened) badges.push('opened');
  if (lead.clicked) badges.push('clicked');
  const intr = lead.interest ?? lead.interest_status;
  if (intr === 'interested') badges.push('interested');
  if (intr === 'not_interested') badges.push('not_interested');
  if (intr === 'out_of_office') badges.push('out_of_office');
  if (intr === 'auto_reply') badges.push('auto_reply');
  if (lead.sending_paused) badges.push('paused');
  if (lead.email_verification_status) badges.push(lead.email_verification_status);
  return [...new Set(badges)];
}

// ─── Leads Tab ────────────────────────────────────────────────────────────────
export function LeadsTab({ leads, campaignId, refresh, onViewQueue }) {
  const {ct,language}=useCampaignLanguage();
  const notify  = useNotify();
  const confirm = useConfirm();
  const [showAdd, setShowAdd] = useState(false);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [showFilters, setShowFilters] = useState(false);
  const [showColumns, setShowColumns] = useState(false);
  const [hiddenFields, setHiddenFields] = useState([]);
  const [adding, setAdding] = useState(false);
  const [mode, setMode]   = useState('single');
  const [single, setSingle] = useState({ email: '', name: '', custom: '' });
  const [bulk, setBulk]   = useState('');
  const [msg, setMsg]     = useState(null);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [verifyEmails, setVerifyEmails] = useState(false);
  const [emailVerifEnabled, setEmailVerifEnabled] = useState(() => {
    try { return localStorage.getItem('emailVerifEnabled') === 'true'; } catch { return false; }
  });
  const [lastDuplicates, setLastDuplicates] = useState([]);
  const [editCell, setEditCell] = useState(null); // { leadId, field }
  const [editValue, setEditValue] = useState('');
  const [importing, setImporting] = useState(false);
  const [showFormatInfo, setShowFormatInfo] = useState(false);
  const fileInputRef = useRef(null);
  const [verifying, setVerifying] = useState(false);
  const [verificationSummary, setVerificationSummary] = useState(null);
  const [showLeadsConfirm, setShowLeadsConfirm] = useState(false);
  const [confirmPayload, setConfirmPayload] = useState(null);
  const [confirmPreview, setConfirmPreview] = useState(null);
  const [confirmAddLoading, setConfirmAddLoading] = useState(false);
  const [importFile, setImportFile] = useState(null);
  // filters: { status, interest, opened, replied, clicked, verification }
  const [filters, setFilters] = useState(emptyRecipientFilters);
  const setFilter = (key, val) => { setFilters(prev => ({ ...prev, [key]: val })); setPage(1); };
  const hasActiveFilter = !!query.trim() || Object.values(filters).some(v => v !== 'all');
  const clearFilters = () => { setFilters(emptyRecipientFilters); setQuery(''); setPage(1); };

  // All custom field names across all leads
  const customFields = useMemo(() => {
    const keys = new Set();
    leads.forEach(l => Object.keys(l.custom_data || {}).forEach(k => keys.add(k)));
    return [...keys].sort();
  }, [leads]);

  const visibleFields = customFields.filter(f => !hiddenFields.includes(f));
  const filteredLeads = useMemo(() => filterRecipients(leads, filters, query), [leads, filters, query]);
  const pageCount = Math.max(1, Math.ceil(filteredLeads.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageLeads = filteredLeads.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  useEffect(() => { if (page > pageCount) setPage(pageCount); }, [page, pageCount]);

  // Load verification summary
  const loadVerificationSummary = useCallback(async () => {
    try {
      const res = await api.get(`/campaigns/${campaignId}/leads/verification-status`);
      setVerificationSummary(res);
    } catch {}
  }, [campaignId]);

  useEffect(() => { loadVerificationSummary(); }, [loadVerificationSummary]);

  useEffect(() => {
    api.get('/settings/email-verification').then(d => {
      const enabled = !!d.enabled;
      setEmailVerifEnabled(enabled);
      try { localStorage.setItem('emailVerifEnabled', enabled ? 'true' : 'false'); } catch {}
    }).catch(() => {});
  }, []);

  // Interval ref so we can clear the poll on unmount or completion
  const verifyPollRef = useRef(null);

  // Verify all unverified leads (or re-verify when forceReverify=true)
  const verifyAllLeads = async (forceReverify = false) => {
    setVerifying(true);
    try {
      const url = `/campaigns/${campaignId}/leads/verify` + (forceReverify ? '?reverify=true' : '');
      const res = await api.post(url);

      // Nothing queued – ask the user if they want to re-verify existing ones
      if (res.queued === 0 && res.needs_reverify && !forceReverify) {
        const confirmed = await confirm(
          ct('Wszystkie kontakty ({count}) są już zweryfikowane. Zweryfikować je ponownie?',{count:res.total_verified})
        );
        setVerifying(false);
        if (confirmed) verifyAllLeads(true);
        return;
      }

      if (res.queued === 0) {
        notify({ type: 'info', message: ct("Brak kontaktów do weryfikacji.") });
        setVerifying(false);
        return;
      }

      notify({ type: 'success', message: ct('Weryfikacja kontaktów: {count}…',{count:res.queued}) });

      // Poll verification-status every 5 s and show a toast per change
      let prevStatuses = { ...(verificationSummary?.statuses || {}) };

      verifyPollRef.current = setInterval(async () => {
        try {
          const newSummary = await api.get(`/campaigns/${campaignId}/leads/verification-status`);
          setVerificationSummary(newSummary);
          const ns = newSummary.statuses || {};

          // Toast for any counts that increased
          Object.entries(ns).forEach(([status, count]) => {
            const delta = count - (prevStatuses[status] || 0);
            if (delta > 0 && status !== 'pending') {
              const isWarn = status === 'invalid' || status === 'risky';
              notify({
                type: isWarn ? 'warning' : 'success',
                message: ct('Zweryfikowano {count} kontaktów → {status}',{count:delta,status:ct(STATUS_LABELS[status]||status)}),
              });
            }
          });

          prevStatuses = { ...ns };

          // Stop polling once no leads remain in pending state
          if (!ns.pending || ns.pending === 0) {
            clearInterval(verifyPollRef.current);
            verifyPollRef.current = null;
            setVerifying(false);
            refresh();
          }
        } catch {
          // ignore transient poll errors
        }
      }, 5000);
    } catch (e) {
      notify({ type: 'error', message: e.message });
      setVerifying(false);
    }
  };

  // Clean up any running verification poll when the component unmounts
  useEffect(() => () => { if (verifyPollRef.current) clearInterval(verifyPollRef.current); }, []);

  const startEdit = (leadId, field, val) => {
    setEditCell({ leadId, field });
    setEditValue(val == null ? '' : String(val));
  };
  const cancelEdit = () => setEditCell(null);

  const commitEdit = async (leadId) => {
    if (!editCell) return;
    const lead = leads.find(l => l.lead_id === leadId);
    if (!lead) { cancelEdit(); return; }
    const newCustom = { ...(lead.custom_data || {}), [editCell.field]: editValue };
    try {
      await api.patch(`/leads/${leadId}`, { custom_data: newCustom });
      notify({ type: 'success', message: ct("Zapisano.") });
      refresh();
    } catch (e) {
      notify({ type: 'error', message: e.message });
    }
    cancelEdit();
  };

  const removeLead = async (lid, email) => {
    const ok = await confirm({message:ct('Usunąć {email} z tej kampanii?',{email}),danger:true});
    if (!ok) return;
    try {
      await api.del(`/campaigns/${campaignId}/leads/${lid}`);
      notify({ type: 'success', message: ct("Kontakt usunięty z kampanii.") });
      refresh();
    } catch (e) {
      notify({ type: 'error', message: e.message });
    }
  };

  const addSingle = async e => {
    e.preventDefault();
    setMsg(null);
    if (adding) return;
    if (!single.email.trim()) { setMsg({ type: 'error', text: 'Adres e-mail jest wymagany.' }); return; }
    let custom_data;
    if (single.custom.trim()) {
      try { custom_data = JSON.parse(single.custom); }
      catch { setMsg({ type: 'error', text: 'Dane niestandardowe muszą być poprawnym JSON-em.' }); return; }
    }
    setAdding(true);
    try {
      const res = await api.post(`/campaigns/${campaignId}/leads?skip_duplicates=${skipDuplicates}&verify_emails=${verifyEmails}`, [{
        email: single.email.trim(),
        name: single.name.trim() || undefined,
        custom_data,
      }]);
      setSingle({ email: '', name: '', custom: '' });
      setShowAdd(false);
      setLastDuplicates(res?.duplicate_leads || []);
      notify({ type: 'success', message: ct('Dodano kontaktów: {count}',{count:res?.added??1}) });
      refresh();
    } catch (e) {
      setMsg({ type: 'error', text: e.message });
    } finally { setAdding(false); }
  };

  /* Enhanced bulk parser – supports:
     1. email-per-line  (john@a.com)
     2. comma-separated (john@a.com, jane@b.com)
     3. tab-separated rows from Excel / Sheets copy-paste (email \t name \t company ...)
     4. CSV-style rows with headers (email,name,company\njohn@a.com,John,Acme)
  */
  const addBulk = async e => {
    e.preventDefault();
    if (adding) return;
    const lines = bulk.split('\n').map(s => s.trim()).filter(Boolean);
    if (!lines.length) { setMsg({ type: 'error', text: 'Nie wprowadzono danych.' }); return; }

    // Detect if first line could be a header
    const firstLine = lines[0];
    const hasTabs = firstLine.includes('\t');
    const sep = hasTabs ? '\t' : ',';
    const cells = firstLine.split(sep).map(s => s.trim().toLowerCase());
    const looksLikeHeader = cells.includes('email');

    let payload;
    if (looksLikeHeader) {
      // Parse as tabular data with headers
      const headers = cells;
      const emailIdx = headers.indexOf('email');
      const nameIdx = headers.indexOf('name');
      payload = lines.slice(1).map(line => {
        const parts = line.split(sep).map(s => s.trim());
        const email = parts[emailIdx] || '';
        const name = nameIdx >= 0 ? (parts[nameIdx] || '') : '';
        const custom_data = {};
        headers.forEach((h, i) => {
          if (i !== emailIdx && i !== nameIdx && parts[i]) {
            custom_data[h] = parts[i];
          }
        });
        return { email, name: name || undefined, custom_data: Object.keys(custom_data).length ? custom_data : undefined };
      }).filter(r => r.email);
    } else {
      // Simple mode – emails only (comma or newline separated)
      const all = bulk.split(/[,\n]/).map(s => s.trim()).filter(Boolean);
      payload = all.map(em => ({ email: em }));
    }

    if (!payload.length) { setMsg({ type: 'error', text: 'Nie znaleziono poprawnych adresów e-mail.' }); return; }

    setAdding(true);
    try {
      const preview = await api.post(`/campaigns/${campaignId}/leads?confirm_only=true&skip_duplicates=${skipDuplicates}`, payload);
      setConfirmPayload(payload);
      setConfirmPreview(preview);
      setImportFile(null);
      setShowAdd(false);
      setShowLeadsConfirm(true);
    } catch (e) {
      setMsg({ type: 'error', text: e.message });
    } finally { setAdding(false); }
  };

  // ---- File import ----
  const handleFileImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setLastDuplicates([]);
    try {
      const preview = await api.upload(`/campaigns/${campaignId}/leads/import?confirm_only=true&skip_duplicates=${skipDuplicates}`, file);
      setImportFile(file);
      setConfirmPayload(null);
      setConfirmPreview(preview);
      setShowAdd(false);
      setShowLeadsConfirm(true);
    } catch (err) {
      notify({ type: 'error', message: err.message });
    } finally {
      setImporting(false);
    }
  };

  const handleConfirmAdd = async () => {
    setConfirmAddLoading(true);
    try {
      let res;
      if (confirmPayload) {
        res = await api.post(`/campaigns/${campaignId}/leads?skip_duplicates=${skipDuplicates}&verify_emails=${verifyEmails}`, confirmPayload);
        setBulk('');
        const dupMsg = res.duplicate_leads?.length ? ct(' (pominięto duplikaty: {count})',{count:res.duplicate_leads.length}) : '';
        notify({ type: 'success', message: ct('Dodano kontaktów: {count}',{count:res.added??confirmPayload.length})+dupMsg });
      } else if (importFile) {
        res = await api.upload(`/campaigns/${campaignId}/leads/import?skip_duplicates=${skipDuplicates}&verify_emails=${verifyEmails}`, importFile);
        const dupMsg = res.duplicate_leads?.length ? ct(', pominięto duplikaty: {count}',{count:res.duplicate_leads.length}) : '';
        notify({ type: 'success', message: ct('Import: dodano {added}, już przypisanych {enrolled}, błędów {errors}{duplicates}',{added:res.added,enrolled:res.already_enrolled,errors:res.errors,duplicates:dupMsg}) });
      }
      setShowLeadsConfirm(false);
      setConfirmPreview(null);
      setConfirmPayload(null);
      setImportFile(null);
      setLastDuplicates(res?.duplicate_leads || []);
      refresh();
    } catch (err) {
      notify({ type: 'error', message: err.message });
    } finally {
      setConfirmAddLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // ---- File export ----
  const handleExport = async () => {
    try {
      const blob = new Blob([recipientsCsv(filteredLeads)], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `odbiorcy-kampanii-${campaignId}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      notify({ type: 'error', message: err.message });
    }
  };

  return (
    <div className="sk-campaign-recipients">
      <div className="sk-metrics four">
        <Metric icon="contacts" title={ct("Kontakty w kampanii")} value={leads.length} detail={ct("Wszyscy przypisani odbiorcy")}/>
        <Metric icon="chat" title={ct("Odpowiedzi")} value={leads.filter(l=>l.replied).length} detail={ct("Kontakty, które odpowiedziały")} tone="blue"/>
        <Metric icon="warning" title={ct("Treści do uzupełnienia")} value={leads.filter(l=>l.status==='needs_custom_email').length} detail={ct("Wymagają nowej wiadomości")} tone="amber"/>
        <Metric icon="shield" title={ct("Odbite lub wypisane")} value={leads.filter(l=>['bounced','unsubscribed'].includes(l.status)).length} detail={ct("Status kontaktu w kampanii")} tone="red"/>
      </div>
      {/* Import / Export toolbar */}
      <div className="sk-recipient-toolbar">
        <Button size="sm" onClick={()=>setShowAdd(true)}>{ct("Dodaj kontakty")}</Button>
        <CampaignGroupPicker campaignId={campaignId} onAdded={refresh}/>
        <input type="search" aria-label={ct("Szukaj odbiorców")} placeholder={ct("Szukaj po e-mailu, imieniu, firmie…")} value={query} onChange={e=>{setQuery(e.target.value);setPage(1);}}/>
        <Button size="sm" variant="outline" aria-expanded={showFilters} onClick={()=>setShowFilters(v=>!v)}>{ct("Filtry")}</Button>
        {customFields.length>0&&<Button size="sm" variant="outline" aria-expanded={showColumns} onClick={()=>setShowColumns(v=>!v)}>{ct("Kolumny")}</Button>}
        <Button size="sm" variant="outline" onClick={handleExport} disabled={!filteredLeads.length}>
          <svg className="w-4 h-4 mr-1.5 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V3" /></svg> {ct("Eksport")}{hasActiveFilter ? ct(" (filtrowany)") : ''} CSV
        </Button>
        <FileUploadArea
          ref={fileInputRef}
          size="sm"
          accept=".csv,.tsv,.txt"
          disabled={importing}
          onChange={handleFileImport}
        >
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M16 8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          {importing ? ct("Importowanie…") : ct("Import CSV")}
        </FileUploadArea>
        {emailVerifEnabled && (
          <Button size="sm" variant="outline" onClick={()=>verifyAllLeads()} disabled={verifying}>
            {verifying ? ct("Weryfikowanie…") : ct("Zweryfikuj wszystkie e-maile")}
          </Button>
        )}
        <span className="text-xs text-gray-400 ml-1">
          {filteredLeads.length}{hasActiveFilter ? `/${leads.length}` : ''} {ct("kontaktów")} </span>
        {hasActiveFilter && (
          <button
            className="text-xs text-teal-600 hover:underline ml-1"
            onClick={clearFilters}
          >{ct("Wyczyść filtry")}</button>
        )}
      </div>

      {/* Duplicate leads notice */}
      {lastDuplicates.length > 0 && (
        <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-sm font-medium text-yellow-800 mb-1">{ct("Pominięte duplikaty (")}{lastDuplicates.length}{ct(") — już przypisane do kampanii:")}</p>
          <div className="flex flex-wrap gap-1 mt-1">
            {lastDuplicates.map(email => (
              <span key={email} className="font-mono text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded">{email}</span>
            ))}
          </div>
          <button className="text-xs text-yellow-600 underline mt-1" onClick={() => setLastDuplicates([])}>{ct("Ukryj")}</button>
        </div>
      )}

      {/* Add contacts stays out of the table flow; drafts survive closing the drawer. */}
      {showAdd && <Modal title={ct("Dodaj kontakty do kampanii")} drawer busy={adding} onClose={()=>setShowAdd(false)}>
      <div className="sk-recipient-add">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-800">{ct("Dodaj kontakty")}</h3>
          <button
            className="text-gray-400 hover:text-teal-600 transition-colors"
            onClick={() => setShowFormatInfo(v => !v)}
            title={ct("Obsługiwane formaty danych")}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          </button>
        </div>

        {showFormatInfo && (
          <div className="mb-4 p-3 bg-teal-50 border border-teal-200 rounded-lg text-sm text-teal-800 space-y-2">
            <p className="font-semibold">{ct("Obsługiwane formaty wklejania zbiorczego:")}</p>
            <ul className="list-disc pl-5 space-y-1 text-xs">
              <li><strong>{ct("Tylko adresy e-mail")}</strong> {ct("— jeden w wierszu lub rozdzielone przecinkami")}<br/><code className="bg-teal-100 px-1 rounded">john@a.com, jane@b.com</code></li>
              <li><strong>{ct("Rozdzielone tabulatorami (Excel / Arkusze)")}</strong> {ct("— pierwszy wiersz to nagłówki")}<br/><code className="bg-teal-100 px-1 rounded">email&nbsp;&nbsp;&nbsp;name&nbsp;&nbsp;&nbsp;company</code><br/><code className="bg-teal-100 px-1 rounded">john@a.com&nbsp;&nbsp;&nbsp;John&nbsp;&nbsp;&nbsp;Acme</code></li>
              <li><strong>{ct("Rozdzielone przecinkami z nagłówkami")}</strong><br/><code className="bg-teal-100 px-1 rounded">email,name,company</code><br/><code className="bg-teal-100 px-1 rounded">john@a.com,John,Acme</code></li>
            </ul>
            <p className="text-xs text-teal-600 mt-1">{ct("Kolumny poza")} <em>email</em> {ct('i')} <em>name</em> {ct("są zapisywane jako pola niestandardowe.")}</p>
            <p className="font-semibold mt-2">{ct("Import pliku CSV:")}</p>
            <p className="text-xs">{ct("Wgraj plik")} <code className="bg-teal-100 px-1 rounded">.csv</code> {ct("lub")} <code className="bg-teal-100 px-1 rounded">.tsv</code> {ct("z kolumną nagłówkową")} <em>email</em>{ct(". Dodatkowe kolumny staną się polami niestandardowymi.")}</p>
          </div>
        )}

        <div className="flex gap-2 mb-3">
          <Button size="sm" variant={mode==='single'?'default':'outline'} onClick={()=>setMode('single')}>{ct("Pojedynczo")}</Button>
          <Button size="sm" variant={mode==='bulk'?'default':'outline'}   onClick={()=>setMode('bulk')}>{ct("Wklej zbiorczo")}</Button>
        </div>
        <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer select-none mb-2">
          <input
            type="checkbox"
            checked={skipDuplicates}
            onChange={e => { setSkipDuplicates(e.target.checked); setLastDuplicates([]); }}
            className="rounded"
          /> {ct("Pomijaj duplikaty (sprawdza wszystkie kampanie)")} </label>
        {emailVerifEnabled && (
          <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer select-none mb-4">
            <input
              type="checkbox"
              checked={verifyEmails}
              onChange={e => setVerifyEmails(e.target.checked)}
              className="rounded"
            /> {ct("Weryfikuj e-maile po dodaniu")} </label>
        )}
        {msg && <div className={`mb-2 text-sm ${msg.type==='error'?'text-red-600':'text-green-600'}`}>{ct(msg.text)}</div>}
        {mode === 'single' && (
          <form onSubmit={addSingle} className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-gray-600 mb-1">{ct("E-mail *")}</label>
                <input
                  type="email" aria-label={ct("E-mail kontaktu")} required
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300"
                  value={single.email}
                  onChange={e => setSingle(s=>({...s, email: e.target.value}))}
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">{ct("Nazwa / imię")}</label>
                <input
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300"
                  aria-label={ct("Nazwa lub imię kontaktu")} value={single.name}
                  onChange={e => setSingle(s=>({...s, name: e.target.value}))}
                />
              </div>
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">{ct("Dane niestandardowe (JSON)")}</label>
              <textarea
                rows={2}
                className="w-full border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-teal-300"
                placeholder='{"company": "Acme", "title": "CEO"}'
                aria-label={ct("Dane niestandardowe JSON")} value={single.custom}
                onChange={e => setSingle(s=>({...s, custom: e.target.value}))}
              />
            </div>
            <Button size="sm" variant="default" disabled={adding}>{adding ? ct("Dodawanie…") : ct("Dodaj kontakt")}</Button>
          </form>
        )}
        {mode === 'bulk' && (
          <form onSubmit={addBulk} className="space-y-3">
            <div>
              <label className="block text-sm text-gray-600 mb-1">{ct("Wklej kontakty — adresy e-mail, wiersze CSV lub dane skopiowane z Excela (zobacz ⓘ powyżej)")}</label>
              <textarea
                rows={6}
                className="w-full border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-teal-300"
                placeholder={"email,name,company\njohn@acme.com,John Doe,Acme Inc\njane@co.io,Jane Smith,Co"}
                aria-label={ct("Kontakty do dodania zbiorczo")} value={bulk}
                onChange={e => setBulk(e.target.value)}
              />
            </div>
            <Button size="sm" variant="default" disabled={adding}>{adding ? ct("Sprawdzanie…") : ct("Dodaj kontakty")}</Button>
          </form>
        )}
      </div>

      </Modal>}

      {showFilters && <div className="sk-recipient-filters" role="group" aria-label={ct("Filtry odbiorców")}>
        {recipientFilters.map(([key,label,options])=><label key={key}>{ct(label)}<select value={filters[key]} onChange={e=>setFilter(key,e.target.value)}>{options.map(([v,text])=><option key={v} value={v}>{ct(text)}</option>)}</select></label>)}
      </div>}
      {showColumns && <fieldset className="sk-recipient-columns"><legend>{ct("Widoczne pola niestandardowe")}</legend>{customFields.map(f=><label key={f}><input type="checkbox" checked={!hiddenFields.includes(f)} onChange={e=>setHiddenFields(old=>e.target.checked?old.filter(x=>x!==f):[...old,f])}/>{f}</label>)}</fieldset>}

      {/* Leads table */}
      {filteredLeads.length === 0 ? (
        <div className="bg-gray-50 rounded-lg border border-dashed border-gray-300 p-8 text-center text-gray-400">
          {leads.length === 0
            ? ct("Brak kontaktów w kampanii. Użyj przycisku „Dodaj kontakty” lub zaimportuj plik CSV.")
            : ct("Brak kontaktów pasujących do bieżącego filtra.")}
        </div>
      ) : (
        <div className="w-full max-w-full min-w-0 overflow-x-auto rounded-lg border border-gray-200 shadow-sm">
          <table className="sk-table sk-recipient-table">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-3 text-left font-semibold text-gray-600 whitespace-nowrap">{ct("E-mail")}</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">{ct("Nazwa / imię")}</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">{ct("Status")}</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">{ct("Etap")}</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600 whitespace-nowrap">{ct("Skrzynka")}</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600 whitespace-nowrap">{ct("Dodano")}</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600 whitespace-nowrap">{ct("Wysyłka")}</th>
                {visibleFields.map(f => (
                  <th key={f} className="px-4 py-3 text-left font-semibold text-gray-600 whitespace-nowrap capitalize">{f}</th>
                ))}
                <th className="px-4 py-3 w-16"></th>
              </tr>
            </thead>
            <tbody>
              {pageLeads.map(l => (
                <tr key={l.lead_id} className="border-b border-gray-100 hover:bg-gray-50/60 transition-colors">
                  {/* email */}
                  <td className="px-4 py-2.5">
                    <button
                      className="font-mono text-teal-600 hover:underline text-left"
                      onClick={() => onViewQueue?.(l.email)}
                      title={ct("Pokaż kolejkę dla tego kontaktu")}
                    >
                      {l.email}
                    </button>
                  </td>
                  {/* name */}
                  <td className="px-4 py-2.5 text-gray-700">{l.name || <span className="text-gray-300">—</span>}</td>
                  {/* status badges */}
                  <td className="px-4 py-2.5">
                    <div className="sk-recipient-badges">
                      {deriveStatuses(l).map(s => <StatusBadge key={s} label={s} />)}
                    </div>
                  </td>
                  {/* stage */}
                  <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{l.stage?.replace(/^Step /, 'Krok ') || '—'}</td>
                  {/* inbox that last sent or will send next */}
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    {l.from_inbox_email ? (
                      <span className="font-mono text-xs text-gray-700" title={ct("Ostatnia skrzynka nadawcza albo następna zaplanowana, jeśli jeszcze nic nie wysłano")}>
                        {l.from_inbox_email}
                      </span>
                    ) : (
                      <span className="text-gray-300 text-xs">—</span>
                    )}
                  </td>
                  {/* enrolled date */}
                  <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">
                    {new Date(l.enrolled_at).toLocaleDateString(language)}
                  </td>
                  {/* Sending toggle + interest status dropdown */}
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        className={`text-xs font-medium px-2 py-1 rounded transition-colors ${
                          l.sending_paused
                            ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
                            : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                        }`}
                        onClick={async () => {
                          try {
                            await api.patch(`/campaigns/${campaignId}/leads/${l.lead_id}`, {
                              sending_paused: !l.sending_paused,
                            });
                            notify({ type: 'success', message: l.sending_paused ? ct("Wysyłka wznowiona") : ct("Wysyłka wstrzymana") });
                            refresh();
                          } catch (err) { notify({ type: 'error', message: err.message }); }
                        }}
                        title={l.sending_paused ? ct("Kliknij, aby wznowić wysyłkę") : ct("Kliknij, aby wstrzymać wysyłkę")}
                      >
                        {l.sending_paused ? ct("Wstrzymana") : ct("Aktywna")}
                      </button>
                      <select
                        className={`text-[10px] font-medium rounded px-1.5 py-0.5 border cursor-pointer focus:outline-none focus:ring-1 focus:ring-teal-300 ${BADGE_STYLES[l.interest || l.interest_status] || 'bg-gray-50 text-gray-500 border-gray-200'}`}
                        value={l.interest || l.interest_status || ''}
                        title={ct("Intencja odpowiedzi w tej kampanii — kliknij, aby zmienić lub usunąć")}
                        onChange={async (e) => {
                          const newStatus = e.target.value;
                          try {
                            await api.patch(`/campaigns/${campaignId}/leads/${l.lead_id}`, {
                              interest: newStatus,
                            });
                            notify({ type: 'success', message: newStatus ? ct('Ustawiono: {status}',{status:ct(STATUS_LABELS[newStatus]||newStatus.replace(/_/g,' '))}) : ct("Wyczyszczono") });
                            refresh();
                          } catch (err) { notify({ type: 'error', message: err.message }); }
                        }}
                      >
                        <option value="">{ct("— brak oceny —")}</option>
                        <option value="interested">{ct("Zainteresowany")}</option>
                        <option value="not_interested">{ct("Niezainteresowany")}</option>
                        <option value="out_of_office">{ct("Poza biurem")}</option>
                        <option value="auto_reply">{ct("Automatyczna odpowiedź")}</option>
                      </select>
                    </div>
                  </td>
                  {/* custom data columns — inline editable */}
                  {visibleFields.map(f => {
                    const isEditing = editCell?.leadId === l.lead_id && editCell?.field === f;
                    const val = (l.custom_data || {})[f];
                    return (
                      <td key={f} className="px-4 py-2.5 max-w-[200px]">
                        {isEditing ? (
                          <input
                            autoFocus
                            className="w-full border border-teal-400 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300"
                            value={editValue}
                            onChange={e => setEditValue(e.target.value)}
                            onBlur={() => commitEdit(l.lead_id)}
                            onKeyDown={e => {
                              if (e.key === 'Enter')  commitEdit(l.lead_id);
                              if (e.key === 'Escape') cancelEdit();
                            }}
                          />
                        ) : (
                          <button
                            className="w-full text-left px-2 py-1 rounded-md border border-transparent hover:border-teal-200 hover:bg-teal-50 transition-colors group"
                            onClick={() => startEdit(l.lead_id, f, val)}
                            title={ct("Kliknij, aby edytować")}
                          >
                            {val != null
                              ? <span className="text-gray-800">{String(val)}</span>
                              : <span className="text-gray-300 italic group-hover:text-teal-300 text-xs">{ct("puste")}</span>
                            }
                          </button>
                        )}
                      </td>
                    );
                  })}
                  {/* remove */}
                  <td className="px-4 py-2.5 text-right">
                    <button
                      className="text-red-400 hover:text-red-600 text-xs font-medium transition-colors"
                      onClick={() => removeLead(l.lead_id, l.email)}
                    > {ct("Usuń z kampanii")} </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="sk-recipient-pagination">
        <span role="status">{filteredLeads.length ? (currentPage-1)*pageSize+1 : 0}–{Math.min(currentPage*pageSize,filteredLeads.length)} {ct("z")} {filteredLeads.length} {ct("kontaktów")}</span>
        <label>{ct("Wierszy na stronę")} <select value={pageSize} onChange={e=>{setPageSize(Number(e.target.value));setPage(1);}}>{[10,25,50,100].map(n=><option key={n}>{n}</option>)}</select></label>
        <Button size="sm" variant="outline" disabled={currentPage<=1} onClick={()=>setPage(currentPage-1)}>{ct("Poprzednia")}</Button>
        <span>{ct("Strona")} {currentPage} {ct("z")} {pageCount}</span>
        <Button size="sm" variant="outline" disabled={currentPage>=pageCount} onClick={()=>setPage(currentPage+1)}>{ct("Następna")}</Button>
      </div>

      {/* Confirm leads modal */}
      {showLeadsConfirm && confirmPreview && (
        <Modal title={ct("Sprawdź kontakty przed dodaniem")} small busy={confirmAddLoading} onClose={()=>setShowLeadsConfirm(false)}>
            <div className="mb-4 text-center">
              <div className="text-3xl font-bold text-teal-600">{confirmPreview.total_valid}</div>
              <div className="text-sm text-gray-500">{ct("poprawnych kontaktów")}</div>
            </div>

            {confirmPreview.providers && Object.keys(confirmPreview.providers).length > 0 && (
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-2">{ct("Dostawcy poczty")}</h3>
                <div className="space-y-1">
                  {Object.entries(confirmPreview.providers).map(([provider, count]) => (
                    <div key={provider} className="flex justify-between text-sm py-1 px-2 rounded odd:bg-gray-50">
                      <span className="text-gray-700">{provider}</span>
                      <span className="font-mono text-gray-900">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {confirmPreview.total_flagged > 0 && (
              <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-sm font-semibold text-yellow-800 mb-1">{ct("Problemy:")} {confirmPreview.total_flagged} {ct("— te wpisy zostaną pominięte")}</p>
                {confirmPreview.flagged?.invalid_format?.length > 0 && (
                  <div className="mt-1">
                    <span className="text-xs text-yellow-700 font-medium">{ct("Niepoprawny format:")}</span>
                    <div className="flex flex-wrap gap-1 mt-0.5">
                      {confirmPreview.flagged.invalid_format.map((em, i) => (
                        <span key={i} className="font-mono text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded">{em}</span>
                      ))}
                    </div>
                  </div>
                )}
                {confirmPreview.flagged?.duplicates_in_batch > 0 && (
                  <p className="text-xs text-yellow-700 mt-1">{ct("Duplikaty w tej partii:")} {confirmPreview.flagged.duplicates_in_batch}</p>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2 mt-6 pt-3 border-t border-gray-100">
              <Button variant="outline" size="sm" disabled={confirmAddLoading} onClick={() => setShowLeadsConfirm(false)}>{ct("Anuluj")}</Button>
              <Button variant="default" size="sm" onClick={handleConfirmAdd} disabled={confirmAddLoading}>
                {confirmAddLoading ? ct("Dodawanie…") : ct('Potwierdź i dodaj ({count})',{count:confirmPreview.total_valid})}
              </Button>
            </div>
        </Modal>
      )}

    </div>
  );
}

// ─── Analytics Tab ────────────────────────────────────────────────────────────
const SERIES_LIST = [
  { key: 'sent',         name: 'Wysłane',          stroke: 'var(--sk-accent)', fill: 'color-mix(in srgb, var(--sk-accent) 12%, transparent)' },
  { key: 'totalOpens',   name: 'Wszystkie otwarcia',   stroke: 'rgba(234,179,8,0.8)',   fill: 'rgba(234,179,8,0.15)' },
  { key: 'uniqueOpens',  name: 'Unikalne otwarcia',  stroke: 'rgba(16,185,129,0.8)',  fill: 'rgba(16,185,129,0.15)' },
  { key: 'totalReplies', name: 'Odpowiedzi',        stroke: 'var(--sk-blue)', fill: 'color-mix(in srgb, var(--sk-blue) 10%, transparent)' },
  { key: 'totalClicks',  name: 'Wszystkie kliknięcia',  stroke: 'rgba(234,88,12,0.8)',   fill: 'rgba(234,88,12,0.15)' },
  { key: 'uniqueClicks', name: 'Unikalne kliknięcia', stroke: 'rgba(236,72,153,0.8)',  fill: 'rgba(236,72,153,0.15)' },
];

export function CampaignAnalyticsTab({ campaignId, sentData = [], sequences = [], onRefresh }) {
  const {ct,language}=useCampaignLanguage();
  const notify = useNotify();
  const today = new Date();
  const localIso = (dt) => `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
  const todayStr = localIso(today);

  // Date preset helpers
  const presets = useMemo(() => {
    const d = (offset) => { const t = new Date(today); t.setDate(t.getDate() + offset); return localIso(t); };
    const monday = (dt) => { const t = new Date(dt); const day = t.getDay(); t.setDate(t.getDate() - (day === 0 ? 6 : day - 1)); return t; };
    const lastWeekEnd = new Date(monday(today)); lastWeekEnd.setDate(lastWeekEnd.getDate() - 1);
    const lastWeekStart = localIso(monday(lastWeekEnd));
    const lastMonthStart = localIso(new Date(today.getFullYear(), today.getMonth() - 1, 1));
    const lastMonthEnd = localIso(new Date(today.getFullYear(), today.getMonth(), 0));
    return [
      { label: 'Ostatnie 7 dni',  start: d(-6),          end: todayStr },
      { label: 'Poprzedni tydzień',    start: lastWeekStart,  end: localIso(lastWeekEnd) },
      { label: 'Ostatnie 30 dni', start: d(-29),         end: todayStr },
      { label: 'Poprzedni miesiąc',   start: lastMonthStart, end: lastMonthEnd },
      { label: 'Ostatnie 90 dni', start: d(-89),         end: todayStr },
    ];
  }, [todayStr]);

  const [activePreset, setActivePreset] = useState('Ostatnie 7 dni');
  const defaultRange = presets.find(p => p.label === 'Ostatnie 7 dni') || presets[0];
  const [startDate, setStartDate] = useState(defaultRange.start);
  const [endDate,   setEndDate]   = useState(defaultRange.end);
  const [daily, setDaily] = useState({ rows: [], loading: true, error: null });
  const [steps, setSteps] = useState({ rows: [], loading: true, error: null });
  const [dailyRetry, setDailyRetry] = useState(0);
  const [stepRetry, setStepRetry] = useState(0);
  const [hide, setHide] = useState({ totalOpens: true, uniqueOpens: true, totalClicks: true, uniqueClicks: true });
  const [analyticsSub, setAnalyticsSub] = useState('steps');
  const [sentFilter, setSentFilter] = useState('all');
  const [variantBusy, setVariantBusy] = useState(false);
  const variantBusyRef = useRef(false);
  const rangeError = analyticsRangeError(startDate, endDate);

  useEffect(() => {
    let current = true;
    setDaily({ rows: [], loading: !rangeError, error: rangeError });
    if (rangeError) return;
    api.get(`/analytics/daily?start_date=${startDate}&end_date=${endDate}&campaign_id=${campaignId}`)
      .then(rows => { if (current) setDaily({ rows, loading: false, error: null }); })
      .catch(() => { if (current) setDaily({ rows: [], loading: false, error: 'Nie udało się pobrać wyników dziennych.' }); });
    return () => { current = false; };
  }, [campaignId, startDate, endDate, dailyRetry, rangeError]);

  useEffect(() => {
    let current = true;
    setSteps({ rows: [], loading: true, error: null });
    api.get(`/campaigns/${campaignId}/analytics/steps`)
      .then(rows => { if (current) setSteps({ rows, loading: false, error: null }); })
      .catch(() => { if (current) setSteps({ rows: [], loading: false, error: 'Nie udało się pobrać analityki kroków.' }); });
    return () => { current = false; };
  }, [campaignId, stepRetry]);

  const chartData = useMemo(() => daily.loading || daily.error || rangeError ? [] : campaignDailyRows(daily.rows, startDate, endDate), [daily, startDate, endDate, rangeError]);
  const totals = Object.fromEntries(SERIES_LIST.map(s => [s.key, chartData.reduce((sum, row) => sum + row[s.key], 0)]));
  const ready = !daily.loading && !daily.error && !rangeError;
  const hasEvents = chartData.some(row => SERIES_LIST.some(s => row[s.key] > 0));
  const number = value => value.toLocaleString(language);
  const metrics = [
    { key: 'sent', title: 'Wysłane', icon: 'send', tone: 'blue' },
    { key: 'totalReplies', title: 'Odpowiedzi', icon: 'reply', tone: 'green' },
    { key: 'totalOpens', title: 'Otwarcia', icon: 'eye', tone: 'purple' },
    { key: 'totalClicks', title: 'Kliknięcia', icon: 'link', tone: 'amber' },
  ];
  const ranked = steps.rows.flatMap(step => (step.variants || []).map(variant => ({ ...variant, sequenceId: step.sequence_id, subject: step.subject, rate: variant.sent > 0 ? variant.replies / variant.sent : 0 })))
    .filter(variant => variant.sent > 0).sort((a,b) => b.rate - a.rate || b.sent - a.sent).slice(0,5);
  const toggleVariant = async (seqId, variantId, enabled) => {
    if (variantBusyRef.current) return;
    variantBusyRef.current = true; setVariantBusy(true);
    try {
      await api.patch(`/campaigns/${campaignId}/sequences/${seqId}/variants/${variantId}`, { enabled });
      setStepRetry(n => n + 1); onRefresh?.();
      notify({ type: 'success', message: enabled ? ct("Wariant włączony") : ct("Wariant wyłączony") });
    } catch (e) { notify({ type: 'error', message: e.message }); }
    finally { variantBusyRef.current = false; setVariantBusy(false); }
  };
  const exportDaily = () => {
    const url = URL.createObjectURL(new Blob([analyticsCsv(chartData, ct)], {type:'text/csv;charset=utf-8'}));
    const link = document.createElement('a'); link.href = url; link.download = `kampania-${campaignId}-${startDate}-${endDate}.csv`; link.click(); URL.revokeObjectURL(url);
  };
  return (
    <div className="sk-campaign-analytics">
      <div className="sk-ca-toolbar">
        <div><h2>{ct("Analityka kampanii")}</h2><p>{startDate} — {endDate} {ct("· zdarzenia według daty wystąpienia")}</p></div>
        <Button variant="outline" onClick={exportDaily} disabled={!ready || !hasEvents}>{ct("Eksport CSV")}</Button>
      </div>
      <div className="sk-ca-presets" aria-label={ct("Zakres analityki")}>
        {presets.map(p => <button key={p.label} aria-pressed={activePreset === p.label} onClick={() => { setActivePreset(p.label); setStartDate(p.start); setEndDate(p.end); }}>{ct(p.label)}</button>)}
        <button aria-pressed={activePreset === 'custom'} onClick={() => setActivePreset('custom')}>{ct("Własny zakres")}</button>
      </div>
      {activePreset === 'custom' && <div className="sk-ca-dates">
        <label>{ct("Od")}<input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} /></label>
        <label>{ct("Do")}<input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} /></label>
      </div>}
      <ErrorNotice error={ct(rangeError || daily.error)} onRetry={rangeError ? undefined : () => setDailyRetry(n => n + 1)} />
      {daily.loading && <p role="status">{ct("Wczytywanie wyników dziennych…")}</p>}
      <div className="sk-ca-metrics">
        {metrics.map(m => <Metric key={m.key} icon={m.icon} title={ct(m.title)} value={ready ? number(totals[m.key]) : '—'} tone={m.tone} detail={ct("w wybranym zakresie")} />)}
      </div>
      {ready && !hasEvents && <p className="sk-ca-empty">{ct("Brak zdarzeń w wybranym zakresie. Wybierz inny okres, aby sprawdzić wcześniejsze wyniki.")}</p>}
      {ready && hasEvents && <div className="sk-ca-grid">
        <section className="sk-ca-panel">
          <h3>{ct("Aktywność wysyłki")}</h3><p>{ct("Liczba zdarzeń w kolejnych dniach.")}</p>
          <div className="sk-ca-chart">
            <ResponsiveContainer width="100%" height="100%">
              <ReAreaChart data={chartData} margin={{top:12,right:12,left:-20,bottom:0}}>
                <XAxis dataKey="date" tick={{fontSize:11,fill:'var(--sk-muted)'}} tickFormatter={d => `${d.slice(8)}.${d.slice(5,7)}`} minTickGap={25}/>
                <YAxis allowDecimals={false} tick={{fontSize:11,fill:'var(--sk-muted)'}}/>
                <CartesianGrid stroke="var(--sk-line)" strokeDasharray="3 3"/>
                <Tooltip contentStyle={{background:'var(--sk-surface)',border:'1px solid var(--sk-line)',borderRadius:8,color:'var(--sk-text)'}}/>
                {SERIES_LIST.map(s => <Area key={s.key} name={ct(s.name)} dataKey={s.key} type="linear" stroke={s.stroke} strokeWidth={2.5} fill={s.fill} hide={!!hide[s.key]}/>) }
              </ReAreaChart>
            </ResponsiveContainer>
          </div>
          <div className="sk-ca-legend">{SERIES_LIST.map(s => <button key={s.key} aria-pressed={!hide[s.key]} onClick={() => setHide(p => ({...p,[s.key]:!p[s.key]}))}><i style={{background:s.stroke}}/>{ct(s.name)}</button>)}</div>
        </section>
        <section className="sk-ca-panel">
          <h3>{ct("Podsumowanie aktywności")}</h3><p>{ct("Zdarzenia z wybranego okresu.")}</p>
          <dl className="sk-ca-summary">{metrics.map(m => <div key={m.key}><dt>{ct(m.title)}</dt><dd>{number(totals[m.key])}</dd></div>)}</dl>
          <p className="sk-ca-explanation">{ct("Otwarcia i kliknięcia obejmują powtórzenia. Odpowiedzi mogą dotyczyć wiadomości wysłanych wcześniej. Te liczby nie są lejkiem konwersji.")}</p>
          <p className="sk-ca-explanation">{ct("Unikalne otwarcia i kliknięcia na wykresie oznaczają unikalne adresy IP w danym dniu, nie liczbę odbiorców.")}</p>
        </section>
        <section className="sk-ca-panel">
          <h3>{ct("Wyniki według dnia")}</h3><p>{ct("Wybrany zakres · od najnowszych.")}</p>
          <div className="sk-ca-table-scroll"><table><thead><tr><th>{ct("Dzień")}</th><th>{ct("Wysłane")}</th><th>{ct("Odpowiedzi")}</th><th>{ct("Otwarcia")}</th><th>{ct("Kliknięcia")}</th></tr></thead><tbody>
            {[...chartData].reverse().map(row => <tr key={row.date}><th scope="row">{row.date}</th>{['sent','totalReplies','totalOpens','totalClicks'].map(k => <td key={k}>{number(row[k])}</td>)}</tr>)}
          </tbody></table></div>
        </section>
        <section className="sk-ca-panel">
          <h3>{ct("Najlepsze warianty")}</h3><p>{ct("Cały okres kampanii · według wskaźnika odpowiedzi.")}</p>
          {steps.loading ? <p role="status">{ct("Wczytywanie wariantów…")}</p> : steps.error ? <p>{ct("Ranking niedostępny. Ponów pobranie analityki kroków poniżej.")}</p> : ranked.length === 0 ? <p className="sk-ca-empty">{ct("Brak wysłanych wariantów.")}</p> : <div className="sk-ca-table-scroll"><table><thead><tr><th>{ct("Temat / wariant")}</th><th>{ct("Wysłane")}</th><th>{ct("Odpowiedzi")}</th><th>{ct("Wskaźnik")}</th></tr></thead><tbody>{ranked.map(v => <tr key={`${v.sequenceId}-${v.variant_id ?? 'default'}`}><th scope="row"><span>{v.subject || ct("Bez tematu")}</span><small>{v.variant_id == null ? ct("Domyślny") : v.variant_label}</small></th><td>{v.sent}</td><td>{v.replies}</td><td>{(v.rate*100).toLocaleString(language,{maximumFractionDigits:1})}%</td></tr>)}</tbody></table></div>}
        </section>
      </div>}
      <section className="sk-ca-panel sk-ca-details">
        <div className="sk-ca-presets" aria-label={ct("Szczegółowa analityka")}>{[{key:'steps',label:'Analityka kroków'},{key:'sent',label:'Wysłane wiadomości'}].map(sub => <button key={sub.key} aria-pressed={analyticsSub===sub.key} onClick={() => setAnalyticsSub(sub.key)}>{ct(sub.label)}</button>)}</div>
        <p>{ct("Cały okres kampanii — filtr dat powyżej dotyczy wyników dziennych.")}</p>
        {analyticsSub === 'steps' ? <><ErrorNotice error={ct(steps.error)} onRetry={() => setStepRetry(n => n + 1)}/>{!steps.error && <StepAnalyticsPanel stepStats={steps.rows} loading={steps.loading} campaignId={campaignId} sequences={sequences} onToggleVariant={toggleVariant} variantBusy={variantBusy}/>}</> : <SentEmailsPanel sentData={sentData} filter={sentFilter} onFilterChange={setSentFilter}/>}
      </section>
    </div>
  );
}

// ─── Step Analytics Panel ─────────────────────────────────────────────────────
function StepAnalyticsPanel({ stepStats, loading, campaignId, sequences, onToggleVariant, variantBusy }) {
  const {ct}=useCampaignLanguage();
  const [expandedSteps, setExpandedSteps] = useState({});

  const toggleStep = (idx) => setExpandedSteps(p => ({ ...p, [idx]: !p[idx] }));

  const pct = (n, total) => total > 0 ? `${Math.round(n / total * 100)}%` : '—';

  if (loading) return <div className="py-8 text-center text-gray-400 text-sm">{ct("Wczytywanie analityki kroków…")}</div>;
  if (!stepStats.length) return <div className="py-8 text-center text-gray-400 text-sm">{ct("Brak danych. Wyślij wiadomości, aby zobaczyć analitykę kroków.")}</div>;

  return (
    <div className="overflow-x-auto">
      <p className="sk-analytics-note">{ct("Odpowiedzi przypisujemy do ostatniej poprzedzającej wiadomości. Szanse oznaczają wysyłki do kontaktów obecnie zainteresowanych, nie historyczne konwersje.")}</p>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50 text-gray-600 text-xs font-semibold uppercase tracking-wide">
            <th className="px-3 py-2 text-left w-8"></th>
            <th className="px-3 py-2 text-left">{ct("Krok")}</th>
            <th className="px-3 py-2 text-right">{ct("Wysłane")}</th>
            <th className="px-3 py-2 text-right">{ct("Otwarcia")}</th>
            <th className="px-3 py-2 text-right">{ct("Kliknięcia")}</th>
            <th className="px-3 py-2 text-right">{ct("Odpowiedzi")}</th>
            <th className="px-3 py-2 text-right">{ct("Szanse")}</th>
          </tr>
        </thead>
        <tbody>
          {stepStats.map((step) => {
            const seq = sequences.find(s => s.id === step.sequence_id);
            const hasVariants = step.variants && step.variants.length > 1; // >1 means default + at least one named
            const expanded = expandedSteps[step.sequence_index];
            return (
              <Fragment key={step.sequence_id ?? step.sequence_index}>
                <tr
                  key={step.sequence_index}
                  className={`border-b border-gray-100 ${hasVariants ? 'cursor-pointer hover:bg-gray-50' : ''}`}
                  onClick={() => hasVariants && toggleStep(step.sequence_index)}
                >
                  <td className="px-3 py-2.5 text-gray-400 text-center">
                    {hasVariants && (
                      <button aria-label={ct('Warianty kroku {step}',{step:step.sequence_index+1})} aria-expanded={!!expanded} onClick={e => { e.stopPropagation(); toggleStep(step.sequence_index); }} className={`inline-block transition-transform text-xs ${expanded ? 'rotate-90' : ''}`}>▶</button>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="max-w-[280px] min-w-0">
                      <div className="font-medium text-gray-800 truncate">{ct("Krok")} {step.sequence_index + 1}</div>
                      {step.subject && <div className="text-xs text-gray-400 truncate">{step.subject}</div>}
                      {hasVariants && (
                        <span className="inline-flex items-center gap-1 text-[10px] bg-purple-100 text-purple-600 rounded-full px-1.5 py-0.5 mt-0.5"> {ct("A/B · warianty:")} {step.variants.length - 1}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right font-medium">{step.total_sent}</td>
                  <td className="px-3 py-2.5 text-right">
                    {step.total_opens} <span className="text-gray-400 text-xs">({pct(step.total_opens, step.total_sent)})</span>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {step.total_clicks} <span className="text-gray-400 text-xs">({pct(step.total_clicks, step.total_sent)})</span>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {step.total_replies} <span className="text-gray-400 text-xs">({pct(step.total_replies, step.total_sent)})</span>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <span className="font-semibold text-green-600">{step.total_opportunities}</span>
                    <span className="text-gray-400 text-xs ml-1">({pct(step.total_opportunities, step.total_sent)})</span>
                  </td>
                </tr>
                {/* Variant breakdown rows */}
                {hasVariants && expanded && step.variants.map((variant) => (
                  <tr key={`${step.sequence_index}-v${variant.variant_id ?? 'default'}`} className="bg-purple-50/50 border-b border-purple-100 text-xs">
                    <td className="px-3 py-2"></td>
                    <td className="px-3 py-2 pl-8">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-purple-700">
                          {variant.variant_id == null ? ct("Domyślny") : variant.variant_label}
                        </span>
                        {variant.variant_id != null && (
                          <button
                            disabled={variantBusy}
                            onClick={(e) => {
                              e.stopPropagation();
                              onToggleVariant(step.sequence_id, variant.variant_id, !variant.enabled);
                            }}
                            className={`text-[10px] px-2 py-0.5 rounded-full font-medium transition-colors ${
                              variant.enabled
                                ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                                : 'bg-gray-200 text-gray-500 hover:bg-gray-300'
                            }`}
                          >
                            {variant.enabled ? ct("Włączony") : ct("Wyłączony")}
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right">{variant.sent}</td>
                    <td className="px-3 py-2 text-right">
                      {variant.opens} <span className="text-gray-400">({pct(variant.opens, variant.sent)})</span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      {variant.clicks} <span className="text-gray-400">({pct(variant.clicks, variant.sent)})</span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      {variant.replies} <span className="text-gray-400">({pct(variant.replies, variant.sent)})</span>
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-green-600">
                      {variant.opportunities} <span className="text-gray-400 font-normal">({pct(variant.opportunities, variant.sent)})</span>
                    </td>
                  </tr>
                ))}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Sent E-mails Panel ────────────────────────────────────────────────────────
const SENT_FILTER_OPTIONS = [
  { value: 'all',        label: 'Wszystkie' },
  { value: 'opened',     label: 'Otwarte' },
  { value: 'clicked',    label: 'Kliknięte' },
  { value: 'replied',    label: 'Z odpowiedzią' },
  { value: 'interested', label: 'Zainteresowane' },
  { value: 'not_opened', label: 'Nieotwarte' },
  { value: 'bounced',    label: 'Odbite' },
  { value: 'unsubscribed', label: 'Wypisane' },
];

function SentEmailsPanel({ sentData = [], filter, onFilterChange }) {
  const {ct,language}=useCampaignLanguage();
  const filtered = useMemo(() => {
    switch (filter) {
      case 'opened':      return sentData.filter(e => e.opened);
      case 'clicked':     return sentData.filter(e => e.clicked);
      case 'replied':     return sentData.filter(e => e.replied);
      case 'interested':  return sentData.filter(e => (e.interest || e.interest_status) === 'interested');
      case 'not_opened':  return sentData.filter(e => !e.opened);
      case 'bounced':     return sentData.filter(e => e.lead_status === 'bounced');
      case 'unsubscribed':return sentData.filter(e => e.lead_status === 'unsubscribed');
      default:            return sentData;
    }
  }, [sentData, filter]);

  const fmt = (isoStr) => {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    return d.toLocaleString(language, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="space-y-3">
      {/* Filter bar */}
      <div className="flex flex-wrap gap-1.5 items-center">
        <span className="text-xs font-medium text-gray-500 mr-1">{ct("Filtr:")}</span>
        {SENT_FILTER_OPTIONS.map(opt => (
          <button
            key={opt.value}
            onClick={() => onFilterChange(opt.value)}
            className={`px-2.5 py-1 text-xs font-medium rounded-full border transition-colors ${
              filter === opt.value
                ? 'bg-teal-500 text-white border-teal-500'
                : 'bg-white text-gray-600 border-gray-300 hover:border-teal-300 hover:bg-teal-50'
            }`}
          >
            {ct(opt.label)}
          </button>
        ))}
        <span className="text-xs text-gray-400 ml-2">{filtered.length} {ct("wiadomości")}</span>
      </div>

      {filtered.length === 0 ? (
        <div className="py-8 text-center text-gray-400 text-sm">{ct("Brak wiadomości pasujących do filtra.")}</div>
      ) : (
        <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white z-10">
              <tr className="border-b border-gray-200 bg-gray-50 text-gray-600 text-xs font-semibold uppercase tracking-wide">
                <th className="px-3 py-2.5 text-left">{ct("Wysłane")}</th>
                <th className="px-3 py-2.5 text-left">{ct("Od")}</th>
                <th className="px-3 py-2.5 text-left">{ct("Kontakt")}</th>
                <th className="px-3 py-2.5 text-left">{ct("Krok")}</th>
                <th className="px-3 py-2.5 text-left">{ct("Temat")}</th>
                <th className="px-3 py-2.5 text-center">{ct("Otwarte")}</th>
                <th className="px-3 py-2.5 text-center">{ct("Kliknięte")}</th>
                <th className="px-3 py-2.5 text-center">{ct("Odpowiedź")}</th>
                <th className="px-3 py-2.5 text-left">{ct("Wariant")}</th>
                <th className="px-3 py-2.5 text-left">{ct("Status")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(e => (
                <tr key={e.log_id} className="border-b border-gray-100 hover:bg-gray-50/60">
                  <td className="px-3 py-2 whitespace-nowrap text-gray-500 text-xs">{fmt(e.sent_at)}</td>
                  <td className="px-3 py-2 font-mono text-xs text-gray-700 max-w-[200px] truncate" title={e.inbox_email || ''}>{e.inbox_email || '—'}</td>
                  <td className="px-3 py-2 font-mono text-xs text-gray-800 max-w-[180px] truncate">{e.lead_email}</td>
                  <td className="px-3 py-2 text-xs text-gray-600 whitespace-nowrap">{ct("Krok")} {(e.sequence_index ?? 0) + 1}</td>
                  <td className="px-3 py-2 text-xs text-gray-700 max-w-[200px] truncate">{e.subject || '—'}</td>
                  <td className="px-3 py-2 text-center">
                    {e.opened
                      ? <span className="text-amber-600 font-bold text-xs">✓</span>
                      : <span className="text-gray-300 text-xs">—</span>}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {e.clicked
                      ? <span className="text-orange-600 font-bold text-xs">✓</span>
                      : <span className="text-gray-300 text-xs">—</span>}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {e.replied
                      ? <span className="text-violet-600 font-bold text-xs">✓</span>
                      : <span className="text-gray-300 text-xs">—</span>}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {e.variant_label
                      ? <span className="bg-purple-100 text-purple-700 rounded px-1.5 py-0.5">{e.variant_label}</span>
                      : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {e.lead_status && e.lead_status !== 'active' && (
                        <StatusBadge label={e.lead_status} />
                      )}
                      {(e.interest || e.interest_status) && (
                        <StatusBadge label={e.interest || e.interest_status} />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Settings Tab ─────────────────────────────────────────────────────────────
function SettingsTab({ campaign, inboxes, onSave, campaignId }) {
  const {ct}=useCampaignLanguage();
  const confirm = useConfirm();
  const notify  = useNotify();
  const [form, setForm] = useState({
    name:                  campaign.name,
    inbox_ids:             campaign.inbox_ids         || [],
    sending_days:          campaign.sending_days      || [0,1,2,3,4],
    sending_hours_start:   campaign.sending_hours_start || '09:00',
    sending_hours_end:     campaign.sending_hours_end   || '17:00',
    stop_on_reply:         campaign.stop_on_reply,
    track_opens:           campaign.track_opens           ?? false,
    track_clicks:          campaign.track_clicks          ?? false,
    add_unsubscribe_header:campaign.add_unsubscribe_header ?? true,
    send_first_as_text:    campaign.send_first_as_text    ?? false,
    send_all_as_text:      campaign.send_all_as_text      ?? false,
    match_lead_provider:   campaign.match_lead_provider   ?? true,
    custom_sequence_mode:  campaign.custom_sequence_mode  ?? 'wait_for_all',
    paused:                campaign.paused               ?? false,
    timezone:              campaign.timezone              ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
  const [msg,    setMsg]    = useState(null);
  const [saving, setSaving] = useState(false);
  const [preflight, setPreflight] = useState(null);
  const [preflightBusy, setPreflightBusy] = useState(false);
  const [tzSearch, setTzSearch] = useState(null); // null = not focused

  // pre-compute timezone list once
  const tzList = useMemo(() => {
    return Intl.supportedValuesOf('timeZone').map(tz => {
      let offsetLabel = '';
      try {
        const parts = new Intl.DateTimeFormat('en', {
          timeZone: tz, timeZoneName: 'shortOffset',
        }).formatToParts(new Date());
        const off = parts.find(p => p.type === 'timeZoneName');
        if (off) offsetLabel = ` (${off.value})`;
      } catch (_) {}
      return { value: tz, label: `${tz.replace(/_/g, ' ')}${offsetLabel}` };
    });
  }, []);

  const filteredTz = tzSearch
    ? tzList.filter(t => t.label.toLowerCase().includes(tzSearch.toLowerCase()))
    : tzList;

  const toggleDay   = d  => setForm(f => { const s=new Set(f.sending_days); s.has(d)?s.delete(d):s.add(d); return {...f, sending_days:[...s].sort()}; });
  const toggleInbox = id => setForm(f => { const s=new Set(f.inbox_ids);   s.has(id)?s.delete(id):s.add(id); return {...f, inbox_ids:[...s]}; });

  const settingsPayload = () => {
    const { paused: _paused, ...payload } = form;
    return payload;
  };

  const runPreflight = async () => {
    setPreflightBusy(true);
    try {
      const report = await api.get(`/campaigns/${campaignId}/preflight`);
      setPreflight(report);
      return report;
    } catch (e) {
      notify({ type: 'error', message: e.message || 'Nie udało się sprawdzić kampanii.' });
      return null;
    } finally {
      setPreflightBusy(false);
    }
  };

  const startCampaign = async () => {
    setSaving(true);
    try {
      // Save the visible settings first, but never bypass pre-flight by
      // changing paused through the generic PATCH endpoint.
      await api.patch(`/campaigns/${campaignId}`, settingsPayload());
      const report = await api.get(`/campaigns/${campaignId}/preflight`);
      setPreflight(report);
      if (!report.ready) {
        setMsg({ type: 'error', text: 'Kampania ma błędy blokujące start. Popraw je i uruchom pre-flight ponownie.' });
        return;
      }
      await api.post(`/campaigns/${campaignId}/start`, {});
      setForm(prev => ({ ...prev, paused: false }));
      setMsg({ type: 'success', text: 'Kampania uruchomiona. Kolejka jest przeliczana.' });
      onSave();
    } catch (e) {
      setMsg({ type: 'error', text: e.message || 'Nie udało się uruchomić kampanii.' });
    } finally {
      setSaving(false);
    }
  };

  const pauseCampaign = async () => {
    setSaving(true);
    try {
      await api.post(`/campaigns/${campaignId}/pause`, {});
      setForm(prev => ({ ...prev, paused: true }));
      setMsg({ type: 'success', text: 'Kampania została wstrzymana.' });
      onSave();
    } catch (e) {
      setMsg({ type: 'error', text: e.message || 'Nie udało się wstrzymać kampanii.' });
    } finally {
      setSaving(false);
    }
  };

  const resetUncertainAttempt = async (slotId) => {
    const ok = await confirm(
      `Odblokować slot #${slotId}? Zrób to tylko po sprawdzeniu, że wiadomość NIE została faktycznie dostarczona.`,
    );
    if (!ok) return;
    try {
      await api.post(`/campaigns/${campaignId}/send-attempts/${slotId}/reset`, {});
      notify({ type: 'success', message: `Slot #${slotId} odblokowany.` });
      await runPreflight();
    } catch (e) {
      notify({ type: 'error', message: e.message || 'Nie udało się odblokować slotu.' });
    }
  };

  const submit = async e => {
    e.preventDefault();
    if (!form.name.trim())          { setMsg({type:'error',text:'Nazwa kampanii jest wymagana.'});           return; }
    if (!form.inbox_ids.length)     { setMsg({type:'error',text:'Wybierz co najmniej jedną skrzynkę nadawczą.'});  return; }
    setSaving(true);
    try {
      await api.patch(`/campaigns/${campaignId}`, settingsPayload());
      // If the timezone was changed, trigger a queue recalculation automatically.
      const tzChanged = form.timezone !== (campaign.timezone ?? '');
      if (tzChanged) {
        try {
          await api.post(`/campaigns/${campaignId}/recalculate-queue`);
          setMsg({ type: 'success', text: 'Ustawienia zapisane · kolejka przeliczona dla nowej strefy czasowej' });
        } catch (_) {
          setMsg({ type: 'success', text: 'Ustawienia zapisane (nie udało się przeliczyć kolejki — w razie potrzeby uruchom przeliczenie ręcznie)' });
        }
      } else {
        setMsg({ type: 'success', text: 'Ustawienia zapisane' });
      }
      onSave();
    } catch (e) {
      setMsg({ type: 'error', text: e.message });
    } finally {
      setSaving(false);
    }
  };

  const deleteCampaign = async () => {
    if (!await confirm('Usunąć tę kampanię? Tej operacji nie można cofnąć.')) return;
    try {
      await api.del(`/campaigns/${campaignId}`);
      window.location.href = '/campaigns';
    } catch (e) {
      notify({ type: 'error', message: e.message });
    }
  };

  const TOGGLE_OPTIONS = [
    { key: 'stop_on_reply',            label: 'Zatrzymaj sekwencję po odpowiedzi' },
    { key: 'track_opens',              label: 'Śledź otwarcia wiadomości' },
    { key: 'track_clicks',             label: 'Śledź kliknięcia linków' },
    { key: 'add_unsubscribe_header',   label: 'Dodaj nagłówek List-Unsubscribe (zalecane)' },
    { key: 'send_first_as_text',       label: 'Pierwszą wiadomość wyślij jako zwykły tekst', disabled: form.send_all_as_text },
    { key: 'send_all_as_text',         label: 'Wszystkie wiadomości wysyłaj jako zwykły tekst' },
  ];

  return (
    <div className="max-w-2xl space-y-8">
      <div className="rounded-lg border border-gray-200 bg-white p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-gray-800">Gotowość kampanii</h2>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                form.paused ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-700'
              }`}>
                {form.paused ? 'Wstrzymana' : 'Aktywna'}
              </span>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Pre-flight sprawdza skrzynki, limity, harmonogram, sekwencje, kontakty, zmienne i bezpieczeństwo kolejki.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={runPreflight} disabled={preflightBusy || saving}>
              {preflightBusy ? 'Sprawdzanie…' : 'Sprawdź gotowość'}
            </Button>
            {form.paused ? (
              <Button type="button" size="sm" variant="default" onClick={startCampaign} disabled={saving}>
                {saving ? 'Uruchamianie…' : 'Uruchom kampanię'}
              </Button>
            ) : (
              <Button type="button" size="sm" variant="outline" onClick={pauseCampaign} disabled={saving}>
                Wstrzymaj kampanię
              </Button>
            )}
          </div>
        </div>

        {preflight && (
          <div className="space-y-3">
            <p>{ct("Gotowość nie obejmuje pomiaru DNS.")} <Link to="/domains">{ct("Sprawdź domeny przed wysyłką")}</Link></p>
            <div className={`rounded-lg px-3 py-2 text-sm ${
              preflight.ready
                ? 'border border-green-200 bg-green-50 text-green-800'
                : 'border border-red-200 bg-red-50 text-red-800'
            }`}>
              {preflight.ready
                ? `Gotowa do startu · ${preflight.summary?.sendable_contacts || 0} kontaktów · ${preflight.summary?.sequences || 0} kroków`
                : `${preflight.summary?.errors || 0} błędów blokujących start`}
              {(preflight.summary?.warnings || 0) > 0 && (
                <span> · {preflight.summary.warnings} ostrzeżeń</span>
              )}
            </div>

            {(preflight.issues || []).length > 0 && (
              <div className="space-y-2">
                {preflight.issues.map((issue, idx) => (
                  <div
                    key={`${issue.code}-${idx}`}
                    className={`rounded-lg border px-3 py-2 text-sm ${
                      issue.severity === 'error'
                        ? 'border-red-200 bg-red-50/60 text-red-800'
                        : 'border-amber-200 bg-amber-50/60 text-amber-800'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span>{issue.message}</span>
                      {issue.code === 'uncertain_send_attempts' && issue.details?.slot_ids?.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {issue.details.slot_ids.map(slotId => (
                            <button
                              key={slotId}
                              type="button"
                              onClick={() => resetUncertainAttempt(slotId)}
                              className="rounded border border-red-300 bg-white px-2 py-0.5 text-xs text-red-700 hover:bg-red-50"
                            >
                              Sprawdź/resetuj #{slotId}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <form onSubmit={submit} className="bg-white rounded-lg border border-gray-200 p-6 space-y-5">
        <h2 className="text-lg font-semibold text-gray-800">Ustawienia kampanii</h2>
        {msg && (
          <div className={`rounded-lg px-3 py-2 text-sm ${msg.type==='error'?'bg-red-50 text-red-700':'bg-green-50 text-green-700'}`}>
            {msg.text}
          </div>
        )}

        {/* Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Nazwa *</label>
          <input
            required
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300"
            value={form.name}
            onChange={e => setForm(f=>({...f, name: e.target.value}))}
          />
        </div>

        {/* Tryb sekwencji spersonalizowanej */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Tryb sekwencji spersonalizowanej</label>
          <div className="space-y-2">
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="radio"
                name="custom_sequence_mode"
                className="mt-0.5"
                checked={form.custom_sequence_mode === 'wait_for_all'}
                onChange={() => setForm(f => ({ ...f, custom_sequence_mode: 'wait_for_all' }))}
              />
              <div>
                <span className="text-sm text-gray-700 font-medium">Czekaj na wszystkie wiadomości</span>
                <p className="text-xs text-gray-400">Nie rozpoczynaj wysyłki, dopóki dla każdego kontaktu nie zostanie przygotowana spersonalizowana wiadomość.</p>
              </div>
            </label>
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="radio"
                name="custom_sequence_mode"
                className="mt-0.5"
                checked={form.custom_sequence_mode === 'asap'}
                onChange={() => setForm(f => ({ ...f, custom_sequence_mode: 'asap' }))}
              />
              <div>
                <span className="text-sm text-gray-700 font-medium">Wysyłaj od razu</span>
                <p className="text-xs text-gray-400">Wysyłaj każdą spersonalizowaną wiadomość od razu po jej przygotowaniu — bez czekania na pozostałe.</p>
              </div>
            </label>
          </div>
        </div>

        {/* Inboxes */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Skrzynki nadawcze *</label>
          <div className="border rounded-lg p-3 max-h-48 overflow-y-auto space-y-1.5">
            {inboxes.length === 0 && <p className="text-sm text-gray-400">Brak skonfigurowanych skrzynek.</p>}
            {inboxes.map(i => (
              <label key={i.id} className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.inbox_ids.includes(i.id)} onChange={()=>toggleInbox(i.id)} />
                <span className="text-sm">{i.email}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Sending days */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Dni wysyłki</label>
          <div className="flex flex-wrap gap-3">
            {[0,1,2,3,4,5,6].map(d => (
              <label key={d} className="flex items-center gap-1.5 cursor-pointer text-sm">
                <input type="checkbox" checked={form.sending_days.includes(d)} onChange={()=>toggleDay(d)} />
                {['Pon','Wt','Śr','Czw','Pt','Sob','Nd'][d]}
              </label>
            ))}
          </div>
        </div>

        {/* Hours */}
        <div className="grid grid-cols-2 gap-4">
          {[
            { key: 'sending_hours_start', label: 'Początek okna' },
            { key: 'sending_hours_end',   label: 'Koniec okna' },
          ].map(({key, label}) => (
            <div key={key}>
              <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
              <input
                type="time"
                className="w-full border rounded-lg px-3 py-2 text-sm"
                value={form[key]}
                onChange={e => setForm(f=>({...f, [key]: e.target.value}))}
              />
            </div>
          ))}
        </div>

        {/* Timezone */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Strefa czasowa</label>
          <div className="relative">
            <input
              type="text"
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300"
              placeholder="Szukaj strefy czasowej…"
              value={tzSearch !== null ? tzSearch : (form.timezone || '')}
              onChange={e => setTzSearch(e.target.value)}
              onFocus={() => setTzSearch(form.timezone || '')}
              onBlur={() => setTimeout(() => setTzSearch(null), 200)}
            />
            {tzSearch !== null && filteredTz.length > 0 && (
              <div className="absolute z-20 w-full top-full mt-1 border rounded-lg max-h-48 overflow-y-auto bg-white dark:bg-gray-900 shadow-lg">
                {filteredTz.slice(0, 100).map(t => (
                  <button
                    key={t.value}
                    type="button"
                    className={`block w-full text-left px-3 py-1.5 text-sm hover:bg-teal-50 dark:hover:bg-gray-800 ${t.value === form.timezone ? 'bg-teal-50 font-medium' : ''}`}
                    onMouseDown={e => {
                      e.preventDefault();
                      setForm(f => ({ ...f, timezone: t.value }));
                      setTzSearch(null);
                    }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Godziny okna wysyłki są interpretowane w tej strefie czasowej. Terminy są wewnętrznie zapisywane w UTC i realizowane o właściwej godzinie lokalnej.
          </p>
        </div>

        {/* Toggle options */}
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">Opcje</p>
          <div className="space-y-2.5">
            {TOGGLE_OPTIONS.map(({ key, label, disabled }) => (
              <label key={key} className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  disabled={disabled}
                  checked={form[key]}
                  onChange={e => {
                    const v = e.target.checked;
                    setForm(f => ({
                      ...f, [key]: v,
                      ...(key==='send_all_as_text'&&v ? {send_first_as_text:false} : {}),
                    }));
                  }}
                />
                <span className={`text-sm ${disabled?'text-gray-400':'text-gray-700'}`}>{label}</span>
              </label>
            ))}
          </div>
        </div>

        {(form.send_all_as_text||form.send_first_as_text) && (form.track_opens||form.track_clicks) && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            ⚠ Tryb czystego tekstu ma pierwszeństwo przed trackingiem — śledzenie otwarć i kliknięć wymaga HTML i zostanie wyłączone dla tych wiadomości.
          </p>
        )}
        {(form.send_all_as_text||form.send_first_as_text) && !(form.track_opens||form.track_clicks) && (
          <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            ⚠ Ustawienia HTML w sekwencji zostaną zignorowane dla tych wiadomości.
          </p>
        )}
        {!(form.send_all_as_text||form.send_first_as_text) && (form.track_opens||form.track_clicks) && (
          <p className="text-xs text-blue-600 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
            ℹ Tracking jest włączony — sekwencje w czystym tekście zostaną automatycznie wysłane jako HTML, aby dodać piksele i linki śledzące.
          </p>
        )}

        <Button variant="default" disabled={saving}>
          {saving ? 'Zapisywanie…' : 'Zapisz ustawienia'}
        </Button>
      </form>

      {/* Danger zone */}
      <div className="bg-white rounded-lg border border-red-200 p-6">
        <h3 className="font-semibold text-red-700 mb-1">Strefa niebezpieczna</h3>
        <p className="text-sm text-gray-500 mb-4">Trwale usuń kampanię wraz ze wszystkimi jej danymi. Tej operacji nie można cofnąć.</p>
        <Button variant="destructive" onClick={deleteCampaign}>Usuń kampanię</Button>
      </div>
    </div>
  );
}

// ─── Quill editor config ──────────────────────────────────────────────────────
const QUILL_MODULES = {
  toolbar: [
    [{ header: [1,2,3,false] }],
    ['bold','italic','underline','strike'],
    [{ list:'ordered' },{ list:'bullet' }],
    ['link','blockquote','code-block'],
    ['clean'],
  ],
};
const QUILL_FORMATS = [
  'header','bold','italic','underline','strike',
  'list','bullet','link','blockquote','code-block',
];

function VariablesGuide() {
 const {ct}=useCampaignLanguage();
  const [copiedVar, setCopiedVar] = useState(null);
  const [fields, setFields] = useState([]);
  const notify = useNotify();

  useEffect(() => {
    api.get('/contact-fields')
      .then(rows => setFields(Array.isArray(rows) ? rows : []))
      .catch(() => setFields([]));
  }, []);

  const copyVar = (v) => {
    navigator.clipboard?.writeText(v);
    setCopiedVar(v);
    notify({ type: 'success', message: ct('Skopiowano {variable}',{variable:v}), duration: 1500 });
    setTimeout(() => setCopiedVar(null), 1500);
  };

  const vars = [
    ...fields.map(field => `{{${field.key}}}`),
    '{{unsubscribe_link}}',
  ];

  return (
    <div className="mt-1 text-xs text-gray-500 flex flex-wrap items-center gap-1">
      <span>{ct("Zmienne:")}</span>
      {vars.map(v => (
        <span key={v} className="relative inline-flex items-center">
          <code
            className="px-1 bg-gray-100 rounded cursor-pointer hover:bg-teal-100 transition-colors select-none"
            title={ct("Kliknij, aby skopiować")}
            onClick={() => copyVar(v)}
          >
            {v}
          </code>
          {copiedVar === v && (
            <span className="absolute -top-6 left-1/2 -translate-x-1/2 bg-gray-800 text-white text-xs rounded px-1.5 py-0.5 whitespace-nowrap pointer-events-none z-10"> {ct("Skopiowano")} </span>
          )}
        </span>
      ))}
      <a href="/templates" className="ml-1 text-teal-600 hover:underline">{ct("zarządzaj polami")}</a>
    </div>
  );
}

function SequenceBodyEditor({ value, onChange, isHtml, onIsHtmlChange, previewText, onPreviewTextChange, isFirstSequence, campaign, required }) {
 const {ct}=useCampaignLanguage();
  const notify = useNotify();

  const forcePlainAll   = campaign?.send_all_as_text;
  const forcePlainFirst = campaign?.send_first_as_text && isFirstSequence;
  const isOverridden    = forcePlainAll || forcePlainFirst;
  const trackingEnabled = campaign?.track_opens || campaign?.track_clicks;
  // Tracking needs HTML: if sequence is plain text but tracking is on, it will be upgraded
  const trackingUpgrade = !isHtml && trackingEnabled && !isOverridden;
  const effectiveHtml   = (isHtml || trackingUpgrade) && !isOverridden;

  const overrideMsg = forcePlainAll
    ? ct("Kampania wysyła wszystkie wiadomości jako czysty tekst — HTML zostanie zignorowany, a tracking będzie dla nich wyłączony.")
    : forcePlainFirst
    ? ct("Kampania wysyła pierwszy e-mail jako czysty tekst — HTML zostanie zignorowany w tym kroku, a tracking będzie wyłączony.")
    : trackingUpgrade
    ? ct("Śledzenie otwarć/kliknięć jest włączone — wiadomość zostanie wysłana jako HTML, aby można było dodać elementy trackingu.")
    : null;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-1">
        <label className="flex items-center gap-1.5 cursor-pointer select-none">
          <input type="checkbox" checked={isHtml} onChange={e=>onIsHtmlChange(e.target.checked)} />
          <span className="text-sm font-medium">{ct("Wyślij jako HTML")}</span>
        </label>
        {isOverridden && isHtml && (
          <span className="text-xs font-medium text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-0.5">
            ⚠ {overrideMsg}
          </span>
        )}
        {trackingUpgrade && (
          <span className="text-xs font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded px-2 py-0.5">
            ℹ {overrideMsg}
          </span>
        )}
      </div>
      {effectiveHtml ? (
        <div className="border rounded overflow-hidden">
          <ReactQuill
            theme="snow" value={value} onChange={onChange}
            modules={QUILL_MODULES} formats={QUILL_FORMATS}
            style={{ minHeight: '160px' }}
          />
        </div>
      ) : (
        <textarea
          className="w-full border rounded-lg p-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-teal-300"
          required={required}
          value={value}
          onChange={e => onChange(e.target.value)}
          rows={5}
          placeholder={ct("Treść wiadomości…")}
        />
      )}
      {effectiveHtml && (
        <div className="mt-2">
          <label className="block text-xs font-medium text-gray-500 mb-1"> {ct("Tekst podglądu")} <span className="ml-1 font-normal text-gray-400">{ct("— wyświetlany jako fragment wiadomości i w powiadomieniach")}</span>
          </label>
          <input
            type="text"
            maxLength={150}
            value={previewText || ''}
            onChange={e => onPreviewTextChange(e.target.value)}
            className="w-full border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300 placeholder-gray-400"
            placeholder={ct("Opcjonalnie — pozostaw puste, aby użyć początku treści wiadomości")}
          />
        </div>
      )}
      <VariablesGuide />
    </div>
  );
}

// ─── Preview Modal ────────────────────────────────────────────────────────────
function PreviewModal({ sequence, campaignId, leads, onClose, variant = null, editingOverride = null }) {
 const {ct}=useCampaignLanguage();
  const [leadId,    setLeadId]    = useState(leads[0]?.lead_id ?? '');
  const [preview,   setPreview]   = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [err,       setErr]       = useState(null);
  const [testEmail, setTestEmail] = useState('');
  const [testState, setTestState] = useState(null); // null | 'sending' | 'success' | {error}
  const {isDemo} = useAppMode();

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const data = await api.post(`/campaigns/${campaignId}/preview`, {
        sequence_id: sequence.id,
        lead_id: leadId ? Number(leadId) : null,
        ...(variant ? { variant_id: variant.id } : {}),
        ...(editingOverride ? {
          subject_override: editingOverride.subject ?? null,
          body_override: editingOverride.body ?? null,
          is_html_override: editingOverride.is_html ?? null,
        } : {}),
      });
      setPreview(data);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, [campaignId, sequence.id, leadId, variant, editingOverride]);

  useEffect(() => { load(); }, [load]);

  const sendTest = async () => {
    if (isDemo || testState === 'sending' || !testEmail.trim()) return;
    setTestState('sending');
    try {
      await api.post(`/campaigns/${campaignId}/send-test`, {
        sequence_id: sequence.id,
        lead_id: leadId ? Number(leadId) : null,
        to_email: testEmail.trim(),
        ...(variant ? { variant_id: variant.id } : {}),
      });
      setTestState('success');
      setTimeout(() => setTestState(null), 3000);
    } catch (e) {
      setTestState({ error: e.message });
    }
  };

  return (
    <Modal title={<>{ct("Podgląd — krok #")}{(sequence.position ?? 0) + 1}{variant && <span> · {variant.label || ct("Wariant")}</span>}</>}
      onClose={onClose} busy={testState === 'sending'}>
        {preview?.signature_inbox&&<p className="sk-muted">{ct("Stopka")}: {preview.signature_inbox}</p>}
        {/* Lead picker */}
        <div className="px-6 py-3 border-b bg-gray-50 flex flex-wrap items-center gap-3">
          <label className="text-sm font-medium text-gray-600">{ct("Podgląd dla:")}</label>
          <select
            className="border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300"
            aria-label={ct("Podgląd dla kontaktu")}
            value={leadId}
            onChange={e => setLeadId(e.target.value)}
          >
            <option value="">{ct("Bez kontaktu — pokaż zmienne")}</option>
            {leads.map(l => (
              <option key={l.lead_id} value={l.lead_id}>
                {l.email}{l.name ? ` — ${l.name}` : ''}
              </option>
            ))}
          </select>
          {preview?.tracking_note && (
            <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-0.5">
              ℹ {preview.tracking_note}
            </span>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading && (
            <div className="flex items-center justify-center py-12 text-gray-400">{ct("Wczytywanie podglądu…")}</div>
          )}
          {err && <div className="text-red-600 text-sm">{err}</div>}
          {preview && !loading && (
            <div className="space-y-4">
              {/* Temat */}
              <div className="bg-gray-50 rounded-lg px-4 py-3">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">{ct("Temat")}</span>
                <p className="sk-preview-message font-medium text-gray-800">
                  {preview.subject || <em className="text-gray-400 font-normal">{ct("Odpowiedź w wątku")}</em>}
                </p>
              </div>
              {/* Body */}
              <div>
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">{ct("Treść")}</span>
                {preview.is_html ? (
                  <div
                    className="sk-preview-message border rounded-lg p-5 bg-white prose prose-sm max-w-none"
                    dangerouslySetInnerHTML={{ __html: preview.body }}
                  />
                ) : (
                  <pre className="sk-preview-message border rounded-lg p-5 bg-gray-50 text-sm whitespace-pre-wrap font-sans text-gray-800">
                    {preview.body}
                  </pre>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer: test email + close */}
        <div className="px-6 py-3 border-t space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-gray-600 whitespace-nowrap">{ct("Wyślij test do:")}</span>
            <input
              type="email"
              aria-label={ct("Adres odbiorcy testu")}
              disabled={isDemo || testState === 'sending'}
              value={testEmail}
              onChange={e => setTestEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && sendTest()}
              placeholder={ct("you@example.com")}
              className="flex-1 min-w-0 border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300"
            />
            <Button
              size="sm"
              variant="default"
              onClick={sendTest}
              disabled={isDemo || testState === 'sending' || !testEmail.trim()}
            >
              {testState === 'sending' ? ct("Wysyłanie…") : ct("Wyślij test")}
            </Button>
            {testState === 'success' && (
              <span className="text-xs text-green-600 font-medium">{ct("✓ Wysłano!")}</span>
            )}
            {testState?.error && (
              <span className="text-xs text-red-600">{testState.error}</span>
            )}
          </div>
          <div className="flex justify-end">
            {isDemo && <p role="status">{ct("Wysyłka testowa jest wyłączona w DEMO.")}</p>}
            <Button variant="outline" size="sm" disabled={testState === 'sending'} onClick={onClose}>{ct("Zamknij")}</Button>
          </div>
        </div>
    </Modal>
  );
}

// ─── Sequences Tab ────────────────────────────────────────────────────────────
function PersonalizedSequenceSection({ sequence, sequences, personalizedSequences, leads, campaignId, campaign, onWriteCustom, onRefresh }) {
 const {ct}=useCampaignLanguage();
  const [filter, setFilter] = useState('needs_writing');
  const [searchQuery, setSearchQuery] = useState('');
  const [bulkState, setBulkState] = useState({ busy: false, text: 'Użyj treści zastępczej dla pozostałych' });
  const confirm = useConfirm();
  const notify = useNotify();

  const psIds = useMemo(() => personalizedSequences.map(s => s.id), [personalizedSequences]);

  const leadsForCurrentStep = useMemo(() => {
    return leads.filter(l => {
      const personalized = l.personalized || [];
      return personalized.some(p => p.sequence_id === sequence.id);
    });
  }, [leads, sequence.id]);

  const leadsWithProgress = useMemo(() => {
    return leadsForCurrentStep.map(lead => {
      const perLead = lead.personalized || [];
      const writtenCount = psIds.filter(sid => {
        const entry = perLead.find(p => p.sequence_id === sid);
        return entry?.written || entry?.already_sent;
      }).length;
      const totalCount = psIds.length;
      const isPartial = writtenCount > 0 && writtenCount < totalCount;
      return { ...lead, _writtenCount: writtenCount, _totalCount: totalCount, _isPartial: isPartial };
    });
  }, [leadsForCurrentStep, psIds]);

  const filtered = useMemo(() => {
      let result = leadsWithProgress;
      if (filter === 'needs_writing') {
        result = result.filter(l => {
          if (['completed', 'bounced', 'unsubscribed', 'wrong_person'].includes(l.status)) return false;
          const ps = (l.personalized || []).find(p => p.sequence_id === sequence.id);
          return ps && !ps.written && !ps.already_sent;
        });
      } else if (filter === 'written') {
        result = result.filter(l => {
          const ps = (l.personalized || []).find(p => p.sequence_id === sequence.id);
          return ps && (ps.written || ps.already_sent);
        });
      }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(l =>
        (l.email || '').toLowerCase().includes(q) ||
        (l.name || '').toLowerCase().includes(q)
      );
    }
    const partial = result.filter(l => l._isPartial);
    const rest = result.filter(l => !l._isPartial);
    partial.sort((a, b) => b._writtenCount - a._writtenCount);
    return [...partial, ...rest];
  }, [leadsWithProgress, filter, searchQuery, sequence.id]);

  const writtenCount = leadsForCurrentStep.filter(l => {
    const ps = (l.personalized || []).find(p => p.sequence_id === sequence.id);
    return ps?.written || ps?.already_sent;
  }).length;

  const remainingLeads = useMemo(() => {
    return leadsForCurrentStep.filter(l => {
      if (['completed', 'bounced', 'unsubscribed', 'wrong_person'].includes(l.status)) return false;
      const ps = (l.personalized || []).find(p => p.sequence_id === sequence.id);
      return ps && !ps.written && !ps.already_sent;
    });
  }, [leadsForCurrentStep, sequence.id]);

  const applyFallbackToRemaining = async () => {
    if (!remainingLeads.length) return;
    if ((sequence.position ?? 0) === 0 && !sequence?.fallback_subject?.trim()) {
      notify({ type: 'error', message: ct("Temat zastępczy jest wymagany dla pierwszego e-maila.") });
      return;
    }
    if (!sequence?.fallback_body?.trim()) {
      notify({ type: 'error', message: ct("Treść zastępcza jest wymagana przed zastosowaniem jej do pozostałych kontaktów.") });
      return;
    }
    if (!await confirm(ct('Użyć treści zastępczej dla pozostałych kontaktów ({count})?',{count:remainingLeads.length}))) return;
    setBulkState({ busy: true, text: 'Stosowanie…' });
    try {
      await Promise.all(
        remainingLeads.map(l => api.patch(
          `/campaigns/${campaignId}/leads/${l.lead_id}/custom-email/${sequence.id}`,
          { subject: null, body: null, is_html: sequence?.is_html ?? false },
        ))
      );
      notify({ type: 'success', message: ct("Treść zastępcza zastosowana do pozostałych kontaktów") });
      onRefresh?.();
    } catch (e) {
      notify({ type: 'error', message: e.message });
    } finally {
      setBulkState({ busy: false, text: 'Użyj treści zastępczej dla pozostałych' });
    }
  };

  if (leadsForCurrentStep.length === 0) {
    return (
      <div className="sk-personalized-sequence mt-6 pt-6 border-t border-gray-200">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">{ct("Indywidualne wiadomości dla kontaktów")}</span>
        <p className="text-xs text-gray-400 italic">{ct("Brak przypisanych kontaktów.")}</p>
      </div>
    );
  }

  const dotColor = (sid, lead) => {
    const perLead = lead.personalized || [];
    const entry = perLead.find(p => p.sequence_id === sid);
    if (entry?.already_sent) return 'bg-emerald-400';
    if (entry?.written) return 'bg-emerald-400';
    return 'bg-purple-300';
  };

  const dotTitle = (sid, idx, lead) => {
    const perLead = lead.personalized || [];
    const entry = perLead.find(p => p.sequence_id === sid);
    const stepNum = (personalizedSequences.find(s => s.id === sid)?.position ?? 0) + 1;
    if (entry?.already_sent) return ct('Krok {step}: Gotowe (wysłane)',{step:stepNum});
    if (entry?.written) return ct('Krok {step}: Gotowe',{step:stepNum});
    return ct('Krok {step}: Wymaga przygotowania',{step:stepNum});
  };

  const FILTERS = [
    { key: 'needs_writing', label: ct("Do przygotowania") },
    { key: 'written', label: ct("Gotowe") },
    { key: 'all', label: ct("Wszystkie") },
  ];

  const campaignMode = campaign?.custom_sequence_mode || 'wait_for_all';

  return (
    <div className="sk-personalized-sequence mt-6 pt-6 border-t border-gray-200">
      {campaignMode === 'asap' && (
        <div className="mb-3 p-2 bg-teal-50 border border-teal-200 rounded-lg text-xs text-teal-700">
          <strong>{ct("Tryb „Wysyłaj od razu” jest włączony.")}</strong> {ct("Każda indywidualna wiadomość może zostać zaplanowana i wysłana po jej przygotowaniu.")} </div>
      )}
      {campaignMode !== 'asap' && (
        <div className="mb-3 p-2 bg-purple-50 border border-purple-200 rounded-lg text-xs text-purple-700">
          <strong>{ct("Tryb „Czekaj na wszystkie” jest włączony.")}</strong> {ct("Wysyłka nie rozpocznie się, dopóki wszystkie indywidualne wiadomości nie będą przygotowane.")} </div>
      )}
      <div className="sk-personalized-heading flex items-center justify-between mb-3 gap-2">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{ct("Indywidualne wiadomości dla kontaktów")}</span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">{writtenCount} {ct("z")} {leadsForCurrentStep.length} {ct("gotowych")}</span>
          <Button
            size="sm"
            variant="outline"
            onClick={applyFallbackToRemaining}
            disabled={bulkState.busy || remainingLeads.length === 0}
          >
            {bulkState.busy ? ct("Stosowanie…") : ct(bulkState.text)}
          </Button>
        </div>
      </div>

      <div className="flex gap-1 mb-3">
        {FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              filter === f.key
                ? 'bg-purple-100 text-purple-700 border border-purple-200'
                : 'bg-gray-50 text-gray-500 border border-gray-200 hover:bg-gray-100'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <input
        className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300 mb-3"
        value={searchQuery}
        onChange={e => setSearchQuery(e.target.value)}
        placeholder={ct("Szukaj po e-mailu lub nazwie…")}
      />

      <div className="max-h-[280px] overflow-y-auto border border-gray-200 rounded-lg">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-gray-50">
            <tr className="border-b border-gray-200 text-xs text-gray-500">
              <th className="px-3 py-2 text-left">{ct("Kontakt")}</th>
              {personalizedSequences.length > 1 && (
                <th className="px-3 py-2 text-center">
                  <div className="flex items-center justify-center gap-1.5">
                    {personalizedSequences.map((s, i) => (
                      <span key={s.id} className={`w-4 text-center ${s.id === sequence.id ? 'font-bold text-purple-600' : ''}`}>{s.position + 1}</span>
                    ))}
                  </div>
                </th>
              )}
              <th className="px-3 py-2 text-left">{ct("Status")}</th>
              <th className="px-3 py-2 text-right">{ct("Akcja")}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={personalizedSequences.length > 1 ? 4 : 3} className="px-3 py-8 text-center text-gray-400 text-sm">{ct("Brak kontaktów pasujących do filtra.")}</td></tr>
            ) : (
              filtered.map(l => {
                const ps = (l.personalized || []).find(p => p.sequence_id === sequence.id);
                const isWritten = ps?.written || ps?.already_sent;
                const alreadySent = ps?.already_sent;
                const isTerminal = ['completed', 'bounced', 'unsubscribed', 'wrong_person'].includes(l.status);
                const terminalLabel = isTerminal ? l.status.charAt(0).toUpperCase() + l.status.slice(1) : '';
                return (
                  <tr key={l.lead_id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-3 py-2">
                      <span className="font-mono text-xs">{l.email}</span>
                      {l.name && <span className="text-gray-400 text-xs ml-1">({l.name})</span>}
                    </td>
                    {personalizedSequences.length > 1 && (
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-center gap-1.5">
                          {personalizedSequences.map((s, i) => (
                            <span
                              key={s.id}
                              title={dotTitle(s.id, i, l)}
                              className={`inline-block w-2 h-2 rounded-full ${dotColor(s.id, l)} ${s.id === sequence.id ? 'ring-2 ring-purple-500' : ''} ${s.id !== sequence.id ? 'opacity-70' : ''}`}
                            />
                          ))}
                        </div>
                      </td>
                    )}
                    <td className="px-3 py-2">
                      {alreadySent ? (
                        <span className="text-green-600 text-xs font-medium">{ct("✓ Gotowe")}</span>
                      ) : isTerminal ? (
                        <span className="text-gray-400 text-xs font-medium">{terminalLabel}</span>
                      ) : isWritten ? (
                        <span className="text-green-600 text-xs font-medium">{ct("✓ Gotowe")}</span>
                      ) : (
                        <span className="text-purple-600 text-xs font-medium">{ct("Do przygotowania")}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
      {(alreadySent || isTerminal) ? (
        <span className="text-xs text-gray-400 italic">{alreadySent ? ct("Wysłano") : terminalLabel}</span>
                      ) : (
                        <button
                          onClick={() => onWriteCustom(l, sequence)}
                          className="px-2.5 py-1 text-xs font-medium rounded-lg border border-gray-300 transition-colors hover:bg-purple-50 hover:border-purple-300"
                        >
                          {isWritten ? ct("Edytuj") : ct("Napisz")}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CustomEmailEditorModal({ target, campaignId, onClose, onSaved }) {
 const {ct}=useCampaignLanguage();
  const { lead, sequence } = target || {};
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [isHtml, setIsHtml] = useState(false);
  const [saving, setSaving] = useState(false);
  const [subjectError, setSubjectError] = useState('');
  const [bodyError, setBodyError] = useState('');
  const notify = useNotify();

  useEffect(() => {
    if (lead) {
      const personalized = lead.personalized || [];
      const ps = personalized.find(p => p.sequence_id === sequence?.id);
      if (ps?.written || ps?.already_sent) {
        setSubject(ps.subject ?? '');
        setBody(ps.body ?? '');
      } else {
        setSubject('');
        setBody('');
      }
      setIsHtml(sequence?.is_html ?? false);
      setSubjectError('');
      setBodyError('');
    }
  }, [target]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function save() {
    setSubjectError('');
    setBodyError('');
    let hasError = false;
    if ((sequence.position ?? 0) === 0 && !subject.trim() && !sequence?.fallback_subject?.trim()) {
      setSubjectError('Temat jest wymagany dla pierwszego e-maila');
      hasError = true;
    }
    if (!body.trim() && !sequence?.fallback_body?.trim()) {
      setBodyError(ct("Treść jest wymagana, jeśli nie ustawiono treści zastępczej"));
      hasError = true;
    }
    if (hasError) return;
    setSaving(true);
    try {
      await api.patch(`/campaigns/${campaignId}/leads/${lead.lead_id}/custom-email/${sequence.id}`, {
        subject: subject || null,
        body: body || null,
        is_html: isHtml,
      });
      notify({ type: 'success', message: ct("Indywidualna wiadomość zapisana") });
      onSaved?.();
      onClose();
    } catch (e) {
      notify({ type: 'error', message: e.message });
    } finally {
      setSaving(false);
    }
  }

  if (!target) return null;

  const hasFallback = sequence?.fallback_subject || sequence?.fallback_body;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="sk-campaign-modal-surface rounded-xl shadow-lg w-full max-w-2xl max-h-[90vh] flex flex-col mx-auto"
                onClick={e => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-800">{ct("Indywidualna wiadomość")}</h2>
            <p className="text-xs text-gray-400">
              {lead.email}{lead.name ? ` — ${lead.name}` : ''}
              {' · '}{ct("Krok")} {(sequence.position ?? 0) + 1}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {hasFallback && (
            <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg text-xs text-purple-700 space-y-1">
              {sequence.fallback_subject && <p><span className="font-semibold">{ct("Temat zastępczy:")}</span> {sequence.fallback_subject}</p>}
              {sequence.fallback_body && <p><span className="font-semibold">{ct("Treść zastępcza:")}</span> {sequence.fallback_body}</p>}
              <p className="text-purple-500 mt-1">{ct("Wyświetlane jako podpowiedź podczas tworzenia indywidualnej wiadomości i używane automatycznie, jeśli pole pozostanie puste.")}</p>
            </div>
          )}
          {!hasFallback && (
            <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg text-xs text-purple-700"> {ct("Przygotuj indywidualną wiadomość dla tego kontaktu.")} </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{ct("Temat")}</label>
            <input
              className={`w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 ${subjectError ? 'border-red-400 focus:ring-red-300' : 'focus:ring-teal-300'}`}
              value={subject}
              onChange={e => { setSubject(e.target.value); setSubjectError(''); }}
              placeholder={
                sequence?.fallback_subject
                  ? sequence.fallback_subject
                  : (sequence.position ?? 0) === 0
                    ? ct("Temat jest wymagany dla pierwszego e-maila")
                    : ct("Pozostaw puste, aby odpowiedzieć w tym samym wątku")
              }
            />
            {subjectError && <p className="text-xs text-red-500 mt-1">{ct(subjectError)}</p>}
          </div>

          <div>
            <label className="flex items-center gap-1.5 cursor-pointer select-none mb-2">
              <input type="checkbox" checked={isHtml} onChange={e => setIsHtml(e.target.checked)} />
              <span className="text-sm font-medium">{ct("Wyślij jako HTML")}</span>
            </label>
            {isHtml ? (
              <div className={`border rounded overflow-hidden ${bodyError ? 'border-red-400' : ''}`}>
                <ReactQuill
                  theme="snow" value={body} onChange={v => { setBody(v); setBodyError(''); }}
                  modules={QUILL_MODULES} formats={QUILL_FORMATS}
                  style={{ minHeight: '160px' }}
                />
              </div>
            ) : (
              <textarea
                className={`w-full border rounded-lg p-3 font-mono text-sm focus:outline-none focus:ring-2 ${bodyError ? 'border-red-400 focus:ring-red-300' : 'focus:ring-teal-300'}`}
                value={body}
                onChange={e => { setBody(e.target.value); setBodyError(''); }}
                rows={8}
                placeholder={sequence?.fallback_body ? sequence.fallback_body : ct("Wpisz treść indywidualnej wiadomości")}
              />
            )}
            {bodyError && <p className="text-xs text-red-500 mt-1">{ct(bodyError)}</p>}
          </div>

          <VariablesGuide />
        </div>

        <div className="px-6 py-3 border-t flex justify-end gap-2">
          <Button size="sm" variant="outline" onClick={onClose}>{ct("Anuluj")}</Button>
          <Button size="sm" variant="default" onClick={save} disabled={saving}>
            {saving ? ct("Zapisywanie…") : ct("Zapisz")}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function SequencesTab({ sequences, campaignId, campaign, leads, refresh }) {
 const {ct}=useCampaignLanguage();
  const notify      = useNotify();
  const confirm     = useConfirm();
  const loadingCtrl = useLoading();
  const [pos, setPos] = useState(sequences.length);
  const [form, setForm] = useState({ subject: '', body: '', wait_days_after_previous: 0, is_html: false, preview_text: '', sequence_type: 'standard', fallback_subject: '', fallback_body: '' });
  const [msg,  setMsg]  = useState(null);
  const [editing,         setEditing]         = useState(null);
  const pendingPanelAction = useRef(null);
  const [editDirty,       setEditDirty]       = useState(false);
  const [customEmailTarget, setCustomEmailTarget] = useState(null); // { lead, sequence }
  const [showEditWarning, setShowEditWarning] = useState(false);
  const [previewSeq, setPreviewSeq] = useState(null);
  const [previewVariant, setPreviewVariant] = useState(null);
  const [previewOverride, setPreviewOverride] = useState(null);
  const [selectedIdx, setSelectedIdx] = useState(sequences.length > 0 ? 0 : null);
  const [showAddForm, setShowAddForm] = useState(sequences.length === 0);
  const [editingVariant, setEditingVariant] = useState(null);
  const [showVariantForm, setShowVariantForm] = useState(false);
  const [variantForm, setVariantForm] = useState({ label: '', subject: '', body: '', is_html: false, preview_text: '' });
  const [messageTemplates, setMessageTemplates] = useState([]);

  useEffect(() => {
    api.get('/templates')
      .then(rows => setMessageTemplates(Array.isArray(rows) ? rows : []))
      .catch(() => setMessageTemplates([]));
  }, []);

  useEffect(() => { setPos(sequences.length); }, [sequences]);
  useEffect(() => {
    if (sequences.length > 0 && selectedIdx === null) setSelectedIdx(0);
    if (sequences.length === 0) { setSelectedIdx(null); setShowAddForm(true); }
  }, [sequences.length]);

  const selectedSeq = selectedIdx !== null && sequences[selectedIdx] ? sequences[selectedIdx] : null;

  const personalizedSequences = useMemo(
    () => sequences.filter(s => (s.sequence_type || 'standard') === 'personalized'),
    [sequences],
  );

  const openEdit = (seq) => requestPanelChange(() => {
    const copy = { ...seq, is_html: seq.is_html ?? false, preview_text: seq.preview_text ?? '', sequence_type: seq.sequence_type ?? 'standard', fallback_subject: seq.fallback_subject ?? '', fallback_body: seq.fallback_body ?? '' };
    copy._previous_type = copy.sequence_type;
    setEditing(copy);
    setSelectedIdx(sequences.findIndex(s=>s.id===seq.id));
    setShowVariantForm(false);
    setEditingVariant(null);
    setEditDirty(false);
    setShowAddForm(false);
  });

  const updateEditing = (patch) => {
    setEditing(ed => ({ ...ed, ...patch }));
    setEditDirty(true);
  };

  const requestPanelChange = action => {
    if (editDirty || showVariantForm) {
      pendingPanelAction.current = action;
      setShowEditWarning(true);
    } else action();
  };
  const selectStep = idx => requestPanelChange(() => {
    setSelectedIdx(idx); setEditing(null); setEditDirty(false); setShowAddForm(false);
    setShowVariantForm(false); setEditingVariant(null);
  });
  const addStep = () => requestPanelChange(() => {
    setShowAddForm(true); setEditing(null); setEditDirty(false); setSelectedIdx(null);
    setShowVariantForm(false); setEditingVariant(null);
  });
  const tryCloseEdit = () => requestPanelChange(() => {setEditing(null);setEditDirty(false);});

  const submit = async e => {
    e.preventDefault();
    try {
      await api.post(`/campaigns/${campaignId}/sequences`, { ...form, position: pos });
      setForm({ subject: '', body: '', wait_days_after_previous: 0, is_html: false, preview_text: '', sequence_type: 'standard', fallback_subject: '', fallback_body: '' });
      setMsg({ type: 'success', text: 'Krok sekwencji dodany' });
      setShowAddForm(false);
      refresh();
    } catch (e) {
      setMsg({ type: 'error', text: e.message });
    }
  };

  const saveEdit = async e => {
    e.preventDefault();
    loadingCtrl.start();
    try {
      const { _previous_type, ...payload } = editing || {};
      await api.patch(`/campaigns/${campaignId}/sequences/${editing.id}`, payload);
      notify({ type: 'success', message: ct("Krok sekwencji zaktualizowany") });
      setEditing(null);
      setEditDirty(false);
      refresh();
    } catch (e) {
      notify({ type: 'error', message: e.message });
    } finally {
      loadingCtrl.stop();
    }
  };

  const deleteSeq = async seq => {
    if (!await confirm({message:ct('Usunąć krok sekwencji #{step}?',{step:seq.position+1}),danger:true})) return;
    try {
      await api.del(`/campaigns/${campaignId}/sequences/${seq.id}`);
      notify({ type: 'success', message: ct("Krok sekwencji usunięty") });
      if (editing?.id === seq.id) { setEditing(null); setEditDirty(false); }
      setShowVariantForm(false);
      setEditingVariant(null);
      if (selectedIdx >= sequences.length - 1) setSelectedIdx(Math.max(0, sequences.length - 2));
      refresh();
    } catch (e) {
      notify({ type: 'error', message: e.message });
    }
  };

  const createVariant = async () => {
    try {
      await api.post(`/campaigns/${campaignId}/sequences/${selectedSeq.id}/variants`, variantForm);
      setShowVariantForm(false);
      setVariantForm({ label: '', subject: '', body: '', is_html: false, preview_text: '' });
      refresh();
    } catch (e) { notify({ type: 'error', message: e.message }); }
  };

  const saveVariant = async () => {
    if (!editingVariant) return;
    try {
      await api.patch(`/campaigns/${campaignId}/sequences/${selectedSeq.id}/variants/${editingVariant.id}`, variantForm);
      setEditingVariant(null);
      setShowVariantForm(false);
      refresh();
    } catch (e) { notify({ type: 'error', message: e.message }); }
  };

  const deleteVariant = async (v) => {
    if (!await confirm({message:ct('Usunąć wariant „{name}”?',{name:v.label||ct('Wariant')}),danger:true})) return;
    try {
      await api.del(`/campaigns/${campaignId}/sequences/${selectedSeq.id}/variants/${v.id}`);
      refresh();
    } catch (e) { notify({ type: 'error', message: e.message }); }
  };

  const toggleVariantEnabled = async (v) => {
    try {
      await api.patch(`/campaigns/${campaignId}/sequences/${selectedSeq.id}/variants/${v.id}`, { enabled: !v.enabled });
      refresh();
    } catch (e) { notify({ type: 'error', message: e.message }); }
  };

  const openEditVariant = (v) => {
    setEditingVariant(v);
    setVariantForm({ label: v.label || '', subject: v.subject || '', body: v.body || '', is_html: v.is_html ?? false, preview_text: v.preview_text || '' });
    setShowVariantForm(true);
  };

  const applyMessageTemplate = (templateId, target) => {
    const tpl = messageTemplates.find(t => String(t.id) === String(templateId));
    const version = tpl?.latest_version;
    if (!version) return;
    const patch = {
      subject: version.subject || '',
      body: version.body || '',
      is_html: Boolean(version.is_html),
      preview_text: '',
    };
    if (target === 'edit') {
      updateEditing(patch);
    } else {
      setForm(prev => ({ ...prev, ...patch }));
    }
  };

  const getCumulativeDay = idx => sequenceDay(sequences,idx);

  return (
    <div className="sk-sequence-workspace">
      {/* ── Left: Step timeline ── */}
      <section className="sk-sequence-timeline" aria-label={ct("Oś sekwencji")}>
        <header className="sk-sequence-timeline-heading">
          <div><h3>{ct("Sekwencja wiadomości")}</h3><p>{sequences.length} {sequences.length === 1 ? ct('krok') : ct("kroków")} {ct("· Ostatni krok: dzień")} {getCumulativeDay(sequences.length-1)}</p></div>
          <Button size="sm" onClick={addStep}>{ct("Dodaj krok")}</Button>
        </header>
        <div className="sk-sequence-timeline-steps">
          {sequences.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-4">{ct("Brak kroków. Dodaj pierwszy, aby rozpocząć.")}</p>
          )}
          <div className="relative">
            {sequences.map((s, idx) => {
              const isActive = editing?.id === s.id || (selectedIdx === idx && !editing && !showAddForm);
              const cumulDay = getCumulativeDay(idx);
              return (
                <div key={s.id}>
                  {/* Step row — circle column is always exactly w-8 so all cards are the same width */}
                  <div className="flex gap-3">
                    <div className="w-8 shrink-0 flex items-center justify-center">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all z-10 ${
                        isActive ? 'bg-teal-500 border-teal-500 text-white shadow-md' : 'bg-white border-gray-300 text-gray-500'
                      }`}>{idx + 1}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => selectStep(idx)}
                      aria-label={ct('Pokaż krok {step}',{step:idx+1})}
                      aria-current={isActive ? 'step' : undefined}
                      className={`sk-sequence-step-choice flex-1 min-w-0 text-left rounded-lg px-3 py-2.5 transition-all border cursor-pointer ${
                        isActive ? 'bg-teal-50 border-teal-300 shadow-sm' : 'bg-white border-gray-200 hover:border-teal-200 hover:bg-teal-50/30'
                      }`}
                    >
                      <div className="flex items-center gap-1 min-w-0">
                        <span className={`text-sm font-medium truncate min-w-0 flex-1 ${isActive ? 'text-teal-700' : 'text-gray-800'}`}>
                          {s.sequence_type === 'personalized'
                            ? (s.fallback_subject || <em className="text-purple-400 font-normal text-xs">{ct("Indywidualna dla kontaktu")}</em>)
                            : (s.subject || <em className="text-gray-400 font-normal text-xs">{ct("Odpowiedź w wątku")}</em>)
                          }
                        </span>
                        {s.is_html && <span className="text-[9px] bg-blue-100 text-blue-600 rounded px-1 py-0.5 font-medium shrink-0">{ct("HTML")}</span>}
                        {s.sequence_type === 'personalized' && <span className="text-[9px] bg-purple-100 text-purple-600 rounded px-1 py-0.5 font-medium shrink-0">{ct("Spersonalizowana")}</span>}
                      </div>
                      <p className="sk-sequence-excerpt">{sequenceExcerpt(s, ct)}</p>
                      <div className="sk-sequence-step-meta"><Icon name="mail" size={15}/><span>{ct("Dzień")} {cumulDay}{idx === 0 ? ct(' (start)') : ''}</span><span>{(s.variants||[]).length ? ct('{count} wariantów A/B',{count:s.variants.length}) : ct("Treść domyślna")}</span></div>
                    </button>
                    <button type="button" className="sk-sequence-step-edit" aria-label={ct('Edytuj krok {step}',{step:idx+1})} onClick={()=>openEdit(s)}><Icon name="edit" size={18}/></button>
                  </div>
                  {/* Connector between kroks — rendered as its own row so it never affects card width */}
                  {idx < sequences.length - 1 && (
                    <div className="flex gap-3">
                      <div className="sk-sequence-delay flex flex-col items-start">
                        <div className="w-0.5 h-4 bg-gray-300" />
                        <div className="text-[10px] font-medium text-gray-400 bg-gray-100 border border-gray-200 rounded-full px-2 py-0.5 my-0.5 whitespace-nowrap">
                          {sequences[idx + 1]?.wait_days_after_previous || 0} {ct("dni przerwy")} </div>
                        <div className="w-0.5 h-4 bg-gray-300" />
                      </div>
                    </div>
                  )}
                  {/* Small gap after each krok */}
                  <div className="h-2" />
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Right: Editor / Detail Panel ── */}
      <section className="sk-sequence-editor" aria-label={ct("Szczegóły i edycja kroku")}>
        {editing && (
          <div className="flex-1 flex flex-col overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-800">{ct("Edytuj krok #")}{editing.position + 1}</h3>
                <p className="text-xs text-gray-400">{ct("Zmień treść wiadomości i czas wysyłki")}</p>
              </div>
              <div className="flex gap-2">
                {(editing.sequence_type || 'standard') !== 'personalized' && (
                  <Button size="sm" variant="outline" onClick={() => { setPreviewSeq(editing); setPreviewVariant(null); setPreviewOverride(editing); }}>{ct("Podgląd")}</Button>
                )}
                <Button size="sm" variant="destructive" onClick={() => deleteSeq(editing)}>{ct("Usuń")}</Button>
              </div>
            </div>
            <form onSubmit={saveEdit} className="flex-1 overflow-y-auto p-6 space-y-5">
              {(editing.sequence_type || 'standard') === 'personalized' ? (
                <>
                  <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg text-xs text-purple-700"> {ct("To krok spersonalizowany. Wpisz treść zastępczą, która będzie używana jako podpowiedź podczas tworzenia indywidualnej wiadomości dla kontaktu.")} {campaign?.custom_sequence_mode === 'asap' && (
                      <span className="block mt-1 font-medium text-purple-800">{ct("Kampania działa w trybie „Wysyłaj od razu” — każda wiadomość może zostać wysłana po jej przygotowaniu.")}</span>
                    )}
                    {(!campaign?.custom_sequence_mode || campaign?.custom_sequence_mode === 'wait_for_all') && (
                      <span className="block mt-1">{ct("Kampania działa w trybie „Czekaj na wszystkie” — wysyłka nie ruszy, dopóki wszystkie wiadomości nie będą przygotowane.")}</span>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{ct("Temat zastępczy")}</label>
                    <input className="w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300" value={editing.fallback_subject || ''} onChange={e => updateEditing({ fallback_subject: e.target.value })} placeholder={(editing.position ?? 0) === 0 ? ct("Pozostaw puste — pierwszy e-mail wymaga indywidualnego tematu") : ct("Pozostaw puste — indywidualny temat będzie odpowiedzią w wątku")} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{ct("Treść zastępcza")}</label>
                    <textarea className="w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300 min-h-[120px] font-mono" value={editing.fallback_body || ''} onChange={e => updateEditing({ fallback_body: e.target.value })} placeholder={ct("Wpisz treść zastępczą używaną podczas przygotowywania indywidualnej wiadomości")} />
                    <VariablesGuide />
                  </div>
                </>
              ) : (
                <>
                  {messageTemplates.length > 0 && (
                    <div className="rounded-lg border border-teal-100 bg-teal-50/40 p-3">
                      <label className="block text-xs font-medium text-gray-600 mb-1">{ct("Wczytaj z szablonu")}</label>
                      <select
                        defaultValue=""
                        onChange={e => {
                          if (e.target.value) applyMessageTemplate(e.target.value, 'edit');
                          e.target.value = '';
                        }}
                        className="w-full rounded-lg border-gray-300 bg-white text-sm"
                      >
                        <option value="">{ct("Wybierz szablon…")}</option>
                        {messageTemplates.map(t => (
                          <option key={t.id} value={t.id}>{t.name} {ct("· v")}{t.latest_version?.version || 1}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{ct("Temat")}</label>
                    <input className="w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300" aria-label={ct("Temat wiadomości")} value={editing.subject || ''} onChange={e => updateEditing({ subject: e.target.value })} placeholder={ct("Pozostaw puste, aby odpowiedzieć w tym samym wątku")} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{ct("Treść wiadomości *")}</label>
                    <SequenceBodyEditor value={editing.body} onChange={val => updateEditing({ body: val })} isHtml={editing.is_html ?? false} onIsHtmlChange={v => updateEditing({ is_html: v })} previewText={editing.preview_text ?? ''} onPreviewTextChange={v => updateEditing({ preview_text: v })} isFirstSequence={editing.position === 0} campaign={campaign} required />
                  </div>
                </>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{ct("Typ sekwencji")}</label>
                <select
                  className="w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300"
                  value={editing.sequence_type || 'standard'}
                  onChange={e => {
                    const nextType = e.target.value;
                    setEditing(ed => {
                      if (!ed) return ed;
                      const next = { ...ed, sequence_type: nextType };
                      if ((ed.sequence_type || 'standard') !== nextType) {
                        if (nextType === 'personalized') {
                          next.fallback_subject = ed.subject || '';
                          next.fallback_body = ed.body || '';
                        } else {
                          next.subject = ed.fallback_subject || '';
                          next.body = ed.fallback_body || '';
                        }
                      }
                      return next;
                    });
                    setEditDirty(true);
                  }}
                >
                  <option value="standard">{ct("Standardowa — ta sama treść dla wszystkich kontaktów")}</option>
                  <option value="personalized">{ct("Spersonalizowana — indywidualna treść dla kontaktu")}</option>
                </select>
                {(editing.sequence_type || 'standard') === 'personalized' && (
                  <p className="text-xs text-purple-600 mt-1"> {ct("Dla każdego kontaktu trzeba przygotować indywidualną wiadomość w tym kroku przed rozpoczęciem wysyłki.")} {campaign?.custom_sequence_mode === 'asap' ? (
                      <span className="block mt-0.5 font-medium">{ct("Tryb „Wysyłaj od razu” jest włączony — wiadomość może zostać wysłana zaraz po przygotowaniu.")}</span>
                    ) : (
                      <span className="block mt-0.5">{ct("Tryb „Czekaj na wszystkie” jest włączony — nic nie zostanie wysłane, dopóki wszystkie wiadomości nie będą przygotowane.")}</span>
                    )}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{ct("Dni przerwy po poprzednim kroku")}</label>
                <input type="number" min={0} className="w-28 border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300" aria-label={ct("Dni przerwy po poprzednim kroku")} value={editing.wait_days_after_previous} onChange={e => updateEditing({ wait_days_after_previous: +e.target.value })} />
              </div>
              <div className="flex gap-2 pt-2">
                <Button size="sm" variant="default">{ct("Zapisz zmiany")}</Button>
                <Button type="button" size="sm" variant="outline" onClick={tryCloseEdit}>{ct("Anuluj")}</Button>
              </div>
            </form>
          </div>
        )}

        {!editing && !showAddForm && selectedSeq && (
          <div className="flex-1 flex flex-col overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-800" >{ct("Krok")} {selectedSeq.position + 1}{selectedSeq.sequence_type === 'personalized'
                  ? (selectedSeq.fallback_subject ? ` — ${selectedSeq.fallback_subject}` : ct(" — Indywidualna dla kontaktu"))
                  : (selectedSeq.subject ? ` — ${selectedSeq.subject}` : ct(" — Odpowiedź w wątku"))
                }</h3>
                <p className="text-xs text-gray-400">{selectedSeq.wait_days_after_previous} {ct("dni przerwy")}{selectedSeq.is_html ? ' · HTML' : ct(' · czysty tekst')}{ct(' · Dzień ') + getCumulativeDay(selectedIdx)}</p>
              </div>
              <div className="flex gap-2">
                {(selectedSeq.sequence_type || 'standard') !== 'personalized' && (
                  <Button size="sm" variant="outline" onClick={() => { setPreviewSeq(selectedSeq); setPreviewOverride(null); }}>{ct("Podgląd")}</Button>
                )}
                <Button size="sm" variant="default" onClick={() => openEdit(selectedSeq)}>{ct("Edytuj")}</Button>
                <Button size="sm" variant="destructive" onClick={() => deleteSeq(selectedSeq)}>{ct("Usuń")}</Button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {(selectedSeq.sequence_type || 'standard') !== 'personalized' && (
                <>
                  <div className="mb-5">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-1">{ct("Temat")}</span>
                    <p className="text-gray-800 font-medium">{selectedSeq.subject || <em className="text-gray-400 font-normal">{ct("Odpowiedź w tym samym wątku")}</em>}</p>
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide block mb-2">{ct("Treść")}</span>
                    {selectedSeq.is_html ? (
                      <div className="border rounded-lg p-5 bg-white prose prose-sm max-w-none min-h-[200px]" dangerouslySetInnerHTML={{ __html: selectedSeq.body }} />
                    ) : (
                      <pre className="border rounded-lg p-5 bg-gray-50 text-sm whitespace-pre-wrap font-sans text-gray-800 min-h-[200px]">{selectedSeq.body || '(pusto)'}</pre>
                    )}
                  </div>
                </>
              )}

              {/* ── Personalized Sequence: Custom E-mails ── */}
              {(selectedSeq.sequence_type || 'standard') === 'personalized' && (
                <PersonalizedSequenceSection
                  sequence={selectedSeq}
                  sequences={sequences}
                  personalizedSequences={personalizedSequences}
                  leads={leads}
                  campaignId={campaignId}
                  campaign={campaign}
                  onWriteCustom={(lead, seq) => setCustomEmailTarget({ lead, sequence: seq })}
                  onRefresh={refresh}
                />
              )}

              {/* ── A/B Variants ── */}
              {(selectedSeq.sequence_type || 'standard') !== 'personalized' && (
              <div className="mt-6 pt-6 border-t border-gray-200">
                <div className="sk-sequence-variants-heading">
                  <div>
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{ct("Warianty A/B")}</span>
                    <p className="text-xs text-gray-400 mt-0.5">{ct("Dodaj alternatywną treść — podczas wysyłki jeden wariant zostanie wybrany losowo")}</p>
                  </div>
                  {!showVariantForm && (
                    <button
                      onClick={() => { setEditingVariant(null); setVariantForm({ label: '', subject: '', body: '', is_html: false, preview_text: '' }); setShowVariantForm(true); }}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-purple-50 text-purple-700 border border-purple-200 rounded-lg hover:bg-purple-100 transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg> {ct("Dodaj wariant")} </button>
                  )}
                </div>

                {(selectedSeq.variants || []).length === 0 && !showVariantForm && (
                  <p className="text-xs text-gray-400 italic py-2">{ct("Brak wariantów — zawsze zostanie użyta domyślna treść powyżej.")}</p>
                )}
                {(selectedSeq.variants || []).length > 0 && (
                  <div className="space-y-2 mb-3">
                    {(selectedSeq.variants || []).map(v => (
                      <div key={v.id} className={`flex items-center gap-3 p-3 rounded-lg border ${v.enabled ? 'border-purple-200 bg-purple-50/50' : 'border-gray-200 bg-gray-50 opacity-60'}`}>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm text-gray-800">{v.label || ct("Wariant")}</span>
                            <button
                              onClick={() => toggleVariantEnabled(v)}
                              className={`text-[10px] px-2 py-0.5 rounded-full font-medium transition-colors ${v.enabled ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-gray-200 text-gray-500 hover:bg-gray-300'}`}
                            >
                              {v.enabled ? ct("Włączony") : ct("Wyłączony")}
                            </button>
                          </div>
                          {v.subject && <p className="text-xs text-gray-500 mt-0.5 truncate">{ct("Temat:")} {v.subject}</p>}
                          {v.body && <p className="text-xs text-gray-400 mt-0.5 truncate">{v.body.replace(/<[^>]+>/g, '').slice(0, 80)}…</p>}
                        </div>
                        <div className="flex gap-1.5 shrink-0">
                          <button onClick={() => { setPreviewSeq(selectedSeq); setPreviewVariant(v); setPreviewOverride(null); }} className="px-2.5 py-1 text-xs bg-white border border-teal-200 rounded hover:bg-teal-50 text-teal-700 transition-colors">{ct("Podgląd")}</button>
                          <button onClick={() => openEditVariant(v)} className="px-2.5 py-1 text-xs bg-white border border-gray-300 rounded hover:bg-gray-100 text-gray-600 transition-colors">{ct("Edytuj")}</button>
                          <button onClick={() => deleteVariant(v)} className="px-2.5 py-1 text-xs bg-white border border-red-200 rounded hover:bg-red-50 text-red-600 transition-colors">{ct("Usuń")}</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {showVariantForm && (
                  <div className="border border-purple-200 bg-purple-50/30 rounded-lg p-4 space-y-3">
                    <h4 className="text-sm font-semibold text-gray-700">{editingVariant ? ct("Edytuj wariant") : ct("Nowy wariant")}</h4>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">{ct("Etykieta")} <span className="text-gray-400">{ct("(np. „Wariant A”)")}</span></label>
                      <input className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300" placeholder={ct("Wariant A")} value={variantForm.label} onChange={e => setVariantForm(f => ({ ...f, label: e.target.value }))} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">{ct("Temat")} <span className="text-gray-400">{ct("(puste = użyj tematu kroku)")}</span></label>
                      <input className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300" placeholder={ct("Pozostaw puste, aby użyć tematu kroku")} value={variantForm.subject} onChange={e => setVariantForm(f => ({ ...f, subject: e.target.value }))} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">{ct("Treść *")}</label>
                      <textarea className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300 min-h-[120px] font-mono" placeholder={ct("Treść wiadomości…")} value={variantForm.body} onChange={e => setVariantForm(f => ({ ...f, body: e.target.value }))} />
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="default" onClick={editingVariant ? saveVariant : createVariant} type="button">
                        {editingVariant ? ct("Zapisz wariant") : ct("Utwórz wariant")}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => { setShowVariantForm(false); setEditingVariant(null); }} type="button">{ct("Anuluj")}</Button>
                    </div>
                  </div>
                )}
              </div>
              )}
            </div>
          </div>
        )}

        {!editing && showAddForm && (
          <div className="flex-1 flex flex-col overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
              <h3 className="font-semibold text-gray-800">{ct("Dodaj nowy krok")}</h3>
              <p className="text-xs text-gray-400">{ct("To będzie krok #")}{sequences.length + 1} {ct("w sekwencji")}</p>
            </div>
            <form onSubmit={submit} className="flex-1 overflow-y-auto p-6 space-y-5">
              {msg && <div className={`rounded-lg px-3 py-2 text-sm ${msg.type === 'error' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>{ct(msg.text)}</div>}
              {(form.sequence_type || 'standard') === 'personalized' ? (
                <>
                  <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg text-xs text-purple-700"> {ct("To krok spersonalizowany. Wpisz treść zastępczą, która będzie używana jako podpowiedź podczas tworzenia indywidualnej wiadomości dla kontaktu.")} </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{ct("Temat zastępczy")}</label>
                    <input className="w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300" value={form.fallback_subject} onChange={e => setForm(f => ({ ...f, fallback_subject: e.target.value }))} placeholder={pos === 0 ? ct("Pozostaw puste — pierwszy e-mail wymaga indywidualnego tematu") : ct("Pozostaw puste — indywidualny temat będzie odpowiedzią w wątku")} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{ct("Treść zastępcza")}</label>
                    <textarea className="w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300 min-h-[120px] font-mono" value={form.fallback_body} onChange={e => setForm(f => ({ ...f, fallback_body: e.target.value }))} placeholder={ct("Wpisz treść zastępczą używaną podczas przygotowywania indywidualnej wiadomości")} />
                    <VariablesGuide />
                  </div>
                </>
              ) : (
                <>
                  {messageTemplates.length > 0 && (
                    <div className="rounded-lg border border-teal-100 bg-teal-50/40 p-3">
                      <label className="block text-xs font-medium text-gray-600 mb-1">{ct("Wczytaj z szablonu")}</label>
                      <select
                        defaultValue=""
                        onChange={e => {
                          if (e.target.value) applyMessageTemplate(e.target.value, 'new');
                          e.target.value = '';
                        }}
                        className="w-full rounded-lg border-gray-300 bg-white text-sm"
                      >
                        <option value="">{ct("Wybierz szablon…")}</option>
                        {messageTemplates.map(t => (
                          <option key={t.id} value={t.id}>{t.name} {ct("· v")}{t.latest_version?.version || 1}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{ct("Temat")}</label>
                    <input className="w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300" value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} placeholder={ct("Pozostaw puste, aby odpowiedzieć w tym samym wątku")} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{ct("Treść wiadomości *")}</label>
                    <SequenceBodyEditor value={form.body} onChange={val => setForm(f => ({ ...f, body: val }))} isHtml={form.is_html} onIsHtmlChange={v => setForm(f => ({ ...f, is_html: v }))} previewText={form.preview_text ?? ''} onPreviewTextChange={v => setForm(f => ({ ...f, preview_text: v }))} isFirstSequence={pos === 0} campaign={campaign} required />
                  </div>
                </>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{ct("Typ sekwencji")}</label>
                <select
                  className="w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300"
                  value={form.sequence_type || 'standard'}
                  onChange={e => {
                    const newType = e.target.value;
                    setForm(f => {
                      const next = { ...f, sequence_type: newType };
                      if ((f.sequence_type || 'standard') !== newType) {
                        if (newType === 'personalized') {
                          next.fallback_subject = f.subject || '';
                          next.fallback_body = f.body || '';
                        } else {
                          next.subject = f.fallback_subject || '';
                          next.body = f.fallback_body || '';
                        }
                      }
                      return next;
                    });
                  }}
                >
                  <option value="standard">{ct("Standardowa — ta sama treść dla wszystkich kontaktów")}</option>
                  <option value="personalized">{ct("Spersonalizowana — indywidualna treść dla kontaktu")}</option>
                </select>
                {(form.sequence_type || 'standard') === 'personalized' && (
                  <p className="text-xs text-purple-600 mt-1">{ct("Dla każdego kontaktu trzeba przygotować indywidualną wiadomość w tym kroku przed rozpoczęciem wysyłki.")}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{ct("Dni przerwy po poprzednim kroku")}</label>
                <input type="number" min={0} className="w-28 border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300" value={form.wait_days_after_previous} onChange={e => setForm(f => ({ ...f, wait_days_after_previous: +e.target.value }))} />
              </div>
              <Button size="sm" variant="default">{ct("Dodaj krok")}</Button>
            </form>
          </div>
        )}

        {!editing && !showAddForm && !selectedSeq && (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">{ct("Wybierz krok albo dodaj nowy, aby rozpocząć.")}</div>
        )}
      </section>

      {showEditWarning && (
        <Modal title={ct("Odrzucić zmiany?")} small onClose={()=>{setShowEditWarning(false);pendingPanelAction.current=null;}} footer={<>
          <Button size="sm" variant="outline" onClick={()=>{setShowEditWarning(false);pendingPanelAction.current=null;}}>{ct("Kontynuuj edycję")}</Button>
          <Button size="sm" variant="destructive" onClick={()=>{
            const action=pendingPanelAction.current; pendingPanelAction.current=null;
            setShowEditWarning(false);setEditDirty(false);setShowVariantForm(false);setEditingVariant(null);
            action?.();
          }}>{ct("Odrzuć")}</Button>
        </>}><p>{ct("Masz niezapisane zmiany. Przejście do innego kroku lub zamknięcie edytora spowoduje ich utratę.")}</p></Modal>
      )}

      {previewSeq && (
        <PreviewModal sequence={previewSeq} campaignId={campaignId} leads={leads} variant={previewVariant} editingOverride={previewOverride} onClose={() => { setPreviewSeq(null); setPreviewVariant(null); setPreviewOverride(null); }} />
      )}

      {customEmailTarget && (
        <CustomEmailEditorModal
          target={customEmailTarget}
          campaignId={campaignId}
          onClose={() => setCustomEmailTarget(null)}
          onSaved={refresh}
        />
      )}
    </div>
  );
}
