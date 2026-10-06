import React from 'react';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,cleanup,waitFor,act} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import ContactGroups,{AddToGroup,CampaignGroupPicker} from './ContactGroups';
import CrmNavigation,{isCrmPath} from './CrmNavigation';
import {api} from '../api';
vi.mock('../api',()=>({api:{get:vi.fn(),post:vi.fn()}}));
const group={id:4,name:'Partnerzy',member_count:1};
beforeEach(()=>{vi.clearAllMocks();localStorage.clear();api.get.mockImplementation(async p=>p==='/leads/lists'?[group]:[{id:8,name:'Ala',email:'ala@example.com'}]);api.post.mockResolvedValue({id:4});});
afterEach(cleanup);
it('creates a group from selected stable IDs and blocks double submission',async()=>{
 let resolve;api.post.mockImplementation(()=>new Promise(r=>{resolve=r;}));const saved=vi.fn();render(<AddToGroup leadIds={[8,9]} onClose={()=>{}} onSaved={saved}/>);
 fireEvent.change(screen.getByLabelText('Nazwa grupy'),{target:{value:'Partnerzy'}});const form=screen.getByLabelText('Nazwa grupy').closest('form');fireEvent.submit(form);fireEvent.submit(form);
 expect(api.post).toHaveBeenCalledTimes(1);expect(api.post).toHaveBeenCalledWith('/leads/lists',{name:'Partnerzy',lead_ids:[8,9]});await act(async()=>resolve({id:4}));expect(saved).toHaveBeenCalledWith(4);
});
it('removes membership only and searches existing contacts to add members',async()=>{
 render(<MemoryRouter initialEntries={['/crm/groups?group=4']}><ContactGroups/></MemoryRouter>);
 fireEvent.click(await screen.findByLabelText('ala@example.com'));fireEvent.click(screen.getByRole('button',{name:'Usuń z grupy (1)'}));
 await waitFor(()=>expect(api.post).toHaveBeenCalledWith('/leads/lists/4/members/remove',{lead_ids:[8]}));
 fireEvent.click(screen.getByRole('button',{name:'Dodaj kontakty'}));await screen.findByRole('dialog');await waitFor(()=>expect(api.get).toHaveBeenCalledWith('/leads?q='));
 fireEvent.change(screen.getAllByRole('searchbox')[1],{target:{value:'Ala'}});await waitFor(()=>expect(api.get).toHaveBeenCalledWith('/leads?q=Ala'));
});
it('keeps group enrollment errors visible and reports suppression counts',async()=>{
 const added=vi.fn();api.post.mockRejectedValueOnce(Error('Brak dostępu')).mockResolvedValueOnce({added:2,already_enrolled:1,suppressed:3,errors:0});render(<CampaignGroupPicker campaignId={7} onAdded={added}/>);
 fireEvent.click(screen.getByRole('button',{name:'Z grupy kontaktów'}));await screen.findByRole('option',{name:'Partnerzy (1)'});fireEvent.change(screen.getByLabelText('Wybierz grupę'),{target:{value:'4'}});fireEvent.click(screen.getByRole('button',{name:'Dodaj odbiorców'}));
 await screen.findByText('Brak dostępu');expect(added).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'Dodaj odbiorców'}));await waitFor(()=>expect(added).toHaveBeenCalledTimes(1));expect(screen.getByRole('status').textContent).toContain('Zablokowane: 3');expect(api.post).toHaveBeenLastCalledWith('/campaigns/7/contact-groups/4?skip_duplicates=true',{});
});
it('uses one CRM navigation across legacy deep links and keeps sales context',()=>{
 for(const p of ['/leads/8','/companies/4','/sales','/crm/groups'])expect(isCrmPath(p)).toBe(true);expect(isCrmPath('/campaigns')).toBe(false);
 render(<MemoryRouter initialEntries={['/sales?company_id=4&view=calendar']}><CrmNavigation/></MemoryRouter>);
 expect(screen.getByRole('link',{name:'Kalendarz'}).getAttribute('aria-current')).toBe('page');expect(screen.getByRole('link',{name:'Zadania i spotkania'}).getAttribute('href')).toBe('/sales?company_id=4&view=agenda');
});
