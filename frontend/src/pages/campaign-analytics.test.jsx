import React from 'react';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,cleanup,waitFor,act} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {CampaignAnalyticsTab} from './CampaignDetail';
import {api} from '../api';
import {analyticsRangeError,campaignDailyRows,analyticsCsv} from '../redesign/campaignAnalytics';
vi.mock('../api',()=>({api:{get:vi.fn(),patch:vi.fn()},apiCache:{}}));
vi.mock('../context/NotificationContext',()=>({useNotify:()=>vi.fn()}));
vi.mock('react-quill',()=>({default:()=>null}));
vi.mock('recharts',()=>({ResponsiveContainer:({children})=><div>{children}</div>,AreaChart:({children})=><div>{children}</div>,Area:()=>null,XAxis:()=>null,YAxis:()=>null,Tooltip:()=>null,CartesianGrid:()=>null}));
const today=()=>new Date().toLocaleDateString('sv-SE');
const row=(n=12)=>({date:today(),sent:n,total_opens:30,total_replies:2,total_clicks:4,unique_opens:7,unique_clicks:3});
const mount=()=>render(<MemoryRouter><CampaignAnalyticsTab campaignId={1}/></MemoryRouter>);
const dailyRows=()=>document.querySelector('.sk-ca-table-scroll tbody');
beforeEach(()=>{vi.clearAllMocks();api.get.mockImplementation(url=>Promise.resolve(url.includes('/daily?')?[row()]:[]));});
afterEach(cleanup);
it('distinguishes failed daily data from zero results and retries',async()=>{
 let fail=true;api.get.mockImplementation(url=>url.includes('/daily?')?(fail?Promise.reject(Error('offline')):Promise.resolve([row()])):Promise.resolve([]));
 mount();await screen.findByRole('alert');
 expect(document.querySelector('.sk-metric-value').textContent).toBe('—');
 expect(screen.getByRole('button',{name:'Eksport CSV'}).disabled).toBe(true);
 expect(screen.queryByText(/Brak zdarzeń/)).toBeNull();
 fail=false;fireEvent.click(screen.getByRole('button',{name:'Spróbuj ponownie'}));
 await screen.findByText('Wyniki według dnia');expect(document.querySelector('.sk-metric-value').textContent).toBe('12');
 expect(screen.queryByRole('alert')).toBeNull();
});
it('ignores an old range response after a newer range has loaded',async()=>{
 let resolveOld;let count=0;api.get.mockImplementation(url=>url.includes('/daily?')?(++count===1?new Promise(resolve=>{resolveOld=resolve}):Promise.resolve([row(24)])):Promise.resolve([]));
 mount();fireEvent.click(screen.getByRole('button',{name:'Ostatnie 30 dni'}));
 await screen.findByText('Wyniki według dnia');expect(document.querySelector('.sk-metric-value').textContent).toBe('24');
 await act(async()=>{resolveOld([row(999)]);});expect(document.querySelector('.sk-metric-value').textContent).toBe('24');
});
it('rejects inverted and excessive date ranges without requesting them',async()=>{
 mount();await screen.findByText('Wyniki według dnia');fireEvent.click(screen.getByRole('button',{name:'Własny zakres'}));
 api.get.mockClear();fireEvent.change(screen.getByLabelText('Od'),{target:{value:'2099-01-01'}});
 expect(await screen.findByRole('alert')).toBeTruthy();expect(api.get).not.toHaveBeenCalled();expect(dailyRows()).toBeNull();
 expect(analyticsRangeError('2020-01-01','2026-01-01')).toMatch('366');
 expect(analyticsRangeError('2026-02-30','2026-03-02')).toBeTruthy();
});
it('keeps step failures separate from daily analytics and allows retry',async()=>{
 let fail=true;api.get.mockImplementation(url=>url.includes('/steps')?(fail?Promise.reject(Error('offline')):Promise.resolve([])):Promise.resolve([row()]));
 mount();await screen.findByText('Wyniki według dnia');expect(await screen.findByRole('alert')).toBeTruthy();
 expect(screen.queryByText(/Brak danych. Wyślij/)).toBeNull();
 fail=false;fireEvent.click(screen.getByRole('button',{name:'Spróbuj ponownie'}));
 await waitFor(()=>expect(screen.queryByRole('alert')).toBeNull());expect(screen.getByText(/Brak danych. Wyślij/)).toBeTruthy();
});
it('shows actual repeated events without claiming a conversion percentage and exposes legend controls',async()=>{
 mount();await screen.findByText('Wyniki według dnia');
 expect([...document.querySelectorAll('.sk-metric-value')].map(e=>e.textContent)).toEqual(['12','2','30','4']);
 expect(screen.getByText(/Te liczby nie są lejkiem/)).toBeTruthy();
 const legend=screen.getByRole('button',{name:'Wszystkie otwarcia'});expect(legend.getAttribute('aria-pressed')).toBe('false');fireEvent.click(legend);expect(legend.getAttribute('aria-pressed')).toBe('true');
 expect(screen.getByText(/Cały okres kampanii — filtr/)).toBeTruthy();
});
it('fills calendar gaps across DST and exports every daily row',()=>{
 const rows=campaignDailyRows([{date:'2026-03-28',sent:'2'},{date:'2026-03-30',sent:3,total_replies:1}],'2026-03-28','2026-03-30');
 expect(rows.map(r=>r.date)).toEqual(['2026-03-28','2026-03-29','2026-03-30']);expect(rows.map(r=>r.sent)).toEqual([2,0,3]);
 const csv=analyticsCsv(rows);expect(csv.startsWith('\uFEFF')).toBe(true);expect(csv.split('\r\n')).toHaveLength(5);expect(csv).toContain('"2026-03-29","0"');
});
it('reports an empty successful period without an error or a misleading chart',async()=>{
 api.get.mockResolvedValue([]);mount();await screen.findByText(/Brak zdarzeń/);expect(screen.queryByRole('alert')).toBeNull();expect(screen.queryByText('Aktywność wysyłki')).toBeNull();expect(document.querySelector('.sk-metric-value').textContent).toBe('0');
});
