import React from 'react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {SystemHealthProvider,useSystemHealth} from './SystemHealthContext';
import {api} from '../api';
const auth=vi.hoisted(()=>({user:{id:1}}));
vi.mock('../api',()=>({api:{get:vi.fn()}}));
vi.mock('./AuthContext',()=>({useAuth:()=>auth}));
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{resolve,reject,promise};}
function Probe(){const h=useSystemHealth();return <><button onClick={h.refresh}>Odśwież próbę</button><output>{JSON.stringify({raw:h.rawData,error:h.fetchError,status:h.overallStatus,loading:h.loading})}</output></>;}
const view=()=> <SystemHealthProvider><Probe/></SystemHealthProvider>;
beforeEach(()=>{vi.clearAllMocks();auth.user={id:1};});afterEach(cleanup);
it('coalesces concurrent refreshes and keeps a failure visible throughout retry',async()=>{
 const gate=deferred();api.get.mockReturnValueOnce(Promise.resolve({flags:{test_mode:true}})).mockRejectedValueOnce(new Error('offline')).mockReturnValueOnce(gate.promise);
 render(view());await waitFor(()=>expect(screen.getByText(/"loading":false/)).toBeTruthy());
 fireEvent.click(screen.getByRole('button'));await screen.findByText(/offline/);
 fireEvent.click(screen.getByRole('button'));fireEvent.click(screen.getByRole('button'));
 expect(api.get).toHaveBeenCalledTimes(3);expect(screen.getByText(/offline/)).toBeTruthy();expect(screen.getByText(/"status":"unknown"/)).toBeTruthy();
 await act(async()=>gate.resolve({flags:{test_mode:true}}));
 expect(screen.queryByText(/offline/)).toBeNull();
});
it('discards a previous user request and clears cached diagnostic data on logout',async()=>{
 const old=deferred();api.get.mockReturnValueOnce(old.promise).mockResolvedValueOnce({flags:{test_mode:true}});
 const {rerender}=render(view());auth.user={id:2};rerender(view());
 await waitFor(()=>expect(screen.getByText(/"test_mode":true/)).toBeTruthy());
 await act(async()=>old.resolve({flags:{test_mode:false}}));
 expect(screen.queryByText(/"test_mode":false/)).toBeNull();
 auth.user=null;rerender(view());
 expect(screen.getByText(/"raw":null/)).toBeTruthy();
});
