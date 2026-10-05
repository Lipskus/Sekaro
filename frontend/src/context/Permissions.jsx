import {useState} from 'react';
import {Button,Panel,ErrorNotice} from '../redesign/ui';
import {useOptionalAuth} from './AuthContext';
import {useLocation} from 'react-router-dom';
import {useAccessText} from '../pages/AccessManagement';
export function can(user,permission){return user?.role==='admin'||!!user?.permissions?.includes(permission);}
export function moduleFor(path){if(path.startsWith('/crm/automations'))return 'automation';if(path.startsWith('/crm/reports')||path==='/analytics'||path==='/')return 'reports';if(/^\/(crm|leads|companies|sales|contacts-tools)(\/|$)/.test(path))return 'crm';if(/^\/(campaigns|schedule)(\/|$)/.test(path))return 'outreach';if(/^\/(inboxes|unibox)(\/|$)/.test(path))return 'mail';if(path==='/templates')return 'templates';return null;}
export function useCan(permission){const auth=useOptionalAuth();return can(auth?.user,permission);}
export function PermissionPage({children}){const {user}=useOptionalAuth()||{}, {pathname}=useLocation(),t=useAccessText();const module=moduleFor(pathname);if(user?.role==='admin')return children;if(!module){if(pathname==='/settings')return <AccountPage/>;if(pathname==='/notifications')return children;return <p role="alert">{t('denied')}</p>;}if(!can(user,module+'.read')||(module==='outreach'&&(!can(user,'crm.read')||!can(user,'mail.read')))||(module==='automation'&&!can(user,'crm.read')))return <p role="alert">{t('denied')}</p>;return <>{!can(user,module+'.write')&&<p role="status">{t('readOnly')}</p>}{children}</>;}

function AccountPage(){const {user,logout}=useOptionalAuth(),t=useAccessText(),[error,setError]=useState(null),[busy,setBusy]=useState(false);return <Panel title={user.username}><p>{user.email}</p><p>{(user.permissions||[]).map(p=>p.split('.').map(t).join(' · ')).join(', ')||t('noAccess')}</p><ErrorNotice error={error}/><Button disabled={busy} onClick={async()=>{setBusy(true);try{await logout();}catch(e){setError(e);}finally{setBusy(false);}}}>{t('logout')}</Button></Panel>;}
