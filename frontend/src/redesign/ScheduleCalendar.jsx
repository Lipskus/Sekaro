import { useEffect, useMemo, useState } from 'react';
import './calendar.css';
import { Button, Badge, Icon, Panel, Switch, Empty } from './ui';
import { addDaysToDateKey, formatDateKey, formatTimeKey } from '../utils/datetime';

const messageCount = count => `${count} ${count === 1 ? 'wiadomość' : 'wiadomości'}`;

export function calendarDays(anchor, mode = 'week') {
  const date = new Date(`${anchor}T12:00:00Z`);
  const first = mode === 'month' ? `${anchor.slice(0, 7)}-01` : anchor;
  const weekday = new Date(`${first}T12:00:00Z`).getUTCDay();
  const start = addDaysToDateKey(first, -((weekday + 6) % 7));
  const count = mode === 'month' ? 42 : 7;
  if (Number.isNaN(+date)) return [];
  return Array.from({ length: count }, (_, i) => addDaysToDateKey(start, i));
}

export function groupCalendarItems(items, zone) {
  const groups = new Map();
  for (const item of items) {
    const timestamp = item.type === 'sent' ? item.sent_at : item.scheduled_at;
    const day = formatDateKey(timestamp, zone);
    if (day === 'unknown') continue;
    const hour = Number(formatTimeKey(timestamp, zone).slice(0, 2)) % 24;
    const key = `${day}|${Math.floor(hour / 2) * 2}|${item.campaign_id}|${item.type}`;
    if (!groups.has(key)) groups.set(key, { key, day, hour: Math.floor(hour / 2) * 2, name: item.campaign_name, type: item.type, items: [] });
    groups.get(key).items.push(item);
  }
  return [...groups.values()];
}

function dayLabel(day, options) {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString('pl-PL', { timeZone: 'UTC', ...options });
}

