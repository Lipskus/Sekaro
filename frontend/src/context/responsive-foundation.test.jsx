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
vi.mock('./LanguageContext',()=>({useLanguage:()=>({language:'pl',setLanguage:vi.fn(),languages:[{code:'pl',label:'Polski'}]})}));

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
