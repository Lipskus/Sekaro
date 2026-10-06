import React from 'react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {api} from '../api';
import Dashboard from '../redesign/pages/Dashboard';
vi.mock('../api',()=>({api:{get:vi.fn()}}));
vi.mock('../context/AuthContext',()=>({useAuth:()=>({user:{username:'QA'}})}));
vi.mock('../context/SystemHealthContext',()=>({useSystemHealth:()=>({overallStatus:'ok',loading:false,fetchError:new Error('Niedostępne')})}));
vi.mock('../redesign/ActivityChart',()=>({default:({rows,days})=><div data-testid="chart">{days}:{rows[0]?.sent}</div>}));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
const mount=()=>render(<MemoryRouter future={{v7_startTransition:true,v7_relativeSplatPath:true}}><Dashboard/></MemoryRouter>);
beforeEach(()=>{vi.clearAllMocks();api.get.mockImplementation(async p=>p.startsWith('/ui/unibox?')?{items:[]}:[]);});
afterEach(cleanup);
it('does not present empty totals during initial loading or failure, and retries',async()=>{
 const gate=deferred(),original=api.get.getMockImplementation();api.get.mockImplementation(p=>p==='/inboxes'?gate.promise:original(p));
 mount();expect(screen.getByText('Ładowanie podsumowania')).toBeTruthy();expect(screen.queryByText('Utwórz pierwszą kampanię.')).toBeNull();
 await act(async()=>gate.reject(new Error('Brak danych')));expect(screen.getByText('Podsumowanie niedostępne')).toBeTruthy();
 expect(screen.queryByText('Utwórz pierwszą kampanię.')).toBeNull();
 api.get.mockImplementation(original);fireEvent.click(screen.getByRole('button',{name:/Spróbuj ponownie/}));
 expect(await screen.findByText('Utwórz pierwszą kampanię.')).toBeTruthy();
});
it('ignores an old range response and hides a chart when the selected range fails',async()=>{
 const original=api.get.getMockImplementation(),old=deferred(),newer=deferred();let calls=0;
 api.get.mockImplementation(p=>p.startsWith('/analytics/daily?')?(++calls===1?Promise.resolve([{sent:1}]):calls===2?old.promise:calls===3?newer.promise:Promise.reject(new Error('Nie pobrano'))):original(p));
 mount();await screen.findByTestId('chart');
 fireEvent.change(screen.getByRole('combobox',{name:'Zakres wykresu'}),{target:{value:'14'}});
 expect(screen.queryByTestId('chart')).toBeNull();
 fireEvent.change(screen.getByRole('combobox',{name:'Zakres wykresu'}),{target:{value:'7'}});
 await act(async()=>newer.resolve([{sent:7}]));expect(screen.getByTestId('chart').textContent).toBe('7:7');
 await act(async()=>old.resolve([{sent:14}]));expect(screen.getByTestId('chart').textContent).toBe('7:7');
 fireEvent.change(screen.getByRole('combobox',{name:'Zakres wykresu'}),{target:{value:'14'}});
 await waitFor(()=>expect(screen.getByText('Wykres niedostępny')).toBeTruthy());expect(screen.queryByTestId('chart')).toBeNull();
});

it.each(['de','ru'])('preserves the dashboard range and unknown DNS state in %s',async language=>{
 const {LanguageProvider,useLanguage}=await import('../context/LanguageContext');const {operationsText:t}=await import('../context/operationsLanguage');
 function Switch(){const {setLanguage}=useLanguage();return <button onClick={()=>setLanguage(language)}>language</button>;}
 localStorage.clear();api.get.mockImplementation(async p=>p==='/inboxes'?[{email:'sender@example.test',max_emails_per_day:100}]:p==='/campaigns'?[{id:1,name:'Nazwa klienta',stats:{}}]:p.startsWith('/ui/unibox?')?{items:[]}:[]);
 render(<LanguageProvider><MemoryRouter><Switch/><Dashboard/></MemoryRouter></LanguageProvider>);
 await screen.findByTestId('chart');fireEvent.change(screen.getByRole('combobox',{name:'Zakres wykresu'}),{target:{value:'14'}});await waitFor(()=>expect(screen.getByTestId('chart').textContent).toBe('14:'));
 api.get.mockClear();fireEvent.click(screen.getByRole('button',{name:'language'}));
 expect(screen.getByRole('combobox',{name:t(language,'Zakres wykresu')}).value).toBe('14');expect(api.get).not.toHaveBeenCalled();
 expect(screen.getByText(t(language,'Brak pomiaru DNS'))).toBeTruthy();expect(screen.getByText(t(language,'Nie sprawdzono'))).toBeTruthy();expect(screen.getByText('Nazwa klienta')).toBeTruthy();expect(screen.getByText('example.test')).toBeTruthy();
 localStorage.clear();
});
