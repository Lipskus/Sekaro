import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import DOMPurify from 'dompurify';
import EmailContent from '../components/EmailContent';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { useNotify } from '../context/NotificationContext';
import { useUniboxNotifications } from '../context/UniboxNotificationsContext';
import { buildHtmlReply, escapeHtml, formatAttributionDate } from '../utils/emailQuote';

const PAGE_SIZE = 25;
const OLDER_WINDOW_DAYS = 7;

async function uniboxRequest(path, options = {}) {
  // all unibox endpoints now live under /api/unibox on the server
  const res = await fetch(`/api${path}`, options);
  if (!res.ok) {
    const text = await res.text();
    const err = new Error(text || res.statusText);
    err.status = res.status;
    throw err;
  }

  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error('Nieoczekiwany typ odpowiedzi z API skrzynki. Sprawdź routing /api/unibox.');
  }
  return res.json();
}

function formatDateTime(value) {
  if (!value) return 'Nieznane';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return value;
  return dt.toLocaleString();
}

function extractEmailAddress(headerValue) {
  if (!headerValue) return '';
  const angleMatch = headerValue.match(/<([^>]+)>/);
  if (angleMatch?.[1]) return angleMatch[1].trim().toLowerCase();

  const emailMatch = headerValue.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return emailMatch?.[0]?.trim().toLowerCase() || '';
}

function makeReplySubject(subject) {
  const clean = (subject || '').trim();
  if (!clean) return '';
  return /^re:/i.test(clean) ? clean : `Re: ${clean}`;
}

/** Extract display name from a "Name <email>" header value. */
function extractFromName(headerValue) {
  if (!headerValue) return '';
  const angleMatch = headerValue.match(/^"?([^"<]*?)"?\s*<[^>]+>/);
  if (angleMatch?.[1]?.trim()) return angleMatch[1].trim();
  // fall back to the part before the @ sign
  return headerValue.split('@')[0] || headerValue;
}

/**
 * Build the `originalEmail` object from the last received message in the thread.
 * This is fed into buildHtmlReply / buildPlainTextReply.
 */
function buildOriginalEmailFromMsg(msg) {
  if (!msg) return null;
  return {
    fromName: extractFromName(msg.from || ''),
    fromAddress: extractEmailAddress(msg.from || ''),
    date: msg.timestamp ? new Date(msg.timestamp) : new Date(),
    plainBody: msg.body_plain || msg.snippet || '',
    // If no HTML body available, wrap the plain text so quoting still looks right
    htmlBody: msg.body_html || `<div dir="ltr">${escapeHtml(msg.body_plain || msg.snippet || '')}</div>`,
  };
}

