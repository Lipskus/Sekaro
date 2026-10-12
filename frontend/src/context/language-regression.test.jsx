import React from 'react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {LanguageProvider,useLanguage} from './LanguageContext';
import Shell from '../redesign/Shell';

vi.mock('../api',()=>({api:{get:vi.fn().mockResolvedValue([])}}));
vi.mock('./AuthContext',()=>({useAuth:()=>({user:{username:'qa',role:'admin'},logout:vi.fn()})}));
vi.mock('./SystemHealthContext',()=>({useSystemHealth:()=>({overallStatus:'ok',rawData:null,loading:false,fetchError:null})}));
vi.mock('./NotificationsContext',()=>({useNotifications:()=>({count:0})}));
vi.mock('./AppModeContext',()=>({useAppMode:()=>({isProduction:true})}));

function LanguageSwitch(){
 const {setLanguage}=useLanguage();
 return <button type="button" onClick={()=>setLanguage('de')}>Deutsch aktivieren</button>;
}

beforeEach(()=>{localStorage.clear();localStorage.setItem('sekaro.language','en');vi.spyOn(window,'scrollTo').mockImplementation(()=>{});});
afterEach(()=>{cleanup();localStorage.clear();document.documentElement.lang='';});

describe('language regression',()=>{
 it('translates the redesign shell immediately and persists the selected language',()=>{
  render(<LanguageProvider><MemoryRouter><Shell><LanguageSwitch/></Shell></MemoryRouter></LanguageProvider>);
  expect(screen.getByRole('link',{name:'Dashboard'})).toBeTruthy();
  expect(screen.getByRole('link',{name:'Campaigns'})).toBeTruthy();
  expect(screen.getByRole('searchbox',{name:'Search Sekaro'})).toBeTruthy();
  expect(document.documentElement.lang).toBe('en');

  fireEvent.click(screen.getByRole('button',{name:'Deutsch aktivieren'}));
  expect(screen.getByRole('link',{name:'Übersicht'})).toBeTruthy();
  expect(screen.getByRole('link',{name:'Kampagnen'})).toBeTruthy();
  expect(screen.getByRole('searchbox',{name:'Sekaro durchsuchen'})).toBeTruthy();
  expect(localStorage.getItem('sekaro.language')).toBe('de');
  expect(document.documentElement.lang).toBe('de');
 });
});
