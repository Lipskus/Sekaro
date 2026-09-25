import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { api, apiCache } from '../api';
import { PageFrame, Panel, Metric, Badge, Button, ErrorNotice, Empty, Icon } from '../redesign/ui';
import { useConfirm } from '../context/ConfirmContext';
import { useNotify } from '../context/NotificationContext';


function campaignView(c) {
  const stats = c.stats || {};
  const totalLeads = stats.total_leads || 0;
  const emailsSent = stats.emails_sent || 0;
  const scheduled = stats.scheduled || 0;
  const replies = stats.replies || 0;
  const bounced = stats.bounced || 0;
  const unsubscribed = stats.unsubscribed || 0;
  const needsCustom = stats.needs_custom_email || 0;
  const denom = emailsSent + scheduled;
  const percent = denom > 0 ? Math.round((emailsSent / denom) * 100) : 0;
  const replyRate = emailsSent > 0 ? Math.round((replies / emailsSent) * 100) : 0;
  const isPaused = !!c.paused;
  const isCompleted = !isPaused && scheduled === 0 && emailsSent > 0;
  const pausedPercent = isPaused && totalLeads > 0 ? Math.round((emailsSent / totalLeads) * 100) : 0;

  let statusKey = 'active';
  let statusLabel = 'Aktywna';
  let tone = 'green';
  if (isPaused) {
    statusKey = 'paused'; statusLabel = 'Wstrzymana'; tone = 'amber';
  } else if (isCompleted) {
    statusKey = 'completed'; statusLabel = 'Zakończona'; tone = 'blue';
  } else if (needsCustom > 0 && totalLeads === needsCustom) {
    statusKey = 'issues'; statusLabel = 'Wymaga poprawek'; tone = 'red';
  } else if (totalLeads === 0) {
    statusKey = 'draft'; statusLabel = 'Szkic'; tone = 'neutral';
  }

  return {
    totalLeads, emailsSent, scheduled, replies, bounced, unsubscribed, needsCustom,
    percent, replyRate, isPaused, isCompleted, pausedPercent, statusKey, statusLabel, tone,
  };
}

