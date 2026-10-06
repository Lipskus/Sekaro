import React from 'react';
import {it,expect,vi,beforeEach,afterEach} from 'vitest';
import {render,screen,fireEvent,waitFor,within,cleanup} from '@testing-library/react';
import AccessManagement from './AccessManagement';
import {api} from '../api';
import {PermissionPage} from '../context/Permissions';
import {MemoryRouter} from 'react-router-dom';
const state=vi.hoisted(()=>({user:{role:'user',permissions:['crm.read']},confirm:vi.fn()}));
vi.mock('../context/AuthContext',()=>({useOptionalAuth:()=>({user:state.user})}));
vi.mock('../api',()=>({api:{get:vi.fn(),post:vi.fn(),put:vi.fn()}}));
vi.mock('../context/ConfirmContext',()=>({useConfirm:()=>state.confirm}));
const data={users:[{id:1,username:'adam',email:'test@example.com',administrator:true,active:true,revision:0,role_id:null,permissions:[]}],roles:[],teams:[],permissions:[]};
beforeEach(()=>{vi.clearAllMocks();state.confirm.mockResolvedValue(true);api.get.mockImplementation(path=>Promise.resolve(path==='/access'?data:[]));api.post.mockResolvedValue({});state.user={role:'user',permissions:['crm.read']};});afterEach(cleanup);
it('requires a confirmation and saves a role with read accompanying write',async()=>{
 render(<AccessManagement/>);const buttons=await screen.findAllByRole('button',{name:'Dodaj'});fireEvent.click(buttons[1]);
 const d=within(screen.getByRole('dialog'));fireEvent.change(d.getByLabelText('Nazwa'),{target:{value:'CRM editor'}});fireEvent.click(d.getAllByLabelText('Zmiany')[0]);fireEvent.click(d.getByRole('button',{name:'Zapisz'}));
 await waitFor(()=>expect(api.post).toHaveBeenCalledWith('/access/roles',expect.objectContaining({name:'CRM editor',permissions:['crm.write','crm.read']})));expect(state.confirm).toHaveBeenCalled();
});
it('keeps user draft on conflict and masks the password',async()=>{
 api.post.mockRejectedValue(Error('Conflict'));render(<AccessManagement/>);fireEvent.click((await screen.findAllByRole('button',{name:'Dodaj'}))[0]);const d=within(screen.getByRole('dialog'));
 for(const [label,value] of [['Login','new_user'],['E-mail','new@example.com'],['Hasło początkowe','Secret123!']])fireEvent.change(d.getByLabelText(label),{target:{value}});
 fireEvent.click(d.getByRole('button',{name:'Zapisz'}));await waitFor(()=>expect(api.post).toHaveBeenCalled());await waitFor(()=>expect(d.getByLabelText('Login').closest('fieldset').disabled).toBe(false));expect(d.getByLabelText('Login').value).toBe('new_user');expect(d.getByLabelText('Hasło początkowe').type).toBe('password');
});
it('blocks a module route and marks a permitted read-only page',()=>{
 const r=render(<MemoryRouter initialEntries={['/sales']}><PermissionPage><div>CRM content</div></PermissionPage></MemoryRouter>);expect(screen.getByText('CRM content')).toBeTruthy();expect(screen.getByRole('status').textContent).toContain('odczytu');r.unmount();
 render(<MemoryRouter initialEntries={['/campaigns']}><PermissionPage><div>Hidden campaign</div></PermissionPage></MemoryRouter>);expect(screen.queryByText('Hidden campaign')).toBeNull();expect(screen.getByRole('alert')).toBeTruthy();
});
