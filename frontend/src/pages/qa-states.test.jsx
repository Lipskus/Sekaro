import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { api } from '../api';
import Campaigns from './Campaigns';
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

function Location() { const l = useLocation(); return <output data-testid="location">{l.pathname}{l.search}</output>; }
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
