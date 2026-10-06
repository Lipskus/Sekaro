import React from 'react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {act, cleanup, fireEvent, render, screen, waitFor, within} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {api} from '../api';
import Notifications from './Notifications';
import SystemHealth from './SystemHealth';
import Schedule from './Schedule';
import ScheduleCalendar, {groupCalendarItems} from '../redesign/ScheduleCalendar';

const mocks=vi.hoisted(()=>({notify:vi.fn(), confirm:vi.fn(), refresh:vi.fn(), health:{},production:true}));
vi.mock('../api',()=>({api:{get:vi.fn(),post:vi.fn(),patch:vi.fn(),put:vi.fn(),del:vi.fn()},apiCache:{get:()=>undefined}}));
vi.mock('../context/NotificationContext',()=>({useNotify:()=>mocks.notify}));
vi.mock('../context/ConfirmContext',()=>({useConfirm:()=>mocks.confirm}));
vi.mock('../context/NotificationsContext',()=>({useNotifications:()=>({refresh:mocks.refresh})}));
vi.mock('../context/SystemHealthContext',()=>({useSystemHealth:()=>mocks.health}));
vi.mock('../context/AppModeContext',()=>({useAppMode:()=>({isProduction:mocks.production})}));
const config={enabled:true,notification_email:'',events:[],rate_limit_per_hour:10};
const row=(id,read=false)=>({id,title:`Zdarzenie ${id}`,message:`Treść ${id}`,event_type:'lead.replied',created_at:'2026-09-28T09:00:00',read_at:read?'2026-09-28T10:00:00':null});
function mount(Page){return render(<MemoryRouter future={{v7_startTransition:true,v7_relativeSplatPath:true}}><Page/></MemoryRouter>);}
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{resolve,reject,promise};}
beforeEach(()=>{
 vi.clearAllMocks();mocks.production=true;api.post.mockReset();vi.spyOn(window,'scrollTo').mockImplementation(()=>{});mocks.confirm.mockResolvedValue(true);
 api.get.mockImplementation(async path=>path==='/notifications/config'?config:path==='/settings/webhooks/events'?{events:['lead.replied','email.sent']}:{items:[],total:0,unread:0});
});
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.useRealTimers();});

