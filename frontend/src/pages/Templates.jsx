import { Link } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';

import { api } from '../api';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { PageFrame, Icon, ErrorNotice, StatePanel, dateTime } from '../redesign/ui';
import SafeEmail from '../redesign/SafeEmail';
import { useNotify } from '../context/NotificationContext';
import { useConfirm } from '../context/ConfirmContext';

function latestVersion(template) {
  return template?.latest_version || template?.versions?.[0] || null;
}

function variableToken(key) {
  return `{{${key}}}`;
}

export default function Templates() {
  const notify = useNotify();
  const confirm = useConfirm();

  const [templates, setTemplates] = useState([]);
  const [fields, setFields] = useState([]);
  const [inboxes, setInboxes] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedTemplate, setSelectedTemplate] = useState(null);

  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [isHtml, setIsHtml] = useState(false);
  const [htmlSourceMode, setHtmlSourceMode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [baseLoading, setBaseLoading] = useState(true);
  const [baseError, setBaseError] = useState(null);
  const [templateQuery, setTemplateQuery] = useState('');
  const [selectedVersionId, setSelectedVersionId] = useState(null);

  const [contactSearch, setContactSearch] = useState('');
  const [contactMatches, setContactMatches] = useState([]);
  const [previewLeadId, setPreviewLeadId] = useState('');
  const [editorMode, setEditorMode] = useState('edit');
  const [preview, setPreview] = useState(null);
  const [previewBusy, setPreviewBusy] = useState(false);

  const [testInboxId, setTestInboxId] = useState('');
  const [testTo, setTestTo] = useState('');
  const [testBusy, setTestBusy] = useState(false);

  const smtpInboxes = useMemo(
    () => (inboxes || []).filter((i) => (i.provider || 'smtp') === 'smtp'),
    [inboxes],
  );

  const loadBase = async () => {
    setBaseLoading(true);
    setBaseError(null);
    try {
      const [tpls, flds, ibxs] = await Promise.all([
        api.get('/templates'),
        api.get('/contact-fields'),
        api.get('/inboxes'),
      ]);
      setTemplates(Array.isArray(tpls) ? tpls : []);
      setFields(Array.isArray(flds) ? flds : []);
      setInboxes(Array.isArray(ibxs) ? ibxs : []);
      if (!testInboxId) {
        const first = (ibxs || []).find((i) => (i.provider || 'smtp') === 'smtp' && !i.paused);
        if (first) setTestInboxId(String(first.id));
      }
    } catch (e) {
      setBaseError(e);
    } finally {
      setBaseLoading(false);
    }
  };

  useEffect(() => {
    loadBase();
  }, []);

  const loadTemplate = async (id) => {
    setBusy(true);
    try {
      const row = await api.get(`/templates/${id}`);
      setSelectedId(row.id);
      setSelectedTemplate(row);
      setName(row.name || '');
      const v = latestVersion(row);
      setSelectedVersionId(v?.id ?? null);
      setSubject(v?.subject || '');
      setBody(v?.body || '');
      setIsHtml(Boolean(v?.is_html));
      setHtmlSourceMode(false);
      setPreview(null);
    } catch (e) {
      notify({ type: 'error', message: e.message || 'Nie udało się wczytać szablonu.' });
    } finally {
      setBusy(false);
    }
  };

  const newTemplate = () => {
    setEditorMode('edit');
    setSelectedId(null);
    setSelectedTemplate(null);
    setSelectedVersionId(null);
    setName('');
    setSubject('');
    setBody('');
    setIsHtml(false);
    setHtmlSourceMode(false);
    setPreview(null);
  };

  const saveTemplate = async () => {
    if (!name.trim()) {
      notify({ type: 'error', message: 'Podaj nazwę szablonu.' });
      return;
    }
    setBusy(true);
    try {
      let row;
      if (!selectedId) {
        row = await api.post('/templates', {
          name: name.trim(),
          subject,
          body,
          is_html: isHtml,
        });
        notify({ type: 'success', message: 'Szablon utworzony.' });
      } else {
        if (selectedTemplate?.name !== name.trim()) {
          await api.patch(`/templates/${selectedId}`, { name: name.trim() });
        }
        row = await api.post(`/templates/${selectedId}/versions`, {
          subject,
          body,
          is_html: isHtml,
        });
        notify({
          type: 'success',
          message: `Zapisano wersję ${row.latest_version?.version || ''}.`,
        });
      }
      setSelectedId(row.id);
      setSelectedTemplate(row);
      setName(row.name || name.trim());
      setSelectedVersionId(latestVersion(row)?.id ?? null);
      await loadBase();
    } catch (e) {
      notify({ type: 'error', message: e.message || 'Nie udało się zapisać szablonu.' });
    } finally {
      setBusy(false);
    }
  };

  const deleteTemplate = async () => {
    if (!selectedId) return;
    const ok = await confirm(`Usunąć szablon „${name}” wraz z historią wersji?`);
    if (!ok) return;
    setBusy(true);
    try {
      await api.del(`/templates/${selectedId}`);
      newTemplate();
      await loadBase();
      notify({ type: 'success', message: 'Szablon usunięty.' });
    } catch (e) {
      notify({ type: 'error', message: e.message || 'Nie udało się usunąć szablonu.' });
    } finally {
      setBusy(false);
    }
  };

  const loadVersion = (versionId) => {
    const version = (selectedTemplate?.versions || []).find((v) => String(v.id) === String(versionId));
    if (!version) return;
    setEditorMode('edit');
    setSelectedVersionId(version.id);
    setSubject(version.subject || '');
    setBody(version.body || '');
    setIsHtml(Boolean(version.is_html));
    setPreview(null);
  };

  const insertVariable = (key, target = 'body') => {
    setEditorMode('edit');
    const token = variableToken(key);
    if (target === 'subject') {
      setSubject((prev) => `${prev}${prev && !prev.endsWith(' ') ? ' ' : ''}${token}`);
    } else {
      setBody((prev) => `${prev}${prev && !prev.endsWith(' ') && !prev.endsWith('\n') ? ' ' : ''}${token}`);
    }
  };

  const searchContacts = async () => {
    if (!contactSearch.trim()) {
      setContactMatches([]);
      return;
    }
    try {
      const rows = await api.get(`/leads?q=${encodeURIComponent(contactSearch.trim())}`);
      setContactMatches(Array.isArray(rows) ? rows.slice(0, 25) : []);
    } catch (e) {
      notify({ type: 'error', message: e.message || 'Nie udało się wyszukać kontaktów.' });
    }
  };

  const renderPreview = async () => {
    setPreviewBusy(true);
    setPreview(null);
    try {
      const row = await api.post('/templates/preview/render', {
        subject,
        body,
        is_html: isHtml,
        lead_id: previewLeadId ? Number(previewLeadId) : null,
      });
      setPreview(row);
    } catch (e) {
      notify({ type: 'error', message: e.message || 'Nie udało się wygenerować podglądu.' });
    } finally {
      setPreviewBusy(false);
    }
  };

  const sendTest = async () => {
    if (!testInboxId || !testTo.trim()) {
      notify({ type: 'error', message: 'Wybierz skrzynkę i podaj adres testowy.' });
      return;
    }
    setTestBusy(true);
    try {
      await api.post('/templates/actions/test-send', {
        inbox_id: Number(testInboxId),
        to_email: testTo.trim(),
        subject,
        body,
        is_html: isHtml,
        lead_id: previewLeadId ? Number(previewLeadId) : null,
      });
      notify({ type: 'success', message: `Wiadomość testowa wysłana do ${testTo.trim()}.` });
    } catch (e) {
      notify({ type: 'error', message: e.message || 'Wysyłka testowa nie powiodła się.' });
    } finally {
      setTestBusy(false);
    }
  };

  return (
    <PageFrame
      className="sk-templates-page"
      title="Szablony wiadomości"
      description="Twórz, wersjonuj i testuj szablony. Dynamiczne zmienne korzystają z pól kontaktów w formacie {{klucz}}."
      actions={<Button type="button" variant="default" onClick={newTemplate} disabled={busy}>Nowy szablon</Button>}
    >
      <ErrorNotice error={baseError} onRetry={loadBase} />
      <div className="sk-template-layout">
        <Card className="sk-template-sidebar overflow-hidden h-fit">
          <div className="border-b px-4 py-3">
            <div className="sk-template-sidebar-title"><Icon name="template" size={18}/><span>Szablony</span></div>
            <input aria-label="Szukaj szablonów" placeholder="Szukaj szablonów…" value={templateQuery} onChange={e => setTemplateQuery(e.target.value)} className="sk-template-search" />
          </div>
          <div className="max-h-[70vh] overflow-y-auto p-2">
            {baseLoading && templates.length === 0 ? (
              <StatePanel icon="refresh" title="Ładowanie szablonów" />
            ) : baseError && templates.length === 0 ? null : templates.length === 0 ? (
              <p className="p-3 text-sm text-gray-400">Brak szablonów.</p>
            ) : templates.filter(t => t.name.toLocaleLowerCase('pl-PL').includes(templateQuery.toLocaleLowerCase('pl-PL'))).length === 0 ? (
              <p className="p-3 text-sm text-gray-400">Brak pasujących szablonów.</p>
            ) : templates.filter(t => t.name.toLocaleLowerCase('pl-PL').includes(templateQuery.toLocaleLowerCase('pl-PL'))).map((tpl) => (
              <button
                key={tpl.id}
                type="button"
                disabled={busy}
                aria-pressed={selectedId === tpl.id}
                onClick={() => { setEditorMode('edit'); loadTemplate(tpl.id); }}
                className={`sk-template-list-item mb-1 w-full rounded-lg px-3 py-2 text-left transition-colors ${
                  selectedId === tpl.id ? 'bg-teal-50 text-teal-800' : 'hover:bg-gray-50 text-gray-700'
                }`}
              >
                <div className="truncate text-sm font-medium">{tpl.name}</div>
                <div className="mt-0.5 text-[11px] text-gray-400">
                  wersja {tpl.latest_version?.version || 1}
                  {tpl.latest_version?.is_html ? ' · HTML' : ' · tekst'}
                </div>
              </button>
            ))}
          </div>
        </Card>

        <div className="sk-template-main min-w-0">
          <div className="sk-template-mode" role="group" aria-label="Widok szablonu">
            {[['edit', 'Edytor'], ['preview', 'Podgląd'], ['test', 'Wysyłka testowa']].map(([value, label]) => <button type="button" key={value} aria-pressed={editorMode === value} onClick={() => setEditorMode(value)}>{label}</button>)}
          </div>
          <Card hidden={editorMode !== 'edit'} className="sk-template-editor p-5 space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-0 flex-1">
                <label className="mb-1 block text-sm font-medium text-gray-700">Nazwa szablonu</label>
                <input
                  aria-label="Nazwa szablonu"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-lg border-gray-300 text-sm"
                  placeholder="Nazwa widoczna tylko w Sekaro"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Temat</label>
              <input
                aria-label="Temat wiadomości"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full rounded-lg border-gray-300 text-sm"
                placeholder="Temat wiadomości"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-gray-700">Format:</span>
              <button
                type="button"
                onClick={() => setIsHtml(false)}
                className={`rounded-full border px-3 py-1 text-xs font-medium ${
                  !isHtml ? 'border-teal-500 bg-teal-500 text-white' : 'border-gray-300 text-gray-600'
                }`}
              >
                Czysty tekst
              </button>
              <button
                type="button"
                onClick={() => setIsHtml(true)}
                className={`rounded-full border px-3 py-1 text-xs font-medium ${
                  isHtml ? 'border-teal-500 bg-teal-500 text-white' : 'border-gray-300 text-gray-600'
                }`}
              >
                HTML
              </button>
              {isHtml && (
                <button
                  type="button"
                  onClick={() => setHtmlSourceMode((v) => !v)}
                  className="ml-auto text-xs text-teal-700 hover:underline"
                >
                  {htmlSourceMode ? 'Edytor wizualny' : 'Kod HTML'}
                </button>
              )}
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Treść</label>
              {!isHtml ? (
                <textarea
                  rows={15}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  className="w-full rounded-lg border-gray-300 font-mono text-sm"
                  placeholder="Napisz wiadomość…"
                />
              ) : htmlSourceMode ? (
                <textarea
                  rows={17}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  className="w-full rounded-lg border-gray-300 font-mono text-sm"
                  placeholder="<p>Treść HTML</p>"
                />
              ) : (
                <div className="template-quill">
                  <ReactQuill theme="snow" value={body} onChange={setBody} />
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-2 border-t pt-4">
              <Button type="button" variant="default" onClick={saveTemplate} disabled={busy}>
                {busy ? 'Przetwarzanie…' : selectedId ? 'Zapisz nową wersję' : 'Utwórz szablon'}
              </Button>
              {selectedId && (
                <Button type="button" variant="destructive" onClick={deleteTemplate} disabled={busy}>
                  Usuń
                </Button>
              )}
            </div>
          </Card>

          <Card hidden={editorMode !== 'preview'} className="sk-template-preview p-5 space-y-4">
            <div>
              <h2 className="font-semibold text-gray-900">Podgląd dla kontaktu</h2>
              <p className="mt-1 text-xs text-gray-500">
                Wybierz realny kontakt, żeby zobaczyć dokładnie jak Sekaro podstawi jego pola.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <input
                value={contactSearch}
                onChange={(e) => setContactSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    searchContacts();
                  }
                }}
                className="min-w-0 flex-1 rounded-lg border-gray-300 text-sm"
                aria-label="Szukaj kontaktu do podglądu"
                placeholder="Szukaj e-maila lub nazwy…"
              />
              <Button type="button" variant="outline" onClick={searchContacts}>Szukaj</Button>
            </div>
            {contactMatches.length > 0 && (
              <select
                aria-label="Kontakt do podglądu"
                value={previewLeadId}
                onChange={(e) => {
                  setPreviewLeadId(e.target.value);
                  setPreview(null);
                }}
                className="w-full rounded-lg border-gray-300 text-sm"
              >
                <option value="">Bez kontaktu</option>
                {contactMatches.map((lead) => (
                  <option key={lead.id} value={lead.id}>
                    {lead.email}{lead.name ? ` · ${lead.name}` : ''}
                  </option>
                ))}
              </select>
            )}
            <Button type="button" variant="outline" onClick={renderPreview} disabled={previewBusy}>
              {previewBusy ? 'Generowanie…' : 'Generuj podgląd'}
            </Button>

            {preview && (
              <div className="space-y-3 rounded-lg border bg-gray-50 p-4">
                {preview.missing_variables?.length > 0 && (
                  <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    Brak wartości: {preview.missing_variables.map((v) => `{{${v}}}`).join(', ')}
                  </div>
                )}
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Temat</div>
                  <div className="mt-1 text-sm font-medium text-gray-800">{preview.subject || '(brak)'}</div>
                </div>
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Treść</div>
                  {preview.is_html ? (
                    <div className="mt-2 rounded-md p-4 text-sm sk-template-email"><SafeEmail html={preview.body} /></div>
                  ) : (
                    <pre className="mt-2 whitespace-pre-wrap rounded-md bg-white p-4 font-sans text-sm">{preview.body}</pre>
                  )}
                </div>
              </div>
            )}
          </Card>

          <Card hidden={editorMode !== 'test'} className="sk-template-test p-5 space-y-3">
            <div>
              <h2 className="font-semibold text-gray-900">Wysyłka testowa</h2>
              <p className="mt-1 text-xs text-gray-500">
                Wiadomość jest renderowana z wybranym powyżej kontaktem, ale wysyłana na wskazany adres testowy.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <select
                aria-label="Skrzynka do wysyłki testowej"
                value={testInboxId}
                onChange={(e) => setTestInboxId(e.target.value)}
                className="rounded-lg border-gray-300 text-sm"
              >
                <option value="">Wybierz skrzynkę SMTP</option>
                {smtpInboxes.map((inbox) => (
                  <option key={inbox.id} value={inbox.id}>
                    {inbox.display_name || inbox.email} · {inbox.email}{inbox.paused ? ' · wstrzymana' : ''}
                  </option>
                ))}
              </select>
              <input
                type="email"
                aria-label="Adres odbiorcy testowego"
                value={testTo}
                onChange={(e) => setTestTo(e.target.value)}
                className="rounded-lg border-gray-300 text-sm"
                placeholder="Adres odbiorcy testowego"
              />
            </div>
            <Button type="button" variant="default" onClick={sendTest} disabled={testBusy}>
              {testBusy ? 'Wysyłanie…' : 'Wyślij test'}
            </Button>
          </Card>
        </div>

        <div className="sk-template-aside">
          <Card className="sk-template-history p-4">
            <h2>Historia wersji</h2>
            <p>Wybór wersji wczytuje ją do edytora. Zapis tworzy nową wersję.</p>
            {selectedTemplate?.versions?.length ? (
              <ol>
                {selectedTemplate.versions.map(v => (
                  <li key={v.id}>
                    <button type="button" aria-pressed={selectedVersionId === v.id} onClick={() => loadVersion(v.id)} disabled={busy}>
                      <span><strong>Wersja {v.version}</strong>{v.id === selectedTemplate.latest_version?.id && <small>Aktualna</small>}</span>
                      <time dateTime={v.created_at}>{dateTime(v.created_at)}</time>
                    </button>
                  </li>
                ))}
              </ol>
            ) : <p>Zapisane wersje szablonu pojawią się tutaj.</p>}
          </Card>
          <Card className="sk-template-variables p-4">
            <div className="mb-3">
              <h2 className="font-semibold text-gray-900">Zmienne</h2>
              <p className="mt-1 text-xs text-gray-500">
                Lista jest dynamiczna. Oprócz pól systemowych widzisz tylko pola utworzone przez Ciebie lub obecne w danych kontaktów.
              </p>
            </div>
            <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
              {fields.map((field) => (
                <div key={`${field.system ? 'system' : field.id || 'detected'}-${field.key}`} className="rounded-lg border p-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-gray-800">{field.label || field.key}</div>
                      <code className="text-[11px] text-teal-700">{variableToken(field.key)}</code>
                    </div>

                  </div>
                  <div className="mt-2 flex gap-1">
                    <button
                      type="button"
                      onClick={() => insertVariable(field.key, 'subject')}
                      className="rounded bg-gray-100 px-2 py-1 text-[11px] text-gray-600 hover:bg-gray-200"
                    >
                      do tematu
                    </button>
                    <button
                      type="button"
                      onClick={() => insertVariable(field.key, 'body')}
                      className="rounded bg-teal-50 px-2 py-1 text-[11px] text-teal-700 hover:bg-teal-100"
                    >
                      do treści
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="sk-template-fields p-4">
            <h2 className="font-semibold text-gray-900">Własne pola kontaktów</h2>
            <p className="mt-1 text-xs text-gray-500">Dodawaj, edytuj i usuwaj pola w Kontaktach. Tutaj są automatycznie dostępne jako zmienne szablonu.</p>
            <Link to="/leads?fields=1" className="sk-btn sk-full-width" style={{marginTop:12}}>Zarządzaj polami</Link>
          </Card>
        </div>
      </div>
    </PageFrame>
  );
}
