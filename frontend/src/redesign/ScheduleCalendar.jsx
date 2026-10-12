import {useOperationsLanguage} from '../context/operationsLanguage';
import { useEffect, useMemo, useState } from 'react';
import './calendar.css';
import { Button, Badge, Icon, Panel, Switch, Empty } from './ui';
import { addDaysToDateKey, formatDateKey, formatTimeKey, parseApiDate } from '../utils/datetime';

const itemTime = item => +parseApiDate(item.type === 'sent' ? item.sent_at : item.scheduled_at);
export function calendarMessageCount(count,language='pl') {
  const category=new Intl.PluralRules(language).select(count);
  const words={pl:{one:'wiadomość',other:'wiadomości'},en:{one:'message',other:'messages'},de:{one:'Nachricht',other:'Nachrichten'},ru:{one:'сообщение',few:'сообщения',other:'сообщений'}};
  const forms=words[language]||words.en;
  return `${count.toLocaleString(language)} ${forms[category]||forms.other}`;
}

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
  return [...groups.values()].map(group => ({...group, items: group.items.sort((a, b) => itemTime(a) - itemTime(b))}));
}

function dayLabel(day, options, language='pl') {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString(language, { timeZone: 'UTC', ...options });
}

export default function ScheduleCalendar({ items, filters, onRangeChange, onPreview, onOpenQueue, busy }) {
  const {ct,language}=useOperationsLanguage();
  const displayDay=(day,options)=>dayLabel(day,options,language);
  const messageCount=count=>calendarMessageCount(count,language);
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
    .sort((a, b) => itemTime(a) - itemTime(b));
  const zones = [...new Set([zone, 'UTC', Intl.DateTimeFormat().resolvedOptions().timeZone, ...items.map(i => i.campaign_timezone)].filter(Boolean))];
  const chosen = selectedGroup && displayedGroups.find(g => g.key === selectedGroup);

  useEffect(() => { onRangeChange(days[0], days[days.length - 1]); }, [days, onRangeChange]);
  useEffect(() => { setSelectedGroup(null); }, [anchor, mode, zone, hideWeekend]);
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
    <strong>{group.name || ct("Kampania")}</strong><span>{messageCount(group.items.length)}</span>
  </button>;

  return <div className="sk-calendar-workspace" aria-busy={busy}>
    <Panel className="sk-calendar-panel">
      <div className="sk-calendar-controls">
        <div className="sk-calendar-navigation">
          <Button icon="prev" aria-label={ct("Poprzedni okres")} onClick={() => move(-1)} disabled={busy} />
          <Button onClick={() => { setAnchor(today); setSelectedGroup(null); }}>{ct("Dzisiaj")}</Button>
          <Button icon="next" aria-label={ct("Następny okres")} onClick={() => move(1)} disabled={busy} />
          <h2>{mode === 'month' ? displayDay(anchor, { month: 'long', year: 'numeric' }) : `${displayDay(days[0], { day: 'numeric', month: 'short' })} – ${displayDay(days[6], { day: 'numeric', month: 'short', year: 'numeric' })}`}</h2>
        </div>
        <div className="sk-calendar-view" role="group" aria-label={ct("Zakres kalendarza")}>
          <button type="button" aria-pressed={mode === 'week'} onClick={() => setMode('week')}>{ct("Tydzień")}</button>
          <button type="button" aria-pressed={mode === 'month'} onClick={() => setMode('month')}>{ct("Miesiąc")}</button>
        </div>
      </div>
      <div className="sk-calendar-scroll" tabIndex={0} role="region" aria-label={ct("Kalendarz wysyłki")}>
        {mode === 'week' ? <table className="sk-calendar-grid"><thead><tr><th scope="col">{ct("Godzina")}</th>{visibleDays.map(day => <th scope="col" key={day} data-today={day === today}><span>{displayDay(day, { weekday: 'short', day: 'numeric' })}</span><small>{displayDay(day, { month: 'short' })}</small></th>)}</tr></thead>
          <tbody>{hours.map(hour => <tr key={hour}><th scope="row">{String(hour).padStart(2, '0')}:00</th>{visibleDays.map(day => <td key={day} data-today={day === today}>{displayedGroups.filter(g => g.day === day && g.hour === hour).map(event)}</td>)}</tr>)}</tbody>
        </table> : <div className="sk-calendar-month" style={{ '--calendar-columns': hideWeekend ? 5 : 7 }}>
          {visibleDays.slice(0, hideWeekend ? 5 : 7).map(day => <div className="sk-calendar-weekday" key={day}>{displayDay(day, { weekday: 'short' })}</div>)}
          {visibleDays.map(day => <section key={day} className="sk-calendar-month-day" data-today={day === today} data-outside={day.slice(0, 7) !== anchor.slice(0, 7)} aria-label={displayDay(day, { day: 'numeric', month: 'long' })}>
            <strong>{Number(day.slice(-2))}</strong>{displayedGroups.filter(g => g.day === day).map(event)}
          </section>)}
        </div>}
      </div>
      {!busy && !displayedGroups.length && <p className="sk-calendar-empty-note" role="status">{ct("Brak wiadomości w wyświetlanym okresie dla wybranych filtrów.")}</p>}
      <div className="sk-calendar-legend"><Badge tone="green">{ct("Zaplanowane")}</Badge><Badge tone="blue">{ct("Wysłane")}</Badge><span>{ct("Godziny w strefie")} {zone}{ct(". Bloki obejmują 2 godziny.")}</span></div>
    </Panel>
    <aside className="sk-calendar-sidebar">
      <Panel title={ct("Filtry kolejki")} icon="filter"><div className="sk-calendar-filter-fields">{filters}
        <label>{ct("Strefa czasowa")}<select value={zone} onChange={e => setZone(e.target.value)}>{zones.map(tz => <option key={tz}>{tz}</option>)}</select></label>
        <Switch label={ct("Ukryj weekend")} checked={hideWeekend} onChange={setHideWeekend} />
      </div></Panel>
      <Panel title={chosen ? chosen.name : ct("Dzisiaj")} icon={chosen ? 'mail' : 'calendar'} action={chosen && <Button icon="close" aria-label={ct("Zamknij listę bloku")} onClick={() => setSelectedGroup(null)} />}>
        <div className="sk-calendar-agenda"><div className="sk-calendar-agenda-items">
          <p className="sk-muted">{chosen ? displayDay(chosen.day, { day: 'numeric', month: 'long' }) : displayDay(today, { day: 'numeric', month: 'long' })} · {messageCount((chosen?.items || todayItems).length)}</p>
          {(chosen?.items || todayItems).length ? (chosen?.items || todayItems).map(item => <button type="button" key={`${item.type}-${item.slot_id ?? item.log_id}`} onClick={() => onPreview(item)} disabled={busy}>
            <strong>{formatTimeKey(item.sent_at || item.scheduled_at, zone)} · {item.campaign_name}</strong>
            <span>{item.lead_email}</span><small>{item.subject || ct("(bez tematu)")}</small>
          </button>) : <Empty icon="calendar">{ct("Brak wiadomości.")}</Empty>}
          </div><Button onClick={onOpenQueue}>{ct("Otwórz pełną kolejkę")}</Button>
        </div>
      </Panel>
      <p className="sk-calendar-hint"><Icon name="info" size={17} /> {ct("Kolejka respektuje limity i okna wysyłki każdej kampanii.")}</p>
    </aside>
  </div>;
}
