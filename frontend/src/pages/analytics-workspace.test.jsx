import React from 'react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {api} from '../api';
import Analytics from './Analytics';
import DeliverabilityTips from './DeliverabilityTips';
vi.mock('../api',()=>({api:{get:vi.fn()}}));
vi.mock('recharts',()=>({ResponsiveContainer:({children})=><div>{children}</div>,AreaChart:({children})=><div>{children}</div>,Area:()=>null,XAxis:()=>null,YAxis:()=>null,Tooltip:()=>null,CartesianGrid:()=>null}));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
const today=new Date().toISOString().slice(0,10);
const row=(id=1,extra={})=>({date:today,campaign_id:id,sent:10,total_replies:2,total_opens:5,unique_opens:3,total_clicks:1,unique_clicks:1,...extra});
const mount=(Page=Analytics)=>render(<MemoryRouter future={{v7_startTransition:true,v7_relativeSplatPath:true}}><Page/></MemoryRouter>);
const metric=title=>[...document.querySelectorAll('.sk-metric')].find(el=>el.querySelector('.sk-metric-title')?.textContent===title)?.querySelector('.sk-metric-value').textContent;
beforeEach(()=>{vi.clearAllMocks();api.get.mockImplementation(async p=>p==='/campaigns'?[{id:1,name:'Kampania A',stats:{emails_sent:200,scheduled:20}},{id:2,name:'Kampania B',stats:{}}]:p.startsWith('/analytics/daily?')?[row()]:{time_offset_days:0});});
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();});
it('preserves a user-selected range when the server clock arrives late',async()=>{
 const gate=deferred(),base=api.get.getMockImplementation();api.get.mockImplementation(p=>p==='/settings/time-offset'?gate.promise:base(p));
 mount();fireEvent.click(screen.getByRole('button',{name:'Ostatnie 30 dni'}));await screen.findByRole('region',{name:'Wyniki kampanii — tabela'});
 const request=api.get.mock.calls.filter(([p])=>p.startsWith('/analytics/daily?')).at(-1)[0];
 await act(async()=>gate.resolve({time_offset_days:20}));
 expect(screen.getByRole('button',{name:'Ostatnie 30 dni'}).getAttribute('aria-pressed')).toBe('true');
 expect(api.get.mock.calls.filter(([p])=>p.startsWith('/analytics/daily?')).at(-1)[0]).toBe(request);
});
it('blocks oversized custom ranges and export without issuing a daily query',async()=>{
 mount();await screen.findByRole('region',{name:'Wyniki kampanii — tabela'});fireEvent.click(screen.getByRole('button',{name:'Własny zakres'}));api.get.mockClear();
 fireEvent.change(screen.getByLabelText('Data początkowa'),{target:{value:'2020-01-01'}});
 expect(screen.getByRole('alert').textContent).toContain('366 dni');expect(screen.getByRole('button',{name:'Eksport CSV'}).disabled).toBe(true);
 expect(api.get.mock.calls.filter(([p])=>p.startsWith('/analytics/daily?'))).toHaveLength(0);
 expect(screen.queryByRole('region',{name:'Wyniki kampanii — tabela'})).toBeNull();
});
it('shows no ratio when replies occur without sends and never clips ratios over 100 percent',async()=>{
 const base=api.get.getMockImplementation();api.get.mockImplementation(p=>p.startsWith('/analytics/daily?')?Promise.resolve([row(1,{sent:0,total_replies:3})]):base(p));
 mount();await screen.findByRole('region',{name:'Wyniki kampanii — tabela'});expect(metric('Wskaźnik odpowiedzi')).toBe('—');
 api.get.mockImplementation(p=>p.startsWith('/analytics/daily?')?Promise.resolve([row(1,{sent:1,total_replies:3})]):base(p));
 fireEvent.click(screen.getByRole('button',{name:'Ostatnie 30 dni'}));await waitFor(()=>expect(metric('Wskaźnik odpowiedzi')).toBe('300%'));
});
it('filters metrics and campaign rows and ignores an obsolete response',async()=>{
 const old=deferred(),base=api.get.getMockImplementation();api.get.mockImplementation(p=>p.startsWith('/analytics/daily?')?(p.includes('campaign_id=2')?Promise.resolve([row(2,{sent:7}),row(1,{sent:90})]):old.promise):base(p));
 mount();await screen.findByRole('option',{name:'Kampania B'});fireEvent.change(screen.getByRole('combobox',{name:'Kampanie'}),{target:{value:'2'}});fireEvent.click(screen.getByRole('button',{name:'Dodaj'}));
 await screen.findByRole('region',{name:'Wyniki kampanii — tabela'});expect(metric('Wysłane')).toBe('7');expect(screen.queryByRole('link',{name:'Kampania A'})).toBeNull();
 await act(async()=>old.resolve([row(1,{sent:999})]));expect(metric('Wysłane')).toBe('7');
});
it('retries campaign metadata without presenting a false empty campaign list',async()=>{
 const base=api.get.getMockImplementation();api.get.mockImplementation(p=>p==='/campaigns'?Promise.reject(new Error('Lista niedostępna')):base(p));
 mount();await screen.findByRole('alert');expect(screen.queryByText('Brak kampanii do analizy.')).toBeNull();
 api.get.mockImplementation(base);fireEvent.click(screen.getByRole('button',{name:'Spróbuj ponownie'}));
 expect(await screen.findByRole('link',{name:'Kampania A'})).toBeTruthy();
});
it('exports the selected daily data as CSV and disables export after a failed reload',async()=>{
 const blobs=[];vi.stubGlobal('Blob',class{constructor(parts){this.parts=parts;blobs.push(this);}});
 const create=vi.fn(()=> 'blob:qa'),revoke=vi.fn();vi.stubGlobal('URL',class extends URL{static createObjectURL=create;static revokeObjectURL=revoke;});
 const click=vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{});
 mount();await screen.findByRole('region',{name:'Wyniki kampanii — tabela'});fireEvent.click(screen.getByRole('button',{name:'Eksport CSV'}));
 expect(click).toHaveBeenCalledTimes(1);expect(blobs[0].parts[0]).toContain(`"${today}","10","5","3","2","1","1"`);expect(revoke).toHaveBeenCalledWith('blob:qa');
 api.get.mockRejectedValue(new Error('offline'));fireEvent.click(screen.getByRole('button',{name:'Ostatnie 30 dni'}));await screen.findByRole('alert');expect(screen.getByRole('button',{name:'Eksport CSV'}).disabled).toBe(true);
});
it('keeps guide disclosures accessible and points each category to an existing tool',()=>{
 mount(DeliverabilityTips);const rule=screen.getByRole('button',{name:/Zweryfikuj domenę nadawczą/});
 const body=document.getElementById(rule.getAttribute('aria-controls'));expect(body.hidden).toBe(true);fireEvent.click(rule);expect(body.hidden).toBe(false);expect(rule.getAttribute('aria-expanded')).toBe('true');
 fireEvent.click(screen.getByRole('button',{name:/Treść wiadomości/}));expect(screen.getByRole('link',{name:'Otwórz szablony'}).getAttribute('href')).toBe('/templates');
 fireEvent.click(screen.getByRole('button',{name:/Bezpieczna wysyłka/}));expect(screen.getByRole('link',{name:'Ustawienia skrzynek'}).getAttribute('href')).toBe('/inboxes');
 expect(screen.getByRole('table')).toBeTruthy();expect(screen.getByText(/nie jest jeszcze dostępna/)).toBeTruthy();
});
