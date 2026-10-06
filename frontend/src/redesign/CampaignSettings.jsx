import {useCampaignLanguage, campaignWeekdays} from '../context/campaignLanguage';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useConfirm } from '../context/ConfirmContext';
import { Badge, Button, ErrorNotice, Field, Icon, Panel, Switch } from './ui';


export function campaignSettingsForm(c) {
  return { name: c.name || '', inbox_ids: c.inbox_ids || [], sending_days: c.sending_days || [],
    sending_hours_start: c.sending_hours_start || '09:00', sending_hours_end: c.sending_hours_end || '17:00', timezone: c.timezone || 'UTC',
    stop_on_reply: c.stop_on_reply ?? true, track_opens: c.track_opens ?? false, track_clicks: c.track_clicks ?? false,
    add_unsubscribe_header: c.add_unsubscribe_header ?? true, send_first_as_text: c.send_first_as_text ?? false,
    send_all_as_text: c.send_all_as_text ?? false, custom_sequence_mode: c.custom_sequence_mode || 'wait_for_all' };
}
export default function CampaignSettings({ campaign, inboxes, onSaved }) {
 const {ct,language}=useCampaignLanguage();
  const days = campaignWeekdays(language);
  const [form, setForm] = useState(() => campaignSettingsForm(campaign));
  const [baseline, setBaseline] = useState(() => JSON.stringify(campaignSettingsForm(campaign)));
  const [paused, setPaused] = useState(campaign.paused);
  const [busy, setBusy] = useState(false), [error, setError] = useState(null), [message, setMessage] = useState(''), [report, setReport] = useState(null);
  const lock = useRef(false), confirm = useConfirm(), navigate = useNavigate();
  const selected = inboxes.filter(i => form.inbox_ids.includes(i.id));
  const dirty = JSON.stringify(form) !== baseline;
  useEffect(() => {
    setPaused(campaign.paused);
    if (!dirty) { const fresh = campaignSettingsForm(campaign); setForm(fresh); setBaseline(JSON.stringify(fresh)); }
    // Background refresh may update pristine fields, but must not discard edits.
  }, [campaign]);
  const zones = useMemo(() => [...new Set([form.timezone, 'UTC', ...(Intl.supportedValuesOf?.('timeZone') || [])])], [form.timezone]);
  const update = (key, value) => { setForm(f => ({ ...f, [key]: value, ...(key === 'send_all_as_text' && value ? { send_first_as_text: false } : {}) })); setReport(null); setMessage(''); };
  const validate = () => {
    if (!form.name.trim()) throw new Error(ct("Nazwa kampanii jest wymagana."));
    if (!form.sending_days.length || !form.sending_hours_start || !form.sending_hours_end || form.sending_hours_start >= form.sending_hours_end) throw new Error(ct("Wybierz dni wysyłki i godzinę końca późniejszą niż początek."));
  };
  async function perform(action) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(null); setMessage('');
    try { await action(); } catch (e) { setError(e); } finally { lock.current = false; setBusy(false); }
  }
  async function persist() {
    validate(); setReport(null);
    const payload = { ...form, name: form.name.trim() };
    await api.patch(`/campaigns/${campaign.id}`, payload);
    setForm(payload); setBaseline(JSON.stringify(payload));
    // PATCH already schedules recalculation for calendar/inbox changes.
    await onSaved?.();
  }
  const save = e => { e.preventDefault(); perform(async () => { await persist(); setMessage('Ustawienia zapisane.'); }); };
  const check = () => perform(async () => { setReport(null); setReport(await api.get(`/campaigns/${campaign.id}/preflight`)); });
  const start = () => perform(async () => {
    await persist();
    const result = await api.get(`/campaigns/${campaign.id}/preflight`); setReport(result);
    if (!result.ready) throw new Error(ct("Kampania ma błędy blokujące start. Popraw wskazane problemy."));
    await api.post(`/campaigns/${campaign.id}/start`, {}); setPaused(false); setMessage('Kampania uruchomiona.'); await onSaved?.();
  });
  const pause = () => perform(async () => { await api.post(`/campaigns/${campaign.id}/pause`, {}); setPaused(true); setMessage('Kampania wstrzymana.'); await onSaved?.(); });
  const remove = async () => { if (await confirm({message:ct("Usunąć tę kampanię wraz ze wszystkimi jej danymi? Tej operacji nie można cofnąć."),danger:true})) perform(async () => { await api.del(`/campaigns/${campaign.id}`); navigate('/campaigns'); }); };
  return <div className="sk-campaign-settings">
    <ErrorNotice error={error}/>{message && <div role="status" className="sk-notice tone-green"><Icon name="check"/>{ct(message)}</div>}
    <form onSubmit={save} className="sk-campaign-settings-layout">
      <fieldset disabled={busy} className="sk-settings-card-grid">
        <Panel title={ct("Podstawowe informacje")} icon="campaign"><div className="sk-settings-card-body">
          <Field label={ct("Nazwa kampanii")} help={ct("Nazwa widoczna na liście kampanii.")}><input aria-label={ct("Nazwa kampanii")} required maxLength={120} value={form.name} onChange={e => update('name', e.target.value)}/></Field>
          <Field label={ct("Sekwencja spersonalizowana")}><select value={form.custom_sequence_mode} onChange={e => update('custom_sequence_mode', e.target.value)}><option value="wait_for_all">{ct("Czekaj na wszystkie wiadomości")}</option><option value="asap">{ct("Wysyłaj po przygotowaniu wiadomości")}</option></select></Field>
        </div></Panel>
        <Panel title={ct("Skrzynki nadawcze")} icon="mail" action={<Button to="/inboxes" className="compact">{ct("Zarządzaj skrzynkami")}</Button>}><div className="sk-settings-card-body">
          {inboxes.length ? inboxes.map(i => <label key={i.id} className="sk-settings-mailbox"><input type="checkbox" checked={form.inbox_ids.includes(i.id)} onChange={e => update('inbox_ids', e.target.checked ? [...form.inbox_ids, i.id] : form.inbox_ids.filter(id => id !== i.id))}/><span><strong>{i.email}</strong><small>{i.display_name || 'SMTP / IMAP'}</small></span><Badge tone={i.paused ? 'amber' : 'green'}>{i.paused ? ct("Wstrzymana") : ct("Aktywna")}</Badge></label>) : <p className="sk-muted">{ct("Brak skonfigurowanych skrzynek.")}</p>}
        </div></Panel>
        <Panel title={ct("Harmonogram wysyłki")} icon="calendar"><div className="sk-settings-card-body">
          <Field label={ct("Strefa czasowa")}><select value={form.timezone} onChange={e => update('timezone', e.target.value)}>{zones.map(t => <option key={t}>{t}</option>)}</select></Field>
          <div className="sk-builder-two-col"><Field label={ct("Początek okna")}><input type="time" required value={form.sending_hours_start} onChange={e => update('sending_hours_start', e.target.value)}/></Field><Field label={ct("Koniec okna")}><input type="time" required value={form.sending_hours_end} onChange={e => update('sending_hours_end', e.target.value)}/></Field></div>
          <div className="sk-builder-days" role="group" aria-label={ct("Dni wysyłki")}>{days.map((day, index) => <label key={day} className={form.sending_days.includes(index) ? 'is-selected' : ''}><input type="checkbox" checked={form.sending_days.includes(index)} onChange={e => update('sending_days', e.target.checked ? [...form.sending_days,index].sort() : form.sending_days.filter(d => d !== index))}/><span>{day}</span></label>)}</div>
        </div></Panel>
        <Panel title={ct("Tożsamość nadawcy")} icon="contacts"><div className="sk-settings-card-body">
          <p className="sk-muted sk-small">{ct("Dane pochodzą z wybranych skrzynek. Edycja skrzynki zmienia je także w innych kampaniach.")}</p>
          {selected.length ? selected.map(i => <div key={i.id} className="sk-sender-identity"><strong>{i.display_name || ct("Brak nazwy nadawcy")}</strong><span>{i.email}</span><small>{ct("Reply-To:")} {i.reply_to || i.email}</small><Button to={`/inboxes?inbox=${i.id}`} className="compact" icon="edit">{ct("Edytuj nadawcę")}</Button></div>) : <p className="sk-muted">{ct("Wybierz skrzynkę nadawczą.")}</p>}
        </div></Panel>
        <Panel title={ct("Limity i odstępy")} icon="clock"><div className="sk-settings-card-body">
          <p className="sk-muted sk-small">{ct("Limity są wspólne dla kampanii korzystających z danej skrzynki.")}</p>
          {selected.length ? selected.map(i => <div key={i.id} className="sk-settings-inbox-limits"><strong>{i.email}</strong><dl>
            <div><dt>{ct("Dziennie")}</dt><dd>{i.effective_max_per_day || i.max_emails_per_day}</dd></div><div><dt>{ct("Na godzinę")}</dt><dd>{i.max_emails_per_hour || ct("Bez limitu")}</dd></div><div><dt>{ct("Odstęp")}</dt><dd>{i.wait_minutes_between} {ct("min")}</dd></div><div><dt>{ct("Losowe opóźnienie")}</dt><dd>0–{i.max_jitter_seconds ?? 0} {ct("s")}</dd></div>
          </dl><Button to={`/inboxes?inbox=${i.id}`} className="compact">{ct("Zmień limity skrzynki")}</Button></div>) : <p className="sk-muted">{ct("Limity pojawią się po wyborze skrzynki.")}</p>}
        </div></Panel>
        <Panel title={ct("Zasady zatrzymywania")} icon="shield"><div className="sk-settings-card-body">
          <Switch label={ct("Zatrzymaj po odpowiedzi")} description={ct("Kontakt nie otrzyma kolejnych kroków po wykryciu odpowiedzi.")} checked={form.stop_on_reply} onChange={v => update('stop_on_reply',v)} disabled={busy}/>
          <p className="sk-muted sk-small">{ct("Wykluczenia, wypisania i status kontaktu są sprawdzane niezależnie od tej opcji.")}</p>
          <Switch label={ct("Nagłówek List-Unsubscribe")} checked={form.add_unsubscribe_header} onChange={v => update('add_unsubscribe_header',v)} disabled={busy}/>
        </div></Panel>
        <Panel title={ct("Śledzenie i dane")} icon="chart"><div className="sk-settings-card-body">
          <Switch label={ct("Śledź otwarcia")} checked={form.track_opens} onChange={v => update('track_opens',v)} disabled={busy}/><Switch label={ct("Śledź kliknięcia")} checked={form.track_clicks} onChange={v => update('track_clicks',v)} disabled={busy}/>
          <p className="sk-muted sk-small">{ct("Śledzenie wymaga HTML. Wymuszenie czystego tekstu wyłącza je dla danej wiadomości.")}</p>
        </div></Panel>
        <Panel title={ct("Format wiadomości")} icon="template"><div className="sk-settings-card-body">
          <Switch label={ct("Pierwsza wiadomość jako tekst")} checked={form.send_first_as_text} disabled={busy || form.send_all_as_text} onChange={v => update('send_first_as_text',v)}/><Switch label={ct("Wszystkie wiadomości jako tekst")} checked={form.send_all_as_text} disabled={busy} onChange={v => update('send_all_as_text',v)}/>
        </div></Panel>
      </fieldset>
      <aside className="sk-settings-readiness">
        <Panel title={ct("Gotowość kampanii")} icon="shield"><div className="sk-settings-card-body">
          <Badge tone={paused ? 'amber' : 'green'}>{paused ? ct("Wstrzymana") : ct("Aktywna")}</Badge>
          <dl className="sk-settings-summary"><div><dt>{ct("Skrzynki")}</dt><dd>{selected.length}</dd></div><div><dt>{ct("Okno wysyłki")}</dt><dd>{form.sending_hours_start}–{form.sending_hours_end}</dd></div><div><dt>{ct("Dni")}</dt><dd>{form.sending_days.map(i => days[i]).join(', ') || ct("Brak")}</dd></div></dl>
          {dirty && <p className="sk-notice tone-amber">{ct("Masz niezapisane zmiany.")}</p>}
          <Button onClick={check} disabled={busy || dirty}>{ct("Sprawdź zapisane ustawienia")}</Button>
          {!report ? <p className="sk-muted sk-small">{ct("Brak aktualnego wyniku pre-flight.")}</p> : <><Badge tone={report.ready ? 'green' : 'red'}>{report.ready ? ct("Gotowa do startu") : ct("Wymaga poprawek")}</Badge>{(report.issues || []).map((issue,index) => <p key={index} className={`sk-notice tone-${issue.severity === 'error' ? 'red' : 'amber'}`}>{issue.message}</p>)}</>}
          <Button onClick={paused ? start : pause} disabled={busy} icon={paused ? 'play' : 'pause'}>{paused ? ct("Zapisz i sprawdź przed startem") : ct("Wstrzymaj kampanię")}</Button>
          <Button to="#queue" className="compact">{ct("Kolejka i niepewne wysyłki")}</Button>
        </div></Panel>
        <div className="sk-settings-save"><Button type="submit" variant="primary" disabled={busy}>{busy ? ct("Zapisywanie…") : ct("Zapisz zmiany")}</Button></div>
      </aside>
    </form>
    <details className="sk-settings-danger"><summary>{ct("Usuwanie kampanii")}</summary><p>{ct("Usunięcie kampanii i jej danych jest nieodwracalne.")}</p><Button variant="danger" onClick={remove} disabled={busy}>{ct("Usuń kampanię")}</Button></details>
  </div>;
}
