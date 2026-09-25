import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, apiCache } from '../api';
import { PageFrame, Panel, Button, Field, Switch, Badge, Icon } from '../redesign/ui';

export default function AddCampaign() {
  const [inboxes, setInboxes] = useState(() => apiCache.get('/inboxes') || []);
  const [form, setForm] = useState({
    name: '',
    inbox_ids: [],
    sending_days: [0,1,2,3,4],
    sending_hours_start: '09:00',
    sending_hours_end: '17:00',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    stop_on_reply: true,
    paused: true,
    // Tracking (off by default)
    track_opens: false,
    track_clicks: false,
    // Unsubscribe
    add_unsubscribe_header: true,
    // sending format
    send_first_as_text: false,
    send_all_as_text: false,
    match_lead_provider: false,
  });
  const [message, setMessage] = useState(null);
  const [tzSearch, setTzSearch] = useState('');
  const navigate = useNavigate();

  const tzList = useMemo(() => {
    return Intl.supportedValuesOf('timeZone').map(tz => {
      let offsetLabel = '';
      try {
        const parts = new Intl.DateTimeFormat('en', { timeZone: tz, timeZoneName: 'shortOffset' }).formatToParts(new Date());
        const off = parts.find(p => p.type === 'timeZoneName');
        if (off) offsetLabel = ` (${off.value})`;
      } catch (_) {}
      return { value: tz, label: `${tz.replace(/_/g, ' ')}${offsetLabel}` };
    });
  }, []);

  const filteredTz = tzSearch
    ? tzList.filter(t => t.label.toLowerCase().includes(tzSearch.toLowerCase()))
    : tzList;

  useEffect(() => {
    api.get('/inboxes').then(setInboxes).catch(() => {
      setMessage({ type: 'error', text: 'Nie udało się wczytać skrzynek. Najpierw dodaj skrzynkę SMTP/IMAP.' });
    });
  }, []);

  function handleCheckboxChange(e) {
    const { name, value, checked } = e.target;
    if (name === 'inbox_id') {
      const id = parseInt(value, 10);
      setForm(f => {
        const ids = new Set(f.inbox_ids);
        if (checked) ids.add(id); else ids.delete(id);
        return { ...f, inbox_ids: Array.from(ids) };
      });
    } else if (name === 'day') {
      const day = parseInt(value, 10);
      setForm(f => {
        const days = new Set(f.sending_days);
        if (checked) days.add(day); else days.delete(day);
        return { ...f, sending_days: Array.from(days).sort() };
      });
    }
  }

  function handleChange(e) {
    const { name, value, type, checked } = e.target;
    setForm(f => ({ ...f, [name]: type === 'checkbox' ? checked : value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      const data = await api.post('/campaigns', form);
      setMessage({ type: 'success', text: 'Kampania została utworzona jako wstrzymana. Uruchom ją po przejściu pre-flight.' });
      navigate(`/campaigns/${data.id}#analytics`);
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    }
  }

  const selectedInboxes = inboxes.filter(inbox => form.inbox_ids.includes(inbox.id));
  const dayLabels = ['Pon','Wt','Śr','Czw','Pt','Sob','Nie'];

  return (
    <PageFrame
      className="sk-campaign-builder"
      title="Nowa kampania"
      description="Skonfiguruj podstawowe zasady wysyłki. Kampania zostanie utworzona jako wstrzymana i wymaga pre-flight przed startem."
      actions={
        <Button variant="outline" to="/campaigns" icon="back">Wróć do kampanii</Button>
      }
    >
      {message && (
        <div className={`sk-notice ${message.type === 'error' ? 'tone-red' : 'tone-green'}`} role={message.type === 'error' ? 'alert' : 'status'}>
          <Icon name={message.type === 'error' ? 'warning' : 'success'} />
          <span>{message.text}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="sk-campaign-builder-grid">
        <div className="sk-campaign-builder-main">
          <Panel title="Podstawowe informacje" icon="campaign" className="sk-builder-panel">
            <div className="sk-builder-panel-body">
              <Field
                label="Nazwa kampanii *"
                help="Wybierz krótką nazwę, po której łatwo rozpoznasz kampanię."
              >
                <input
                  name="name"
                  value={form.name}
                  onChange={handleChange}
                  required
                  maxLength={120}
                  placeholder="np. Q4 — pozyskiwanie agencji marketingowych"
                />
              </Field>
              <div className="sk-builder-inline-note">
                <Badge tone="amber" dot>Wstrzymana po utworzeniu</Badge>
                <span>Uruchomienie będzie możliwe po pozytywnym pre-flight.</span>
              </div>
            </div>
          </Panel>

          <Panel title="Skrzynki nadawcze" icon="mail" className="sk-builder-panel">
            <div className="sk-builder-panel-body">
              {inboxes.length === 0 ? (
                <div className="sk-builder-empty">
                  <Icon name="warning" size={24} />
                  <div>
                    <strong>Brak skonfigurowanych skrzynek SMTP/IMAP</strong>
                    <span>Dodaj skrzynkę, zanim zaczniesz wysyłać wiadomości.</span>
                  </div>
                  <Button variant="outline" to="/inboxes">Skonfiguruj skrzynki</Button>
                </div>
              ) : (
                <div className="sk-builder-mailbox-list">
                  {inboxes.map(inbox => {
                    const checked = form.inbox_ids.includes(inbox.id);
                    return (
                      <label key={inbox.id} className={`sk-builder-mailbox ${checked ? 'is-selected' : ''}`}>
                        <input
                          type="checkbox"
                          name="inbox_id"
                          value={inbox.id}
                          checked={checked}
                          onChange={handleCheckboxChange}
                        />
                        <span className="sk-builder-mailbox-icon"><Icon name="mail" size={18}/></span>
                        <span className="sk-builder-mailbox-copy">
                          <strong>{inbox.email}</strong>
                          <small>
                            {inbox.display_name || 'SMTP / IMAP'} · maks. {inbox.max_emails_per_day}/dzień
                            {inbox.max_emails_per_hour > 0 ? ` · ${inbox.max_emails_per_hour}/godz.` : ''}
                          </small>
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          </Panel>

          <Panel title="Harmonogram wysyłki" icon="calendar" className="sk-builder-panel">
            <div className="sk-builder-panel-body">
              <div>
                <span className="sk-field-label">Dni wysyłki</span>
                <div className="sk-builder-days" role="group" aria-label="Dni wysyłki">
                  {[0,1,2,3,4,5,6].map(day => {
                    const checked=form.sending_days.includes(day);
                    return (
                      <label key={day} className={checked ? 'is-selected' : ''}>
                        <input
                          type="checkbox"
                          name="day"
                          value={day}
                          checked={checked}
                          onChange={handleCheckboxChange}
                        />
                        <span>{dayLabels[day]}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="sk-builder-two-col">
                <Field label="Godzina rozpoczęcia">
                  <input
                    type="time"
                    name="sending_hours_start"
                    value={form.sending_hours_start}
                    onChange={handleChange}
                  />
                </Field>
                <Field label="Godzina zakończenia">
                  <input
                    type="time"
                    name="sending_hours_end"
                    value={form.sending_hours_end}
                    onChange={handleChange}
                  />
                </Field>
              </div>

              <div className="sk-field">
                <span className="sk-field-label">Strefa czasowa</span>
                <div className="sk-builder-timezone">
                  <input
                    type="text"
                    aria-label="Strefa czasowa"
                    placeholder="Szukaj strefy czasowej…"
                    value={tzSearch || form.timezone}
                    onFocus={e => { setTzSearch(''); e.target.select(); }}
                    onChange={e => setTzSearch(e.target.value)}
                    onBlur={() => setTimeout(() => setTzSearch(''), 200)}
                  />
                  {tzSearch !== '' && (
                    <ul className="sk-builder-timezone-menu">
                      {filteredTz.slice(0, 100).map(t => (
                        <li key={t.value}>
                          <button
                            type="button"
                            className={form.timezone === t.value ? 'is-selected' : ''}
                            onMouseDown={e => {
                              e.preventDefault();
                              setForm(prev => ({ ...prev, timezone: t.value }));
                              setTzSearch('');
                            }}
                          >
                            {t.label}
                          </button>
                        </li>
                      ))}
                      {filteredTz.length === 0 && <li className="sk-muted sk-small">Brak dopasowania</li>}
                    </ul>
                  )}
                </div>
                <span className="sk-field-help">Okno wysyłki jest interpretowane w wybranej strefie czasowej.</span>
              </div>
            </div>
          </Panel>

          <Panel title="Zasady i śledzenie" icon="shield" className="sk-builder-panel">
            <div className="sk-builder-panel-body">
              <Switch
                checked={form.stop_on_reply}
                onChange={value => setForm(prev => ({ ...prev, stop_on_reply: value }))}
                label="Zatrzymaj sekwencję po odpowiedzi"
                description="Kontakt nie otrzyma kolejnych kroków po wykryciu odpowiedzi."
              />
              <div className="sk-settings-divider"/>
              <Switch
                checked={form.track_opens}
                onChange={value => setForm(prev => ({ ...prev, track_opens: value }))}
                label="Śledź otwarcia wiadomości"
                description="Rejestruj otwarcia wiadomości kampanii."
              />
              <Switch
                checked={form.track_clicks}
                onChange={value => setForm(prev => ({ ...prev, track_clicks: value }))}
                label="Śledź kliknięcia linków"
                description="Rejestruj kliknięcia w linki znajdujące się w wiadomościach."
              />
              <Switch
                checked={form.add_unsubscribe_header}
                onChange={value => setForm(prev => ({ ...prev, add_unsubscribe_header: value }))}
                label="Dodaj nagłówek List-Unsubscribe"
                description="Zalecane dla bezpiecznej i zgodnej wysyłki."
              />
              <div className="sk-settings-divider"/>
              <Switch
                checked={form.send_first_as_text}
                disabled={form.send_all_as_text}
                onChange={value => setForm(prev => ({ ...prev, send_first_as_text: value }))}
                label="Pierwszą wiadomość wyślij jako zwykły tekst"
                description="Dotyczy tylko pierwszego kroku sekwencji."
              />
              <Switch
                checked={form.send_all_as_text}
                onChange={value => setForm(prev => ({
                  ...prev,
                  send_all_as_text: value,
                  send_first_as_text: value ? false : prev.send_first_as_text,
                }))}
                label="Wszystkie wiadomości wysyłaj jako zwykły tekst"
                description="Wyłącza formatowanie HTML dla całej kampanii."
              />
            </div>
          </Panel>
        </div>

        <aside className="sk-campaign-builder-summary">
          <Panel title="Podsumowanie kampanii" icon="chart" className="sk-builder-summary-panel">
            <dl className="sk-builder-summary-list">
              <div><dt>Nazwa</dt><dd>{form.name || '—'}</dd></div>
              <div><dt>Skrzynki</dt><dd>{selectedInboxes.length}</dd></div>
              <div><dt>Dni wysyłki</dt><dd>{form.sending_days.length ? form.sending_days.map(day => dayLabels[day]).join(', ') : 'Brak'}</dd></div>
              <div><dt>Okno wysyłki</dt><dd>{form.sending_hours_start}–{form.sending_hours_end}</dd></div>
              <div><dt>Strefa</dt><dd>{form.timezone}</dd></div>
              <div><dt>Zatrzymaj po odpowiedzi</dt><dd>{form.stop_on_reply ? 'Tak' : 'Nie'}</dd></div>
              <div><dt>Śledzenie</dt><dd>{form.track_opens || form.track_clicks ? 'Włączony' : 'Wyłączony'}</dd></div>
            </dl>
          </Panel>

          <Panel title="Lista kontrolna" icon="check" className="sk-builder-summary-panel">
            <div className="sk-builder-checklist">
              <div className={form.name.trim() ? 'is-ok' : ''}><Icon name={form.name.trim() ? 'check' : 'clock'} size={17}/><span>Nazwa kampanii</span></div>
              <div className={selectedInboxes.length ? 'is-ok' : ''}><Icon name={selectedInboxes.length ? 'check' : 'clock'} size={17}/><span>Skrzynka nadawcza</span></div>
              <div className={form.sending_days.length ? 'is-ok' : ''}><Icon name={form.sending_days.length ? 'check' : 'clock'} size={17}/><span>Dni wysyłki</span></div>
              <div className="is-ok"><Icon name="check" size={17}/><span>Bezpieczny start: wstrzymana</span></div>
            </div>
          </Panel>

          <div className="sk-builder-submit">
            <Button type="button" variant="outline" to="/campaigns">Anuluj</Button>
            <Button type="submit" variant="primary" icon="plus" disabled={!form.name.trim()}>
              Utwórz kampanię
            </Button>
          </div>
        </aside>
      </form>
    </PageFrame>
  );
}