describe('notification workspace',()=>{
 it('limits unread pagination by unread count, not global total',async()=>{
  const base=api.get.getMockImplementation();api.get.mockImplementation(p=>p.startsWith('/notifications?')?Promise.resolve({items:[row(1)],total:120,unread:1}):base(p));
  mount(Notifications);await screen.findByRole('button',{name:/Zdarzenie 1/});
  fireEvent.click(screen.getByRole('tab',{name:'Nieprzeczytane (1)'}));
  await screen.findByText('Wyświetlono 1 z 1 powiadomień');
  expect(screen.queryByRole('button',{name:'Wczytaj więcej'})).toBeNull();
  expect(screen.getByRole('tab',{name:'Wszystkie (120)'})).toBeTruthy();
 });
 it('selects without marking read and serializes the explicit read action, refilling unread from offset zero',async()=>{
  let wasRead=false;const gate=deferred(),base=api.get.getMockImplementation();
  api.get.mockImplementation(p=>p.startsWith('/notifications?')?Promise.resolve({items:wasRead?[row(2)]:[row(1),row(2)],total:80,unread:wasRead?1:2}):base(p));
  api.patch.mockImplementation(()=>gate.promise.then(()=>{wasRead=true;}));
  mount(Notifications);await screen.findByRole('tab',{name:'Nieprzeczytane (2)'});
  fireEvent.click(screen.getByRole('tab',{name:'Nieprzeczytane (2)'}));
  fireEvent.click(await screen.findByRole('button',{name:/Zdarzenie 1/}));expect(api.patch).not.toHaveBeenCalled();
  const read=screen.getByRole('button',{name:'Oznacz jako przeczytane',exact:true});fireEvent.click(read);fireEvent.click(read);
  expect(api.patch).toHaveBeenCalledTimes(1);
  await act(async()=>gate.resolve());
  await screen.findByRole('tab',{name:'Nieprzeczytane (1)'});
  expect(screen.queryByRole('button',{name:/Zdarzenie 1/})).toBeNull();
  expect(screen.getByRole('heading',{name:'Zdarzenie 1'})).toBeTruthy();
  expect(api.get.mock.calls.filter(([p])=>p.startsWith('/notifications?')).at(-1)[0]).toContain('offset=0');
 });
 it('restarts pagination after a deletion instead of skipping the shifted row',async()=>{
  let rows=Array.from({length:51},(_,i)=>row(i+1,true));const base=api.get.getMockImplementation();
  api.get.mockImplementation(p=>{if(!p.startsWith('/notifications?'))return base(p);const offset=Number(new URLSearchParams(p.split('?')[1]).get('offset'));return Promise.resolve({items:rows.slice(offset,offset+50),total:rows.length,unread:0});});
  api.del.mockImplementation(async()=>{rows=rows.filter(n=>n.id!==1);});
  mount(Notifications);await screen.findByRole('button',{name:/Zdarzenie 50 /});
  fireEvent.click(screen.getAllByRole('button',{name:'Usuń powiadomienie'})[0]);
  await screen.findByRole('button',{name:/Zdarzenie 51 /});
  expect(screen.queryByRole('button',{name:/Zdarzenie 1 /})).toBeNull();
  expect(screen.queryByRole('button',{name:'Wczytaj więcej'})).toBeNull();
 });
 it('does not let an old tab fetch overwrite the current list',async()=>{
  const old=deferred(),base=api.get.getMockImplementation();
  api.get.mockImplementation(p=>p.startsWith('/notifications?')?(p.includes('unread_only')?Promise.resolve({items:[row(2)],total:2,unread:1}):old.promise):base(p));
  mount(Notifications);fireEvent.click(screen.getByRole('tab',{name:'Nieprzeczytane (0)'}));
  await screen.findByRole('button',{name:/Zdarzenie 2/});
  await act(async()=>old.resolve({items:[row(1,true)],total:2,unread:1}));
  expect(screen.queryByRole('button',{name:/Zdarzenie 1/})).toBeNull();
 });
 it('preserves failed preference drafts and blocks double saving and editing during save',async()=>{
  const gate=deferred();api.put.mockReturnValue(gate.promise);const {container}=mount(Notifications);
  fireEvent.click(screen.getByRole('tab',{name:'Preferencje'}));
  const limit=await screen.findByRole('spinbutton',{name:'Limit powiadomień na godzinę'});
  fireEvent.change(limit,{target:{value:'25'}});expect(screen.getByText('Niezapisane zmiany')).toBeTruthy();
  fireEvent.submit(container.querySelector('form'));fireEvent.submit(container.querySelector('form'));
  expect(api.put).toHaveBeenCalledTimes(1);expect(limit.closest('fieldset').disabled).toBe(true);
  await act(async()=>gate.reject(new Error('Zapis niedostępny')));
  expect(await screen.findByRole('alert')).toBeTruthy();expect(limit.value).toBe('25');
  expect(limit.closest('fieldset').disabled).toBe(false);
  fireEvent.click(screen.getByRole('button',{name:'Odrzuć zmiany'}));
  await waitFor(()=>expect(limit.value).toBe('10'));
 });
});

