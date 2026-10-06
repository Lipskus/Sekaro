import {useCampaignLanguage, campaignWeekdays} from '../context/campaignLanguage';
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
 const {ct,language}=useCampaignLanguage();
  const issues = report?.issues || [];
  const known = new Set(preflightGroups.flatMap(group => group[2]));
  const groups = preflightGroups.map(([icon,label,codes,target])=>[icon,ct(label),codes,target]);
  if (issues.some(issue => !known.has(issue.code))) groups.push(['warning', ct("Pozostałe kontrole"), issues.filter(issue => !known.has(issue.code)).map(issue => issue.code), 'settings']);
  const warningCount = issues.filter(issue => issue.severity !== 'error').length;
  const days = campaignWeekdays(language);
  return <div className="sk-preflight-workspace">
    <Panel title={ct("Pre-flight kampanii")} icon="shield" action={<Button onClick={onCheck} disabled={busy} icon="refresh">{ct("Sprawdź ponownie")}</Button>}>
      <div className="sk-preflight-checks">{groups.map(([icon, label, codes, target]) => {
        const found = issues.filter(issue => codes.includes(issue.code));
        const tone = !report ? 'neutral' : found.some(issue => issue.severity === 'error') ? 'red' : found.length ? 'amber' : 'green';
        return <section key={label} className={`sk-preflight-check tone-${tone}`} aria-label={label}>
          <Icon name={!report ? 'clock' : found.length ? 'warning' : 'check'} />
          <div><strong>{label}</strong>{!report ? <p>{ct("Brak aktualnego wyniku kontroli.")}</p> : found.length ? <ul>{found.map((issue, i) => <li key={i}>{issue.message}</li>)}</ul> : <p>{ct("Brak zgłoszonych problemów.")}</p>}
            {found.length > 0 && <Button to={`?setup=1#${target}`} variant="ghost" className="compact">{ct("Przejdź i popraw")}</Button>}
          </div><Badge tone={tone}>{!report ? ct("Oczekuje") : tone === 'red' ? ct("Błąd") : found.length ? ct("Uwaga") : 'OK'}</Badge>
        </section>;
      })}</div>
    </Panel>
    <aside className="sk-preflight-summary">
      <Panel title={ct("Podsumowanie kampanii")} icon="chart"><dl className="sk-builder-summary-list">
        <div><dt>{ct("Nazwa")}</dt><dd>{campaign.name}</dd></div>
        <div><dt>{ct("Kontakty gotowe")}</dt><dd>{report?.summary?.sendable_contacts ?? '—'}</dd></div>
        <div><dt>{ct("Skrzynki")}</dt><dd>{inboxes.length} {ct("· aktywne:")} {inboxes.filter(i => !i.paused).length}</dd></div>
        <div><dt>{ct("Sekwencja")}</dt><dd>{sequences.length} {ct("kroków")}</dd></div>
        <div><dt>{ct("Dni wysyłki")}</dt><dd>{(campaign.sending_days || []).map(d => days[d]).join(', ') || ct("Brak")}</dd></div>
        <div><dt>{ct("Okno wysyłki")}</dt><dd>{campaign.sending_hours_start}–{campaign.sending_hours_end}<small>{campaign.timezone || 'UTC'}</small></dd></div>
      </dl></Panel>
      <Panel title={report?.ready ? ct("Kampania gotowa do startu") : report ? ct("Kampania wymaga poprawek") : ct("Sprawdź gotowość")} icon={report?.ready ? 'check' : 'warning'}>
        <div className="sk-builder-panel-body"><p>{!report ? ct("Poczekaj na aktualne wyniki kontroli przed uruchomieniem.") : !report.ready ? ct("Popraw błędy blokujące wysyłkę, a następnie sprawdź kampanię ponownie.") : warningCount ? ct('Ostrzeżenia do sprawdzenia: {count}. Przeczytaj je przed uruchomieniem.',{count:warningCount}) : ct("Nie wykryto błędów blokujących wysyłkę.")}</p>
          <Button variant="primary" icon="play" disabled={busy || !report?.ready || !campaign.paused} onClick={onStart}>{busy ? ct("Sprawdzanie…") : campaign.paused ? ct("Uruchom kampanię") : ct("Kampania uruchomiona")}</Button>
        </div>
      </Panel>
    </aside>
  </div>;
}
