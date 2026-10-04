import React from 'react';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {render,screen,fireEvent,cleanup,waitFor,act} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import CrmContact from './CrmContact';
import Companies from './Companies';
import {api} from '../api';
const {confirm}=vi.hoisted(()=>({confirm:vi.fn()}));
vi.mock('../api',()=>({api:{get:vi.fn(),patch:vi.fn(),post:vi.fn(),delete:vi.fn()}}));
vi.mock('../context/ConfirmContext',()=>({useConfirm:()=>confirm}));
const profile={id:1,name:'Anna',email:'anna@example.com',kind:'person',members:[],companies:[],notes:[],operations:[],addresses:[{id:null,lead_id:1,email:'anna@example.com',primary:true}],custom_data:{}};
beforeEach(()=>{vi.clearAllMocks();confirm.mockResolvedValue(true);api.get.mockImplementation(path=>Promise.resolve(path==='/crm/contacts/1'?profile:path.startsWith('/leads?')?[{id:2,name:'Anna 2',email:'anna2@example.com'}]:[]));});
afterEach(cleanup);
it('preserves a failed note draft and locks duplicate submissions',async()=>{
 let reject;api.post.mockImplementation(()=>new Promise((_,r)=>{reject=r;}));
 render(<MemoryRouter><CrmContact id="1"/></MemoryRouter>);const note=await screen.findByLabelText('Treść notatki');fireEvent.change(note,{target:{value:'Call tomorrow'}});fireEvent.submit(note.closest('form'));fireEvent.submit(note.closest('form'));expect(api.post).toHaveBeenCalledTimes(1);expect(note.closest('fieldset').disabled).toBe(true);await act(async()=>reject(Error('Not saved')));await screen.findByText('Not saved');expect(note.value).toBe('Call tomorrow');
});
it('requires conflict selection and confirmation and submits the preview fingerprint',async()=>{
 const preview={target:profile,source:{...profile,id:2,email:'anna2@example.com'},conflicts:[{field:'name',target:'Anna',source:'Anna 2'}],fingerprint:'a'.repeat(64)};
 const base=api.get.getMockImplementation();api.get.mockImplementation(p=>p.includes('merge-preview')?Promise.resolve(preview):base(p));api.post.mockResolvedValue(profile);
 render(<MemoryRouter><CrmContact id="1"/></MemoryRouter>);fireEvent.change(await screen.findByLabelText('Szukaj drugiego kontaktu'),{target:{value:'Anna'}});await screen.findByRole('option',{name:/Anna 2/});fireEvent.change(screen.getByLabelText('Dołączany kontakt'),{target:{value:'2'}});fireEvent.click(screen.getByRole('button',{name:'Porównaj'}));const merge=await screen.findByRole('button',{name:'Potwierdź scalenie'});expect(merge.disabled).toBe(true);fireEvent.click(screen.getByRole('radio',{name:'Zachowany kontakt: Anna'}));fireEvent.click(merge);await waitFor(()=>expect(api.post).toHaveBeenCalledWith('/crm/contacts/1/merge',{source_id:2,fingerprint:preview.fingerprint,choices:{name:'target'}}));expect(confirm).toHaveBeenCalled();
});
it('merged source is read only and links to its surviving identity',async()=>{
 api.get.mockImplementation(p=>Promise.resolve(p==='/crm/contacts/1'?{...profile,merged_into:9}:[]));render(<MemoryRouter><CrmContact id="1"/></MemoryRouter>);expect((await screen.findByRole('link',{name:'#9'})).getAttribute('href')).toBe('/leads/9');expect(screen.queryByRole('button',{name:'Dodaj'})).toBeNull();
});
it('keeps company search mounted while results refresh',async()=>{
 render(<MemoryRouter><Companies/></MemoryRouter>);const search=await screen.findByLabelText('Szukaj firmy');search.focus();fireEvent.change(search,{target:{value:'Ma'}});expect(document.activeElement).toBe(search);await waitFor(()=>expect(api.get).toHaveBeenCalledWith('/crm/companies?q=Ma&archived=false'));expect(screen.getByLabelText('Szukaj firmy')).toBe(search);
});