describe('calendar and schedule',()=>{
 it('sorts equivalent timezone representations chronologically inside a block',()=>{
  const items=[{type:'scheduled',slot_id:1,campaign_id:2,scheduled_at:'2026-09-28T09:30:00+02:00'},{type:'scheduled',slot_id:2,campaign_id:2,scheduled_at:'2026-09-28T07:00:00Z'}];
  expect(groupCalendarItems(items,'Europe/Warsaw')[0].items.map(i=>i.slot_id)).toEqual([2,1]);
 });
 it('clears a selected weekend group when weekends become hidden',()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-28T10:00:00Z'));
  render(<MemoryRouter><ScheduleCalendar items={[{type:'scheduled',slot_id:1,campaign_id:2,campaign_name:'Weekend QA',lead_email:'qa@example.invalid',scheduled_at:'2026-10-03T12:00:00Z'}]} onRangeChange={()=>{}} onPreview={()=>{}} onOpenQueue={()=>{}}/></MemoryRouter>);
  fireEvent.click(screen.getByRole('button',{name:/Weekend QA, 2026-10-03/}));
  expect(screen.getByRole('heading',{name:'Weekend QA'})).toBeTruthy();
  fireEvent.click(screen.getByRole('switch',{name:'Ukryj weekend'}));
  expect(screen.queryByRole('heading',{name:'Weekend QA'})).toBeNull();
  expect(screen.getByRole('heading',{name:'Dzisiaj'})).toBeTruthy();
 });
 it('reports accepted but unfinished recalculation as unconfirmed rather than success',async()=>{
  vi.useFakeTimers();mocks.production=false;
  api.get.mockImplementation(async p=>p.startsWith('/schedule/sent?')||p.startsWith('/schedule/scheduled?')?[]:{});
  api.post.mockResolvedValue({accepted:true});
  mount(Schedule);await act(async()=>{});
  fireEvent.click(screen.getByRole('button',{name:/Przelicz kampanie/}));
  await act(async()=>{await vi.advanceTimersByTimeAsync(121000);});
  expect(mocks.notify).toHaveBeenCalledWith(expect.objectContaining({type:'error',message:expect.stringContaining('nie potwierdził zakończenia')}));
  expect(mocks.notify.mock.calls.some(([n])=>n.type==='success')).toBe(false);
 });
 it('renders queue validation issues in the page',async()=>{
  mocks.production=false;
  api.get.mockImplementation(async p=>p.startsWith('/schedule/sent?')||p.startsWith('/schedule/scheduled?')?[]:{});
  api.post.mockResolvedValue({total_slots_checked:3,issues:[{campaign_name:'Kampania QA',lead_email:'qa@example.invalid',details:'Przekroczono okno wysyłki'}]});
  mount(Schedule);fireEvent.click(await screen.findByRole('button',{name:/Sprawdź kolejkę/}));
  expect(await screen.findByText('Przekroczono okno wysyłki')).toBeTruthy();
  expect(api.post).toHaveBeenCalledWith('/schedule/validate-queue');
 });
 it('shows a preview fetch error and recovers via retry without navigating to an unrelated message',async()=>{
  const item={type:'scheduled',slot_id:7,campaign_id:3,campaign_name:'Kampania QA',lead_email:'qa@example.invalid',scheduled_at:new Date().toISOString()};let fail=true;
  api.get.mockImplementation(async p=>{
   if(p==='/schedule/scheduled/7'){if(fail)throw new Error('offline');return {...item,sequence_body:'Treść QA'};}
   if(p.startsWith('/schedule/scheduled?'))return[item];if(p.startsWith('/schedule/sent?'))return[];return{};
  });
  mount(Schedule);fireEvent.click(await screen.findByRole('button',{name:/qa@example.invalid/}));
  expect(await screen.findByRole('alert')).toBeTruthy();expect(screen.queryByText('Treść QA')).toBeNull();
  fail=false;fireEvent.click(screen.getByRole('button',{name:'Spróbuj ponownie'}));
  expect(await screen.findByText('Treść QA')).toBeTruthy();
 });
});

describe('diagnostic results',()=>{
 it('hides stale green disk readings and check cards after refresh fails',()=>{
  mocks.health={checks:[{id:'storage',label:'Stary pomiar',status:'ok',issues:[],meta:{}}],rawData:{storage:{available:true,used_percent:31}},loading:false,lastChecked:new Date('2026-09-28T08:00:00Z'),fetchError:'offline',refresh:vi.fn(),muted:new Set(),toggleMute:vi.fn(),overallStatus:'unknown'};
  const {container}=mount(SystemHealth);
  expect(screen.queryByText('31%')).toBeNull();expect(screen.queryByText('Stary pomiar')).toBeNull();
  expect(container.querySelector('.sk-health-metrics .tone-green')).toBeNull();
  expect(screen.getByText(/Ostatni udany pomiar:/)).toBeTruthy();
 });
 it('excludes informational entries from problem counts and filters actual checks',()=>{
  mocks.health={checks:[{id:'a',label:'Sprawny moduł',status:'ok',issues:[{level:'info',text:'Informacja'}],meta:{}},{id:'b',label:'Błędny moduł',status:'error',issues:[{level:'error',text:'Awaria'}],meta:{}}],rawData:{},loading:false,lastChecked:null,fetchError:null,refresh:vi.fn(),muted:new Set(),toggleMute:vi.fn(),overallStatus:'error'};
  mount(SystemHealth);expect(screen.getByText(/Problemy: 1 —/)).toBeTruthy();
  fireEvent.change(screen.getByRole('combobox',{name:'Wyniki kontroli'}),{target:{value:'attention'}});
  expect(screen.queryByText('Sprawny moduł')).toBeNull();expect(screen.getByText('Błędny moduł')).toBeTruthy();
 });
});
