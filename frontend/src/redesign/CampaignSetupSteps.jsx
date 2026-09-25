import { Link } from 'react-router-dom';
export const campaignSetupSteps = [
  ['settings', 'Podstawy', 'Informacje o kampanii'],
  ['leads', 'Kontakty', 'Wybór odbiorców'],
  ['sequences', 'Sekwencja', 'Treść i kroki'],
  ['inboxes', 'Skrzynki', 'Wybór nadawców'],
  ['schedule', 'Harmonogram', 'Ustawienia wysyłki'],
  ['overview', 'Podsumowanie', 'Sprawdź i uruchom'],
];
export default function CampaignSetupSteps({ current = 0, campaignId }) {
  return <nav aria-label="Etapy tworzenia kampanii" className="sk-setup-steps"><ol>
    {campaignSetupSteps.map(([key, label, detail], index) => <li key={key}>
      {campaignId ? <Link to={`/campaigns/${campaignId}?setup=1#${key}`} aria-current={index === current ? 'step' : undefined}>
        <span className="sk-setup-number">{index + 1}</span><span><strong>{label}</strong><small>{detail}</small></span>
      </Link> : <span aria-current={index === current ? 'step' : undefined}><span className="sk-setup-number">{index + 1}</span><span><strong>{label}</strong><small>{detail}</small></span></span>}
    </li>)}
  </ol></nav>;
}
