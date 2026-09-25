import { useState } from 'react';
import { Badge, Button, Empty, Panel } from './ui';
import SafeEmail from './SafeEmail';
import { formatDateTimeKey } from '../utils/datetime';

export default function ScheduleMessagePreview({ item, items, onSelect, busy }) {
  const [query, setQuery] = useState('');
  const key = row => `${row.type}-${row.slot_id ?? row.log_id}`;
  const zone = item.campaign_timezone || 'UTC';
  const body = item.sequence_body || '';
  const isHtml = item.sequence_is_html || body.trim().startsWith('<');
  const matching = items.filter(row => `${row.lead_name} ${row.lead_email} ${row.subject}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <div className="sk-schedule-preview-workspace" aria-busy={busy}>
    <Panel title="Kolejka wiadomości" action={<Badge>{matching.length}</Badge>} className="sk-schedule-preview-queue">
      <div className="sk-schedule-preview-search"><input type="search" aria-label="Szukaj wiadomości do podglądu" placeholder="Szukaj po kontakcie lub temacie…" value={query} onChange={e => setQuery(e.target.value)} /></div>
      <div className="sk-schedule-preview-items">{matching.length ? matching.map(row => <button type="button" key={key(row)} aria-pressed={key(row) === key(item)} disabled={busy} onClick={() => onSelect(row)}>
        <strong>{row.lead_name || row.lead_email}</strong>
        <small>{row.campaign_name} · krok {(row.sequence_index ?? 0) + 1}</small>
        <time>{formatDateTimeKey(row.sent_at || row.scheduled_at, zone)}</time>
      </button>) : <Empty>Brak pasujących wiadomości.</Empty>}</div>
    </Panel>
    <Panel title="Podgląd wiadomości" className="sk-schedule-preview-message" action={<Badge tone={item.type === 'sent' ? 'blue' : 'green'}>{item.type === 'sent' ? 'Wysłana' : 'Zaplanowana'}</Badge>}>
      <div className="sk-schedule-preview-envelope"><p>Od: {item.inbox_display_name} {item.inbox_email}</p><p>Do: {item.lead_name} {item.lead_email}</p><h2>Temat: {item.subject === '(reply in thread)' ? 'Odpowiedź w wątku' : item.subject || '(bez tematu)'}</h2></div>
      <div className="sk-schedule-message-body">{body ? isHtml ? <SafeEmail html={body} /> : <pre>{body}</pre> : <Empty>Brak treści wiadomości.</Empty>}</div>
      {item.lead_id && <div className="sk-schedule-preview-footer"><Button to={`/leads/${item.lead_id}`} icon="contacts">Otwórz kontakt</Button></div>}
    </Panel>
    <aside className="sk-schedule-preview-details"><Panel title="Szczegóły wysyłki"><dl>
      <div><dt>Kampania</dt><dd>{item.campaign_name}</dd></div>
      <div><dt>Krok</dt><dd>{(item.sequence_index ?? 0) + 1}</dd></div>
      <div><dt>{item.type === 'sent' ? 'Wysłano' : 'Planowana wysyłka'}</dt><dd>{formatDateTimeKey(item.sent_at || item.scheduled_at, zone)}</dd></div>
      <div><dt>Strefa</dt><dd>{zone}</dd></div>
      <div><dt>Skrzynka</dt><dd>{item.inbox_email}</dd></div>
      <div><dt>Limit dzienny</dt><dd>{item.inbox_max_per_day ?? '—'}</dd></div>
      <div><dt>Odstęp</dt><dd>{item.campaign_wait_minutes == null ? '—' : `${item.campaign_wait_minutes} min`}</dd></div>
    </dl></Panel>
    <Panel title="Powiązane widoki"><div className="sk-schedule-related-links">
      {item.campaign_id && <Button to={`/campaigns/${item.campaign_id}#overview`} icon="campaign">Harmonogram kampanii</Button>}
      {item.inbox_id && <Button to={`/inboxes?inbox=${item.inbox_id}`} icon="mail">Ustawienia skrzynki</Button>}
    </div></Panel>
    {item.type === 'scheduled' && <p className="sk-notice tone-blue">Wysyłka podlega limitom, oknom czasowym i kontroli wykluczeń przed wysłaniem.</p>}
    </aside>
  </div>;
}
