import {Link,useLocation} from 'react-router-dom';
import {useCrmText} from './crm-text';
import './crm.css';
export function isCrmPath(path){return /^\/(crm(?:\/|$)|leads(?:\/|$)|companies(?:\/|$)|sales(?:\/|$)|contacts-tools(?:\/|$))/.test(path);}
export default function CrmNavigation(){
 const {pathname,search}=useLocation(),t=useCrmText();
 if(!isCrmPath(pathname))return null;
 const params=new URLSearchParams(search),view=params.get('view');
 const salesPath=v=>{const q=new URLSearchParams();for(const key of ['lead_id','company_id','opportunity_id'])if(params.get(key))q.set(key,params.get(key));q.set('view',v);return '/sales?'+q;};
 const current=pathname.startsWith('/crm/groups')?'groups':pathname.startsWith('/companies')?'companies':pathname==='/sales'?view==='agenda'?'activities':view==='calendar'?'calendar':'opportunities':'contacts';
 return <nav className="sk-crm-nav" aria-label="CRM"><strong>CRM</strong><div>{[['contacts','/leads'],['groups','/crm/groups'],['companies','/companies'],['opportunities',salesPath('board')],['activities',salesPath('agenda')],['calendar',salesPath('calendar')]].map(([key,to])=><Link key={key} to={to} aria-current={current===key?'page':undefined}>{t(key)}</Link>)}</div></nav>;
}
