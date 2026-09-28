import {useState,useEffect,useRef} from 'react';
import {NavLink,Link,useLocation,useNavigate} from 'react-router-dom';
import {api} from '../api';
import {useAuth} from '../context/AuthContext';
import {useSystemHealth} from '../context/SystemHealthContext';
import {useNotifications} from '../context/NotificationsContext';
import {useAppMode} from '../context/AppModeContext';
import {useLanguage} from '../context/LanguageContext';
import {Icon,Avatar,Badge} from './ui';
import Logo from './Logo';
const nav=[['/','home','dashboard'],['/campaigns','campaign','campaigns'],['/inboxes','mail','inboxes'],['/leads','contacts','leads'],['/templates','template','templates'],['/unibox','chat','unibox'],['/analytics','chart','analytics'],['/schedule','calendar','schedule'],['/domains','globe','domains'],['/settings','settings','settings']];
export default function Shell({children}){
 const {user,logout}=useAuth();const {overallStatus,rawData,loading:healthLoading,fetchError:healthError}=useSystemHealth();const {count}=useNotifications();const {isProduction}=useAppMode();const {language,setLanguage,languages,t}=useLanguage();
 const [menu,setMenu]=useState(false),[profile,setProfile]=useState(false),[q,setQ]=useState(''),[results,setResults]=useState([]),[searchBusy,setSearchBusy]=useState(false),[searchError,setSearchError]=useState(''),[showSearch,setShowSearch]=useState(false);
 const location=useLocation(),navigate=useNavigate(),searchRef=useRef(null),searchBoxRef=useRef(null),profileRef=useRef(null);
 const userName=user?.display_name||user?.name||user?.username||user?.email||'Administrator';
 const storage=healthError?null:rawData?.storage;
 const diskUsed=storage?.available?Math.max(0,Math.min(100,Number(storage.used_percent)||0)):0;
 const diskTone=!storage?.available?'neutral':diskUsed>=95?'red':diskUsed>=85?'amber':'green';
 const diskFree=storage?.available
  ? `${(Number(storage.free_bytes)/(1024**3)).toLocaleString(language,{maximumFractionDigits:1})} GB ${t('shell.free')}`
  : t('shell.noData');
 useEffect(()=>{setMenu(false);setProfile(false);setShowSearch(false);window.scrollTo(0,0);},[location.pathname]);
 useEffect(()=>{if(!menu)return;const previous=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{document.body.style.overflow=previous;};},[menu]);
 useEffect(()=>{const key=e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();searchRef.current?.focus();}if(e.key==='Escape'){setShowSearch(false);setProfile(false);setMenu(false);}};const click=e=>{if(!searchBoxRef.current?.contains(e.target))setShowSearch(false);if(!profileRef.current?.contains(e.target))setProfile(false);};document.addEventListener('keydown',key);document.addEventListener('pointerdown',click);return()=>{document.removeEventListener('keydown',key);document.removeEventListener('pointerdown',click);};},[]);
 useEffect(()=>{let active=true;if(q.trim().length<2){setResults([]);setSearchError('');setSearchBusy(false);return;}setResults([]);setSearchError('');setSearchBusy(true);const timer=setTimeout(async()=>{setSearchBusy(true);setSearchError('');try{const [leads,campaigns,templates]=await Promise.all([api.get('/leads?q='+encodeURIComponent(q.trim())),api.get('/campaigns'),api.get('/templates')]);if(active)setResults([...(leads||[]).slice(0,5).map(l=>({label:l.name||l.email,detail:l.email,to:'/leads/'+l.id,icon:'contacts'})),...(campaigns||[]).filter(c=>c.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0,3).map(c=>({label:c.name,detail:t('shell.campaign'),to:'/campaigns/'+c.id,icon:'campaign'})),...(templates||[]).filter(c=>c.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0,3).map(c=>({label:c.name,detail:t('shell.template'),to:'/templates',icon:'template'}))]);}catch{if(active)setSearchError(t('shell.searchFailed'));}finally{if(active)setSearchBusy(false);}},300);return()=>{active=false;clearTimeout(timer);};},[q,language]);
 const state=healthError?[t('shell.noData'),'neutral']:healthLoading&&overallStatus==='unknown'?[t('shell.checking'),'neutral']:({ok:[t('shell.allGood'),'green'],warning:[t('shell.needsAttention'),'amber'],error:[t('shell.problem'),'red'],unknown:[t('shell.unknown'),'neutral']})[overallStatus]||[t('shell.unknown'),'neutral'];
 return <div className="sk-shell">
  <a className="sk-skip" href="#sk-main">Przejdź do treści</a>
  {menu&&<button className="sk-nav-backdrop" aria-label={t('shell.closeMenu')} onClick={()=>setMenu(false)}/>}
  <aside className={`sk-sidebar ${menu?'is-open':''}`}>
   <Link to="/" className="sk-brand"><Logo/><div><strong>Sekaro</strong><small>Self-hosted outreach</small></div></Link>
   <nav aria-label={t('shell.mainNavigation')}>{nav.map(([to,icon,key])=><NavLink key={to} to={to} end={to==='/'} className={({isActive})=>`sk-nav-item ${isActive?'active':''}`}><Icon name={icon}/><span>{t(`nav.${key}`)}</span></NavLink>)}</nav>
   <div className="sk-sidebar-bottom"><Link to="/system-health" className="sk-system-card"><div><strong>{t('shell.system')}</strong><Badge tone={state[1]} dot>{state[0]}</Badge></div><dl><dt>{t('shell.version')}</dt><dd>0.5.6</dd><dt>{t('shell.environment')}</dt><dd>{isProduction?t('shell.production'):t('shell.test')}</dd><dt>{t('shell.disk')}</dt><dd>{diskFree}</dd></dl><progress className="sk-storage-progress" data-tone={diskTone} max="100" value={diskUsed} aria-label={t('shell.diskUsage')} title={storage?.available?`${t('shell.diskUsage')}: ${diskUsed}%`:t('shell.noData')}/></Link><Link to="/settings" className="sk-selfhost"><Icon name="server" size={31}/><div><strong>Self-hosted</strong><small>{t('shell.selfHostedMotto')}</small></div></Link></div>
  </aside>
  <div className="sk-workspace">
   <header className="sk-topbar">
    <button className="sk-icon-button sk-mobile-menu" aria-label={t('shell.openMenu')} aria-expanded={menu} onClick={()=>setMenu(v=>!v)}><Icon name="menu"/></button>
    <div className="sk-global-search" ref={searchBoxRef}><Icon name="search"/><input ref={searchRef} type="search" aria-label={t('shell.search')} placeholder={t('shell.searchPlaceholder')} value={q} onFocus={()=>setShowSearch(true)} onChange={e=>{setQ(e.target.value);setShowSearch(true);}}/><kbd>Ctrl K</kbd>{showSearch&&q.trim().length>=2&&<div className="sk-search-results">{searchBusy?<p>{t('shell.searching')}</p>:searchError?<p role="alert">{searchError}</p>:results.length?results.map((r,i)=><Link key={r.to+i} to={r.to} onClick={()=>{setQ('');setShowSearch(false);}}><Icon name={r.icon}/><div><strong>{r.label}</strong><small>{r.detail}</small></div></Link>):<p>{t('shell.noResults')}</p>}<Link to={'/unibox?q='+encodeURIComponent(q)}><Icon name="chat"/><span>{t('shell.searchMessages')}</span><Icon name="arrow" size={16}/></Link></div>}</div>
    <div className="sk-topbar-actions"><Link to="/notifications" className="sk-icon-button sk-notification" aria-label={t('shell.notifications')}><Icon name="bell" size={24}/>{count>0&&<i/>}</Link><div className="sk-profile" ref={profileRef}><button className="sk-profile-toggle" aria-expanded={profile} onClick={()=>setProfile(v=>!v)}><Avatar name={userName}/><div><strong>{userName}</strong><small>{user?.role==='admin'?t('shell.administrator'):t('shell.user')}</small></div><Icon name="down" size={16}/></button>{profile&&<div className="sk-profile-menu"><Link to="/settings"><Icon name="settings"/>{t('shell.settings')}</Link><Link to="/schedule"><Icon name="calendar"/>{t('shell.queue')}</Link><Link to="/system-health"><Icon name="shield"/>{t('nav.health')}</Link><label>{t('shell.language')}<select aria-label={t('appearance.language')} value={language} onChange={e=>setLanguage(e.target.value)}>{(languages||[]).map(v=><option key={v.code} value={v.code}>{v.label}</option>)}</select></label><button onClick={async()=>{await logout();navigate('/login');}}><Icon name="logout"/>{t('shell.logout')}</button></div>}</div></div>
   </header>
   <main id="sk-main" className="sk-main" tabIndex={-1}>{children}</main>
  </div>
 </div>;
}
