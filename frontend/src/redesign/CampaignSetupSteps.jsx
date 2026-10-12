import {useUiLanguage} from '../context/LanguageContext';
import { Link } from 'react-router-dom';
export const campaignSetupSteps = [
  ['settings', 'Podstawy', 'Informacje o kampanii'],
  ['leads', 'Kontakty', 'Wybór odbiorców'],
  ['sequences', 'Sekwencja', 'Treść i kroki'],
  ['inboxes', 'Skrzynki', 'Wybór nadawców'],
  ['schedule', 'Harmonogram', 'Ustawienia wysyłki'],
  ['overview', 'Podsumowanie', 'Sprawdź i uruchom'],
];
export function getCampaignSetupSteps(tr) {
  const keys=[['stepBasics','stepBasicsHelp'],['contacts','stepContactsHelp'],['sequence','stepSequenceHelp'],['inboxes','stepInboxesHelp'],['schedule','stepScheduleHelp'],['summary','stepSummaryHelp']];
  return campaignSetupSteps.map(([id],i)=>[id,tr('outreach.'+keys[i][0]),tr('outreach.'+keys[i][1])]);
}
export default function CampaignSetupSteps({ current = 0, campaignId }) {
  const {t:tr}=useUiLanguage();
  return <nav aria-label={tr('outreach.setupSteps')} className="sk-setup-steps"><ol>
    {getCampaignSetupSteps(tr).map(([key, label, detail], index) => <li key={key}>
      {campaignId ? <Link to={`/campaigns/${campaignId}?setup=1#${key}`} aria-current={index === current ? 'step' : undefined}>
        <span className="sk-setup-number">{index + 1}</span><span><strong>{label}</strong><small>{detail}</small></span>
      </Link> : <span aria-current={index === current ? 'step' : undefined}><span className="sk-setup-number">{index + 1}</span><span><strong>{label}</strong><small>{detail}</small></span></span>}
    </li>)}
  </ol></nav>;
}
