import React from 'react';
import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,cleanup,waitFor} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {LeadsTab} from './CampaignDetail';
import {api} from '../api';
import {filterRecipients,emptyRecipientFilters,recipientsCsv} from '../redesign/campaignRecipients';
const mocks=vi.hoisted(()=>({notify:vi.fn(),confirm:vi.fn()}));
vi.mock('../api',()=>({api:{get:vi.fn(),post:vi.fn(),patch:vi.fn(),del:vi.fn()},apiCache:{}}));
vi.mock('../context/NotificationContext',()=>({useNotify:()=>mocks.notify}));
vi.mock('../context/ConfirmContext',()=>({useConfirm:()=>mocks.confirm}));
vi.mock('react-quill',()=>({default:()=>null}));
const leads=Array.from({length:31},(_,i)=>({lead_id:i+1,email:`person${i+1}@example.test`,name:i===30?'Łukasz Żółty':`Osoba ${i+1}`,status:'active',enrolled_at:'2026-09-01',opened:i%2===0,replied:i===30,clicked:i===30,custom_data:{company:i===30?'Żagle':'Marina'},email_verification_status:i===30?null:'valid'}));
function mount(data=leads){return render(<MemoryRouter><LeadsTab leads={data} campaignId={1} refresh={vi.fn()} onViewQueue={vi.fn()}/></MemoryRouter>)}
beforeEach(()=>{vi.clearAllMocks();localStorage.clear();api.get.mockImplementation(async path=>path==='/settings/email-verification'?{enabled:true}:{statuses:{valid:30}});api.post.mockResolvedValue({queued:0});mocks.confirm.mockResolvedValue(false)});
afterEach(cleanup);
describe('campaign recipients',()=>{
 it('resets pagination for search and clamps it after data shrinks',()=>{
  const result=mount();
  expect(screen.getAllByRole('row')).toHaveLength(26);
  fireEvent.click(screen.getByRole('button',{name:'Następna'}));
  expect(screen.getByText('Strona 2 z 2')).toBeTruthy();
  fireEvent.change(screen.getByRole('searchbox',{name:'Szukaj odbiorców'}),{target:{value:'lukasz'}});
  expect(screen.getByText('Strona 1 z 1')).toBeTruthy();
  expect(screen.getAllByRole('row')).toHaveLength(2);
  expect(screen.getByRole('button',{name:'person31@example.test'})).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'Wyczyść filtry'}));
  fireEvent.click(screen.getByRole('button',{name:'Następna'}));
  result.rerender(<MemoryRouter><LeadsTab leads={leads.slice(0,3)} campaignId={1} refresh={()=>{}}/></MemoryRouter>);
  expect(screen.getByText('Strona 1 z 1')).toBeTruthy();
  expect(screen.getAllByRole('row')).toHaveLength(4);
 });
 it('keeps add drafts when the drawer closes without submitting',()=>{
  mount();
  expect(screen.queryByRole('dialog')).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Dodaj kontakty',exact:true}));
  fireEvent.change(screen.getByLabelText('E-mail kontaktu'),{target:{value:'draft@example.test'}});
  fireEvent.click(screen.getByRole('button',{name:'Zamknij okno'}));
  expect(api.post).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Dodaj kontakty',exact:true}));
  expect(screen.getByLabelText('E-mail kontaktu').value).toBe('draft@example.test');
 });
 it('preserves all filters together and exports matching rows with custom fields',()=>{
  const selected=filterRecipients(leads,{...emptyRecipientFilters,opened:'yes',clicked:'yes',replied:'yes',verification:'unverified'},'zagle');
  expect(selected.map(l=>l.lead_id)).toEqual([31]);
  const csv=recipientsCsv(selected);
  expect(csv).toContain('person31@example.test');
  expect(csv).not.toContain('person1@example.test');
  expect(csv).toContain('"company"');
  expect(csv).toContain('"Żagle"');
 });
 it('quotes CSV separators and newlines and neutralizes spreadsheet formulas',()=>{
  const csv=recipientsCsv([{email:'x@example.test',name:'A, "B"\nC',custom_data:{company:'=1+1'}}]);
  expect(csv).toContain('"A, ""B""\nC"');
  expect(csv).toContain('"\'=1+1"');
 });
 it('requires confirmation before forcing verification again',async()=>{
  api.post.mockResolvedValue({queued:0,needs_reverify:true,total_verified:31});mount();
  fireEvent.click(await screen.findByRole('button',{name:'Zweryfikuj wszystkie e-maile'}));
  await waitFor(()=>expect(mocks.confirm).toHaveBeenCalled());
  expect(api.post).toHaveBeenCalledTimes(1);
  expect(api.post).toHaveBeenCalledWith('/campaigns/1/leads/verify');
 });
 it('toggles custom columns without changing the contact set',()=>{
  mount();fireEvent.click(screen.getByRole('button',{name:'Kolumny'}));
  fireEvent.click(screen.getByRole('checkbox',{name:'company'}));
  expect(screen.queryByRole('columnheader',{name:'company'})).toBeNull();
  expect(screen.getAllByRole('row')).toHaveLength(26);
  fireEvent.click(screen.getByRole('checkbox',{name:'company'}));
  expect(screen.getByRole('columnheader',{name:'company'})).toBeTruthy();
 });
});
