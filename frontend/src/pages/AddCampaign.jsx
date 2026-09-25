import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { PageFrame, Panel, Button, Field, Badge, ErrorNotice } from '../redesign/ui';
import CampaignSetupSteps, { campaignSetupSteps } from '../redesign/CampaignSetupSteps';

export default function AddCampaign() {
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
  return <PageFrame className="sk-campaign-builder" title="Nowa kampania" description="Uzupełnij kolejne etapy, a następnie sprawdź kampanię przed uruchomieniem.">
    <CampaignSetupSteps />
    <ErrorNotice error={error} />
    <form onSubmit={createDraft} className="sk-campaign-builder-grid">
      <Panel title="Podstawowe informacje" icon="campaign" className="sk-builder-panel">
        <div className="sk-builder-panel-body">
          <Field label="Nazwa kampanii *" help="Wybierz krótką, opisową nazwę kampanii.">
            <input name="name" value={name} onChange={e => setName(e.target.value)} required maxLength={120} disabled={busy} placeholder="np. Q4 — pozyskiwanie agencji marketingowych" />
          </Field>
          <p className="sk-muted sk-small">{name.length}/120</p>
          <div className="sk-builder-inline-note"><Badge tone="amber" dot>Wstrzymana po utworzeniu</Badge></div>
          <p className="sk-muted">Przycisk „Dalej” zapisze kampanię. W kolejnych etapach dodasz kontakty, wiadomości, skrzynki i harmonogram. Wysyłkę uruchomisz osobno po sprawdzeniu podsumowania.</p>
        </div>
      </Panel>
      <aside className="sk-campaign-builder-summary">
        <Panel title="Podsumowanie kampanii" icon="chart"><dl className="sk-builder-summary-list">
          <div><dt>Nazwa</dt><dd>{name.trim() || '—'}</dd></div>
          <div><dt>Kontakty</dt><dd>Do wybrania</dd></div><div><dt>Skrzynki</dt><dd>Do wybrania</dd></div><div><dt>Sekwencja</dt><dd>Do przygotowania</dd></div>
        </dl></Panel>
        <Panel title="Lista kontrolna" icon="check"><ol className="sk-setup-checklist">{campaignSetupSteps.map(([, label, detail], index) => <li key={label}><span className="sk-setup-number">{index + 1}</span><span><strong>{label}</strong><small>{detail}</small></span><Badge tone={index === 0 ? 'green' : 'neutral'}>{index === 0 ? 'W trakcie' : 'Do zrobienia'}</Badge></li>)}</ol></Panel>
        <div className="sk-builder-submit"><Button to="/campaigns">Anuluj</Button><Button type="submit" variant="primary" icon="next" disabled={busy || !name.trim()}>{busy ? 'Zapisywanie…' : 'Dalej'}</Button></div>
      </aside>
    </form>
  </PageFrame>;
}
