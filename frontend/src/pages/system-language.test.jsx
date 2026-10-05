import React from 'react';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,cleanup,waitFor} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {LanguageProvider,useLanguage} from '../context/LanguageContext';
import {SystemHealthProvider} from '../context/SystemHealthContext';
import {operationsText} from '../context/operationsLanguage';
import SystemHealth from './SystemHealth';
import DeliverabilityTips from './DeliverabilityTips';
import {api} from '../api';
vi.mock('../api',()=>({api:{get:vi.fn()}}));
vi.mock('../context/AuthContext',()=>({useAuth:()=>({user:{id:1,role:'admin'}}),useOptionalAuth:()=>null}));
vi.mock('../context/AppModeContext',()=>({useAppMode:()=>({isProduction:true})}));
const t=(l,s,p)=>operationsText(l,s,p);
function Switch(){const {setLanguage}=useLanguage();return <>{['pl','de','ru'].map(l=><button key={l} onClick={()=>setLanguage(l)}>{l}</button>)}</>;}
const fixture={security:{external_mailbox_encryption_key:true},smtp:{accounts:[{inbox_id:1,inbox_email:'client@example.test',last_tested_at:'2026-09-30T10:00:00Z',last_test_ok:false,last_test_error:'Provider original error',imap_configured:true}]},inboxes:[],storage:{available:true,used_percent:96,free_bytes:1024,total_bytes:8192}};
beforeEach(()=>{vi.clearAllMocks();localStorage.clear();api.get.mockResolvedValue(fixture);});
afterEach(()=>{cleanup();localStorage.clear();});
it.each(['de','ru'])('preserves diagnostic filter, muted IDs and error severity in %s',async lang=>{
 render(<LanguageProvider><MemoryRouter><Switch/><SystemHealthProvider><SystemHealth/></SystemHealthProvider></MemoryRouter></LanguageProvider>);
 await screen.findByText('Provider original error');fireEvent.change(screen.getByRole('combobox',{name:'Wyniki kontroli'}),{target:{value:'error'}});
 fireEvent.click(screen.getAllByTitle('Wycisz tę kategorię')[0]);api.get.mockClear();fireEvent.click(screen.getByRole('button',{name:lang,exact:true}));
 expect(screen.getByRole('combobox',{name:t(lang,'Wyniki kontroli')}).value).toBe('error');expect(api.get).not.toHaveBeenCalled();
 expect(JSON.parse(localStorage.getItem('sekaro_health_muted_v1'))).toContain('smtp_imap');
 expect(screen.getByText(t(lang,'Powiadomienia dla tej kategorii są wyciszone; stan nadal wpływa na ocenę systemu.'))).toBeTruthy();
 expect(document.querySelector('.sk-health-summary-error')).toBeTruthy();
 api.get.mockRejectedValueOnce(Error('offline'));fireEvent.click(screen.getByRole('button',{name:t(lang,'Odśwież'),exact:true}));
 await waitFor(()=>expect(document.querySelector('.sk-health-summary-unknown')).toBeTruthy());
 expect(screen.queryByText(t(lang,'Monitorowane elementy działają poprawnie.'))).toBeNull();
});
it.each(['de','ru'])('preserves expanded guidance and its selected category in %s',async lang=>{
 render(<LanguageProvider><MemoryRouter><Switch/><DeliverabilityTips/></MemoryRouter></LanguageProvider>);
 fireEvent.click(screen.getByRole('button',{name:/Reputacja nadawcy/}));
 fireEvent.click(screen.getByRole('button',{name:/Respektuj każde wypisanie/}));
 fireEvent.click(screen.getByRole('button',{name:lang,exact:true}));
 expect(screen.getByRole('button',{name:new RegExp(t(lang,'Reputacja nadawcy'))}).getAttribute('aria-pressed')).toBe('true');
 expect(screen.getByRole('button',{name:new RegExp(t(lang,'Respektuj każde wypisanie'))}).getAttribute('aria-expanded')).toBe('true');
 expect(api.get).not.toHaveBeenCalled();
});
