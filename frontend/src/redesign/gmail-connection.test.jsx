import {render,screen,waitFor,fireEvent,cleanup} from '@testing-library/react';
import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
import GmailConnection from './GmailConnection';
const mocks=vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),user:{role:'admin'}}));
vi.mock('../api',()=>({api:{get:mocks.get,post:mocks.post}}));
vi.mock('../context/AuthContext',()=>({useOptionalAuth:()=>({user:mocks.user})}));
vi.mock('../context/operationsLanguage',()=>({useOperationsLanguage:()=>({ct:s=>s})}));
afterEach(cleanup);
beforeEach(()=>{vi.clearAllMocks();mocks.user={role:'admin'};mocks.get.mockResolvedValue({configured:true,demo:false,accounts:[]});});
describe('Gmail connection',()=>{
 it('does not fetch administrator configuration for members',()=>{mocks.user={role:'user'};render(<GmailConnection/>);expect(mocks.get).not.toHaveBeenCalled();expect(screen.queryByText('Gmail API')).toBeNull();});
 it('keeps demo connection disabled',async()=>{mocks.get.mockResolvedValue({configured:true,demo:true,accounts:[]});render(<GmailConnection/>);expect(await screen.findByText('Połączenia Gmail są wyłączone w demo.')).toBeTruthy();expect(screen.getByRole('button',{name:'Połącz Gmail'}).disabled).toBe(true);});
 it('requires server configuration',async()=>{mocks.get.mockResolvedValue({configured:false,demo:false,accounts:[]});render(<GmailConnection/>);expect((await screen.findByRole('button',{name:'Połącz Gmail'})).disabled).toBe(true);});
 it('reconnects a specific mailbox and shows errors without losing the list',async()=>{mocks.get.mockResolvedValue({configured:true,demo:false,accounts:[{inbox_id:7,email:'mail@example.com',paused:true}]});mocks.post.mockRejectedValue(new Error('Google unavailable'));render(<GmailConnection/>);fireEvent.click(await screen.findByRole('button',{name:'Połącz ponownie'}));await waitFor(()=>expect(mocks.post).toHaveBeenCalledWith('/gmail/authorize',{inbox_id:7}));expect(await screen.findByText('Google unavailable')).toBeTruthy();expect(screen.getByText('mail@example.com')).toBeTruthy();expect(screen.getByRole('button',{name:'Połącz ponownie'}).disabled).toBe(false);});
});
