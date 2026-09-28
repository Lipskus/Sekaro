import React from 'react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {ConfirmProvider,useConfirm} from './ConfirmContext';
import Shell from '../redesign/Shell';

vi.mock('../api',()=>({api:{get:vi.fn().mockResolvedValue([])}}));
vi.mock('./AuthContext',()=>({useAuth:()=>({user:{username:'qa',role:'admin'},logout:vi.fn()})}));
vi.mock('./SystemHealthContext',()=>({useSystemHealth:()=>({overallStatus:'ok',rawData:null,loading:false,fetchError:null})}));
vi.mock('./NotificationsContext',()=>({useNotifications:()=>({count:0})}));
vi.mock('./AppModeContext',()=>({useAppMode:()=>({isProduction:true})}));
vi.mock('./LanguageContext',()=>({useLanguage:()=>{const labels={
 'shell.closeMenu':'Zamknij menu','shell.openMenu':'Otwórz menu','shell.mainNavigation':'Nawigacja główna','shell.search':'Szukaj w Sekaro',
 'shell.searchPlaceholder':'Szukaj','shell.notifications':'Powiadomienia','shell.administrator':'Administrator','shell.user':'Użytkownik','shell.system':'System',
 'shell.version':'Wersja','shell.environment':'Środowisko','shell.production':'Produkcja','shell.test':'Testowe','shell.disk':'Dysk','shell.noData':'Brak danych',
 'shell.free':'wolne','shell.diskUsage':'Wykorzystanie dysku','shell.selfHostedMotto':'Twoje dane. Twoje zasady.','shell.allGood':'Wszystko działa',
 'shell.needsAttention':'Wymaga uwagi','shell.problem':'Wykryto problem','shell.unknown':'Stan nieznany','shell.checking':'Sprawdzanie…',
 'shell.searching':'Wyszukiwanie…','shell.searchFailed':'Błąd wyszukiwania','shell.noResults':'Brak wyników.','shell.searchMessages':'Szukaj w wiadomościach',
 'shell.campaign':'Kampania','shell.template':'Szablon','shell.settings':'Ustawienia','shell.queue':'Kolejka wysyłki','shell.language':'Język','shell.logout':'Wyloguj się',
 'appearance.language':'Język','nav.dashboard':'Dashboard','nav.campaigns':'Kampanie','nav.inboxes':'Skrzynki','nav.leads':'Kontakty','nav.templates':'Szablony',
 'nav.unibox':'Wątki','nav.analytics':'Analityka','nav.schedule':'Harmonogram','nav.domains':'Domeny','nav.settings':'Ustawienia','nav.health':'Stan systemu'
 };return {language:'pl',setLanguage:vi.fn(),languages:[{code:'pl',label:'Polski'}],t:key=>labels[key]||key};}}));

function ConfirmationButton({message}){
 const confirm=useConfirm();
 return <button type="button" onClick={()=>confirm(message)}>Otwórz potwierdzenie</button>;
}

beforeEach(()=>{document.body.style.overflow='auto';vi.spyOn(window,'scrollTo').mockImplementation(()=>{});});
afterEach(()=>{cleanup();document.body.style.overflow='';});

describe('responsive shell and confirmation foundation',()=>{
 it('locks background scrolling while the mobile navigation is open and restores it on close',()=>{
  render(<MemoryRouter><Shell><p>Treść</p></Shell></MemoryRouter>);
  fireEvent.click(screen.getByRole('button',{name:'Otwórz menu'}));
  expect(document.body.style.overflow).toBe('hidden');
  fireEvent.click(screen.getByRole('button',{name:'Zamknij menu'}));
  expect(document.body.style.overflow).toBe('auto');
 });

 it('uses a destructive action treatment for irreversible confirmations',()=>{
  render(<ConfirmProvider><ConfirmationButton message="Usunąć zaznaczone kampanie? Tej operacji nie można cofnąć."/></ConfirmProvider>);
  fireEvent.click(screen.getByRole('button',{name:'Otwórz potwierdzenie'}));
  expect(screen.getByRole('heading',{name:'Potwierdź usunięcie'})).toBeTruthy();
  expect(screen.getByRole('button',{name:'Usuń'}).className).toContain('sk-btn-danger');
 });

 it('keeps non-destructive confirmations on the primary treatment',()=>{
  render(<ConfirmProvider><ConfirmationButton message="Przeliczyć harmonogram wszystkich kampanii?"/></ConfirmProvider>);
  fireEvent.click(screen.getByRole('button',{name:'Otwórz potwierdzenie'}));
  expect(screen.getByRole('heading',{name:'Potwierdź operację'})).toBeTruthy();
  expect(screen.getByRole('button',{name:'Potwierdź'}).className).toContain('sk-btn-primary');
 });
});
