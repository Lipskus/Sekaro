import {useState,useEffect,useRef} from 'react';
import {NavLink,Link,useLocation,useNavigate} from 'react-router-dom';
import {api} from '../api';
import {useAuth} from '../context/AuthContext';
import {useDarkMode} from '../context/DarkModeContext';
import {useSystemHealth} from '../context/SystemHealthContext';
import {useNotifications} from '../context/NotificationsContext';
import {useAppMode} from '../context/AppModeContext';
import {useLanguage} from '../context/LanguageContext';
import {Icon,Avatar,Badge} from './ui';
import Logo from './Logo';
const nav=[['/','home','Dashboard'],['/campaigns','campaign','Kampanie'],['/inboxes','mail','Skrzynki (SMTP/IMAP)'],['/leads','contacts','Kontakty'],['/templates','template','Szablony'],['/unibox','chat','Wątki (Inbox)'],['/analytics','chart','Analityka'],['/domains','globe','Domeny'],['/settings','settings','Ustawienia']];
export default function Shell({children}){
 const {user,logout}=useAuth();const {themePreference,setThemePreference}=useDarkMode();const {overallStatus}=useSystemHealth();const {count}=useNotifications();const {isProduction}=useAppMode();const {language,setLanguage,languages}=useLanguage();
 const [menu,setMenu]=useState(false),[profile,setProfile]=useState(false),[q,setQ]=useState(''),[results,setResults]=useState([]),[searchBusy,setSearchBusy]=useState(false),[searchError,setSearchError]=useState(''),[showSearch,setShowSearch]=useState(false);
 const location=useLocation(),navigate=useNavigate(),searchRef=useRef(null),searchBoxRef=useRef(null),profileRef=useRef(null);
 const userName=user?.display_name||user?.name||user?.username||user?.email||'Administrator';
 useEffect(()=>{setMenu(false);setProfile(false);setShowSearch(false);},[location.pathname]);
 useEffect(()=>{const key=e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();searchRef.current?.focus();}if(e.key==='Escape'){setShowSearch(false);setProfile(false);setMenu(false);}};const click=e=>{if(!searchBoxRef.current?.contains(e.target))setShowSearch(false);if(!profileRef.current?.contains(e.target))setProfile(false);};document.addEventListener('keydown',key);document.addEventListener('pointerdown',click);return()=>{document.removeEventListener('keydown',key);document.removeEventListener('pointerdown',click);};},[]);
 useEffect(()=>{let active=true;if(q.trim().length<2){setResults([]);setSearchBusy(false);return;}const t=setTimeout(async()=>{setSearchBusy(true);setSearchError('');try{const [leads,campaigns,templates]=await Promise.all([api.get('/leads?q='+encodeURIComponent(q.trim())),api.get('/campaigns'),api.get('/templates')]);if(active)setResults([...(leads||[]).slice(0,5).map(l=>({label:l.name||l.email,detail:l.email,to:'/leads/'+l.id,icon:'contacts'})),...(campaigns||[]).filter(c=>c.name.toLowerCase().includes(q.toLowerCase())).slice(0,3).map(c=>({label:c.name,detail:'Kampania',to:'/campaigns/'+c.id,icon:'campaign'})),...(templates||[]).filter(c=>c.name.toLowerCase().includes(q.toLowerCase())).slice(0,3).map(c=>({label:c.name,detail:'Szablon',to:'/templates',icon:'template'}))]);}catch{if(active)setSearchError('Nie udało się wyszukać danych.');}finally{if(active)setSearchBusy(false);}},300);return()=>{active=false;clearTimeout(t);};},[q]);
 const state=({ok:['Wszystko działa','green'],warning:['Wymaga uwagi','amber'],error:['Wykryto problem','red']})[overallStatus]||['Sprawdzanie…','neutral'];
 return <div className="sk-shell">
  <a className="sk-skip" href="#sk-main">Przejdź do treści</a>
  {menu&&<button className="sk-nav-backdrop" aria-label="Zamknij menu" onClick={()=>setMenu(false)}/>}
  <aside className={`sk-sidebar ${menu?'is-open':''}`}>
   <Link to="/" className="sk-brand"><Logo/><div><strong>Sekaro</strong><small>Self-hosted outreach</small></div></Link>
   <nav aria-label="Nawigacja główna">{nav.map(([to,icon,label])=><NavLink key={to} to={to} end={to==='/'} className={({isActive})=>`sk-nav-item ${isActive?'active':''}`}><Icon name={icon}/><span>{label}</span></NavLink>)}</nav>
   <div className="sk-sidebar-bottom"><Link to="/system-health" className="sk-system-card"><div><strong>System</strong><Badge tone={state[1]} dot>{state[0]}</Badge></div><dl><dt>Wersja</dt><dd>0.5.1</dd><dt>Środowisko</dt><dd>{isProduction?'Produkcja':'Testowe'}</dd><dt>Dostęp</dt><dd>Panel prywatny</dd></dl><div className="sk-status-rule"/></Link><Link to="/settings" className="sk-selfhost"><Icon name="server" size={31}/><div><strong>Self-hosted</strong><small>Twoje dane. Twoje zasady.</small></div></Link></div>
  </aside>
  <div className="sk-workspace">
   <header className="sk-topbar">
    <button className="sk-icon-button sk-mobile-menu" aria-label="Otwórz menu" aria-expanded={menu} onClick={()=>setMenu(v=>!v)}><Icon name="menu"/></button>
    <div className="sk-global-search" ref={searchBoxRef}><Icon name="search"/><input ref={searchRef} type="search" aria-label="Szukaj w Sekaro" placeholder="Szukaj kontaktów, kampanii, wiadomości…" value={q} onFocus={()=>setShowSearch(true)} onChange={e=>{setQ(e.target.value);setShowSearch(true);}}/><kbd>Ctrl K</kbd>{showSearch&&q.trim().length>=2&&<div className="sk-search-results">{searchBusy?<p>Wyszukiwanie…</p>:searchError?<p role="alert">{searchError}</p>:results.length?results.map((r,i)=><Link key={r.to+i} to={r.to} onClick={()=>{setQ('');setShowSearch(false);}}><Icon name={r.icon}/><div><strong>{r.label}</strong><small>{r.detail}</small></div></Link>):<p>Brak wyników.</p>}<Link to={'/unibox?q='+encodeURIComponent(q)}><Icon name="chat"/><span>Szukaj w wiadomościach</span><Icon name="arrow" size={16}/></Link></div>}</div>
    <div className="sk-topbar-actions"><div className="sk-theme-picker" role="group" aria-label="Motyw">{[['light','sun','Jasny'],['dark','moon','Ciemny'],['system','system','Systemowy']].map(([p,icon,label])=><button key={p} title={label} aria-label={`Motyw ${label.toLowerCase()}`} aria-pressed={themePreference===p} className={themePreference===p?'active':''} onClick={()=>setThemePreference(p)}><Icon name={icon} size={17}/></button>)}</div><Link to="/notifications" className="sk-icon-button sk-notification" aria-label="Powiadomienia"><Icon name="bell" size={24}/>{count>0&&<i/>}</Link><div className="sk-profile" ref={profileRef}><button className="sk-profile-toggle" aria-expanded={profile} onClick={()=>setProfile(v=>!v)}><Avatar name={userName}/><div><strong>{userName}</strong><small>Administrator</small></div><Icon name="down" size={16}/></button>{profile&&<div className="sk-profile-menu"><Link to="/settings"><Icon name="settings"/>Ustawienia</Link><Link to="/schedule"><Icon name="calendar"/>Kolejka wysyłki</Link><Link to="/system-health"><Icon name="shield"/>Stan systemu</Link><label>Język<select aria-label="Język interfejsu" value={language} onChange={e=>setLanguage(e.target.value)}>{(languages||[]).map(v=><option key={v.code} value={v.code}>{v.label}</option>)}</select></label><button onClick={async()=>{await logout();navigate('/login');}}><Icon name="logout"/>Wyloguj się</button></div>}</div></div>
   </header>
   <main id="sk-main" className="sk-main" tabIndex={-1}>{children}</main>
  </div>
 </div>;
}
