import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { useConfirm } from '../context/ConfirmContext';
import { formatDateKey, parseApiDate } from '../utils/datetime';
import { Badge, Button, Empty, ErrorNotice, Field, Metric, Panel, dateTime } from './ui';

export default function CampaignActivity({ campaign, inboxes, contact = '', onSaved }) {
  const [data, setData] = useState(null), [error, setError] = useState(null), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [message, setMessage] = useState('');
  const [search, setSearch] = useState(contact), [mailbox, setMailbox] = useState(''), [limit, setLimit] = useState(50);
  const generation = useRef(0), lock = useRef(false), confirm = useConfirm();
  const load = useCallback(async () => {
    const request = ++generation.current; setLoading(true); setError(null);
    try {
      const [queue, sent, report] = await Promise.all([api.get(`/campaigns/${campaign.id}/queue`), api.get(`/campaigns/${campaign.id}/sent`), api.get(`/campaigns/${campaign.id}/preflight`)]);
      if (request === generation.current) setData({ queue, sent, report });
    } catch (e) { if (request === generation.current) { setData(null); setError(e); } }
    finally { if (request === generation.current) setLoading(false); }
  }, [campaign.id]);
  useEffect(() => { load(); return () => { generation.current++; }; }, [load]);
  useEffect(() => { setSearch(contact); }, [contact]);
  useEffect(() => { setLimit(50); }, [search, mailbox]);
  async function perform(action) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(null); setMessage('');
    try { await action(); } catch (e) { setError(e); } finally { lock.current = false; setBusy(false); }
  }
  const toggle = () => perform(async () => {
    if (campaign.paused) {
      const report = await api.get(`/campaigns/${campaign.id}/preflight`);
      setData(d => d ? { ...d, report } : d);
      if (!report.ready) throw new Error('Start zablokowany. Sprawdź gotowość kampanii w ustawieniach.');
    }
    await api.post(`/campaigns/${campaign.id}/${campaign.paused ? 'start' : 'pause'}`, {});
    await onSaved?.(); await load();
  });
  const recalculate = async () => {
    if (!await confirm('Przeliczyć harmonogram wszystkich kampanii? Skrzynki mają wspólne limity, więc zmienią się również terminy pozostałych kampanii.')) return;
    perform(async () => { await api.post('/schedule/recalculate-all', {}); setMessage('Przeliczanie harmonogramu zlecone. Odśwież dane po zakończeniu zadania.'); });
  };
  const reset = async slotId => {
    if (!await confirm(`Czy sprawdzono u dostawcy poczty, że wiadomość z pozycji ${slotId} NIE została dostarczona? Odblokowanie umożliwi ponowną wysyłkę i może spowodować duplikat.`)) return;
    perform(async () => { await api.post(`/campaigns/${campaign.id}/send-attempts/${slotId}/reset`, {}); await load(); setMessage('Pozycja odblokowana do przyszłej wysyłki.'); });
  };
  const uncertainty = data?.report?.issues?.find(i => i.code === 'uncertain_send_attempts');
  const uncertainIds = new Set(uncertainty?.details?.slot_ids || []);
  const pausedIds = new Set(inboxes.filter(i => i.paused).map(i => i.id));
  const matches = row => (!mailbox || row.inbox_email === mailbox) && `${row.lead_name || ''} ${row.lead_email || ''}`.toLocaleLowerCase('pl').includes(search.trim().toLocaleLowerCase('pl'));
  const queue = (data?.queue || []).filter(matches);
  const sent = (data?.sent || []).filter(matches).sort((a,b) => parseApiDate(b.sent_at || b.sent_date) - parseApiDate(a.sent_at || a.sent_date));
  const zone = campaign.timezone || 'UTC';
  const today = formatDateKey(new Date(), zone);
  const stamp = value => dateTime(value, { timeZone: zone });
  const state = row => uncertainIds.has(row.slot_id) ? ['red','Niepewna'] : campaign.paused || pausedIds.has(row.inbox_id) ? ['amber','Wstrzymana'] : ['blue','Zaplanowana'];
  return <div className="sk-campaign-activity">
    <ErrorNotice error={error} onRetry={load}/>{message && <p role="status" className="sk-notice tone-green">{message}</p>}
    <div className="sk-metrics four">
      <Metric icon="stack" title="W kolejce" value={data?.queue.length} detail="Wszystkie zaplanowane wiadomości"/>
      <Metric icon="send" title="Wysłano dzisiaj" value={data ? data.sent.filter(r => formatDateKey(r.sent_at || r.sent_date, zone) === today).length : null} detail={zone} tone="blue"/>
      <Metric icon="pause" title="Wstrzymane" value={data ? data.queue.filter(r => campaign.paused || pausedIds.has(r.inbox_id)).length : null} detail="Pauza kampanii lub skrzynki" tone="amber"/>
      <Metric icon="shield" title="Niepewne wysyłki" value={data ? uncertainty?.details?.count || 0 : null} detail="Wymagają weryfikacji dostarczenia" tone="red"/>
    </div>
    <div className="sk-activity-filters"><Field label="Szukaj kontaktu"><input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Nazwa lub adres e-mail"/></Field><Field label="Skrzynka nadawcza"><select value={mailbox} onChange={e => setMailbox(e.target.value)}><option value="">Wszystkie skrzynki</option>{[...new Set([...(data?.queue || []), ...(data?.sent || [])].map(r => r.inbox_email).filter(Boolean))].map(email => <option key={email}>{email}</option>)}</select></Field><Button icon="refresh" onClick={load} disabled={loading || busy}>Odśwież dane</Button><span className="sk-muted sk-small">Czas: {zone}</span></div>
    {loading && <p role="status">Wczytywanie aktywności…</p>}
    {data && <div className="sk-activity-grid">
      <Panel title="Kolejka wysyłek" icon="clock" action={<Badge>{queue.length}</Badge>}><div className="sk-table-wrap"><table className="sk-table"><thead><tr><th>Termin</th><th>Kontakt</th><th>Krok</th><th>Skrzynka</th><th>Status</th></tr></thead><tbody>{queue.slice(0,limit).map(r => <tr key={r.slot_id}><td>{stamp(r.scheduled_date)}</td><td><strong>{r.lead_name || r.lead_email}</strong>{r.lead_name && <small>{r.lead_email}</small>}</td><td>{r.sequence_index + 1}</td><td>{r.inbox_email || '—'}</td><td><Badge tone={state(r)[0]}>{state(r)[1]}</Badge></td></tr>)}</tbody></table></div>{!queue.length && <Empty>Brak pozycji kolejki dla tych filtrów.</Empty>}{queue.length > limit && <Button className="sk-activity-more" onClick={() => setLimit(n => n + 50)}>Pokaż kolejne pozycje</Button>}</Panel>
      <Panel title="Historia wysyłek" icon="history" action={<Badge>{sent.length}</Badge>}><div className="sk-table-wrap"><table className="sk-table"><thead><tr><th>Wysłano</th><th>Kontakt</th><th>Wiadomość</th><th>Stan obecny</th></tr></thead><tbody>{sent.slice(0,limit).map(r => <tr key={r.log_id}><td>{stamp(r.sent_at || r.sent_date)}</td><td><strong>{r.lead_name || r.lead_email}</strong>{r.lead_name && <small>{r.lead_email}</small>}</td><td><strong>{r.subject || 'Bez tematu'}</strong><small>Krok {r.sequence_index + 1} · {r.inbox_email || '—'}</small></td><td><Badge tone={r.replied ? 'purple' : 'green'}>{r.replied ? 'Kontakt odpowiedział' : r.clicked ? 'Kliknięto' : r.opened ? 'Otwarto' : 'Wysłano'}</Badge></td></tr>)}</tbody></table></div>{!sent.length && <Empty>Brak wysłanych wiadomości dla tych filtrów.</Empty>}{sent.length > limit && <Button className="sk-activity-more" onClick={() => setLimit(n => n + 50)}>Pokaż kolejne wiadomości</Button>}<p className="sk-activity-footnote">Data dotyczy wysyłki. Odpowiedź oznacza obecny stan kontaktu.</p></Panel>
      <Panel title="Sterowanie kolejką" icon="settings"><div className="sk-settings-card-body"><p className="sk-muted">Terminy uwzględniają wspólne limity skrzynek, dni oraz godziny wysyłki.</p><div className="sk-activity-actions"><Button onClick={toggle} disabled={busy || loading} icon={campaign.paused ? 'play' : 'pause'}>{campaign.paused ? 'Sprawdź i uruchom' : 'Wstrzymaj kampanię'}</Button><Button onClick={recalculate} disabled={busy || loading} icon="refresh">Przelicz harmonogram</Button><Button to="#settings">Ustawienia kampanii</Button></div></div></Panel>
      <Panel title="Niepewne wysyłki" icon="shield"><div className="sk-settings-card-body">{uncertainty ? <><p className="sk-notice tone-amber">{uncertainty.message}</p><p className="sk-small sk-muted">Najpierw sprawdź dostarczenie u dostawcy poczty. Odblokuj tylko wiadomości, które nie dotarły.</p>{[...uncertainIds].map(id => { const row = data.queue.find(r => r.slot_id === id); return <div className="sk-uncertain-row" key={id}><span>Pozycja #{id}{row && <small>{row.lead_email} · krok {row.sequence_index + 1}</small>}</span><Button className="compact" disabled={busy || loading} onClick={() => reset(id)}>Odblokuj #{id}</Button></div>; })}{uncertainty.details?.count > uncertainIds.size && <p className="sk-muted">Pokazano pierwsze {uncertainIds.size} pozycji. Kolejne pojawią się po rozwiązaniu widocznych.</p>}</> : <p className="sk-notice tone-green">Brak niepewnych prób wysyłki.</p>}</div></Panel>
    </div>}
  </div>;
}
