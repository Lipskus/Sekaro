import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { api } from '../api';
import { formatDateKey, formatTimeKey } from '../utils/datetime';
import Campaigns from './Campaigns';
import AddCampaign from './AddCampaign';
import CampaignPreflight from '../redesign/CampaignPreflight';
import CampaignSettings from '../redesign/CampaignSettings';
import CampaignActivity from '../redesign/CampaignActivity';
import Dashboard from '../redesign/pages/Dashboard';
import LeadDetail from './LeadDetail';
import Inbox from '../redesign/pages/Inbox';
import ScheduleMessagePreview from '../redesign/ScheduleMessagePreview';
import ScheduleCalendar, { calendarDays, groupCalendarItems } from '../redesign/ScheduleCalendar';
import Inboxes from './Inboxes';
import Templates from './Templates';
import Analytics from './Analytics';
import Notifications from './Notifications';
import Schedule from './Schedule';
import SystemHealth from './SystemHealth';
import Settings from './Settings';
import CampaignWorkspace from '../redesign/pages/CampaignWorkspace';

const mocks = vi.hoisted(() => ({ notify: vi.fn(), confirm: vi.fn(), loading: {start() {}, stop() {}}, health: {}, user: { role: 'user' } }));
vi.mock('../api', () => ({ api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), del: vi.fn() }, apiCache: { get: () => undefined } }));
vi.mock('../context/NotificationContext', () => ({ useNotify: () => mocks.notify }));
vi.mock('../context/ConfirmContext', () => ({ useConfirm: () => mocks.confirm }));
vi.mock('../context/AppModeContext', () => ({ useAppMode: () => ({ isProduction: true, mode: 'production' }) }));
vi.mock('../context/LoadingContext', () => ({ useLoading: () => mocks.loading }));
vi.mock('../context/NotificationsContext', () => ({ useNotifications: () => ({ refresh() {} }) }));
vi.mock('../context/SystemHealthContext', () => ({ useSystemHealth: () => mocks.health }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: mocks.user, logout: vi.fn() }) }));
vi.mock('../context/DarkModeContext', () => ({ useDarkMode: () => ({ themePreference: 'light', setThemePreference: vi.fn() }) }));
vi.mock('../context/LanguageContext', () => ({ useLanguage: () => ({ language: 'pl', setLanguage: vi.fn(), languages: [] }) }));
vi.mock('react-quill', () => ({ default: () => <textarea aria-label="Edytor HTML" /> }));
vi.mock('./CampaignDetail', () => ({ default: () => <div>Edytor kampanii</div> }));
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }) => <div>{children}</div>,
  AreaChart: ({ children }) => <div>{children}</div>,
  Area: () => null, XAxis: () => null, YAxis: () => null,
  Tooltip: () => null, Legend: () => null, CartesianGrid: () => null,
}));

function Location() { const l = useLocation(); return <output data-testid="location">{l.pathname}{l.search}{l.hash}</output>; }
function mount(Page) { return render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Page /><Location /></MemoryRouter>); }
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }

beforeEach(() => {
  vi.clearAllMocks();
  mocks.confirm.mockResolvedValue(false);
  api.get.mockImplementation(async path => {
    if (path === '/notifications/config') return { enabled: false, notification_email: '', events: [] };
    if (path === '/settings/webhooks/events') return { events: [] };
    if (path.startsWith('/notifications?')) return { items: [], total: 0, unread: 0 };
    return [];
  });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
  vi.stubGlobal('IntersectionObserver', class { observe() {} disconnect() {} });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('reference board loading / empty / error states', () => {
  it('uses the same completed, draft and active states on the dashboard and campaign list', async () => {
    mocks.health = { overallStatus: 'ok' };
    api.get.mockImplementation(async path => {
      if (path === '/campaigns') return [
        { id: 1, name: 'Zakończona QA', stats: { emails_sent: 5, scheduled: 0 } },
        { id: 2, name: 'Szkic QA', stats: {} },
        { id: 3, name: 'Aktywna QA', stats: { total_leads: 3, scheduled: 3 } },
      ];
      if (path.startsWith('/ui/unibox')) return { items: [] };
      return [];
    });
    const { container } = mount(Dashboard);
    await screen.findByRole('link', { name: 'Zakończona QA' });
    expect(screen.getByText('Zakończona', { selector: '.sk-badge' })).toBeTruthy();
    expect(screen.getByText('Szkic', { selector: '.sk-badge' })).toBeTruthy();
    const metric = [...container.querySelectorAll('.sk-metric')].find(e => e.textContent.includes('Aktywne kampanie'));
    expect(metric.querySelector('.sk-metric-value').textContent).toBe('1');
  });

  it('categorizes legacy demo bounce notifications and gives them an error tone', async () => {
    const base = api.get.getMockImplementation();
    api.get.mockImplementation(path => path.startsWith('/notifications?') ? Promise.resolve({
      items: [{ id: 1, title: 'Odbicie QA', message: 'Niedostarczona', event_type: 'email_bounced', created_at: '2026-09-25T10:00:00Z', read_at: '2026-09-25T10:00:00Z' }], total: 1, unread: 0,
    }) : base(path));
    const { container } = mount(Notifications);
    await screen.findByRole('button', { name: /Odbicie QA/ });
    fireEvent.click(screen.getByRole('button', { name: 'E-mail', exact: true }));
    expect(screen.getByRole('button', { name: /Odbicie QA/ })).toBeTruthy();
    expect(container.querySelector('.sk-notification-event-icon.tone-red')).toBeTruthy();
  });

  it.each([0, 12])('shows missing custom content instead of draft/completed after %s sends', async emailsSent => {
    api.get.mockImplementation(async path => path === '/campaigns' ? [{
      id: 6, name: 'Personalizacja', paused: false,
      stats: { total_leads: 0, emails_sent: emailsSent, scheduled: 0, needs_custom_email: 8 },
    }] : { scheduling_strategy: 'priority' });
    mount(Campaigns);
    expect(await screen.findByText('Wymaga poprawek', { selector: '.sk-badge' })).toBeTruthy();
    expect(screen.queryByText('Szkic')).toBeNull();
    expect(screen.queryByText('Zakończona')).toBeNull();
  });

  it.each([false, true])('keeps multi-step campaign progress consistent when paused=%s', async paused => {
    api.get.mockImplementation(async path => path === '/campaigns' ? [{
      id: 3, name: 'Wielokrokowa kampania', paused,
      stats: { total_leads: 8, emails_sent: 33, scheduled: 16, replies: 2 },
    }] : { scheduling_strategy: 'priority' });
    mount(Campaigns);
    expect(await screen.findByText('33 wysłano · 67%')).toBeTruthy();
    expect(screen.queryByText(/413%/)).toBeNull();
  });

  it.each([
    [Campaigns, '/campaigns', 'Ładowanie kampanii', /Brak kampanii\./],
    [Inboxes, '/inboxes', 'Ładowanie skrzynek', /Brak skrzynek\./],
    [Templates, '/templates', 'Ładowanie szablonów', /Brak szablonów\./],
  ])('does not report an empty list while loading or after a failure', async (Page, path, title, empty) => {
    const pending = deferred();
    api.get.mockImplementation(p => p === path ? pending.promise : Promise.resolve([]));
    mount(Page);
    expect(screen.getByText(title)).toBeTruthy();
    expect(screen.queryByText(empty)).toBeNull();
    await act(async () => pending.reject(new Error('Awaria API')));
    expect(screen.queryByText(title)).toBeNull();
    expect(screen.queryByText(empty)).toBeNull();
    expect(screen.getByRole('alert')).toBeTruthy();
    api.get.mockResolvedValue([]);
    fireEvent.click(screen.getByRole('button', { name: /Spróbuj ponownie/ }));
    expect(await screen.findByText(empty)).toBeTruthy();
  });

  it('keeps analytics fetch errors distinct from zero activity and allows retry', async () => {
    api.get.mockImplementation(p => p.startsWith('/analytics/daily') ? Promise.reject(new Error('offline')) : Promise.resolve([]));
    mount(Analytics);
    expect(await screen.findByText('Nie udało się pobrać wyników analityki.')).toBeTruthy();
    expect(screen.queryByText('Brak danych')).toBeNull();
    api.get.mockResolvedValue([]);
    fireEvent.click(screen.getByRole('button', { name: /Spróbuj ponownie/ }));
    expect(await screen.findByText('Brak danych')).toBeTruthy();
  });

  it('does not let an older analytics failure overwrite a newer selection', async () => {
    const pending = deferred();
    api.get.mockImplementation(p => p.startsWith('/analytics/daily') ? pending.promise : Promise.resolve([]));
    mount(Analytics);
    await act(async () => {});
    api.get.mockResolvedValue([]);
    fireEvent.click(screen.getByRole('button', { name: 'Ostatnie 30 dni' }));
    expect(await screen.findByText('Brak danych')).toBeTruthy();
    await act(async () => pending.reject(new Error('old failure')));
    expect(screen.queryByText('Nie udało się pobrać wyników analityki.')).toBeNull();
  });

  it('shows a schedule failure instead of a fake empty queue', async () => {
    api.get.mockImplementation(p => p.startsWith('/schedule/scheduled') ? Promise.reject(new Error('offline')) : Promise.resolve([]));
    mount(Schedule);
    expect(await screen.findByText(/Nie udało się wczytać harmonogramu/)).toBeTruthy();
    expect(screen.queryByText('Brak wiadomości')).toBeNull();
  });

  it('shows neutral health metrics when diagnostics are unavailable', () => {
    mocks.health = { checks: [], loading: false, lastChecked: null, fetchError: 'offline', refresh: vi.fn(), muted: new Set(), toggleMute: vi.fn(), overallStatus: 'unknown', rawData: null };
    const { container } = mount(SystemHealth);
    expect(screen.queryByText('Brak aktywnych problemów')).toBeNull();
    expect(container.querySelector('.sk-health-metrics .tone-green')).toBeNull();
    expect(screen.getByText('brak danych o skrzynkach')).toBeTruthy();
  });

  it('does not expose editable default settings after an API failure', async () => {
    api.get.mockRejectedValue(new Error('Ustawienia niedostępne'));
    mount(Settings);
    expect(screen.getByText('Ładowanie ustawień')).toBeTruthy();
    expect(await screen.findByText('Ustawienia niedostępne')).toBeTruthy();
    expect(screen.queryByLabelText('Ustawienia ogólne')).toBeNull();
  });

  it('clears stale successful preflight results after a failed refresh', async () => {
    let fail = false;
    api.get.mockImplementation(async p => {
      if (p.endsWith('/preflight')) {
        if (fail) throw new Error('Diagnostyka niedostępna');
        return { ready: true, issues: [], warnings: [] };
      }
      if (p === '/campaigns/undefined') return { id: 1, name: 'Kampania QA', paused: true, inbox_ids: [], sending_hours_start: '09:00', sending_hours_end: '17:00' };
      return [];
    });
    mount(CampaignWorkspace);
    expect(await screen.findByText('Kampania jest gotowa do uruchomienia!')).toBeTruthy();
    fail = true;
    fireEvent.click(screen.getByRole('button', { name: 'Sprawdź ponownie' }));
    expect(await screen.findByText('Diagnostyka niedostępna')).toBeTruthy();
    expect(screen.queryByText('Kampania jest gotowa do uruchomienia!')).toBeNull();
  });
});

describe('reference board template history and notification detail', () => {
  it('loads a previous template version into the editor without writing it', async () => {
    const versions = [{ id: 2, version: 2, subject: 'Nowy temat', body: 'Nowa treść', created_at: '2026-09-25T10:00:00Z' }, { id: 1, version: 1, subject: 'Poprzedni temat', body: 'Stara treść', created_at: '2026-09-24T10:00:00Z' }];
    api.get.mockImplementation(async p => p === '/templates' ? [{ id: 1, name: 'Oferta', latest_version: versions[0] }] : p === '/templates/1' ? { id: 1, name: 'Oferta', versions, latest_version: versions[0] } : []);
    mount(Templates);
    fireEvent.click(await screen.findByRole('button', { name: /Oferta/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Wersja 1/ }));
    expect(screen.getByDisplayValue('Poprzedni temat')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Wersja 1/ }).getAttribute('aria-pressed')).toBe('true');
    expect(api.post).not.toHaveBeenCalled();
  });

  it('opens full notification detail before navigating to the existing mailbox route', async () => {
    const n = { id: 1, title: 'Skrzynka wymaga uwagi', message: 'Pełny opis problemu.', event_type: 'token_expired', inbox_id: 17, created_at: '2026-09-25T10:00:00Z', read_at: null };
    const base = api.get.getMockImplementation();
    api.get.mockImplementation(p => p.startsWith('/notifications?') ? Promise.resolve({ items: [n], total: 1, unread: 1 }) : base(p));
    api.patch.mockResolvedValue({});
    mount(Notifications);
    fireEvent.click(await screen.findByRole('button', { name: /Skrzynka wymaga uwagi/ }));
    expect(screen.getByRole('heading', { name: 'Skrzynka wymaga uwagi' })).toBeTruthy();
    expect(screen.getByTestId('location').textContent).toBe('/');
    fireEvent.click(screen.getByRole('button', { name: 'Otwórz powiązany widok' }));
    expect(screen.getByTestId('location').textContent).toBe('/inboxes?inbox=17');
  });

  it('does not show editable default preferences when their fetch fails', async () => {
    const base = api.get.getMockImplementation();
    api.get.mockImplementation(p => p === '/notifications/config' ? Promise.reject(new Error('Konfiguracja niedostępna')) : base(p));
    mount(Notifications);
    fireEvent.click(screen.getByRole('tab', { name: 'Preferencje' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Zapisz preferencje' })).toBeNull();
  });
});

describe('calendar, bulk actions and mailbox form regressions', () => {
  it('keeps Monday-first weeks across year boundaries and full month grids', () => {
    expect(calendarDays('2027-01-01')).toEqual(['2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03']);
    const month = calendarDays('2026-02-11', 'month');
    expect(month).toHaveLength(42);
    expect(month[0]).toBe('2026-01-26');
    expect(month.at(-1)).toBe('2026-03-08');
  });

  it('groups by the displayed timezone through DST without mixing sent and planned', () => {
    const items = [
      { campaign_id: 1, type: 'scheduled', scheduled_at: '2026-03-28T23:30:00Z' },
      { campaign_id: 1, type: 'scheduled', scheduled_at: '2026-03-29T00:30:00Z' },
      { campaign_id: 1, type: 'sent', sent_at: '2026-03-29T00:30:00Z' },
      { campaign_id: 1, type: 'scheduled', scheduled_at: '2026-03-29T01:30:00Z' },
      { campaign_id: 1, type: 'scheduled', scheduled_at: 'invalid' },
    ];
    const groups = groupCalendarItems(items, 'Europe/Warsaw');
    expect(groups.map(g => [g.day, g.hour, g.type, g.items.length])).toEqual([
      ['2026-03-29', 0, 'scheduled', 2], ['2026-03-29', 0, 'sent', 1], ['2026-03-29', 2, 'scheduled', 1],
    ]);
  });

  it('switches month/week and extends the requested range while preserving real item previews', async () => {
    const onRangeChange = vi.fn(), onPreview = vi.fn();
    const timestamp = new Date().toISOString();
    render(<ScheduleCalendar items={[{ type: 'scheduled', slot_id: 7, scheduled_at: timestamp, campaign_id: 2, campaign_name: 'QA', lead_email: 'qa@example.test' }]} onRangeChange={onRangeChange} onPreview={onPreview} />);
    fireEvent.click(screen.getByRole('button', { name: 'Miesiąc' }));
    expect(onRangeChange.mock.calls.at(-1)[1]).not.toBe(onRangeChange.mock.calls[0][1]);
    fireEvent.click(screen.getByRole('button', { name: /qa@example.test/ }));
    expect(onPreview.mock.calls[0][0].slot_id).toBe(7);
    fireEvent.click(screen.getByRole('switch', { name: 'Ukryj weekend' }));
    expect(document.querySelectorAll('.sk-calendar-month-day')).toHaveLength(30);
  });

  it('runs bulk actions only for selected rows and keeps failed rows selected', async () => {
    const rows = [1, 2].map(id => ({ id, name: `Kampania ${id}`, paused: true, stats: {}, inbox_ids: [] }));
    api.get.mockImplementation(async p => p === '/campaigns' ? rows : {});
    api.patch.mockImplementation(async p => { if (p === '/campaigns/2') throw new Error('failed'); return {}; });
    mocks.confirm.mockResolvedValue(true);
    mount(Campaigns);
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Zaznacz widoczne kampanie' }));
    fireEvent.click(screen.getByRole('button', { name: 'Wznów zaznaczone' }));
    expect(await screen.findByText(/Wykonano 1 z 2 operacji/)).toBeTruthy();
    expect(api.patch.mock.calls).toEqual([['/campaigns/1', { paused: false }], ['/campaigns/2', { paused: false }]]);
    expect(screen.getByRole('checkbox', { name: 'Zaznacz kampanię Kampania 1' }).checked).toBe(false);
    expect(screen.getByRole('checkbox', { name: 'Zaznacz kampanię Kampania 2' }).checked).toBe(true);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Szukaj kampanii' }), { target: { value: 'Kampania 1' } });
    expect(screen.queryByRole('button', { name: 'Wznów zaznaczone' })).toBeNull();
    expect(api.del).not.toHaveBeenCalled();
  });

  it('does not mutate a campaign when confirmation is cancelled', async () => {
    api.get.mockImplementation(async p => p === '/campaigns' ? [{ id: 1, name: 'QA', stats: {} }] : {});
    mount(Campaigns);
    fireEvent.click(await screen.findByRole('button', { name: 'Usuń' }));
    await act(async () => {});
    expect(api.del).not.toHaveBeenCalled();
  });

  it('adds a mailbox in an accessible dialog and keeps partial SMTP failures visible', async () => {
    const pending = deferred();
    api.post.mockImplementation(p => p === '/inboxes' ? pending.promise : Promise.resolve({ ok: true }));
    api.put.mockRejectedValue(new Error('credentials unavailable'));
    mount(Inboxes);
    await screen.findByText(/Brak skrzynek\./);
    fireEvent.click(screen.getAllByRole('button', { name: 'Dodaj skrzynkę' })[0]);
    expect(screen.getByRole('dialog', { name: 'Dodaj skrzynkę' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Adres e-mail'), { target: { value: 'qa@example.test' } });
    fireEvent.change(screen.getAllByLabelText('Host')[0], { target: { value: 'smtp.example.test' } });
    fireEvent.change(screen.getByLabelText('Login'), { target: { value: 'qa' } });
    fireEvent.change(screen.getByLabelText('Hasło'), { target: { value: 'test-only' } });
    fireEvent.submit(screen.getByLabelText('Adres e-mail').closest('form'));
    expect(screen.getByRole('button', { name: 'Zamknij okno' }).disabled).toBe(true);
    await act(async () => pending.resolve({ id: 9 }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toMatch(/nie udało się zapisać danych SMTP/);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(api.post.mock.calls.filter(([p]) => p === '/inboxes')).toHaveLength(1);
  });

  it('keeps the mailbox header neutral with no accounts or after a mailbox fetch failure', async () => {
    api.get.mockImplementation(async p => p.startsWith('/ui/unibox?') ? { items: [], total: 0, counts: {} } : []);
    const instance = mount(Inbox);
    expect(await screen.findByText('Brak skrzynek')).toBeTruthy();
    expect(screen.queryByText(/Wszystkie online/)).toBeNull();
    instance.unmount();
    api.get.mockImplementation(async p => { if (p === '/inboxes') throw new Error('mailbox offline'); return p.startsWith('/ui/unibox?') ? { items: [], total: 0, counts: {} } : []; });
    mount(Inbox);
    expect(await screen.findByText('Brak danych')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain('mailbox offline');
  });

  it('preserves unsaved contact fields when switching summary and activity', async () => {
    api.get.mockImplementation(async p => p === '/contact-fields' ? [] : { id: 4, name: 'QA', email: 'qa@example.test', campaigns: [], interactions: [{ direction: 'inbound', subject: 'Odpowiedź QA', at: '2026-09-25T10:00:00Z' }] });
    mount(LeadDetail);
    fireEvent.change(await screen.findByRole('textbox', { name: 'Nazwa / imię' }), { target: { value: 'Niezapisana nazwa' } });
    fireEvent.click(screen.getByRole('tab', { name: 'Aktywność' }));
    expect(screen.queryByRole('textbox', { name: 'Nazwa / imię' })).toBeNull();
    expect(screen.getByText('Odpowiedź QA ·')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Podsumowanie' }));
    expect(screen.getByRole('textbox', { name: 'Nazwa / imię' }).value).toBe('Niezapisana nazwa');
    expect(api.patch).not.toHaveBeenCalled();
  });

  it('switches template views without saving or sending a message', async () => {
    mount(Templates);
    await screen.findByText('Brak szablonów.');
    fireEvent.change(screen.getByRole('textbox', { name: 'Nazwa szablonu' }), { target: { value: 'Niezapisany szablon' } });
    fireEvent.click(screen.getByRole('button', { name: 'Podgląd', exact: true }));
    expect(screen.getByRole('button', { name: 'Generuj podgląd' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Edytor', exact: true }));
    expect(screen.getByRole('textbox', { name: 'Nazwa szablonu' }).value).toBe('Niezapisany szablon');
    expect(api.post).not.toHaveBeenCalled();
  });
});

it('filters the mailbox table by name and sending status without changing mailbox state', async () => {
  api.get.mockImplementation(async p => p === '/inboxes' ? [
    { id: 1, email: 'first@example.test', display_name: 'Sprzedaż', provider: 'smtp', paused: false, max_emails_per_day: 100 },
    { id: 2, email: 'second@example.test', display_name: 'Wsparcie', provider: 'smtp', paused: true, max_emails_per_day: 50 },
  ] : []);
  mount(Inboxes);
  await screen.findByRole('button', { name: /first@example.test/ });
  fireEvent.change(screen.getByRole('combobox', { name: 'Status skrzynki' }), { target: { value: 'paused' } });
  expect(screen.queryByRole('button', { name: /first@example.test/ })).toBeNull();
  expect(screen.getByRole('button', { name: /second@example.test/ })).toBeTruthy();
  fireEvent.change(screen.getByRole('searchbox', { name: 'Szukaj skrzynki' }), { target: { value: 'Sprzedaż' } });
  expect(screen.getByText('Brak skrzynek pasujących do filtrów.')).toBeTruthy();
  expect(api.patch).not.toHaveBeenCalled();
});

it('shows a real queued message, blocks remote email content and links to existing views', () => {
  const item = { type: 'scheduled', slot_id: 1, campaign_id: 4, lead_id: 8, inbox_id: 9, campaign_name: 'QA', lead_email: 'qa@example.test', inbox_email: 'sender@example.test', scheduled_at: '2026-09-25T10:00:00Z', sequence_is_html: true, sequence_body: '<p>Treść QA</p><img src="https://example.test/pixel"><script>alert(1)</script>' };
  render(<MemoryRouter><ScheduleMessagePreview item={item} items={[item]} onSelect={vi.fn()} /></MemoryRouter>);
  const root = document.querySelector('.sk-safe-email').shadowRoot;
  expect(root.textContent).toContain('Treść QA');
  expect(root.querySelector('img,script')).toBeNull();
  expect(screen.getByRole('link', { name: 'Harmonogram kampanii' }).getAttribute('href')).toBe('/campaigns/4#overview');
  expect(screen.getByRole('link', { name: 'Otwórz kontakt' }).getAttribute('href')).toBe('/leads/8');
  expect(api.post).not.toHaveBeenCalled();
});


it('renders the contact activity timestamp supplied as at by the API', async () => {
  const thread = { inbox_id: 1, thread_id: 'thread-qa', lead_id: 8, lead_email: 'qa@example.test', lead_name: 'Kontakt osi QA', subject: 'Rozmowa QA' };
  api.get.mockImplementation(async path => {
    if (path.startsWith('/ui/unibox?')) return { items: [thread], total: 1, counts: {} };
    if (path.startsWith('/unibox/threads/')) return { messages: [], subject: 'Rozmowa QA' };
    if (path === '/leads/8') return { id: 8, name: 'Kontakt osi QA', email: 'qa@example.test', interactions: [{ direction: 'inbound', kind: 'reply_marker', at: '2026-09-25T10:00:00' }] };
    return [];
  });
  api.post.mockResolvedValue({});
  const { container } = mount(Inbox);
  fireEvent.click(await screen.findByRole('button', { name: /Kontakt osi QA/ }));
  await screen.findByText('Odpowiedź kontaktu');
  expect(container.querySelector('.sk-timeline-row time').textContent).not.toBe('—');
});


it('calculates the analytics reply rate from the selected period, not lifetime totals', async () => {
  api.get.mockImplementation(async path => {
    if (path === '/campaigns') return [{ id: 1, name: 'Okres QA', stats: { emails_sent: 1000, replies: 10 } }];
    if (path.startsWith('/analytics/daily')) return [{ campaign_id: 1, date: new Date().toISOString().slice(0,10), sent: 20, total_replies: 4, total_opens: 0, unique_opens: 0, total_clicks: 0, unique_clicks: 0 }];
    return {};
  });
  const { container } = mount(Analytics);
  await screen.findByRole('link', { name: 'Okres QA' });
  const metric = [...container.querySelectorAll('.sk-metric')].find(e => e.textContent.includes('Wskaźnik odpowiedzi'));
  expect(metric.querySelector('.sk-metric-value').textContent).toBe('20%');
  expect(screen.getByTitle('Brak danych o unikalnych kontaktach w wybranym okresie').textContent).toBe('—');
});


it('interprets backend timestamps without offsets as UTC across the Warsaw DST change', () => {
  expect(formatDateKey('2026-03-28T23:30:00', 'Europe/Warsaw')).toBe('2026-03-29');
  expect(formatTimeKey('2026-03-29T00:30:00', 'Europe/Warsaw')).toBe('01:30');
  expect(formatTimeKey('2026-03-29T01:30:00', 'Europe/Warsaw')).toBe('03:30');
  expect(formatTimeKey('2026-03-29T03:30:00+02:00', 'Europe/Warsaw')).toBe('03:30');
});


it('creates one paused draft and continues to contacts without starting it', async () => {
  const pending = deferred();
  api.post.mockReturnValue(pending.promise);
  mount(AddCampaign);
  fireEvent.change(screen.getByRole('textbox', { name: /Nazwa kampanii/ }), { target: { value: '  Kreator QA  ' } });
  const next = screen.getByRole('button', { name: 'Dalej' });
  fireEvent.click(next); fireEvent.click(next);
  expect(api.post).toHaveBeenCalledTimes(1);
  expect(api.post).toHaveBeenCalledWith('/campaigns', expect.objectContaining({ name: 'Kreator QA', paused: true, inbox_ids: [], track_opens: false }));
  await act(async () => pending.resolve({ id: 42 }));
  expect(screen.getByTestId('location').textContent).toBe('/campaigns/42?setup=1#leads');
});

it('retains the campaign name after a draft creation failure', async () => {
  api.post.mockRejectedValueOnce(new Error('Nie zapisano kampanii'));
  mount(AddCampaign);
  fireEvent.change(screen.getByRole('textbox', { name: /Nazwa kampanii/ }), { target: { value: 'Zachowaj nazwę' } });
  fireEvent.click(screen.getByRole('button', { name: 'Dalej' }));
  await screen.findByText('Nie zapisano kampanii');
  expect(screen.getByDisplayValue('Zachowaj nazwę')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Dalej' }).disabled).toBe(false);
});

it('shows schedule, limit and unknown blockers in preflight and prevents starting', () => {
  const onStart = vi.fn();
  const props = { campaign: { name: 'QA', paused: true }, inboxes: [], sequences: [], busy: false, onCheck: vi.fn(), onStart };
  const view = render(<MemoryRouter><CampaignPreflight {...props} report={null}/></MemoryRouter>);
  expect(screen.getByRole('button', { name: 'Uruchom kampanię' }).disabled).toBe(true);
  view.rerender(<MemoryRouter><CampaignPreflight {...props} report={{ ready: false, issues: [
    { code: 'invalid_sending_window', severity: 'error', message: 'Niepoprawne godziny QA' },
    { code: 'daily_limit_invalid', severity: 'error', message: 'Niepoprawny limit QA' },
    { code: 'future_check', severity: 'error', message: 'Nowa kontrola QA' },
  ] }}/></MemoryRouter>);
  expect(screen.getByText('Niepoprawne godziny QA')).toBeTruthy();
  expect(screen.getByText('Niepoprawny limit QA')).toBeTruthy();
  expect(screen.getByText('Nowa kontrola QA')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Uruchom kampanię' }));
  expect(onStart).not.toHaveBeenCalled();
});

function mountSetup(step) {
  return render(<MemoryRouter initialEntries={[`/campaigns/42?setup=1#${step}`]}><Routes><Route path="/campaigns/:id" element={<CampaignWorkspace/>}/></Routes><Location/></MemoryRouter>);
}
function setupApi() {
  api.get.mockImplementation(async path => {
    if (path === '/campaigns/42') return { id: 42, name: 'Kreator QA', paused: true, inbox_ids: [], sending_days: [0,1,2,3,4], sending_hours_start: '09:00', sending_hours_end: '17:00', timezone: 'Europe/Warsaw' };
    if (path.endsWith('/preflight')) return { ready: false, issues: [], summary: {} };
    if (path === '/inboxes') return [{ id: 7, email: 'qa@example.test', max_emails_per_day: 20 }];
    return [];
  });
}
it('keeps the mailbox choice and step after a failed save', async () => {
  setupApi(); api.patch.mockRejectedValueOnce(new Error('Nie zapisano skrzynek'));
  mountSetup('inboxes');
  const checkbox = await screen.findByRole('checkbox', { name: /qa@example.test/ });
  fireEvent.click(checkbox);
  fireEvent.click(screen.getByRole('button', { name: 'Zapisz i dalej' }));
  await screen.findByText('Nie zapisano skrzynek');
  expect(checkbox.checked).toBe(true);
  expect(screen.getByTestId('location').textContent).toBe('/campaigns/42?setup=1#inboxes');
  expect(api.patch).toHaveBeenCalledWith('/campaigns/42', { inbox_ids: [7] });
});
it('does not advance or save an invalid sending window', async () => {
  setupApi(); mountSetup('schedule');
  const end = await screen.findByLabelText('Koniec wysyłki');
  fireEvent.change(end, { target: { value: '08:00' } });
  fireEvent.click(screen.getByRole('button', { name: 'Zapisz i dalej' }));
  await screen.findByText('Wybierz dni wysyłki i godzinę końca późniejszą niż początek.');
  expect(api.patch).not.toHaveBeenCalled();
  expect(screen.getByTestId('location').textContent).toBe('/campaigns/42?setup=1#schedule');
});

it('saves the schedule before opening the summary', async () => {
  setupApi(); api.patch.mockResolvedValue({}); mountSetup('schedule');
  await screen.findByLabelText('Koniec wysyłki');
  fireEvent.click(screen.getByRole('button', { name: 'Zapisz i dalej' }));
  await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/campaigns/42?setup=1#overview'));
  expect(api.patch).toHaveBeenCalledWith('/campaigns/42', expect.objectContaining({ sending_hours_start: '09:00', sending_hours_end: '17:00', sending_days: [0,1,2,3,4] }));
  expect(api.post).not.toHaveBeenCalled();
});
it('rechecks readiness at start and does not start after a new blocker appears', async () => {
  setupApi(); const original = api.get.getMockImplementation(); let blocked = false;
  api.get.mockImplementation(path => path.endsWith('/preflight') ? Promise.resolve({ ready: !blocked, issues: blocked ? [{ severity: 'error', code: 'inbox_paused', message: 'Skrzynka została wstrzymana' }] : [] }) : original(path));
  api.patch.mockResolvedValue({}); mountSetup('overview');
  const start = await screen.findByRole('button', { name: 'Uruchom kampanię' });
  await waitFor(() => expect(start.disabled).toBe(false));
  blocked = true; fireEvent.click(start);
  await screen.findByText('Skrzynka została wstrzymana');
  expect(api.post).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Uruchom kampanię' }).disabled).toBe(true);
});

describe('campaign settings and activity safeguards', () => {
  const campaign = { id: 42, name: 'Test QA', paused: true, inbox_ids: [1], sending_days: [0,1,2,3,4], sending_hours_start: '09:00', sending_hours_end: '17:00', timezone: 'Europe/Warsaw' };
  const inboxes = [{id:1,email:'sender@example.com',max_emails_per_day:40,wait_minutes_between:5}];
  it('saves settings without changing paused state or duplicating queue recalculation', async () => {
    mount(() => <CampaignSettings campaign={campaign} inboxes={inboxes}/>);
    fireEvent.change(screen.getByLabelText('Nazwa kampanii'), { target: { value: '  Zmieniona  ' } });
    fireEvent.click(screen.getByRole('button', {name:'Zapisz zmiany'}));
    await screen.findByText('Ustawienia zapisane.');
    expect(api.patch).toHaveBeenCalledWith('/campaigns/42', expect.objectContaining({name:'Zmieniona',inbox_ids:[1]}));
    expect(api.patch.mock.calls[0][1]).not.toHaveProperty('paused');
    expect(api.post).not.toHaveBeenCalled();
  });
  it('refreshes pristine settings without overwriting in-progress edits', () => {
    const view = render(<MemoryRouter><CampaignSettings campaign={campaign} inboxes={inboxes}/></MemoryRouter>);
    view.rerender(<MemoryRouter><CampaignSettings campaign={{...campaign,name:'Odświeżona'}} inboxes={inboxes}/></MemoryRouter>);
    expect(screen.getByLabelText('Nazwa kampanii').value).toBe('Odświeżona');
    fireEvent.change(screen.getByLabelText('Nazwa kampanii'), {target:{value:'Moja edycja'}});
    view.rerender(<MemoryRouter><CampaignSettings campaign={{...campaign,name:'Z serwera'}} inboxes={inboxes}/></MemoryRouter>);
    expect(screen.getByLabelText('Nazwa kampanii').value).toBe('Moja edycja');
  });
  it('blocks invalid schedules and preserves unsaved values after save failure', async () => {
    mount(() => <CampaignSettings campaign={campaign} inboxes={inboxes}/>);
    fireEvent.change(screen.getByLabelText('Koniec okna'), { target: { value: '08:00' } });
    fireEvent.click(screen.getByRole('button', {name:'Zapisz zmiany'}));
    await screen.findByText('Wybierz dni wysyłki i godzinę końca późniejszą niż początek.');
    expect(api.patch).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Koniec okna'), { target: { value: '18:00' } });
    api.patch.mockRejectedValueOnce(new Error('Zapis odrzucony'));
    fireEvent.click(screen.getByRole('button', {name:'Zapisz zmiany'}));
    await screen.findByText('Zapis odrzucony');
    expect(screen.getByLabelText('Koniec okna').value).toBe('18:00');
  });
  it('never starts a campaign when fresh preflight blocks it', async () => {
    api.get.mockResolvedValue({ready:false,issues:[{severity:'error',message:'Brak kontaktów'}]});
    mount(() => <CampaignSettings campaign={campaign} inboxes={inboxes}/>);
    fireEvent.click(screen.getByRole('button', {name:'Zapisz i sprawdź przed startem'}));
    await screen.findByText('Brak kontaktów');
    expect(api.post).not.toHaveBeenCalled();
  });
  function activityApi(report = {ready:true,issues:[]}) {
    api.get.mockImplementation(async path => path.endsWith('/preflight') ? report : path.endsWith('/queue') ? [{slot_id:10,scheduled_date:'2026-09-25T09:00:00Z',lead_email:'one@example.com',inbox_email:'sender@example.com',inbox_id:1,sequence_index:0},{slot_id:11,scheduled_date:'2026-09-25T10:00:00Z',lead_email:'two@example.com',inbox_email:'sender@example.com',inbox_id:1,sequence_index:1}] : []);
  }
  it('keeps contact filters and confirms the real scope of global recalculation', async () => {
    activityApi();
    mount(() => <CampaignActivity campaign={campaign} inboxes={inboxes} contact="one@example.com"/>);
    await screen.findByText('one@example.com');
    expect(screen.queryByText('two@example.com')).toBeNull();
    fireEvent.click(screen.getByRole('button', {name:'Przelicz harmonogram'}));
    await waitFor(() => expect(mocks.confirm).toHaveBeenCalled());
    expect(api.post).not.toHaveBeenCalled();
    mocks.confirm.mockResolvedValueOnce(true);
    fireEvent.click(screen.getByRole('button', {name:'Przelicz harmonogram'}));
    await screen.findByText('Przeliczanie harmonogramu zlecone. Odśwież dane po zakończeniu zadania.');
    expect(api.post).toHaveBeenCalledWith('/schedule/recalculate-all', {});
  });
  it('requires delivery verification before releasing uncertain slots', async () => {
    activityApi({ready:false,issues:[{code:'uncertain_send_attempts',message:'Sprawdź dostarczenie',details:{slot_ids:[10],count:1}}]});
    mount(() => <CampaignActivity campaign={campaign} inboxes={inboxes}/>);
    const reset = await screen.findByRole('button', {name:'Odblokuj #10'});
    fireEvent.click(reset);
    await waitFor(() => expect(mocks.confirm).toHaveBeenCalled());
    expect(api.post).not.toHaveBeenCalled();
    mocks.confirm.mockResolvedValueOnce(true);
    fireEvent.click(reset);
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/campaigns/42/send-attempts/10/reset', {}));
  });
  it('does not report a safe empty queue after a diagnostics failure', async () => {
    api.get.mockRejectedValue(new Error('Diagnostyka niedostępna'));
    mount(() => <CampaignActivity campaign={campaign} inboxes={inboxes}/>);
    await screen.findByText('Diagnostyka niedostępna');
    expect(screen.queryByText('Brak niepewnych prób wysyłki.')).toBeNull();
  });
});

describe('system settings navigation and save semantics', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/#general');
    mocks.user = {role:'admin',username:'Adam'};
    api.get.mockImplementation(async path => {
      if (path === '/settings/scheduling-strategy') return {scheduling_strategy:'priority'};
      if (path === '/settings/ai') return {features:[]};
      if (path === '/settings/ai/providers') return {providers:[]};
      if (path === '/settings/webhooks/events') return {events:['email.sent']};
      if (path === '/settings/known-ips') return {known_ips:[],current_ip:'127.0.0.1'};
      if (path === '/settings/webhooks' || path === '/auth/api-keys') return [];
      if (path === '/campaigns/has-leads') return {has_leads:true};
      return {};
    });
  });
  afterEach(() => { mocks.user = {role:'user'}; window.history.replaceState(null, '', '/'); });
  const nav = () => within(screen.getByRole('navigation', {name:'Sekcje ustawień'}));
  it('opens every available category and keeps legacy deep links working', async () => {
    window.history.replaceState(null, '', '/#integrating');
    mount(Settings);
    await screen.findByRole('heading', {level:1,name:'Ustawienia systemu'});
    expect(nav().getByRole('button', {name:'Klucze API'}).getAttribute('aria-current')).toBe('page');
    for (const name of ['Ogólne','Wygląd i język','Konto i bezpieczeństwo','Znane adresy IP','Kopia i przywracanie','Funkcje AI','Weryfikacja e-mail','Pozostałe','Klucze API','Webhooki','MCP']) {
      fireEvent.click(nav().getByRole('button', {name,exact:true}));
      expect(nav().getByRole('button', {name,exact:true}).getAttribute('aria-current')).toBe('page');
    }
    expect(nav().queryByRole('button', {name:'Tryb testowy'})).toBeNull();
  });
  it('searches categories without accents and can clear a no-results state', async () => {
    mount(Settings);
    const search = await screen.findByRole('searchbox', {name:'Szukaj ustawienia'});
    fireEvent.change(search,{target:{value:'wyglad'}});
    expect(nav().getByRole('button', {name:'Wygląd i język'})).toBeTruthy();
    fireEvent.change(search,{target:{value:'klucze'}});
    expect(nav().getByRole('button', {name:'Klucze API'})).toBeTruthy();
    expect(nav().queryByRole('button', {name:'Ogólne'})).toBeNull();
    fireEvent.change(search,{target:{value:'zaden-wynik'}});
    fireEvent.click(screen.getByRole('button',{name:'Wyczyść wyszukiwanie'}));
    expect(nav().getByRole('button',{name:'Ogólne'})).toBeTruthy();
  });
  it('does not expose backup controls to a non-admin through a URL', async () => {
    mocks.user = {role:'user'};
    window.history.replaceState(null, '', '/#setup');
    mount(Settings);
    await screen.findByRole('heading',{level:1,name:'Ustawienia systemu'});
    expect(nav().queryByRole('button',{name:'Kopia i przywracanie'})).toBeNull();
    expect(nav().getByRole('button',{name:'Ogólne'}).getAttribute('aria-current')).toBe('page');
  });
  it('stages scheduling changes and respects declined recalculation confirmation', async () => {
    mount(Settings);
    fireEvent.click(await screen.findByRole('radio',{name:/Równomierny podział/}));
    expect(api.post).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button',{name:'Zapisz zmiany'}));
    await waitFor(()=>expect(mocks.confirm).toHaveBeenCalled());
    expect(api.post).not.toHaveBeenCalled();
    await waitFor(()=>expect(screen.getByRole('button',{name:'Anuluj'}).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button',{name:'Anuluj'}));
    expect(screen.getByRole('radio',{name:/Priorytet kampanii/}).checked).toBe(true);
  });
  it('preserves drafts across navigation and failed save', async () => {
    mount(Settings);
    fireEvent.click(await screen.findByRole('radio',{name:/Równomierny podział/}));
    fireEvent.click(nav().getByRole('button',{name:'Webhooki'}));
    const url = screen.getByPlaceholderText('https://twoj-endpoint.example.com/hook');
    fireEvent.change(url,{target:{value:'https://example.com/draft'}});
    fireEvent.click(nav().getByRole('button',{name:'Ogólne'}));
    expect(screen.getByRole('radio',{name:/Równomierny podział/}).checked).toBe(true);
    mocks.confirm.mockResolvedValueOnce(true);
    api.post.mockRejectedValueOnce(new Error('Nie zapisano strategii'));
    fireEvent.click(screen.getByRole('button',{name:'Zapisz zmiany'}));
    await screen.findByText('Nie zapisano strategii');
    expect(screen.getByRole('radio',{name:/Równomierny podział/}).checked).toBe(true);
    fireEvent.click(nav().getByRole('button',{name:'Webhooki'}));
    expect(screen.getByPlaceholderText('https://twoj-endpoint.example.com/hook').value).toBe('https://example.com/draft');
  });
});
