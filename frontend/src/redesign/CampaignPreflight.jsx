import { Badge, Button, Icon, Panel } from './ui';

export const preflightGroups = [
  ['mail', 'Skrzynki SMTP', ['no_inboxes', 'inbox_paused', 'smtp_missing', 'smtp_not_verified', 'legacy_provider'], 'inboxes'],
  ['stack', 'Sekwencja wiadomości', ['no_sequences', 'first_subject_missing', 'empty_sequence_body'], 'sequences'],
  ['contacts', 'Kontakty', ['no_contacts', 'no_sendable_contacts', 'custom_emails_pending'], 'leads'],
  ['template', 'Zmienne w szablonach', ['missing_variable_values'], 'leads'],
  ['calendar', 'Harmonogram', ['no_sending_days', 'invalid_sending_days', 'invalid_sending_window', 'invalid_timezone'], 'schedule'],
  ['clock', 'Limity wysyłki', ['daily_limit_invalid', 'hourly_above_daily', 'hourly_spacing_applied'], 'inboxes'],
  ['shield', 'Bezpieczeństwo kolejki', ['uncertain_send_attempts'], 'settings'],
];
export default function CampaignPreflight({ campaign, inboxes, sequences, report, busy, onCheck, onStart }) {
  const issues = report?.issues || [];
  const known = new Set(preflightGroups.flatMap(group => group[2]));
  const groups = [...preflightGroups];
  if (issues.some(issue => !known.has(issue.code))) groups.push(['warning', 'Pozostałe kontrole', issues.filter(issue => !known.has(issue.code)).map(issue => issue.code), 'settings']);
  const warningCount = issues.filter(issue => issue.severity !== 'error').length;
  const days = ['Pon', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob', 'Nie'];
  return <div className="sk-preflight-workspace">
    <Panel title="Pre-flight kampanii" icon="shield" action={<Button onClick={onCheck} disabled={busy} icon="refresh">Sprawdź ponownie</Button>}>
      <div className="sk-preflight-checks">{groups.map(([icon, label, codes, target]) => {
        const found = issues.filter(issue => codes.includes(issue.code));
        const tone = !report ? 'neutral' : found.some(issue => issue.severity === 'error') ? 'red' : found.length ? 'amber' : 'green';
        return <section key={label} className={`sk-preflight-check tone-${tone}`} aria-label={label}>
          <Icon name={!report ? 'clock' : found.length ? 'warning' : 'check'} />
          <div><strong>{label}</strong>{!report ? <p>Brak aktualnego wyniku kontroli.</p> : found.length ? <ul>{found.map((issue, i) => <li key={i}>{issue.message}</li>)}</ul> : <p>Brak zgłoszonych problemów.</p>}
            {found.length > 0 && <Button to={`?setup=1#${target}`} variant="ghost" className="compact">Przejdź i popraw</Button>}
          </div><Badge tone={tone}>{!report ? 'Oczekuje' : tone === 'red' ? 'Błąd' : found.length ? 'Uwaga' : 'OK'}</Badge>
        </section>;
      })}</div>
    </Panel>
    <aside className="sk-preflight-summary">
      <Panel title="Podsumowanie kampanii" icon="chart"><dl className="sk-builder-summary-list">
        <div><dt>Nazwa</dt><dd>{campaign.name}</dd></div>
        <div><dt>Kontakty gotowe</dt><dd>{report?.summary?.sendable_contacts ?? '—'}</dd></div>
        <div><dt>Skrzynki</dt><dd>{inboxes.length} · aktywne: {inboxes.filter(i => !i.paused).length}</dd></div>
        <div><dt>Sekwencja</dt><dd>{sequences.length} kroków</dd></div>
        <div><dt>Dni wysyłki</dt><dd>{(campaign.sending_days || []).map(d => days[d]).join(', ') || 'Brak'}</dd></div>
        <div><dt>Okno wysyłki</dt><dd>{campaign.sending_hours_start}–{campaign.sending_hours_end}<small>{campaign.timezone || 'UTC'}</small></dd></div>
      </dl></Panel>
      <Panel title={report?.ready ? 'Kampania gotowa do startu' : report ? 'Kampania wymaga poprawek' : 'Sprawdź gotowość'} icon={report?.ready ? 'check' : 'warning'}>
        <div className="sk-builder-panel-body"><p>{!report ? 'Poczekaj na aktualne wyniki kontroli przed uruchomieniem.' : !report.ready ? 'Popraw błędy blokujące wysyłkę, a następnie sprawdź kampanię ponownie.' : warningCount ? `Ostrzeżenia do sprawdzenia: ${warningCount}. Przeczytaj je przed uruchomieniem.` : 'Nie wykryto błędów blokujących wysyłkę.'}</p>
          <Button variant="primary" icon="play" disabled={busy || !report?.ready || !campaign.paused} onClick={onStart}>{busy ? 'Sprawdzanie…' : campaign.paused ? 'Uruchom kampanię' : 'Kampania uruchomiona'}</Button>
        </div>
      </Panel>
    </aside>
  </div>;
}