function buildHtmlDoc(html) {
  const safeHtml = DOMPurify.sanitize(html || '', {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'textarea', 'select', 'link', 'meta', 'base'],
  });
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'none'; img-src data: blob: https:; style-src 'unsafe-inline'; font-src data: https:;"
    />
    <style>
      body { font-family: Figtree, sans-serif; margin: 0; padding: 10px; color: #111827; }
      img { max-width: 100%; height: auto; }
      pre { white-space: pre-wrap; }
    </style>
  </head>
  <body>${safeHtml}</body>
</html>`;
}

// helper used when rendering HTML messages outside an iframe
function sanitizeHtmlContent(html) {
  return DOMPurify.sanitize(html || '', {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'textarea', 'select', 'link', 'meta', 'base'],
  });
}

export default function Unibox() {
  const notify = useNotify();
  const { refresh: refreshNotifications } = useUniboxNotifications();
  const [searchParams, setSearchParams] = useSearchParams();

  const [leadsOnly, setLeadsOnly] = useState(true);
  const [leadStatusFilter, setLeadStatusFilter] = useState(''); // '' = all statuses
  const [conversations, setConversations] = useState([]);
  const [total, setTotal] = useState(0);
  // pagination state used for incremental loading only (infinite scroll)
  const [page, setPage] = useState(1);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState('');

  const [selectedThread, setSelectedThread] = useState(null);
  const [threadLoading, setThreadLoading] = useState(false);
  const [threadError, setThreadError] = useState('');

  const [compose, setCompose] = useState({
    to_email: '',
    subject: '',
    body: '',
    originalEmail: null, // { fromName, fromAddress, date, plainBody, htmlBody }
    includeQuote: false,
  });
  const [sending, setSending] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [initialListSyncLoading, setInitialListSyncLoading] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [autoSyncAttempted, setAutoSyncAttempted] = useState(false);
  // view mode for each message is now determined automatically based on available content (html vs plain)
  const [replyOpen, setReplyOpen] = useState(false);
  const listRequestInFlightRef = useRef(false);
  const sseRefreshTimerRef = useRef(null);
  const threadScrollRef = useRef(null);
  const listScrollRef = useRef(null); // reference for conversation list container

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / PAGE_SIZE)), [total]);

  const LEAD_STATUSES = [
    { value: '', label: 'All statuses' },
    { value: 'active', label: 'Active' },
    { value: 'contacted', label: 'Contacted' },
    { value: 'completed', label: 'Completed' },
    { value: 'replied', label: 'Replied' },
    { value: 'unsubscribed', label: 'Unsubscribed' },
    { value: 'bounced', label: 'Bounced' },
    { value: 'interested', label: 'Interested' },
    { value: 'not_interested', label: 'Not Interested' },
    { value: 'out_of_office', label: 'Out of Office' },
    { value: 'wrong_person', label: 'Wrong Person' },
    { value: 'auto_reply', label: 'Auto Reply' },
  ];

  const STATUS_COLORS = {
    active: 'bg-blue-50 text-blue-700 border-blue-200',
    contacted: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    completed: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    replied: 'bg-green-50 text-green-700 border-green-200',
    unsubscribed: 'bg-gray-100 text-gray-600 border-gray-300',
    bounced: 'bg-red-50 text-red-600 border-red-200',
    interested: 'bg-teal-50 text-teal-700 border-teal-200',
    not_interested: 'bg-orange-50 text-orange-700 border-orange-200',
    out_of_office: 'bg-sky-50 text-sky-700 border-sky-200',
    wrong_person: 'bg-purple-50 text-purple-700 border-purple-200',
    auto_reply: 'bg-slate-50 text-slate-600 border-slate-200',
  };

  // load one page of conversations.  when `append` is true we merge the
  // results onto the existing list, otherwise we replace the current
  // conversations (used for initial load and refreshing).
  const loadConversations = useCallback(
    async ({ page: requestedPage = 1, silent = false, append = false } = {}) => {
      if (listRequestInFlightRef.current) return;
      listRequestInFlightRef.current = true;
      if (!silent) {
        setListLoading(true);
        setListError('');
      }
      try {
        const data = await uniboxRequest(
          `/unibox?page=${requestedPage}&page_size=${PAGE_SIZE}&leads_only=${leadsOnly}${leadStatusFilter ? `&lead_status=${encodeURIComponent(leadStatusFilter)}` : ''}`,
        );
        const items = data?.items || [];
        setTotal(data?.total || 0);
        if (append) {
          setConversations((prev) => [...prev, ...items]);
        } else {
          setConversations(items);
        }
        setPage(requestedPage);
      } catch (err) {
        if (!silent) {
          setListError(err.message || 'Failed to load conversations');
        }
      } finally {
        if (!silent) {
          setListLoading(false);
        }
        listRequestInFlightRef.current = false;
      }
    },
    [leadsOnly, leadStatusFilter],
  );

  const loadThread = useCallback(async (threadId, inboxId) => {
    setThreadLoading(true);
    setThreadError('');
    try {
      const params = new URLSearchParams();
      if (inboxId) params.set('inbox_id', String(inboxId));
      const data = await uniboxRequest(`/unibox/threads/${encodeURIComponent(threadId)}?${params.toString()}`);
      setSelectedThread(data);
      // update URL so the conversation is reflected in the address bar
      const newParams = { thread: threadId };
      if (inboxId != null && inboxId !== '') newParams.inbox = String(inboxId);
      setSearchParams(newParams);

      // Mark thread as read if it had an unread lead reply.
      if (inboxId) {
        try {
          await uniboxRequest(
            `/unibox/threads/${encodeURIComponent(threadId)}/mark-read?inbox_id=${inboxId}`,
            { method: 'POST' },
          );
          // Update unread flag locally (optimistic) so UI reacts immediately.
          setConversations(prev =>
            prev.map(c =>
              c.thread_id === threadId && c.inbox_id === Number(inboxId)
                ? { ...c, unread_lead_reply: false }
                : c,
            ),
          );
          refreshNotifications();
        } catch {
          // mark-read failure is non-critical; ignore
        }
      }

      const messages = data?.messages || [];
      const lastReceived = [...messages].reverse().find(m => m.direction === 'received');
      const fallback = messages[messages.length - 1];
      const replyTo = extractEmailAddress(lastReceived?.from || fallback?.from || '');
      const originalEmail = buildOriginalEmailFromMsg(lastReceived || fallback || null);
      setCompose({
        to_email: replyTo,
        subject: makeReplySubject(data?.subject || ''),
        body: '',
        originalEmail,
        includeQuote: Boolean(originalEmail),
      });

      // no explicit view mode state needed; rendering will choose based on msg fields
      setReplyOpen(false);
    } catch (err) {
      setThreadError(err.message || 'Failed to load thread');
      setSelectedThread(null);
      // clear URL on error/none
      setSearchParams({});
    } finally {
      setThreadLoading(false);
    }
  }, [setSearchParams, refreshNotifications]);

  const loadSyncStatus = useCallback(async ({ silent = false } = {}) => {
    try {
      const status = await uniboxRequest('/unibox/status');
      setInitialListSyncLoading(Boolean(status?.initial_list_sync_in_progress));
    } catch (err) {
      if (!silent) {
        notify({ type: 'error', message: err.message || 'Failed to load sync status.' });
      }
    }
  }, [notify]);

  useEffect(() => {
    // initial load, clear any previously held entries
    loadConversations({ page: 1 });
    loadSyncStatus({ silent: true });
  }, [loadConversations, loadSyncStatus]);

  // monitor conversation list scrolling and load more pages lazily
  useEffect(() => {
    const el = listScrollRef.current;
    if (!el) return;
    const onScroll = () => {
      if (listLoading || page >= totalPages) return;
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 50) {
        // nearing bottom, request next page
        const next = page + 1;
        if (next <= totalPages) {
          loadConversations({ page: next, append: true });
        }
      }
    };
    el.addEventListener('scroll', onScroll);
    return () => el.removeEventListener('scroll', onScroll);
  }, [listLoading, page, totalPages, loadConversations]);

  // load thread from query params when component mounts or when params change
  useEffect(() => {
    const thread = searchParams.get('thread');
    const inbox = searchParams.get('inbox');
    if (thread) {
      // avoid unnecessary reloads if we already have the same thread selected
      if (
        !selectedThread ||
        selectedThread.thread_id !== thread ||
        String(selectedThread.inbox_id) !== inbox
      ) {
        loadThread(thread, inbox || undefined);
      }
    } else if (selectedThread) {
      // clear selection when param removed
      setSelectedThread(null);
    }
  }, [searchParams, loadThread, selectedThread]);

  const triggerSync = useCallback(async () => {
    setSyncing(true);
    try {
      const res = await uniboxRequest('/unibox/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if ((res?.queued || 0) <= 0) {
        // notify({ type: 'error', message: 'No inboxes available for sync.' });
      } else {
        // notify({ type: 'success', message: `Sync queued for ${res.queued} inbox(es).` });
        await loadSyncStatus({ silent: true });
      }
    } catch (err) {
      notify({ type: 'error', message: err.message || 'Nie udało się uruchomić synchronizacji.' });
    } finally {
      setSyncing(false);
    }
  }, [loadSyncStatus, notify]);

  const triggerLoadOlder = useCallback(async () => {
    setLoadingOlder(true);
    try {
      const body = {
        window_days: OLDER_WINDOW_DAYS,
        inbox_id: selectedThread?.inbox_id || null,
      };
      const res = await uniboxRequest('/unibox/load-more', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if ((res?.queued || 0) <= 0) {
        notify({ type: 'error', message: 'Brak skrzynek dostępnych do synchronizacji starszych wiadomości.' });
      } else {
        const scopeMsg = selectedThread?.inbox_id ? 'selected inbox' : 'all inboxes';
        notify({
          type: 'success',
          message: `Wczytywanie starszych wiadomości (${OLDER_WINDOW_DAYS} dni) dla ${scopeMsg}.`,
        });
      }
    } catch (err) {
      notify({ type: 'error', message: err.message || 'Failed to load older mail.' });
    } finally {
      setLoadingOlder(false);
    }
  }, [notify, selectedThread?.inbox_id]);

  useEffect(() => {
    if (!listLoading && !listError && conversations.length === 0 && !autoSyncAttempted) {
      setAutoSyncAttempted(true);
      triggerSync();
    }
  }, [autoSyncAttempted, conversations.length, listError, listLoading, triggerSync]);

  useEffect(() => {
    if (!initialListSyncLoading) return undefined;
    const timer = setInterval(() => {
      loadConversations({ page: 1, silent: true });
      loadSyncStatus({ silent: true });
    }, 2000);
    return () => clearInterval(timer);
  }, [initialListSyncLoading, loadConversations, loadSyncStatus]);

  useEffect(() => {
    const source = new EventSource('/api/unibox/events');

    const onUpdate = () => {
      if (sseRefreshTimerRef.current) return;
      sseRefreshTimerRef.current = setTimeout(() => {
        sseRefreshTimerRef.current = null;
        loadConversations({ silent: true });
        if (selectedThread?.thread_id && selectedThread?.inbox_id) {
          loadThread(selectedThread.thread_id, selectedThread.inbox_id);
        }
      }, 1000);
    };

    const onSyncStatus = (evt) => {
      try {
        const data = JSON.parse(evt.data || '{}');
        if (data?.phase === 'initial-list') {
          setInitialListSyncLoading(Boolean(data?.in_progress));
          if (data?.in_progress) {
            loadConversations({ page: 1, silent: true });
          }
        } else {
          loadSyncStatus({ silent: true });
        }
      } catch {
        loadSyncStatus({ silent: true });
      }
    };

    source.addEventListener('unibox.thread.updated', onUpdate);
    source.addEventListener('unibox.sync.status', onSyncStatus);
    // When a lead replies, refresh conversations so the unread thread pins to top.
    source.addEventListener('unibox.notification', () => {
      loadConversations({ silent: true });
    });
    source.onerror = () => {
      // Keep the EventSource open so the browser can reconnect automatically.
    };

    return () => {
      source.removeEventListener('unibox.thread.updated', onUpdate);
      source.removeEventListener('unibox.sync.status', onSyncStatus);
      source.removeEventListener('unibox.notification', () => {});
      source.close();
      if (sseRefreshTimerRef.current) {
        clearTimeout(sseRefreshTimerRef.current);
        sseRefreshTimerRef.current = null;
      }
    };
  }, [loadConversations, loadSyncStatus, loadThread, selectedThread?.inbox_id, selectedThread?.thread_id]);

  useEffect(() => {
    if (!replyOpen || !threadScrollRef.current) return;
    threadScrollRef.current.scrollTo({
      top: threadScrollRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [replyOpen, selectedThread?.thread_id]);

  const sendReply = async (e) => {
    e.preventDefault();
    if (!selectedThread) return;
    if (!compose.to_email.trim()) {
      notify({ type: 'error', message: 'Reply target email is required.' });
      return;
    }

    let finalBody;
    let finalIsHtml;

    if (compose.includeQuote && compose.originalEmail) {
      // Build proper Gmail-style HTML + plain-text reply with quoting
      const replyHtml = `<div dir="ltr">${escapeHtml(compose.body).replace(/\n/g, '<br>')}</div>`;
      finalBody = buildHtmlReply(replyHtml, compose.originalEmail.htmlBody, compose.originalEmail);
      finalIsHtml = true;
    } else {
      finalBody = compose.body;
      finalIsHtml = false;
    }

    setSending(true);
    try {
      await uniboxRequest('/unibox/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inbox_id: selectedThread.inbox_id,
          to_email: compose.to_email.trim(),
          subject: compose.subject,
          body: finalBody,
          thread_id: selectedThread.thread_id,
          is_html: finalIsHtml,
        }),
      });
      notify({ type: 'success', message: 'Odpowiedź została wysłana.' });
      setCompose(c => ({ ...c, body: '' }));
      setReplyOpen(false);
      await loadThread(selectedThread.thread_id, selectedThread.inbox_id);
      await loadConversations({ silent: true });
    } catch (err) {
      notify({ type: 'error', message: err.message || 'Nie udało się wysłać odpowiedzi.' });
    } finally {
      setSending(false);
    }
  };

  const { count: unreadCount } = useUniboxNotifications();

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-8">
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold">Odebrane</h1>
          {unreadCount > 0 && (
            <span className="inline-flex items-center justify-center h-6 min-w-6 px-1.5 rounded-full bg-red-500 text-white text-xs font-bold">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </div>
          <span className="text-sm text-gray-500">Wiadomości i odpowiedzi</span>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 flex-1 min-h-0">
        <Card className="xl:col-span-1 flex flex-col min-h-0 overflow-hidden">
          <div className="flex items-center justify-between border-b border-gray-200 pb-3 mb-3">
            <h2 className="font-semibold">Konwersacje</h2>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">{total} łącznie</span>
              {/* Leads-only filter toggle */}
              <button
                type="button"
                onClick={() => setLeadsOnly(v => !v)}
                title={leadsOnly ? 'Showing lead conversations only — click to show all' : 'Show lead conversations only'}
                className={`flex items-center gap-1 text-xs rounded-full px-2.5 py-1 border transition-colors ${
                  leadsOnly
                    ? 'bg-teal-600 text-white border-teal-600 hover:bg-teal-700'
                    : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                }`}
              >
                <span>{leadsOnly ? 'Kontakty' : 'Wszystkie'}</span>
              </button>
              {/* Lead status filter */}
              <select
                value={leadStatusFilter}
                onChange={e => setLeadStatusFilter(e.target.value)}
                className="text-xs border rounded-full px-2 py-1 bg-white text-gray-600 focus:outline-none focus:ring-1 focus:ring-teal-300"
              >
                {LEAD_STATUSES.map(s => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
              <Button variant="outline" size="sm" onClick={triggerSync} disabled={syncing}>
                {syncing ? 'Synchronizacja…' : 'Synchronizuj'}
              </Button>
            </div>
          </div>

          {listLoading && <p className="text-sm text-gray-500">Wczytywanie konwersacji...</p>}
          {initialListSyncLoading && (
            <p className="text-sm text-teal-700">
              Trwa pierwsza synchronizacja listy konwersacji...
            </p>
          )}
          {listError && <p className="text-sm text-red-600">{listError}</p>}
          {!listLoading && !listError && conversations.length === 0 && (
            <p className="text-sm text-gray-500">
              {leadsOnly
                ? 'Brak konwersacji z kontaktami. Odpowiedzi pojawią się tutaj.'
                : 'Brak zsynchronizowanych konwersacji. Pierwsza synchronizacja obejmuje ostatnie 7 dni.'}
            </p>
          )}

          <div ref={listScrollRef} className="space-y-2 overflow-y-auto pr-1 flex-1 min-h-0">
            {conversations.map((item) => {
              const isActive = selectedThread?.thread_id === item.thread_id && selectedThread?.inbox_id === item.inbox_id;
              const isUnread = Boolean(item.unread_lead_reply);
              const toUrl = `/unibox?thread=${encodeURIComponent(item.thread_id)}${item.inbox_id ? `&inbox=${item.inbox_id}` : ''}`;
              return (
                <Link
                  key={`${item.inbox_id}-${item.thread_id}`}
                  to={toUrl}
                  className={`w-full block text-left p-3 rounded border no-underline hover:no-underline ${
                    isActive
                      ? 'border-teal-400 bg-teal-50'
                      : isUnread
                      ? 'border-red-300 bg-red-50 hover:bg-red-100/60'
                      : 'border-gray-200 hover:bg-teal-50/30'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="text-xs text-gray-500 truncate">{item.inbox_account || item.gmail_account}</div>
                    <div className="flex items-center gap-1.5 shrink-0 ml-1">
                      {item.lead_status && (
                        <span className={`text-[10px] border rounded-full px-1.5 py-0.5 font-medium ${STATUS_COLORS[item.lead_status] || 'bg-gray-100 text-gray-600 border-gray-300'}`}>
                          {item.lead_status.replace(/_/g, ' ')}
                        </span>
                      )}
                      {isUnread && (
                        <span className="h-2 w-2 rounded-full bg-red-500" title="Nieprzeczytana odpowiedź od kontaktu" />
                      )}
                    </div>
                  </div>
                  <div className={`truncate ${isUnread ? 'font-semibold text-gray-900' : 'font-medium'}`}>
                    {item.subject || '(bez tematu)'}
                  </div>
                  {item.lead_email && (
                    <div className="text-xs text-gray-500 truncate">→ {item.lead_email}</div>
                  )}
                  <div className="text-sm text-gray-600 truncate">{item.last_message_snippet || ''}</div>
                  <div className="text-xs text-gray-400 mt-1">{formatDateTime(item.timestamp)}</div>
                </Link>
              );
            })}
            {/* show older button at bottom of scrollable list */}
            <div className="flex justify-center py-2">
              <Button variant="outline" size="sm" onClick={triggerLoadOlder} disabled={loadingOlder}>
                {loadingOlder ? 'Wczytywanie starszych...' : 'Pokaż starsze'}
              </Button>
            </div>
          </div>
        </Card>

        <Card className="xl:col-span-2 flex flex-col min-h-0 overflow-hidden">
          {!selectedThread && !threadLoading && (
            <div className="text-gray-500 text-sm flex-1">Wybierz konwersację, aby zobaczyć wiadomości i odpowiedzieć.</div>
          )}
          {threadLoading && <div className="text-gray-500 text-sm">Wczytywanie wątku...</div>}
          {threadError && <div className="text-red-600 text-sm">{threadError}</div>}

          {selectedThread && !threadLoading && (
            <>
              <div className="border-b border-gray-200 pb-3 mb-3">
                <h2 className="text-lg font-semibold truncate">{selectedThread.subject || '(bez tematu)'}</h2>
                <p className="text-xs text-gray-500">
                  Skrzynka: {selectedThread.inbox_account || selectedThread.gmail_account} | Ostatnia aktualizacja: {formatDateTime(selectedThread.last_message_timestamp)}
                </p>
              </div>

              <div ref={threadScrollRef} className="flex-1 min-h-0 overflow-y-auto pr-1">
                <div className="flex flex-col gap-4 pb-1">
                  {(selectedThread.messages || []).map((msg) => (
                    <article
                      key={msg.message_id}
                      className={`p-3 rounded border ${
                        msg.direction === 'sent'
                          ? 'bg-teal-50 border-teal-200'
                          : 'bg-white border-gray-200'
                      }`}
                    >
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                          <span className="text-xs uppercase tracking-wide font-semibold text-gray-600">
                            {msg.direction === 'sent' ? 'Wysłano' : 'Odebrano'}
                          </span>
                          <span className="text-xs text-gray-500">{formatDateTime(msg.timestamp)}</span>
                        </div>
                        <div className="text-xs text-gray-500 mb-2">
                          Od: {msg.from || '-'} | Do: {msg.to || '-'}
                        </div>
                        {msg.body_html && msg.body_html.trim() ? (
                          <div className="w-full bg-white border border-gray-200 rounded min-h-[220px] overflow-auto">
                            <EmailContent html={msg.body_html} stripTracking />
                          </div>
                        ) : (
                          <div className="text-sm whitespace-pre-wrap break-words">
                            {msg.body_plain || msg.snippet || '(brak treści wiadomości)'}
                          </div>
                        )}
                    </article>
                  ))}

                  {replyOpen && (
                    <form onSubmit={sendReply} className="rounded-2xl border border-gray-200 bg-gradient-to-b from-white to-gray-50 p-4 shadow-sm">
                      <div className="flex items-center justify-between mb-3 gap-2">
                        <h3 className="font-semibold">Odpowiedź</h3>
                        <span className="text-xs text-gray-500 truncate">Do {compose.to_email || '(nieznany odbiorca)'}</span>
                      </div>
                      <textarea
                        value={compose.body}
                        onChange={e => setCompose(c => ({ ...c, body: e.target.value }))}
                        className="w-full min-h-[180px] resize-y rounded-xl border border-gray-300 shadow-sm focus:ring-teal-500 focus:border-teal-500 p-2 text-sm"
                        placeholder="Napisz odpowiedź..."
                        required
                      />

                      {/* Gmail-style quoted message — collapsed, with ✕ to remove */}
                      {compose.originalEmail && (
                        <div className="mt-2">
                          {compose.includeQuote ? (
                            <div className="flex items-start gap-2">
                              {/* The "..." toggle button — mirrors Gmail's look */}
                              <button
                                type="button"
                                className="mt-0.5 inline-flex items-center justify-center w-7 h-4 bg-[#f1f3f4] hover:bg-[#e8eaed] border border-[#dadce0] rounded-[3px] text-[#444746] text-sm font-bold leading-none cursor-pointer select-none flex-shrink-0"
                                onClick={() => setCompose(c => ({ ...c, includeQuote: false }))}
                                title="Usuń cytowaną wiadomość"
                              >
                                ✕
                              </button>
                              <div className="flex-1 min-w-0">
                                {/* Attribution line matching Gmail */}
                                <div className="text-xs text-gray-500 mb-1">
                                  On {formatAttributionDate(compose.originalEmail.date instanceof Date ? compose.originalEmail.date : new Date(compose.originalEmail.date))}{' '}
                                  {compose.originalEmail.fromName || compose.originalEmail.fromAddress} &lt;{compose.originalEmail.fromAddress}&gt; wrote:
                                </div>
                                {/* Quoted body preview — truncated */}
                                <blockquote className="border-l-[3px] border-[#ccc] ml-0 pl-3 text-xs text-gray-500 max-h-16 overflow-hidden">
                                  {compose.originalEmail.plainBody
                                    ? compose.originalEmail.plainBody.slice(0, 300)
                                    : '(no body)'}
                                  {(compose.originalEmail.plainBody?.length || 0) > 300 && '…'}
                                </blockquote>
                              </div>
                            </div>
                          ) : (
                            <button
                              type="button"
                              className="text-xs text-gray-400 hover:text-teal-600 transition-colors"
                              onClick={() => setCompose(c => ({ ...c, includeQuote: true }))}
                            >
                              + Dołącz cytowaną wiadomość
                            </button>
                          )}
                        </div>
                      )}

                      <div className="mt-3 flex items-center justify-end gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="rounded-full px-3 py-1.5"
                          onClick={() => setReplyOpen(false)}
                        >
                          Cancel
                        </Button>
                        <Button type="submit" variant="default" size="sm" disabled={sending} className="rounded-full px-4 py-1.5">
                          {sending ? 'Wysyłanie...' : 'Wyślij odpowiedź'}
                        </Button>
                      </div>
                    </form>
                  )}
                </div>
              </div>

              <div className="pt-3 mt-3 border-t border-gray-200 flex items-center justify-between gap-3">
                <p className="text-xs text-gray-500">
                  {replyOpen ? 'Pole odpowiedzi jest otwarte na końcu wątku.' : 'Chcesz kontynuować tę rozmowę?'}
                </p>
                <Button
                  type="button"
                  variant={replyOpen ? 'outline' : 'default'}
                  size="sm"
                  className="rounded-full px-4 py-2 shadow-sm"
                  onClick={() => setReplyOpen((open) => !open)}
                >
                  {replyOpen ? 'Zamknij odpowiedź' : 'Odpowiedz'}
                </Button>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