export default function ScheduleCalendar({ items, filters, onRangeChange, onPreview, onOpenQueue, busy }) {
  const [zone, setZone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
  const today = formatDateKey(new Date(), zone);
  const [anchor, setAnchor] = useState(today);
  const [mode, setMode] = useState('week');
  const [hideWeekend, setHideWeekend] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const days = useMemo(() => calendarDays(anchor, mode), [anchor, mode]);
  const visibleDays = hideWeekend ? days.filter((_, i) => i % 7 < 5) : days;
  const groups = useMemo(() => groupCalendarItems(items, zone), [items, zone]);
  const displayedGroups = groups.filter(g => visibleDays.includes(g.day));
  const hours = [...new Set([8, 10, 12, 14, 16, 18, ...displayedGroups.map(g => g.hour)])].sort((a, b) => a - b);
  const todayItems = items.filter(i => formatDateKey(i.sent_at || i.scheduled_at, zone) === today)
    .sort((a, b) => (a.sent_at || a.scheduled_at).localeCompare(b.sent_at || b.scheduled_at));
  const zones = [...new Set([zone, 'UTC', Intl.DateTimeFormat().resolvedOptions().timeZone, ...items.map(i => i.campaign_timezone)].filter(Boolean))];
  const chosen = selectedGroup && groups.find(g => g.key === selectedGroup);

  useEffect(() => { onRangeChange(days[0], days[days.length - 1]); }, [days, onRangeChange]);
  const move = direction => {
    if (mode === 'week') setAnchor(addDaysToDateKey(anchor, direction * 7));
    else {
      const d = new Date(`${anchor.slice(0, 7)}-01T12:00:00Z`);
      d.setUTCMonth(d.getUTCMonth() + direction);
      setAnchor(formatDateKey(d, 'UTC'));
    }
    setSelectedGroup(null);
  };
  const event = group => <button type="button" key={group.key} className={`sk-calendar-event ${group.type === 'sent' ? 'is-sent' : ''}`}
    onClick={() => setSelectedGroup(group.key)} aria-pressed={selectedGroup === group.key}
    aria-label={`${group.name}, ${group.day}, ${group.hour}:00, ${messageCount(group.items.length)}`}>
    <strong>{group.name || 'Kampania'}</strong><span>{messageCount(group.items.length)}</span>
  </button>;

  return <div className="sk-calendar-workspace" aria-busy={busy}>
    <Panel className="sk-calendar-panel">
      <div className="sk-calendar-controls">
        <div className="sk-calendar-navigation">
          <Button icon="prev" aria-label="Poprzedni okres" onClick={() => move(-1)} disabled={busy} />
          <Button onClick={() => setAnchor(today)}>Dzisiaj</Button>
          <Button icon="next" aria-label="Następny okres" onClick={() => move(1)} disabled={busy} />
          <h2>{mode === 'month' ? dayLabel(anchor, { month: 'long', year: 'numeric' }) : `${dayLabel(days[0], { day: 'numeric', month: 'short' })} – ${dayLabel(days[6], { day: 'numeric', month: 'short', year: 'numeric' })}`}</h2>
        </div>
        <div className="sk-calendar-view" role="group" aria-label="Zakres kalendarza">
          <button type="button" aria-pressed={mode === 'week'} onClick={() => setMode('week')}>Tydzień</button>
          <button type="button" aria-pressed={mode === 'month'} onClick={() => setMode('month')}>Miesiąc</button>
        </div>
      </div>
      <div className="sk-calendar-scroll" tabIndex={0} role="region" aria-label="Kalendarz wysyłki">
        {mode === 'week' ? <table className="sk-calendar-grid"><thead><tr><th scope="col">Godzina</th>{visibleDays.map(day => <th scope="col" key={day} data-today={day === today}><span>{dayLabel(day, { weekday: 'short', day: 'numeric' })}</span><small>{dayLabel(day, { month: 'short' })}</small></th>)}</tr></thead>
          <tbody>{hours.map(hour => <tr key={hour}><th scope="row">{String(hour).padStart(2, '0')}:00</th>{visibleDays.map(day => <td key={day} data-today={day === today}>{displayedGroups.filter(g => g.day === day && g.hour === hour).map(event)}</td>)}</tr>)}</tbody>
        </table> : <div className="sk-calendar-month" style={{ '--calendar-columns': hideWeekend ? 5 : 7 }}>
          {visibleDays.slice(0, hideWeekend ? 5 : 7).map(day => <div className="sk-calendar-weekday" key={day}>{dayLabel(day, { weekday: 'short' })}</div>)}
          {visibleDays.map(day => <section key={day} className="sk-calendar-month-day" data-today={day === today} data-outside={day.slice(0, 7) !== anchor.slice(0, 7)} aria-label={dayLabel(day, { day: 'numeric', month: 'long' })}>
            <strong>{Number(day.slice(-2))}</strong>{displayedGroups.filter(g => g.day === day).map(event)}
          </section>)}
        </div>}
      </div>
      {!busy && !displayedGroups.length && <p className="sk-calendar-empty-note" role="status">Brak wiadomości w wyświetlanym okresie dla wybranych filtrów.</p>}
      <div className="sk-calendar-legend"><Badge tone="green">Zaplanowane</Badge><Badge tone="blue">Wysłane</Badge><span>Godziny w strefie {zone}. Bloki obejmują 2 godziny.</span></div>
    </Panel>
    <aside className="sk-calendar-sidebar">
      <Panel title="Filtry kolejki" icon="filter"><div className="sk-calendar-filter-fields">{filters}
        <label>Strefa czasowa<select value={zone} onChange={e => setZone(e.target.value)}>{zones.map(tz => <option key={tz}>{tz}</option>)}</select></label>
        <Switch label="Ukryj weekend" checked={hideWeekend} onChange={setHideWeekend} />
      </div></Panel>
      <Panel title={chosen ? chosen.name : 'Dzisiaj'} icon={chosen ? 'mail' : 'calendar'} action={chosen && <Button icon="close" aria-label="Zamknij listę bloku" onClick={() => setSelectedGroup(null)} />}>
        <div className="sk-calendar-agenda">
          <p className="sk-muted">{chosen ? dayLabel(chosen.day, { day: 'numeric', month: 'long' }) : dayLabel(today, { day: 'numeric', month: 'long' })} · {messageCount((chosen?.items || todayItems).length)}</p>
          {(chosen?.items || todayItems).length ? (chosen?.items || todayItems).map(item => <button type="button" key={`${item.type}-${item.slot_id ?? item.log_id}`} onClick={() => onPreview(item)}>
            <strong>{formatTimeKey(item.sent_at || item.scheduled_at, zone)} · {item.campaign_name}</strong>
            <span>{item.lead_email}</span><small>{item.subject || '(bez tematu)'}</small>
          </button>) : <Empty icon="calendar">Brak wiadomości.</Empty>}
          <Button onClick={onOpenQueue}>Otwórz pełną kolejkę</Button>
        </div>
      </Panel>
      <p className="sk-calendar-hint"><Icon name="info" size={17} /> Kolejka respektuje limity i okna wysyłki każdej kampanii.</p>
    </aside>
  </div>;
}
