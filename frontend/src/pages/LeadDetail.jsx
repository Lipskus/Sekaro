import { useEffect, useState, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { useNotify } from '../context/NotificationContext';
import { useLoading } from '../context/LoadingContext';

function formatDt(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

export default function LeadDetail() {
  const { id } = useParams();
  const notify = useNotify();
  const loading = useLoading();
  const [lead, setLead] = useState(null);
  const [fields, setFields] = useState([]);
  const [editName, setEditName] = useState('');
  const [editCustom, setEditCustom] = useState({});
  const [savingFields, setSavingFields] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    loading.start();
    setError(null);
    try {
      const [l, fieldRows] = await Promise.all([
        api.get(`/leads/${id}`),
        api.get('/contact-fields'),
      ]);
      setLead(l);
      setFields(Array.isArray(fieldRows) ? fieldRows : []);
      setEditName(l.name || '');
      setEditCustom({ ...(l.custom_data || {}) });
    } catch (e) {
      setError(e.message || 'Nie udało się wczytać kontaktu.');
      notify({ type: 'error', message: 'Nie udało się wczytać kontaktu.' });
    } finally {
      loading.stop();
    }
  }, [id, loading, notify]);

  useEffect(() => {
    load();
  }, [load]);

  const saveContactFields = async () => {
    if (!lead) return;
    setSavingFields(true);
    try {
      const cleaned = {};
      Object.entries(editCustom || {}).forEach(([key, value]) => {
        const text = value == null ? '' : String(value);
        if (text !== '') cleaned[key] = text;
      });
      const updated = await api.patch(`/leads/${lead.id}`, {
        name: editName,
        custom_data: cleaned,
      });
      setLead(updated);
      setEditName(updated.name || '');
      setEditCustom({ ...(updated.custom_data || {}) });
      notify({ type: 'success', message: 'Dane kontaktu zapisane.' });
    } catch (e) {
      notify({ type: 'error', message: e.message || 'Nie udało się zapisać danych kontaktu.' });
    } finally {
      setSavingFields(false);
    }
  };

  if (error && !lead) {
    return (
      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-8">
        <h1 className="text-2xl font-semibold mb-4">Kontakt</h1>
        <p className="text-red-600">{error}</p>
        <Button as={Link} to="/leads" variant="outline">Wróć do kontaktów</Button>
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto p-8">
        <p className="text-gray-500">Wczytywanie…</p>
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-sm text-gray-500 mb-1">
            <Link to="/leads" className="text-teal-500 hover:underline">Kontakty</Link>
            <span className="mx-2">/</span>
            <span className="font-mono text-xs">#{lead.id}</span>
          </div>
          <h1 className="text-2xl font-semibold">{lead.name || lead.email}</h1>
          <p className="text-gray-600 mt-1 font-mono text-sm">{lead.email}</p>
        </div>
        <Button as={Link} to="/unibox" variant="outline" size="sm">
          Otwórz Odebrane
        </Button>
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        {lead.email_verification_status && (
          <span className="bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-100 rounded-full px-2 py-0.5">
            verify: {lead.email_verification_status}
          </span>
        )}
        {lead.provider && (
          <span className="bg-slate-100 text-slate-700 rounded-full px-2 py-0.5 text-xs">
            {lead.provider}
          </span>
        )}
      </div>

      <Card className="p-4">
        <h2 className="text-lg font-semibold mb-3 border-b border-gray-200 dark:border-gray-700 pb-2">
          Kampanie
        </h2>
        {lead.campaigns?.length ? (
          <ul className="space-y-3">
            {lead.campaigns.map((c) => (
              <li
                key={c.campaign_id}
                className="flex flex-col sm:flex-row sm:flex-wrap sm:items-baseline sm:justify-between gap-2 border-b border-gray-100 dark:border-gray-700 pb-2 last:border-0"
              >
                <div>
                  <Link
                    to={`/campaigns/${c.campaign_id}#leads`}
                    className="text-teal-600 hover:underline font-medium"
                  >
                    {c.campaign_name}
                  </Link>
                  <span className="text-xs text-gray-400 font-mono ml-2">{c.campaign_public_id}</span>
                </div>
                <div className="text-xs text-gray-600 flex flex-wrap gap-2">
                  <span className="rounded-full bg-gray-100 px-2 py-0.5">status: {c.status || 'active'}</span>
                  {c.interest && (
                    <span className="rounded-full bg-violet-50 text-violet-800 px-2 py-0.5">
                      interest: {c.interest}
                    </span>
                  )}
                  <span className="rounded-full bg-gray-50 px-2 py-0.5">
                    opened {c.opened ? 'yes' : 'no'} · clicked {c.clicked ? 'yes' : 'no'} · replied{' '}
                    {c.replied ? 'yes' : 'no'}
                  </span>
                  {c.sending_paused && (
                    <span className="rounded-full bg-amber-100 text-amber-900 px-2 py-0.5">paused</span>
                  )}
                </div>
                <span className="text-sm text-gray-500">enrolled {formatDt(c.enrolled_at)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-gray-500 text-sm">Kontakt nie jest przypisany do żadnej kampanii.</p>
        )}
      </Card>

      <Card className="p-4">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-gray-200 pb-3 dark:border-gray-700">
          <div>
            <h2 className="text-lg font-semibold">Dane kontaktu i zmienne</h2>
            <p className="mt-1 text-xs text-gray-500">
              Wartości poniżej są używane przez szablony. Pola tworzysz samodzielnie w sekcji Szablony.
            </p>
          </div>
          <Button type="button" size="sm" variant="default" onClick={saveContactFields} disabled={savingFields}>
            {savingFields ? 'Zapisywanie…' : 'Zapisz dane'}
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">E-mail</label>
            <input
              value={lead.email || ''}
              readOnly
              className="w-full rounded-md border-gray-300 bg-gray-100 font-mono text-sm text-gray-600"
            />
            <code className="mt-1 block text-[11px] text-teal-700">{'{{email}}'}</code>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Nazwa / imię</label>
            <input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="w-full rounded-md border-gray-300 text-sm"
            />
            <code className="mt-1 block text-[11px] text-teal-700">{'{{name}}'}</code>
          </div>

          {fields.filter((field) => !field.system).map((field) => (
            <div key={field.key}>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                {field.label || field.key}
              </label>
              <input
                value={editCustom[field.key] ?? ''}
                onChange={(e) =>
                  setEditCustom((prev) => ({ ...prev, [field.key]: e.target.value }))
                }
                className="w-full rounded-md border-gray-300 text-sm"
              />
              <div className="mt-1 flex items-center gap-2">
                <code className="text-[11px] text-teal-700">{`{{${field.key}}}`}</code>
                {!field.defined && (
                  <span className="text-[10px] text-gray-400">wykryte w danych</span>
                )}
              </div>
            </div>
          ))}
        </div>

        {fields.filter((field) => !field.system).length === 0 && (
          <p className="mt-3 text-sm text-gray-500">
            Nie masz jeszcze własnych pól. Utwórz je w <Link to="/templates" className="text-teal-600 hover:underline">Szablonach</Link>.
          </p>
        )}
      </Card>

      <Card className="p-4 overflow-auto">
        <h2 className="text-lg font-semibold mb-3 border-b border-gray-200 dark:border-gray-700 pb-2">
          Historia
        </h2>
        <p className="text-xs text-gray-500 mb-3">
          Outbound sends and inbound messages we can associate (mirrored mail + reply markers). Full threads: Unibox.
        </p>
        {lead.interactions?.length ? (
          <ul className="space-y-3 text-sm">
            {lead.interactions.map((row, i) => (
              <li
                key={`${row.at}-${row.kind}-${i}`}
                className={`border-l-2 pl-3 ${
                  row.direction === 'outbound' ? 'border-teal-400' : 'border-violet-400'
                }`}
              >
                <div className="font-medium">
                  {row.direction === 'outbound' ? 'Wysłano' : 'Odebrano'}{' '}
                  {row.kind && row.kind !== 'sent' ? `· ${row.kind.replace(/_/g, ' ')}` : ''}
                </div>
                <div className="text-gray-500 text-xs mt-0.5">
                  {row.campaign_name && <span>{row.campaign_name} · </span>}
                  {row.subject && <span className="font-medium text-gray-600">{row.subject} · </span>}
                  {formatDt(row.at)}
                </div>
                {row.snippet && (
                  <p className="text-xs text-gray-600 mt-1 line-clamp-3">{row.snippet}</p>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-gray-500 text-sm">Brak historii kontaktu.</p>
        )}
      </Card>
    </div>
  );
}
