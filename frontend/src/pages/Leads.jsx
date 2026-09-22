import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { Button } from '../components/ui/Button';
import { FileUploadArea } from '../components/ui/FileUploadArea';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { useNotify } from '../context/NotificationContext';
import { useConfirm } from '../context/ConfirmContext';
import { useLoading } from '../context/LoadingContext';
import { cn } from '../utils/cn';

const STATUS_OPTIONS = [
  { value: 'all', label: 'Wszystkie statusy' },
  { value: 'active', label: 'Kampania: aktywny' },
  { value: 'contacted', label: 'Kampania: skontaktowano' },
  { value: 'completed', label: 'Kampania: zakończony' },
  { value: 'bounced', label: 'Kampania: odbity' },
  { value: 'unsubscribed', label: 'Kampania: wypisany' },
  { value: 'wrong_person', label: 'Kampania: zły odbiorca' },
  { value: 'invalid', label: 'Weryfikacja: niepoprawny' },
  { value: 'replied', label: 'Ma odpowiedź' },
];

const INTEREST_FILTER_OPTIONS = [
  { value: 'all', label: 'Wszystkie reakcje' },
  { value: 'unset', label: 'Brak oceny' },
  { value: 'interested', label: 'Zainteresowany' },
  { value: 'not_interested', label: 'Niezainteresowany' },
  { value: 'out_of_office', label: 'Poza biurem' },
  { value: 'auto_reply', label: 'Automatyczna odpowiedź' },
];

const TAB_ALL = 'all';
const TAB_BOUNCED = 'bounced';

function formatEnrolled(campaigns) {
  if (!campaigns?.length) return '—';
  const dates = campaigns.map((c) => new Date(c.enrolled_at).getTime()).filter(Number.isFinite);
  if (!dates.length) return '—';
  const earliest = new Date(Math.min(...dates));
  return earliest.toLocaleDateString();
}

function statusPillClass(status) {
  switch (status) {
    case 'active':
    case 'contacted':
      return 'bg-green-100 text-green-800';
    case 'completed':
      return 'bg-blue-100 text-blue-800';
    case 'unsubscribed':
    case 'wrong_person':
      return 'bg-gray-200 text-gray-700';
    case 'bounced':
    case 'invalid':
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-gray-100 text-gray-700';
  }
}

function leadRowSummary(lead) {
  const camps = lead.campaigns || [];
  if (!camps.length) return '—';
  const bits = camps.map((c) => `${c.campaign_name?.slice(0, 12) || c.campaign_id}:${c.status || 'active'}`);
  return bits.slice(0, 3).join(' · ') + (bits.length > 3 ? '…' : '');
}

function importTargetKind(target) {
  if (target === 'email') return 'email';
  if (target === 'name') return 'name';
  if (target?.startsWith('custom:')) return 'custom';
  return 'skip';
}

function importCustomKey(target) {
  return target?.startsWith('custom:') ? target.slice(7) : '';
}

function buildLeadsQueryParams({ tab, debouncedSearch, statusFilter, interestFilter }) {
  const params = new URLSearchParams();
  if (debouncedSearch) params.set('q', debouncedSearch);
  if (tab === TAB_BOUNCED) {
    params.set('bad_only', 'true');
  }
  if (tab === TAB_ALL && statusFilter !== 'all') {
    params.set('status', statusFilter);
  }
  if (interestFilter && interestFilter !== 'all') {
    params.set('interest', interestFilter);
  }
  return params;
}

