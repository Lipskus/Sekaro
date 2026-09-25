import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { api } from '../api';
import Campaigns from './Campaigns';
import Inboxes from './Inboxes';
import Templates from './Templates';
import Analytics from './Analytics';
import Notifications from './Notifications';
import Schedule from './Schedule';
import SystemHealth from './SystemHealth';
import Settings from './Settings';
import CampaignWorkspace from '../redesign/pages/CampaignWorkspace';

const mocks = vi.hoisted(() => ({ notify: vi.fn(), health: {}, user: { role: 'user' } }));
vi.mock('../api', () => ({ api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), del: vi.fn() }, apiCache: { get: () => undefined } }));
vi.mock('../context/NotificationContext', () => ({ useNotify: () => mocks.notify }));
vi.mock('../context/ConfirmContext', () => ({ useConfirm: () => vi.fn().mockResolvedValue(false) }));
vi.mock('../context/AppModeContext', () => ({ useAppMode: () => ({ isProduction: true, mode: 'production' }) }));
vi.mock('../context/LoadingContext', () => ({ useLoading: () => ({ start() {}, stop() {} }) }));
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
