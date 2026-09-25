import { campaignView } from '../redesign/campaignView';
import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { api, apiCache } from '../api';
import { PageFrame, Panel, Metric, Badge, Button, ErrorNotice, Empty, StatePanel, Icon } from '../redesign/ui';
import { useConfirm } from '../context/ConfirmContext';
import { useNotify } from '../context/NotificationContext';



export default function Campaigns() {
  const [campaigns, setCampaigns] = useState(() => apiCache.get('/campaigns') || []);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState([]);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [sortOrder, setSortOrder] = useState('priority');
  const [createdAfter, setCreatedAfter] = useState('');
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // scheduling strategy from server ("priority" or other)
  const [strategy, setStrategy] = useState('priority');
  const [orderChanged, setOrderChanged] = useState(false);
  const dragSrcIdx = useRef(null);
  const confirm = useConfirm();
  const notify = useNotify();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
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
      setError('Nie udało się wczytać kampanii.');
    } finally {
      setLoading(false);
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
      notify({ type: 'success', message: 'Kolejność zapisana.' });
    } catch (e) {
      notify({ type: 'error', message: 'Nie udało się zapisać kolejności.' });
    }
  };

  const runAction = async (question, action, successMessage) => {
    if (actionBusy || !(await confirm(question))) return;
    setActionBusy(true);
    setActionError(null);
    try {
      await action();
      if (successMessage) notify({ type: 'success', message: successMessage });
      await load();
    } catch {
      setActionError('Nie udało się wykonać operacji. Sprawdź stan kampanii i spróbuj ponownie.');
    } finally { setActionBusy(false); }
  };
  const togglePause = (id, paused, name) => runAction(
    `${paused ? 'Wznowić' : 'Wstrzymać'} kampanię "${name}"?`,
    () => api.patch(`/campaigns/${id}`, { paused: !paused }),
  );
  const deleteCampaign = (id, name) => runAction(
    `Usunąć kampanię "${name}"? Tej operacji nie można cofnąć.`,
    async () => { await api.del(`/campaigns/${id}`); setSelected(ids => ids.filter(value => value !== id)); },
  );
  const duplicateCampaign = (id, name) => runAction(
    `Zduplikować kampanię "${name}"?`, () => api.post(`/campaigns/${id}/duplicate`), 'Kampania zduplikowana.',
  );
  const bulkAction = async (kind) => {
    const ids = [...selected];
    const label = { pause: 'Wstrzymać', resume: 'Wznowić', delete: 'Usunąć' }[kind];
    if (!ids.length || actionBusy || !(await confirm(`${label} zaznaczone kampanie (${ids.length})?${kind === 'delete' ? ' Tej operacji nie można cofnąć.' : ''}`))) return;
    setActionBusy(true);
    setActionError(null);
    const failed = [];
    // Sequential requests avoid overwhelming a small self-hosted instance.
    for (const id of ids) {
      try {
        if (kind === 'delete') await api.del(`/campaigns/${id}`);
        else await api.patch(`/campaigns/${id}`, { paused: kind === 'pause' });
      } catch { failed.push(id); }
    }
    await load();
    setSelected(failed);
    if (failed.length) setActionError(`Wykonano ${ids.length - failed.length} z ${ids.length} operacji. Nieudane kampanie pozostają zaznaczone — możesz ponowić operację.`);
    else notify({ type: 'success', message: `Zaktualizowano ${ids.length} kampanii.` });
    setActionBusy(false);
  };

  const rows = campaigns.map(c => ({ campaign: c, ...campaignView(c) }));
  const filteredRows = rows.filter(row => {
    const matchesQuery = !query.trim() || row.campaign.name.toLowerCase().includes(query.trim().toLowerCase());
    const matchesStatus = statusFilter === 'all' || row.statusKey === statusFilter;
    return matchesQuery && matchesStatus && (!createdAfter || (row.campaign.created_at || '').slice(0, 10) >= createdAfter);
  }).sort((a, b) => sortOrder === 'name' ? a.campaign.name.localeCompare(b.campaign.name, 'pl') : sortOrder === 'newest' ? (b.campaign.created_at || '').localeCompare(a.campaign.created_at || '') : 0);
  const visibleIds = filteredRows.map(row => row.campaign.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selected.includes(id));
  const toggleVisible = () => setSelected(ids => allVisibleSelected ? ids.filter(id => !visibleIds.includes(id)) : [...new Set([...ids, ...visibleIds])]);
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
  const deliverability = totals.sent > 0 ? Math.max(0, 100 - (totals.bounced / totals.sent) * 100).toFixed(1) : null;
  const isPriority = strategy === 'priority';
  const filtersActive = query.trim().length > 0 || statusFilter !== 'all' || !!createdAfter || sortOrder !== 'priority';
  const canReorder = isPriority && !filtersActive && !actionBusy && !loading;

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
      <ErrorNotice error={actionError} />

      {!loading && !error && <div className="sk-campaign-summary">
        <Metric icon="campaign" title="Aktywne kampanie" value={totals.active} detail={`z ${campaigns.length} wszystkich`} tone="green" />
        <Metric icon="calendar" title="Zaplanowane wysyłki" value={totals.scheduled.toLocaleString('pl-PL')} detail="oczekujące w kolejce" tone="blue" />
        <Metric icon="reply" title="Odpowiedzi" value={`${replyRateTotal}%`} detail={`${totals.replies.toLocaleString('pl-PL')} odpowiedzi`} tone="green" />
        <Metric icon="shield" title="Dostarczalność" value={deliverability == null ? '—' : `${deliverability}%`} detail={totals.sent ? `${totals.sent.toLocaleString('pl-PL')} wysłanych` : 'brak wysłanych wiadomości'} tone={deliverability == null ? 'neutral' : 'green'} />
      </div>}

      <div className="sk-campaign-filterbar">
        <div className="sk-search-input">
          <Icon name="search" />
          <input
            type="search"
            placeholder="Szukaj kampanii…"
            aria-label="Szukaj kampanii"
            value={query}
            onChange={e => { setQuery(e.target.value); setSelected([]); }}
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
              aria-pressed={statusFilter === key}
              onClick={() => { setStatusFilter(key); setSelected([]); }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="sk-campaign-secondary-filters">
        <label>Utworzone od<input type="date" value={createdAfter} onChange={e => { setCreatedAfter(e.target.value); setSelected([]); }} /></label>
        <label>Sortowanie<select value={sortOrder} onChange={e => setSortOrder(e.target.value)}><option value="priority">Priorytet</option><option value="newest">Najnowsze</option><option value="name">Nazwa A–Z</option></select></label>
        {filtersActive && <Button onClick={() => { setQuery(''); setStatusFilter('all'); setCreatedAfter(''); setSortOrder('priority'); setSelected([]); }}>Wyczyść filtry</Button>}
      </div>
      {selected.length > 0 && <div className="sk-campaign-bulkbar" aria-busy={actionBusy}>
        <strong>Zaznaczono: {selected.length}</strong>
        <Button icon="pause" disabled={actionBusy} onClick={() => bulkAction('pause')}>Wstrzymaj zaznaczone</Button>
        <Button icon="play" disabled={actionBusy} onClick={() => bulkAction('resume')}>Wznów zaznaczone</Button>
        <Button variant="danger" icon="delete" disabled={actionBusy} onClick={() => bulkAction('delete')}>Usuń zaznaczone</Button>
        <Button variant="ghost" disabled={actionBusy} onClick={() => setSelected([])}>Odznacz</Button>
      </div>}

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

      {loading && campaigns.length === 0 ? (
        <StatePanel icon="refresh" title="Ładowanie kampanii" description="Pobieramy listę kampanii." />
      ) : error && campaigns.length === 0 ? null : campaigns.length === 0 ? (
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
                  <th><input type="checkbox" aria-label="Zaznacz widoczne kampanie" checked={allVisibleSelected} disabled={actionBusy || loading} onChange={toggleVisible} /></th>
                  {isPriority && <><th aria-label="Przeciągnij"/><th>#</th></>}
                  <th>Nazwa kampanii</th>
                  <th>Status</th>
                  <th>Kontakty</th>
                  <th>Skrzynki</th>
                  <th>Utworzono</th>
                  <th>Postęp</th>
                  <th>Odpowiedzi</th>
                  <th aria-label="Akcje"/>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map(row => {
                  const c = row.campaign;
                  const idx = campaigns.findIndex(item => item.id === c.id);
                  const progress = row.percent;
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
                      <td><input type="checkbox" aria-label={`Zaznacz kampanię ${c.name}`} checked={selected.includes(c.id)} disabled={actionBusy || loading} onChange={() => setSelected(ids => ids.includes(c.id) ? ids.filter(id => id !== c.id) : [...ids, c.id])} /></td>
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
                      <td>{c.inbox_ids?.length ?? '—'}</td>
                      <td className="sk-campaign-created">{c.created_at ? new Date(c.created_at).toLocaleDateString('pl-PL') : '—'}</td>
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
                          <Button variant="outline" icon="eye" aria-label="Otwórz" title="Otwórz kampanię" to={`/campaigns/${c.id}`} />
                          <Button variant="outline" icon={c.paused ? "play" : "pause"} aria-label={c.paused ? "Wznów" : "Wstrzymaj"} title={c.paused ? "Wznów" : "Wstrzymaj"} disabled={actionBusy || loading} onClick={() => togglePause(c.id, c.paused, c.name)} />
                          <Button variant="ghost" icon="stack" aria-label="Duplikuj" title="Duplikuj" disabled={actionBusy || loading} onClick={() => duplicateCampaign(c.id, c.name)} />
                          <Button variant="danger" icon="delete" aria-label="Usuń" title="Usuń" disabled={actionBusy || loading} onClick={() => deleteCampaign(c.id, c.name)} />
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
          <Button variant="primary" disabled={actionBusy || loading} onClick={saveOrder} icon="check">Zapisz kolejność</Button>
        </div>
      )}
    </PageFrame>
  );
}