export default function Leads() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') === TAB_BOUNCED ? TAB_BOUNCED : TAB_ALL;

  const setTab = (next) => {
    const p = new URLSearchParams(searchParams);
    if (next === TAB_ALL) p.delete('tab');
    else p.set('tab', next);
    setSearchParams(p);
  };

  const [leads, setLeads] = useState([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [interestFilter, setInterestFilter] = useState('all');
  const [selected, setSelected] = useState(() => new Set());
  const [emailDrafts, setEmailDrafts] = useState({});
  const [bulkEnrollmentStatus, setBulkEnrollmentStatus] = useState('active');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [contactImportFile, setContactImportFile] = useState(null);
  const [contactImportPreview, setContactImportPreview] = useState(null);
  const [contactImportMapping, setContactImportMapping] = useState({});
  const [contactImportMode, setContactImportMode] = useState('merge');
  const [contactImportBusy, setContactImportBusy] = useState(false);

  const notify = useNotify();
  const confirm = useConfirm();
  const loading = useLoading();

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  const loadLeads = useCallback(async () => {
    loading.start();
    try {
      const params = buildLeadsQueryParams({ tab, debouncedSearch, statusFilter, interestFilter });
      const qs = params.toString();
      const data = await api.get('/leads' + (qs ? `?${qs}` : ''));
      const rows = Array.isArray(data) ? data : [];
      setLeads(rows);
      setSelected(new Set());
      setEmailDrafts((prev) => {
        const next = { ...prev };
        rows.forEach((l) => {
          if (next[l.id] === undefined) next[l.id] = l.email;
        });
        return next;
      });
    } catch (e) {
      notify({ type: 'error', message: e.message || 'Failed to load leads' });
    } finally {
      loading.stop();
    }
  }, [debouncedSearch, statusFilter, interestFilter, tab, loading, notify]);

  useEffect(() => {
    loadLeads();
  }, [loadLeads]);

  const visibleIds = useMemo(() => leads.map((l) => l.id), [leads]);

  const toggleOne = (id) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const toggleAll = () => {
    if (selected.size === visibleIds.length && visibleIds.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(visibleIds));
    }
  };

  const handleBulkDelete = async () => {
    if (!selected.size) return;
    const ok = await confirm(
      `Permanently delete ${selected.size} lead(s)? This removes enrollments and email history for those leads.`,
    );
    if (!ok) return;
    loading.start();
    try {
      const res = await api.post('/leads/bulk-delete', { lead_ids: [...selected] });
      const n = res.deleted ?? selected.size;
      notify({ type: 'success', message: `Deleted ${n} lead(s).` });
      await loadLeads();
    } catch (e) {
      notify({ type: 'error', message: e.message || 'Delete failed' });
    } finally {
      loading.stop();
    }
  };

  const handleBulkStatus = async () => {
    if (!selected.size) return;
    const ok = await confirm(
      `Set enrollment to “${bulkEnrollmentStatus}” on every campaign for ${selected.size} lead(s)? The send queue will be recalculated.`,
    );
    if (!ok) return;
    loading.start();
    try {
      await api.post('/leads/bulk-status', { lead_ids: [...selected], enrollment_status: bulkEnrollmentStatus });
      notify({ type: 'success', message: 'Status updated.' });
      await loadLeads();
    } catch (e) {
      notify({ type: 'error', message: e.message || 'Update failed' });
    } finally {
      loading.stop();
    }
  };

  const handleBulkReenroll = async () => {
    const ids = [...selected];
    const targets = ids
      .map((id) => leads.find((l) => l.id === id))
      .filter(Boolean)
      .filter(
        (l) =>
          l.email_verification_status === 'invalid' ||
          (l.campaigns || []).some((c) => c.status === 'bounced'),
      );
    if (!targets.length) {
      notify({ type: 'info', message: 'Select bounced or invalid leads to re-enroll with a corrected email.' });
      return;
    }
    const ok = await confirm(
      `Re-enroll ${targets.length} lead(s) using the “New email” values? Status becomes active; verification runs when enabled on your account.`,
    );
    if (!ok) return;
    loading.start();
    try {
      const items = targets
        .map((l) => ({
          lead_id: l.id,
          email: (emailDrafts[l.id] ?? l.email).trim(),
        }))
        .filter((row) => row.email);
      if (!items.length) {
        notify({ type: 'error', message: 'Enter an email for each selected lead.' });
        return;
      }
      const res = await api.post('/leads/bulk-recover', { items, verify_email: true });
      const n = res.recovered ?? 0;
      const errN = res.errors?.length ?? 0;
      notify({
        type: errN ? 'info' : 'success',
        message: `Recovery started for ${n} lead(s).${errN ? ` ${errN} skipped (see API errors).` : ''}`,
      });
      await loadLeads();
    } catch (e) {
      notify({ type: 'error', message: e.message || 'Re-enroll failed' });
    } finally {
      loading.stop();
    }
  };

  const recoverOne = async (lead) => {
    const email = (emailDrafts[lead.id] ?? lead.email).trim();
    if (!email) {
      notify({ type: 'error', message: 'Enter an email address.' });
      return;
    }
    loading.start();
    try {
      await api.post(`/leads/${lead.id}/recover`, { email, verify_email: true });
      notify({ type: 'success', message: 'Lead updated. Verification or scheduling will follow your account settings.' });
      await loadLeads();
    } catch (e) {
      notify({ type: 'error', message: e.message || 'Recovery failed' });
    } finally {
      loading.stop();
    }
  };

  const markActiveOne = async (lead) => {
    loading.start();
    try {
      await api.patch(`/leads/${lead.id}`, { enrollment_status: 'active' });
      notify({ type: 'success', message: 'All enrollments set to active; queue recalculated.' });
      await loadLeads();
    } catch (e) {
      notify({ type: 'error', message: e.message || 'Update failed' });
    } finally {
      loading.stop();
    }
  };

  const exportCsv = async () => {
    const params = buildLeadsQueryParams({ tab, debouncedSearch, statusFilter, interestFilter });
    const qs = params.toString();
    loading.start();
    try {
      const res = await api.download('/leads/export' + (qs ? `?${qs}` : ''));
      const blob = await res.blob();
      let filename = tab === TAB_BOUNCED ? 'leads-bounced-invalid.csv' : 'leads-export.csv';
      const cd = res.headers.get('content-disposition');
      if (cd) {
        const m = cd.match(/filename="?([^";\n]+)"?/i);
        if (m?.[1]) filename = m[1].trim();
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      notify({ type: 'success', message: 'CSV downloaded.' });
    } catch (e) {
      notify({ type: 'error', message: e.message || 'Export failed' });
    } finally {
      loading.stop();
    }
  };

  const previewContactImport = async (file) => {
    setContactImportBusy(true);
    try {
      const preview = await api.upload('/leads/import/preview', file);
      setContactImportFile(file);
      setContactImportPreview(preview);
      setContactImportMapping(preview.suggested_mapping || {});
      setContactImportMode('merge');
    } catch (e) {
      notify({ type: 'error', message: e.message || 'Nie udało się odczytać pliku.' });
    } finally {
      setContactImportBusy(false);
    }
  };

  const closeContactImport = () => {
    if (contactImportBusy) return;
    setContactImportFile(null);
    setContactImportPreview(null);
    setContactImportMapping({});
  };

  const setImportMappingKind = (header, kind) => {
    setContactImportMapping((prev) => {
      const next = { ...prev };
      if (kind === 'email') {
        Object.keys(next).forEach((key) => {
          if (next[key] === 'email') next[key] = 'skip';
        });
        next[header] = 'email';
      } else if (kind === 'name') {
        Object.keys(next).forEach((key) => {
          if (next[key] === 'name') next[key] = 'skip';
        });
        next[header] = 'name';
      } else if (kind === 'custom') {
        const fallback = header
          .toLowerCase()
          .replace(/[^0-9a-ząćęłńóśźż]+/gi, '_')
          .replace(/^_+|_+$/g, '') || 'field';
        next[header] = `custom:${fallback}`;
      } else {
        next[header] = 'skip';
      }
      return next;
    });
  };

  const commitContactImport = async () => {
    if (!contactImportFile || !contactImportPreview) return;
    const hasEmail = Object.values(contactImportMapping).includes('email');
    if (!hasEmail) {
      notify({ type: 'error', message: 'Wskaż kolumnę zawierającą adres e-mail.' });
      return;
    }
    setContactImportBusy(true);
    try {
      const res = await api.uploadMultipart('/leads/import', contactImportFile, {
        mapping_json: contactImportMapping,
        duplicate_mode: contactImportMode,
      });
      notify({
        type: 'success',
        message:
          `Import zakończony: ${res.added || 0} nowych, ${res.updated || 0} zaktualizowanych, ` +
          `${res.skipped_suppressed || 0} na suppression list.`,
      });
      closeContactImport();
      await loadLeads();
    } catch (e) {
      notify({ type: 'error', message: e.message || 'Import nie powiódł się.' });
    } finally {
      setContactImportBusy(false);
    }
  };

  const importRecoverCsv = async (file) => {
    const ok = await confirm(
      'Recover leads from this CSV? The server reads id and email columns (header row or first two columns).',
    );
    if (!ok) return;
    loading.start();
    try {
      const res = await api.upload('/leads/recover-import?verify_emails=true', file);
      const n = res.recovered ?? 0;
      const errN = res.errors?.length ?? 0;
      notify({
        type: errN ? 'info' : 'success',
        message: `Recovered ${n} lead(s).${errN ? ` ${errN} row(s) skipped.` : ''}`,
      });
      await loadLeads();
    } catch (e) {
      notify({ type: 'error', message: e.message || 'Import failed — check CSV format and IDs.' });
      await loadLeads();
    } finally {
      loading.stop();
    }
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-8 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold mb-1">Kontakty</h1>
          <p className="text-sm text-gray-500 max-w-2xl">
            Zarządzaj kontaktami ze wszystkich kampanii. W widoku{' '}
            <strong className="font-medium text-gray-700">Odbite i niepoprawne</strong>{' '}
            możesz poprawić adres i ponownie włączyć kontakt do wysyłki.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <FileUploadArea
            size="sm"
            accept=".xlsx,.xlsm,.csv,.tsv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            disabled={contactImportBusy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) previewContactImport(file);
            }}
          >
            {contactImportBusy && !contactImportPreview ? 'Wczytywanie…' : 'Importuj kontakty'}
          </FileUploadArea>
          <Button type="button" variant="outline" size="sm" onClick={exportCsv} disabled={!leads.length}>
            Eksport CSV
          </Button>
          <FileUploadArea
            size="sm"
            accept=".csv,text/csv"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) importRecoverCsv(f);
            }}
          >
            Import CSV do naprawy
          </FileUploadArea>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setTab(TAB_ALL)}
          className={cn(
            'rounded-full border text-xs font-medium px-3 py-1.5 transition-colors',
            tab === TAB_ALL
              ? 'bg-teal-500 text-white border-teal-500'
              : 'bg-white text-gray-600 border-gray-300 hover:border-teal-300 hover:bg-teal-50',
          )}
        >
          Wszystkie kontakty
        </button>
        <button
          type="button"
          onClick={() => setTab(TAB_BOUNCED)}
          className={cn(
            'rounded-full border text-xs font-medium px-3 py-1.5 transition-colors',
            tab === TAB_BOUNCED
              ? 'bg-teal-500 text-white border-teal-500'
              : 'bg-white text-gray-600 border-gray-300 hover:border-teal-300 hover:bg-teal-50',
          )}
        >
          Odbite i niepoprawne
        </button>
      </div>

      {tab === TAB_ALL && (
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-sm text-gray-500">Status:</span>
          {STATUS_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => setStatusFilter(o.value)}
              className={cn(
                'rounded-full border text-xs font-medium px-3 py-1',
                statusFilter === o.value
                  ? 'bg-teal-500 text-white border-teal-500'
                  : 'bg-white text-gray-600 border-gray-300 hover:border-teal-300 hover:bg-teal-50',
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-sm text-gray-500">Interest:</span>
        {INTEREST_FILTER_OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => setInterestFilter(o.value)}
            className={cn(
              'rounded-full border text-xs font-medium px-3 py-1',
              interestFilter === o.value
                ? 'bg-emerald-600 text-white border-emerald-600'
                : 'bg-white text-gray-600 border-gray-300 hover:border-emerald-400 hover:bg-emerald-50',
            )}
          >
            {o.label}
          </button>
        ))}
      </div>

      {tab === TAB_BOUNCED && (
        <Card className="p-4 bg-amber-50/80 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800">
          <p className="text-sm text-gray-800 dark:text-gray-200">
            Edit the email for each row, then <strong className="font-medium">Save &amp; recover</strong>. That updates the
            lead record (all campaigns), sets status to active, and either queues verification or reschedules immediately.
            Export bad addresses to clean them elsewhere, then import a CSV with columns <code className="font-mono text-xs">id,email</code>.
          </p>
        </Card>
      )}

      <div className="flex flex-wrap gap-4 items-end">
        <div className="flex-1 min-w-[200px] max-w-md">
          <Input
            label="Szukaj"
            placeholder="E-mail lub nazwa…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {selected.size > 0 && (
        <Card className="p-4 flex flex-wrap gap-3 items-center">
          <span className="text-sm font-medium text-gray-700">{selected.size} zaznaczono</span>
          <Button type="button" variant="destructive" size="sm" onClick={handleBulkDelete}>
            Usuń
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="rounded-md border-gray-300 text-sm shadow-sm focus:ring-2 focus:ring-teal-300"
              value={bulkEnrollmentStatus}
              onChange={(e) => setBulkEnrollmentStatus(e.target.value)}
            >
              <option value="active">active</option>
              <option value="contacted">contacted</option>
              <option value="completed">completed</option>
              <option value="bounced">bounced</option>
              <option value="unsubscribed">unsubscribed</option>
              <option value="wrong_person">wrong_person</option>
            </select>
            <Button type="button" variant="outline" size="sm" onClick={handleBulkStatus}>
              Apply enrollment
            </Button>
          </div>
          {(tab === TAB_BOUNCED || tab === TAB_ALL) && (
            <Button type="button" variant="default" size="sm" onClick={handleBulkReenroll}>
              Re-enroll (recover)
            </Button>
          )}
        </Card>
      )}

      <Card className="overflow-x-auto max-w-full min-w-0">
        <div className="px-4 py-2 text-sm text-gray-500 border-b border-gray-100">
          {leads.length} lead{leads.length !== 1 ? 's' : ''}
          {tab === TAB_BOUNCED ? ' (bounced or invalid)' : ''}
        </div>
        <table className="min-w-max w-full table-auto border-collapse text-sm">
          <thead>
            <tr className="text-left text-gray-600 border-b">
              <th className="p-2 w-10">
                <input
                  type="checkbox"
                  className="rounded"
                  checked={visibleIds.length > 0 && selected.size === visibleIds.length}
                  onChange={toggleAll}
                  aria-label="Select all"
                />
              </th>
              <th className="p-2">E-mail</th>
              <th className="p-2">Nazwa / imię</th>
              <th className="p-2">Weryfikacja / kampanie</th>
              <th className="p-2">Kampanie</th>
              <th className="p-2">Skrzynka nadawcza</th>
              <th className="p-2">Dodano</th>
              {tab === TAB_BOUNCED && <th className="p-2 min-w-[200px]">Nowy e-mail</th>}
              {tab === TAB_BOUNCED && <th className="p-2 w-44">Akcje</th>}
            </tr>
          </thead>
          <tbody>
            {leads.length === 0 ? (
              <tr>
                <td colSpan={tab === TAB_BOUNCED ? 9 : 7} className="p-8 text-center text-gray-500">
                  Brak kontaktów pasujących do tego widoku.
                </td>
              </tr>
            ) : (
              leads.map((l) => (
                <tr key={l.id} className="even:bg-gray-50 dark:even:bg-gray-800/40 border-b border-gray-100">
                  <td className="p-2 align-top">
                    <input
                      type="checkbox"
                      className="rounded"
                      checked={selected.has(l.id)}
                      onChange={() => toggleOne(l.id)}
                      aria-label={`Select ${l.email}`}
                    />
                  </td>
                  <td className="p-2 align-top font-mono text-xs">
                    <Link to={`/leads/${l.id}`} className="text-teal-600 hover:underline">
                      {l.email}
                    </Link>
                  </td>
                  <td className="p-2 align-top">{l.name || '—'}</td>
                  <td className="p-2 align-top">
                    <div className="flex flex-wrap gap-1">
                      {l.email_verification_status && (
                        <span
                          className={cn(
                            'rounded-full px-2 py-0.5 text-xs font-medium',
                            statusPillClass(l.email_verification_status),
                          )}
                        >
                          verify: {l.email_verification_status}
                        </span>
                      )}
                      {(l.campaigns || []).slice(0, 3).map((c) => (
                        <span
                          key={c.campaign_id}
                          className={cn('rounded-full px-2 py-0.5 text-xs font-medium', statusPillClass(c.status))}
                          title={`${c.campaign_name}: ${c.status}${c.interest ? ` · ${c.interest}` : ''}`}
                        >
                          {c.status}
                        </span>
                      ))}
                      {(l.campaigns || []).length > 3 && (
                        <span className="text-xs text-gray-500">+{l.campaigns.length - 3}</span>
                      )}
                      {!(l.campaigns || []).length && !l.email_verification_status && (
                        <span className="text-gray-400 text-xs">—</span>
                      )}
                    </div>
                  </td>
                  <td className="p-2 align-top">
                    <div className="flex flex-wrap gap-1 max-w-xs">
                      {(l.campaigns || []).map((c) => (
                        <Link
                          key={c.campaign_id}
                          to={`/campaigns/${c.campaign_id}#leads`}
                          className="bg-gray-200 dark:bg-gray-600 rounded-full px-2 py-0.5 text-xs hover:bg-gray-300 dark:hover:bg-gray-500"
                        >
                          {c.campaign_name}
                        </Link>
                      ))}
                      {!(l.campaigns || []).length && <span className="text-gray-400">—</span>}
                    </div>
                  </td>
                  <td className="p-2 align-top">
                    <div className="flex flex-col gap-1 max-w-xs">
                      {(l.campaigns || []).map((c) => (
                        <div key={c.campaign_id} className="text-xs">
                          {c.from_inbox_email ? (
                            <span className="font-mono text-gray-700" title={`${c.campaign_name}: sent from ${c.from_inbox_email}`}>
                              {c.from_inbox_email}
                            </span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </div>
                      ))}
                      {!(l.campaigns || []).length && <span className="text-gray-400 text-xs">—</span>}
                    </div>
                  </td>
                  <td className="p-2 align-top text-gray-600">{formatEnrolled(l.campaigns)}</td>
                  {tab === TAB_BOUNCED && (
                    <td className="p-2 align-top">
                      <input
                        type="email"
                        className="w-full rounded-md border-gray-300 text-sm shadow-sm focus:ring-2 focus:ring-teal-300"
                        value={emailDrafts[l.id] ?? l.email}
                        onChange={(e) =>
                          setEmailDrafts((prev) => ({
                            ...prev,
                            [l.id]: e.target.value,
                          }))
                        }
                      />
                    </td>
                  )}
                  {tab === TAB_BOUNCED && (
                    <td className="p-2 align-top space-y-1">
                      <Button type="button" size="sm" variant="default" onClick={() => recoverOne(l)}>
                        Zapisz i przywróć
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => markActiveOne(l)}>
                        Tylko aktywny
                      </Button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>

      {contactImportPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-6xl max-h-[92vh] overflow-hidden rounded-xl bg-white shadow-2xl flex flex-col">
            <div className="flex items-start justify-between gap-4 border-b px-6 py-4">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Import kontaktów</h2>
                <p className="text-sm text-gray-500 mt-1">
                  {contactImportPreview.filename}
                  {contactImportPreview.sheet_name ? ` · arkusz: ${contactImportPreview.sheet_name}` : ''}
                  {' · '}{contactImportPreview.total_rows} wierszy
                </p>
              </div>
              <button
                type="button"
                onClick={closeContactImport}
                className="text-2xl leading-none text-gray-400 hover:text-gray-700"
                aria-label="Zamknij"
              >
                ×
              </button>
            </div>

            <div className="overflow-y-auto px-6 py-5 space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-gray-500">Poprawne e-maile</div>
                  <div className="text-xl font-semibold">{contactImportPreview.valid_unique_emails}</div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-gray-500">Już istnieją</div>
                  <div className="text-xl font-semibold">{contactImportPreview.existing_contacts}</div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-gray-500">Suppression</div>
                  <div className="text-xl font-semibold">{contactImportPreview.suppressed_contacts}</div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-gray-500">Duplikaty w pliku</div>
                  <div className="text-xl font-semibold">{contactImportPreview.duplicates_in_file}</div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-gray-500">Niepoprawne</div>
                  <div className="text-xl font-semibold">{contactImportPreview.invalid_count}</div>
                </div>
              </div>

              {contactImportPreview.mapping_required && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  Sekaro nie rozpoznało automatycznie kolumny e-mail. Wskaż ją poniżej.
                </div>
              )}

              <div>
                <h3 className="font-semibold text-gray-900 mb-2">Mapowanie kolumn</h3>
                <div className="rounded-lg border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left px-3 py-2">Kolumna w pliku</th>
                        <th className="text-left px-3 py-2">Pole w Sekaro</th>
                        <th className="text-left px-3 py-2">Nazwa custom field</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(contactImportPreview.headers || []).map((header) => {
                        const target = contactImportMapping[header] || 'skip';
                        const kind = importTargetKind(target);
                        return (
                          <tr key={header} className="border-t">
                            <td className="px-3 py-2 font-medium text-gray-800">{header}</td>
                            <td className="px-3 py-2">
                              <select
                                value={kind}
                                onChange={(e) => setImportMappingKind(header, e.target.value)}
                                className="rounded-md border-gray-300 text-sm"
                              >
                                <option value="skip">Pomiń</option>
                                <option value="email">E-mail</option>
                                <option value="name">Nazwa / imię</option>
                                <option value="custom">Custom field</option>
                              </select>
                            </td>
                            <td className="px-3 py-2">
                              {kind === 'custom' ? (
                                <input
                                  value={importCustomKey(target)}
                                  onChange={(e) =>
                                    setContactImportMapping((prev) => ({
                                      ...prev,
                                      [header]: `custom:${e.target.value}`,
                                    }))
                                  }
                                  className="w-full rounded-md border-gray-300 text-sm"
                                  placeholder="np. land"
                                />
                              ) : (
                                <span className="text-gray-400">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-gray-900 mb-2">Podgląd danych</h3>
                <div className="overflow-x-auto rounded-lg border">
                  <table className="min-w-max w-full text-xs">
                    <thead className="bg-gray-50">
                      <tr>
                        {(contactImportPreview.headers || []).map((header) => (
                          <th key={header} className="px-3 py-2 text-left font-semibold text-gray-600">{header}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(contactImportPreview.sample_rows || []).map((row, idx) => (
                        <tr key={idx} className="border-t">
                          {(contactImportPreview.headers || []).map((header) => (
                            <td key={header} className="px-3 py-2 max-w-[260px] truncate" title={row[header] || ''}>
                              {row[header] || '—'}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-gray-900 mb-2">Istniejące kontakty</h3>
                <div className="flex flex-wrap gap-4 text-sm">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="duplicate-mode"
                      checked={contactImportMode === 'merge'}
                      onChange={() => setContactImportMode('merge')}
                    />
                    Uzupełnij / zaktualizuj danymi z pliku
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="duplicate-mode"
                      checked={contactImportMode === 'skip'}
                      onChange={() => setContactImportMode('skip')}
                    />
                    Pomiń istniejące kontakty
                  </label>
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  Adresy znajdujące się na suppression list są zawsze pomijane niezależnie od tego ustawienia.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t px-6 py-4">
              <Button type="button" variant="outline" onClick={closeContactImport} disabled={contactImportBusy}>
                Anuluj
              </Button>
              <Button
                type="button"
                variant="default"
                onClick={commitContactImport}
                disabled={contactImportBusy || !Object.values(contactImportMapping).includes('email')}
              >
                {contactImportBusy ? 'Importowanie…' : 'Importuj kontakty'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
