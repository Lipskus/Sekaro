import {useUiLanguage} from '../context/LanguageContext';
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { PageFrame, Panel, Button, Field, Badge, ErrorNotice } from '../redesign/ui';
import CampaignSetupSteps, { getCampaignSetupSteps } from '../redesign/CampaignSetupSteps';

export default function AddCampaign() {
 const {t:tr}=useUiLanguage();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const pending = useRef(false);
  const navigate = useNavigate();
  async function createDraft(event) {
    event.preventDefault();
    if (pending.current || !name.trim()) return;
    pending.current = true;
    setBusy(true); setError(null);
    try {
      const campaign = await api.post('/campaigns', {
        name: name.trim(), inbox_ids: [], paused: true,
        sending_days: [0, 1, 2, 3, 4], sending_hours_start: '09:00', sending_hours_end: '17:00',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        stop_on_reply: true, track_opens: false, track_clicks: false, add_unsubscribe_header: true,
      });
      navigate(`/campaigns/${campaign.id}?setup=1#leads`);
    } catch (err) { setError(err); }
    finally { pending.current = false; setBusy(false); }
  }
  return <PageFrame className="sk-campaign-builder" title={tr('outreach.newCampaign')} description={tr('outreach.builderDescription')}>
    <CampaignSetupSteps />
    <ErrorNotice error={error} />
    <form onSubmit={createDraft} className="sk-campaign-builder-grid">
      <Panel title={tr('outreach.basics')} icon="campaign" className="sk-builder-panel">
        <div className="sk-builder-panel-body">
          <Field label={tr('outreach.nameRequired')} help={tr('outreach.nameHelp')}>
            <input name="name" value={name} onChange={e => setName(e.target.value)} required maxLength={120} disabled={busy} placeholder={tr('outreach.namePlaceholder')} />
          </Field>
          <p className="sk-muted sk-small">{name.length}/120</p>
          <div className="sk-builder-inline-note"><Badge tone="amber" dot>{tr('outreach.pausedOnCreate')}</Badge></div>
          <p className="sk-muted">{tr('outreach.draftHelp')}</p>
        </div>
      </Panel>
      <aside className="sk-campaign-builder-summary">
        <Panel title={tr('outreach.campaignSummary')} icon="chart"><dl className="sk-builder-summary-list">
          <div><dt>{tr('outreach.name')}</dt><dd>{name.trim() || '—'}</dd></div>
          <div><dt>{tr('outreach.contacts')}</dt><dd>{tr('outreach.chooseLater')}</dd></div><div><dt>{tr('outreach.inboxes')}</dt><dd>{tr('outreach.chooseLater')}</dd></div><div><dt>{tr('outreach.sequence')}</dt><dd>{tr('outreach.prepareLater')}</dd></div>
        </dl></Panel>
        <Panel title={tr('outreach.checklist')} icon="check"><ol className="sk-setup-checklist">{getCampaignSetupSteps(tr).map(([, label, detail], index) => <li key={label}><span className="sk-setup-number">{index + 1}</span><span><strong>{label}</strong><small>{detail}</small></span><Badge tone={index === 0 ? 'green' : 'neutral'}>{index === 0 ? tr('outreach.inProgress') : tr('outreach.todo')}</Badge></li>)}</ol></Panel>
        <div className="sk-builder-submit"><Button to="/campaigns">{tr('outreach.cancel')}</Button><Button type="submit" variant="primary" icon="next" disabled={busy || !name.trim()}>{busy ? tr('outreach.saving') : tr('outreach.next')}</Button></div>
      </aside>
    </form>
  </PageFrame>;
}