export default function Campaigns() {
  const [campaigns, setCampaigns] = useState(() => apiCache.get('/campaigns') || []);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // scheduling strategy from server ("priority" or other)
  const [strategy, setStrategy] = useState('priority');
  const [orderChanged, setOrderChanged] = useState(false);
  const dragSrcIdx = useRef(null);
  const confirm = useConfirm();
  const notify = useNotify();

  const load = useCallback(async () => {
    try {
      const [camp, strat] = await Promise.all([
        api.get('/campaigns'),
        api.get('/settings/scheduling-strategy').catch(() => ({ scheduling_strategy: 'priority' })),
      ]);
      setCampaigns(camp);
      setError(null);
      setStrategy(strat.scheduling_strategy || 'priority');
      setOrderChanged(false);
    } catch (e) {
      setError('Failed to load campaigns');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // drag and drop helpers (only used when strategy === 'priority')
  const onDragStart = (e, idx) => {
    dragSrcIdx.current = idx;
    e.currentTarget.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  };
  const onDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    e.currentTarget.classList.add('drag-over');
  };
  const onDragLeave = (e) => {
    e.currentTarget.classList.remove('drag-over');
  };
  const onDrop = (e, idx) => {
    e.preventDefault();
    e.currentTarget.classList.remove('drag-over');
    const src = dragSrcIdx.current;
    if (src === null || src === idx) return;
    const newList = [...campaigns];
    const [moved] = newList.splice(src, 1);
    newList.splice(idx, 0, moved);
    setCampaigns(newList);
    setOrderChanged(true);
  };
  const onDragEnd = (e) => {
    e.currentTarget.classList.remove('dragging');
    dragSrcIdx.current = null;
  };

  const saveOrder = async () => {
    if (!orderChanged) return;
    try {
      await api.post('/campaigns/reorder', { campaign_ids: campaigns.map(c => c.id) });
      setOrderChanged(false);
      notify({ type: 'success', message: 'Order saved' });
    } catch (e) {
      notify({ type: 'error', message: 'Error saving order' });
    }
  };

  const togglePause = async (id, paused, name) => {
    const ok = await confirm(`${paused ? 'Wznowić' : 'Wstrzymać'} kampanię "${name}"?`);
    if (!ok) return;
    await api.patch(`/campaigns/${id}`, { paused: !paused });
    load();
  };
  const deleteCampaign = async (id, name) => {
    const ok = await confirm(`Usunąć kampanię "${name}"? Tej operacji nie można cofnąć.`);
    if (!ok) return;
    await api.del(`/campaigns/${id}`);
    load();
  };
  const duplicateCampaign = async (id, name) => {
    const ok = await confirm(`Zduplikować kampanię "${name}"?`);
    if (!ok) return;
    const c = await api.post(`/campaigns/${id}/duplicate`);
    notify({ type: 'success', message: 'Kampania zduplikowana: ' + c.name });
    load();
  };

  const rows = campaigns.map(c => ({ campaign: c, ...campaignView(c) }));
  const filteredRows = rows.filter(row => {
    const matchesQuery = !query.trim() || row.campaign.name.toLowerCase().includes(query.trim().toLowerCase());
    const matchesStatus = statusFilter === 'all' || row.statusKey === statusFilter;
    return matchesQuery && matchesStatus;
  });
  const totals = rows.reduce((acc, row) => {
    acc.contacts += row.totalLeads;
    acc.sent += row.emailsSent;
    acc.scheduled += row.scheduled;
    acc.replies += row.replies;
    acc.bounced += row.bounced;
    if (row.statusKey === 'active') acc.active += 1;
    return acc;
  }, { contacts: 0, sent: 0, scheduled: 0, replies: 0, bounced: 0, active: 0 });
  const replyRateTotal = totals.sent > 0 ? ((totals.replies / totals.sent) * 100).toFixed(1) : '0.0';
  const deliverability = totals.sent > 0 ? Math.max(0, 100 - (totals.bounced / totals.sent) * 100).toFixed(1) : '100.0';
  const isPriority = strategy === 'priority';
  const filtersActive = query.trim().length > 0 || statusFilter !== 'all';
  const canReorder = isPriority && !filtersActive;

  return (
    <PageFrame
      className="sk-campaigns-page"
      title="Kampanie"
      description="Twórz, zarządzaj i monitoruj kampanie outreach."
      actions={
        <>
          <Button variant="outline" to="/analytics" icon="chart">Analityka</Button>
          <Button variant="primary" to="/campaigns/add" icon="plus">Nowa kampania</Button>
        </>
      }
    >
      <ErrorNotice error={error} onRetry={load} />

      <div className="sk-campaign-summary">
        <Metric icon="campaign" title="Aktywne kampanie" value={totals.active} detail={`z ${campaigns.length} wszystkich`} tone="green" />
        <Metric icon="calendar" title="Zaplanowane wysyłki" value={totals.scheduled.toLocaleString('pl-PL')} detail="oczekujące w kolejce" tone="blue" />
        <Metric icon="reply" title="Odpowiedzi" value={`${replyRateTotal}%`} detail={`${totals.replies.toLocaleString('pl-PL')} odpowiedzi`} tone="green" />
        <Metric icon="shield" title="Dostarczalność" value={`${deliverability}%`} detail={`${totals.sent.toLocaleString('pl-PL')} wysłanych`} tone="green" />
      </div>

      <div className="sk-campaign-filterbar">
        <div className="sk-search-input">
          <Icon name="search" />
          <input
            type="search"
            placeholder="Szukaj kampanii…"
            aria-label="Szukaj kampanii"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>
        <div className="sk-campaign-filter-tabs" role="group" aria-label="Status kampanii">
          {[
            ['all','Wszystkie'],
            ['active','Aktywne'],
            ['paused','Wstrzymane'],
            ['issues','Wymaga poprawek'],
            ['completed','Zakończone'],
          ].map(([key,label]) => (
            <button
              type="button"
              key={key}
              className={statusFilter === key ? 'is-active' : ''}
              onClick={() => setStatusFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {isPriority && (
        <div className="sk-campaign-priority-note">
          <Icon name="drag" size={17} />
          <span>
            Strategia priorytetowa jest aktywna.
            {canReorder ? ' Przeciągnij wiersze, aby zmienić kolejność.' : ' Wyczyść filtry, aby zmieniać kolejność.'}
          </span>
          <Link to="/settings#general">Zmień strategię</Link>
        </div>
      )}

      {campaigns.length === 0 ? (
        <Panel>
          <Empty icon="campaign">
            Brak kampanii. Utwórz pierwszą kampanię, aby rozpocząć outreach.
          </Empty>
          <div className="sk-actions-end sk-campaign-empty-actions">
            <Button variant="primary" to="/campaigns/add" icon="plus">Utwórz kampanię</Button>
          </div>
        </Panel>
      ) : filteredRows.length === 0 ? (
        <Panel>
          <Empty icon="filter">Brak kampanii pasujących do wybranych filtrów.</Empty>
        </Panel>
      ) : (
        <Panel className="sk-campaign-table-panel">
          <div className="sk-table-wrap">
            <table className="sk-table sk-campaign-table">
              <thead>
                <tr>
                  {isPriority && <><th aria-label="Przeciągnij"/><th>#</th></>}
                  <th>Nazwa kampanii</th>
                  <th>Status</th>
                  <th>Kontakty</th>
                  <th>Postęp</th>
                  <th>Odpowiedzi</th>
                  <th aria-label="Akcje"/>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map(row => {
                  const c = row.campaign;
                  const idx = campaigns.findIndex(item => item.id === c.id);
                  const progress = row.isPaused ? row.pausedPercent : row.percent;
                  const reasonParts = [];
                  if (row.bounced > 0) reasonParts.push(`${row.bounced} odbitych`);
                  if (row.unsubscribed > 0) reasonParts.push(`${row.unsubscribed} wypisanych`);
                  if (row.needsCustom > 0) reasonParts.push(`${row.needsCustom} wymaga treści`);

                  return (
                    <tr
                      key={c.id}
                      draggable={canReorder}
                      onDragStart={e => canReorder && onDragStart(e, idx)}
                      onDragOver={e => canReorder && onDragOver(e)}
                      onDragLeave={e => canReorder && onDragLeave(e)}
                      onDrop={e => canReorder && onDrop(e, idx)}
                      onDragEnd={e => canReorder && onDragEnd(e)}
                    >
                      {isPriority && (
                        <>
                          <td className="sk-campaign-drag">
                            <Icon name="drag" size={18} />
                          </td>
                          <td className="sk-muted">{idx + 1}</td>
                        </>
                      )}
                      <td>
                        <Link className="sk-campaign-name" to={`/campaigns/${c.id}`}>{c.name}</Link>
                        {reasonParts.length > 0 && <small className="sk-campaign-reasons">{reasonParts.join(' · ')}</small>}
                      </td>
                      <td><Badge dot tone={row.tone}>{row.statusLabel}</Badge></td>
                      <td>
                        <strong>{row.totalLeads.toLocaleString('pl-PL')}</strong>
                        <small className="sk-campaign-cell-detail">{row.scheduled.toLocaleString('pl-PL')} w kolejce</small>
                      </td>
                      <td className="sk-campaign-progress-cell">
                        <div className="sk-campaign-progress">
                          <span style={{width:`${Math.min(100,progress)}%`}} data-tone={row.tone}/>
                        </div>
                        <small>{row.emailsSent.toLocaleString('pl-PL')} wysłano · {progress}%</small>
                      </td>
                      <td>
                        <strong>{row.replies.toLocaleString('pl-PL')}</strong>
                        <small className="sk-campaign-cell-detail">{row.replyRate}%</small>
                      </td>
                      <td>
                        <div className="sk-campaign-row-actions">
                          <Button variant="outline" to={`/campaigns/${c.id}`}>Otwórz</Button>
                          <Button variant="outline" onClick={() => togglePause(c.id, c.paused, c.name)}>
                            {c.paused ? 'Wznów' : 'Wstrzymaj'}
                          </Button>
                          <Button variant="ghost" onClick={() => duplicateCampaign(c.id, c.name)}>Duplikuj</Button>
                          <Button variant="danger" onClick={() => deleteCampaign(c.id, c.name)}>Usuń</Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {isPriority && orderChanged && (
        <div className="sk-campaign-savebar" role="status">
          <div>
            <strong>Niezapisana kolejność kampanii</strong>
            <small>Zapisz, aby scheduler używał nowego priorytetu.</small>
          </div>
          <Button variant="primary" onClick={saveOrder} icon="check">Zapisz kolejność</Button>
        </div>
      )}
    </PageFrame>
  );
}
