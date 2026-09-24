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

function buildLeadsQueryParams({ tab, debouncedSearch, statusFilter, interestFilter, listFilter }) {
  const params = new URLSearchParams();
  if (listFilter) params.set('list_id', String(listFilter));
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
  const [contactLists, setContactLists] = useState([]);
  const [listFilter, setListFilter] = useState('');
  const [contactImportFile, setContactImportFile] = useState(null);
  const [contactImportPreview, setContactImportPreview] = useState(null);
  const [contactImportMapping, setContactImportMapping] = useState({});
  const [contactImportMode, setContactImportMode] = useState('merge');
  const [contactImportListName, setContactImportListName] = useState('');
  const [contactImportBusy, setContactImportBusy] = useState(false);
  const [suppressionOpen, setSuppressionOpen] = useState(false);
  const [suppressionRows, setSuppressionRows] = useState([]);
  const [suppressionSearch, setSuppressionSearch] = useState('');
  const [suppressionEmail, setSuppressionEmail] = useState('');
  const [suppressionReason, setSuppressionReason] = useState('manual');
  const [suppressionBusy, setSuppressionBusy] = useState(false);
  const [contactFields, setContactFields] = useState([]);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [hiddenColumns, setHiddenColumns] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('sekaro.contacts.hiddenColumns') || '[]');
      return new Set(Array.isArray(stored) ? stored : []);
    } catch {
      return new Set();
    }
  });

  const notify = useNotify();
  const confirm = useConfirm();
  const loading = useLoading();

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  const loadContactLists = useCallback(async () => {
    try {
      const rows = await api.get('/leads/lists');
      setContactLists(Array.isArray(rows) ? rows : []);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    loadContactLists();
  }, [loadContactLists]);

  useEffect(() => {
    api.get('/contact-fields')
      .then(rows => setContactFields(Array.isArray(rows) ? rows.filter(f => !f.system) : []))
      .catch(() => setContactFields([]));
  }, []);

  const loadLeads = useCallback(async () => {
    loading.start();
    try {
      const params = buildLeadsQueryParams({ tab, debouncedSearch, statusFilter, interestFilter, listFilter });
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
      notify({ type: 'error', message: e.message || 'Nie udało się wczytać kontaktów.' });
    } finally {
      loading.stop();
    }
  }, [debouncedSearch, statusFilter, interestFilter, listFilter, tab, loading, notify]);

  useEffect(() => {
    loadLeads();
  }, [loadLeads]);

  const visibleIds = useMemo(() => leads.map((l) => l.id), [leads]);

  const customColumns = useMemo(() => {
    const keys = new Set();
    leads.forEach((lead) => {
      Object.keys(lead.custom_data || {}).forEach((key) => keys.add(key));
    });
    contactFields.forEach((field) => keys.add(field.key));

    const labels = new Map(contactFields.map((field) => [field.key, field.label || field.key]));
    return [...keys]
      .sort((a, b) => (labels.get(a) || a).localeCompare(labels.get(b) || b, 'pl'))
      .map((key) => ({
        key,
        id: `custom:${key}`,
        label: labels.get(key) || key,
      }));
  }, [leads, contactFields]);

  const systemColumns = [
    { id: 'name', label: 'Nazwa / imię' },
    { id: 'verification', label: 'Weryfikacja / kampanie' },
    { id: 'campaigns', label: 'Kampanie' },
    { id: 'inbox', label: 'Skrzynka nadawcza' },
    { id: 'enrolled', label: 'Dodano' },
  ];

  const isColumnVisible = (id) => !hiddenColumns.has(id);

  const toggleColumn = (id) => {
    setHiddenColumns((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem('sekaro.contacts.hiddenColumns', JSON.stringify([...next]));
      } catch {
        // ignore storage errors
      }
      return next;
    });
  };

  const visibleColumnCount = useMemo(() => {
    const systemCount = systemColumns.filter((column) => !hiddenColumns.has(column.id)).length;
    const customCount = customColumns.filter((column) => !hiddenColumns.has(column.id)).length;
    return 2 + systemCount + customCount + (tab === TAB_BOUNCED ? 2 : 0);
  }, [customColumns, hiddenColumns, tab]);

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
      `Trwale usunąć ${selected.size} kontaktów? Zostaną usunięte przypisania do kampanii i historia wiadomości tych kontaktów.`,
    );
    if (!ok) return;
    loading.start();
    try {
      const res = await api.post('/leads/bulk-delete', { lead_ids: [...selected] });
      const n = res.deleted ?? selected.size;
      notify({ type: 'success', message: `Usunięto kontakty: ${n}.` });
      await loadLeads();
    } catch (e) {
      notify({ type: 'error', message: e.message || 'Usuwanie nie powiodło się.' });
    } finally {
      loading.stop();
    }
  };

  const handleBulkStatus = async () => {
    if (!selected.size) return;
    const ok = await confirm(
      `Ustawić status „${bulkEnrollmentStatus}” we wszystkich kampaniach dla ${selected.size} kontaktów? Kolejka wysyłki zostanie przeliczona.`,
    );
    if (!ok) return;
    loading.start();
    try {
      await api.post('/leads/bulk-status', { lead_ids: [...selected], enrollment_status: bulkEnrollmentStatus });
      notify({ type: 'success', message: 'Status został zaktualizowany.' });
      await loadLeads();
    } catch (e) {
      notify({ type: 'error', message: e.message || 'Aktualizacja nie powiodła się.' });
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
      notify({ type: 'info', message: 'Wybierz odbite lub niepoprawne kontakty, aby ponownie je zapisać z poprawionym adresem.' });
      return;
    }
    const ok = await confirm(
      `Ponownie zapisać ${targets.length} kontaktów z użyciem wartości „Nowy e-mail”? Status stanie się aktywny, a weryfikacja uruchomi się zgodnie z ustawieniami konta.`,
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
        notify({ type: 'error', message: 'Podaj adres e-mail dla każdego wybranego kontaktu.' });
        return;
      }
      const res = await api.post('/leads/bulk-recover', { items, verify_email: true });
      const n = res.recovered ?? 0;
      const errN = res.errors?.length ?? 0;
      notify({
        type: errN ? 'info' : 'success',
        message: `Rozpoczęto odzyskiwanie ${n} kontaktów.${errN ? ` Pominięto: ${errN} (sprawdź błędy API).` : ''}`,
      });
      await loadLeads();
    } catch (e) {
      notify({ type: 'error', message: e.message || 'Ponowne zapisanie nie powiodło się.' });
    } finally {
      loading.stop();
    }
  };

  const recoverOne = async (lead) => {
    const email = (emailDrafts[lead.id] ?? lead.email).trim();
    if (!email) {
      notify({ type: 'error', message: 'Podaj adres e-mail.' });
      return;
    }
    loading.start();
    try {
      await api.post(`/leads/${lead.id}/recover`, { email, verify_email: true });
      notify({ type: 'success', message: 'Kontakt zaktualizowany. Weryfikacja lub harmonogram zostaną zastosowane zgodnie z ustawieniami konta.' });
      await loadLeads();
    } catch (e) {
      notify({ type: 'error', message: e.message || 'Odzyskiwanie nie powiodło się.' });
    } finally {
      loading.stop();
    }
  };

  const markActiveOne = async (lead) => {
    loading.start();
    try {
      await api.patch(`/leads/${lead.id}`, { enrollment_status: 'active' });
      notify({ type: 'success', message: 'Wszystkie przypisania ustawiono jako aktywne; kolejka została przeliczona.' });
      await loadLeads();
    } catch (e) {
      notify({ type: 'error', message: e.message || 'Aktualizacja nie powiodła się.' });
    } finally {
      loading.stop();
    }
  };

  const exportCsv = async () => {
    const params = buildLeadsQueryParams({ tab, debouncedSearch, statusFilter, interestFilter, listFilter });
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
      notify({ type: 'error', message: e.message || 'Eksport nie powiódł się.' });
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
      setContactImportListName(preview.default_list_name || '');
    } catch (e) {
      notify({ type: 'error', message: e.message || 'Nie udało się odczytać pliku.' });
    } finally {
      setContactImportBusy(false);
    }
  };

  const closeContactImport = (force = false) => {
    if (contactImportBusy && !force) return;
    setContactImportFile(null);
    setContactImportPreview(null);
    setContactImportMapping({});
    setContactImportListName('');
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
        list_name: contactImportListName.trim(),
      });
      notify({
        type: 'success',
        message:
          `Import zakończony: ${res.added || 0} nowych, ${res.updated || 0} zaktualizowanych, ` +
          `${res.skipped_suppressed || 0} na suppression list.`,
      });
      closeContactImport(true);
      await Promise.all([loadLeads(), loadContactLists()]);
    } catch (e) {
      notify({ type: 'error', message: e.message || 'Import nie powiódł się.' });
    } finally {
      setContactImportBusy(false);
    }
  };

  const loadSuppression = async (query = suppressionSearch) => {
    setSuppressionBusy(true);
    try {
      const qs = query.trim() ? `?q=${encodeURIComponent(query.trim())}` : '';
      const rows = await api.get('/leads/suppression' + qs);
      setSuppressionRows(Array.isArray(rows) ? rows : []);
    } catch (e) {
      notify({ type: 'error', message: e.message || 'Nie udało się wczytać listy wykluczeń.' });
    } finally {
      setSuppressionBusy(false);
    }
  };

  const openSuppression = async () => {
    setSuppressionOpen(true);
    await loadSuppression('');
  };

  const addSuppression = async (e) => {
    e.preventDefault();
    const email = suppressionEmail.trim().toLowerCase();
    if (!email) return;
    setSuppressionBusy(true);
    try {
      await api.post('/leads/suppression', {
        email,
        reason: suppressionReason,
        source: 'manual',
        note: '',
      });
      setSuppressionEmail('');
      notify({ type: 'success', message: `${email} dodano do listy wykluczeń.` });
      await loadSuppression('');
      await loadLeads();
    } catch (err) {
      notify({ type: 'error', message: err.message || 'Nie udało się dodać adresu.' });
    } finally {
      setSuppressionBusy(false);
    }
  };

  const removeSuppression = async (row) => {
    const ok = await confirm(
      `Usunąć ${row.email} z suppression list? Istniejące kampanie nie zostaną automatycznie wznowione.`,
    );
    if (!ok) return;
    setSuppressionBusy(true);
    try {
      await api.del(`/leads/suppression/${row.id}`);
      notify({ type: 'success', message: `${row.email} usunięto z listy wykluczeń.` });
      await loadSuppression('');
    } catch (err) {
      notify({ type: 'error', message: err.message || 'Nie udało się usunąć wpisu.' });
    } finally {
      setSuppressionBusy(false);
    }
  };

  const importRecoverCsv = async (file) => {
    const ok = await confirm(
      'Odzyskać kontakty z tego pliku CSV? Serwer odczytuje kolumny id i email (z nagłówka lub pierwsze dwie kolumny).',
    );
    if (!ok) return;
    loading.start();
    try {
      const res = await api.upload('/leads/recover-import?verify_emails=true', file);
      const n = res.recovered ?? 0;
      const errN = res.errors?.length ?? 0;
      notify({
        type: errN ? 'info' : 'success',
        message: `Odzyskano ${n} kontaktów.${errN ? ` Pominięto wiersze: ${errN}.` : ''}`,
      });
      await loadLeads();
    } catch (e) {
      notify({ type: 'error', message: e.message || 'Import nie powiódł się — sprawdź format CSV i identyfikatory.' });
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
          <Button type="button" variant="outline" size="sm" onClick={openSuppression}>
            Suppression list
          </Button>
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

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-gray-500">Lista:</span>
        <select
          aria-label="Filtr listy kontaktów"
          value={listFilter}
          onChange={(e) => setListFilter(e.target.value)}
          className="rounded-md border-gray-300 text-sm"
        >
          <option value="">Wszystkie kontakty</option>
          {contactLists.map((list) => (
            <option key={list.id} value={list.id}>
              {list.name} ({list.member_count})
            </option>
          ))}
        </select>
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
        <span className="text-sm text-gray-500">Reakcja:</span>
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
            Popraw adres e-mail w każdym wierszu, a następnie wybierz <strong className="font-medium">Zapisz i odzyskaj</strong>.
            Zaktualizuje to kontakt we wszystkich kampaniach, ustawi status aktywny i uruchomi weryfikację albo ponowne planowanie.
            Możesz też wyeksportować błędne adresy, poprawić je poza Sekaro i zaimportować CSV z kolumnami <code className="font-mono text-xs">id,email</code>.
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

        <div className="relative">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setColumnsOpen((value) => !value)}
          >
            Kolumny
          </Button>

          {columnsOpen && (
            <div className="absolute right-0 top-full z-40 mt-2 w-72 rounded-lg border border-gray-200 bg-white p-3 shadow-xl">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-800">Widoczne kolumny</span>
                <button
                  type="button"
                  className="text-xs text-teal-600 hover:underline"
                  onClick={() => {
                    const next = new Set();
                    setHiddenColumns(next);
                    try {
                      localStorage.setItem('sekaro.contacts.hiddenColumns', '[]');
                    } catch {
                      // ignore storage errors
                    }
                  }}
                >
                  Pokaż wszystkie
                </button>
              </div>

              <div className="max-h-80 space-y-1 overflow-y-auto">
                <label className="flex items-center gap-2 rounded px-2 py-1.5 text-sm text-gray-400">
                  <input type="checkbox" checked readOnly className="rounded" />
                  E-mail
                  <span className="ml-auto text-[10px] uppercase">stała</span>
                </label>

                {systemColumns.map((column) => (
                  <label key={column.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-gray-50">
                    <input
                      type="checkbox"
                      className="rounded"
                      checked={isColumnVisible(column.id)}
                      onChange={() => toggleColumn(column.id)}
                    />
                    {column.label}
                  </label>
                ))}

                {customColumns.length > 0 && (
                  <>
                    <div className="my-2 border-t border-gray-100" />
                    <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                      Pola własne
                    </div>
                    {customColumns.map((column) => (
                      <label key={column.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-gray-50">
                        <input
                          type="checkbox"
                          className="rounded"
                          checked={isColumnVisible(column.id)}
                          onChange={() => toggleColumn(column.id)}
                        />
                        <span className="min-w-0 truncate" title={column.key}>{column.label}</span>
                      </label>
                    ))}
                  </>
                )}
              </div>
            </div>
          )}
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
              aria-label="Zmień status zaznaczonych kontaktów"
              className="rounded-md border-gray-300 text-sm shadow-sm focus:ring-2 focus:ring-teal-300"
              value={bulkEnrollmentStatus}
              onChange={(e) => setBulkEnrollmentStatus(e.target.value)}
            >
              <option value="active">aktywny</option>
              <option value="contacted">skontaktowano</option>
              <option value="completed">zakończony</option>
              <option value="bounced">odbity</option>
              <option value="unsubscribed">wypisany</option>
              <option value="wrong_person">niewłaściwa osoba</option>
            </select>
            <Button type="button" variant="outline" size="sm" onClick={handleBulkStatus}>
              Zastosuj status
            </Button>
          </div>
          {(tab === TAB_BOUNCED || tab === TAB_ALL) && (
            <Button type="button" variant="default" size="sm" onClick={handleBulkReenroll}>
              Ponownie zapisz (odzyskaj)
            </Button>
          )}
        </Card>
      )}

      <Card className="overflow-x-auto max-w-full min-w-0">
        <div className="px-4 py-2 text-sm text-gray-500 border-b border-gray-100">
          {leads.length} kontakt{leads.length === 1 ? '' : 'ów'}
          {tab === TAB_BOUNCED ? ' (odbite lub niepoprawne)' : ''}
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
                  aria-label="Zaznacz wszystkie kontakty"
                />
              </th>
              <th className="p-2">E-mail</th>
              {isColumnVisible('name') && <th className="p-2">Nazwa / imię</th>}
              {isColumnVisible('verification') && <th className="p-2">Weryfikacja / kampanie</th>}
              {isColumnVisible('campaigns') && <th className="p-2">Kampanie</th>}
              {isColumnVisible('inbox') && <th className="p-2">Skrzynka nadawcza</th>}
              {isColumnVisible('enrolled') && <th className="p-2">Dodano</th>}
              {customColumns.filter((column) => isColumnVisible(column.id)).map((column) => (
                <th key={column.id} className="p-2 min-w-[150px]" title={column.key}>
                  {column.label}
                </th>
              ))}
              {tab === TAB_BOUNCED && <th className="p-2 min-w-[200px]">Nowy e-mail</th>}
              {tab === TAB_BOUNCED && <th className="p-2 w-44">Akcje</th>}
            </tr>
          </thead>
          <tbody>
            {leads.length === 0 ? (
              <tr>
                <td colSpan={visibleColumnCount} className="p-8 text-center text-gray-500">
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
                      aria-label={`Zaznacz ${l.email}`}
                    />
                  </td>
                  <td className="p-2 align-top font-mono text-xs">
                    <Link to={`/leads/${l.id}`} className="text-teal-600 hover:underline">
                      {l.email}
                    </Link>
                  </td>
                  {isColumnVisible('name') && (
                    <td className="p-2 align-top">{l.name || '—'}</td>
                  )}
                  {isColumnVisible('verification') && (
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
                  )}
                  {isColumnVisible('campaigns') && (
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
                  )}
                  {isColumnVisible('inbox') && (
                    <td className="p-2 align-top">
                      <div className="flex flex-col gap-1 max-w-xs">
                        {(l.campaigns || []).map((c) => (
                          <div key={c.campaign_id} className="text-xs">
                            {c.from_inbox_email ? (
                              <span className="font-mono text-gray-700" title={`${c.campaign_name}: wysyłka z ${c.from_inbox_email}`}>
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
                  )}
                  {isColumnVisible('enrolled') && (
                    <td className="p-2 align-top text-gray-600">{formatEnrolled(l.campaigns)}</td>
                  )}
                  {customColumns.filter((column) => isColumnVisible(column.id)).map((column) => {
                    const value = l.custom_data?.[column.key];
                    return (
                      <td key={column.id} className="p-2 align-top text-sm text-gray-700">
                        {value === undefined || value === null || value === '' ? (
                          <span className="text-gray-300">—</span>
                        ) : typeof value === 'object' ? (
                          <span className="font-mono text-xs" title={JSON.stringify(value)}>
                            {JSON.stringify(value)}
                          </span>
                        ) : (
                          <span title={String(value)}>{String(value)}</span>
                        )}
                      </td>
                    );
                  })}
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

      {suppressionOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-xl bg-white shadow-2xl flex flex-col">
            <div className="flex items-center justify-between border-b px-6 py-4">
              <div>
                <h2 className="text-xl font-semibold">Suppression list</h2>
                <p className="text-sm text-gray-500">Adresy, do których Sekaro nigdy nie wyśle wiadomości.</p>
              </div>
              <button type="button" className="text-2xl text-gray-400 hover:text-gray-700" onClick={() => setSuppressionOpen(false)}>×</button>
            </div>

            <div className="p-6 space-y-5 overflow-y-auto">
              <form onSubmit={addSuppression} className="flex flex-wrap gap-2 items-end">
                <div className="flex-1 min-w-[260px]">
                  <label className="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
                  <input
                    type="email"
                    value={suppressionEmail}
                    onChange={(e) => setSuppressionEmail(e.target.value)}
                    className="w-full rounded-md border-gray-300"
                    placeholder="kontakt@example.com"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Powód</label>
                  <select
                    value={suppressionReason}
                    onChange={(e) => setSuppressionReason(e.target.value)}
                    className="rounded-md border-gray-300"
                  >
                    <option value="manual">Ręcznie</option>
                    <option value="unsubscribe">Wypis</option>
                    <option value="complaint">Skarga</option>
                    <option value="bounce">Trwały bounce</option>
                    <option value="other">Inny</option>
                  </select>
                </div>
                <Button type="submit" size="sm" disabled={suppressionBusy}>Dodaj</Button>
              </form>

              <div className="flex gap-2">
                <input
                  value={suppressionSearch}
                  onChange={(e) => setSuppressionSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      loadSuppression(e.currentTarget.value);
                    }
                  }}
                  className="flex-1 rounded-md border-gray-300 text-sm"
                  placeholder="Szukaj adresu…"
                />
                <Button type="button" variant="outline" size="sm" onClick={() => loadSuppression(suppressionSearch)} disabled={suppressionBusy}>
                  Szukaj
                </Button>
              </div>

              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-3 py-2">E-mail</th>
                      <th className="text-left px-3 py-2">Powód</th>
                      <th className="text-left px-3 py-2">Źródło</th>
                      <th className="text-left px-3 py-2">Dodano</th>
                      <th className="w-20"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {suppressionRows.length === 0 ? (
                      <tr><td colSpan="5" className="px-3 py-8 text-center text-gray-400">Brak wpisów.</td></tr>
                    ) : suppressionRows.map((row) => (
                      <tr key={row.id} className="border-t">
                        <td className="px-3 py-2 font-mono text-xs">{row.email}</td>
                        <td className="px-3 py-2">{row.reason}</td>
                        <td className="px-3 py-2">{row.source}</td>
                        <td className="px-3 py-2 text-gray-500">{row.created_at ? new Date(row.created_at).toLocaleDateString() : '—'}</td>
                        <td className="px-3 py-2 text-right">
                          <button type="button" onClick={() => removeSuppression(row)} className="text-xs text-red-600 hover:underline">
                            Usuń
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

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
                        <th className="text-left px-3 py-2">Klucz pola własnego</th>
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
                                <option value="custom">Pole własne</option>
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
                                  placeholder="np. region"
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
                <h3 className="font-semibold text-gray-900 mb-2">Lista kontaktów</h3>
                <input
                  value={contactImportListName}
                  onChange={(e) => setContactImportListName(e.target.value)}
                  className="w-full max-w-lg rounded-md border-gray-300 text-sm"
                  placeholder="np. Mariny Niemcy"
                  maxLength={255}
                />
                <p className="mt-1 text-xs text-gray-500">
                  Jeśli lista już istnieje, kontakty zostaną do niej dopisane. Puste pole oznacza import bez listy.
                </p>
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
