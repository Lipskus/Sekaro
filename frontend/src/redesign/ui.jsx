import React from 'react';
import { Link } from 'react-router-dom';
import {
 RiHome5Line, RiMegaphoneLine, RiMailLine, RiContactsLine, RiFileTextLine,
 RiChat3Line, RiBarChartLine, RiGlobalLine, RiSettings3Line, RiSearchLine,
 RiNotification3Line, RiArrowDownSLine, RiArrowRightLine, RiArrowLeftSLine,
 RiArrowRightSLine, RiAddLine, RiUpload2Line, RiDownload2Line, RiEyeLine,
 RiFilter3Line, RiCloseLine, RiMoreLine, RiServerLine, RiShieldCheckLine,
 RiSendPlaneLine, RiReplyLine, RiStackLine, RiUserUnfollowLine, RiFlashlightLine,
 RiCalendarLine, RiTimeLine, RiCheckboxCircleLine, RiCheckLine, RiAlertLine,
 RiPlayLine, RiPauseLine, RiEditLine, RiRefreshLine, RiSunLine, RiMoonLine,
 RiComputerLine, RiMenuLine, RiLogoutBoxRLine, RiLink, RiPriceTag3Line,
 RiDraggable, RiDeleteBinLine, RiArrowUpSLine, RiLock2Line, RiInformationLine,
 RiForbid2Line, RiHistoryLine, RiArrowLeftLine, RiText, RiHashtag, RiExternalLinkLine,
} from 'react-icons/ri';
const icons = {
 home:RiHome5Line,campaign:RiMegaphoneLine,mail:RiMailLine,contacts:RiContactsLine,
 template:RiFileTextLine,chat:RiChat3Line,chart:RiBarChartLine,globe:RiGlobalLine,
 settings:RiSettings3Line,search:RiSearchLine,bell:RiNotification3Line,down:RiArrowDownSLine,
 arrow:RiArrowRightLine,prev:RiArrowLeftSLine,next:RiArrowRightSLine,plus:RiAddLine,
 upload:RiUpload2Line,download:RiDownload2Line,eye:RiEyeLine,filter:RiFilter3Line,
 close:RiCloseLine,more:RiMoreLine,server:RiServerLine,shield:RiShieldCheckLine,
 send:RiSendPlaneLine,reply:RiReplyLine,stack:RiStackLine,unsubscribe:RiUserUnfollowLine,
 flash:RiFlashlightLine,calendar:RiCalendarLine,clock:RiTimeLine,success:RiCheckboxCircleLine,
 check:RiCheckLine,warning:RiAlertLine,play:RiPlayLine,pause:RiPauseLine,edit:RiEditLine,
 refresh:RiRefreshLine,sun:RiSunLine,moon:RiMoonLine,system:RiComputerLine,menu:RiMenuLine,
 logout:RiLogoutBoxRLine,link:RiLink,tag:RiPriceTag3Line,drag:RiDraggable,delete:RiDeleteBinLine,
 up:RiArrowUpSLine,lock:RiLock2Line,info:RiInformationLine,block:RiForbid2Line,
 history:RiHistoryLine,back:RiArrowLeftLine,text:RiText,number:RiHashtag,external:RiExternalLinkLine,
};
export function Icon({ name, size=20, ...props }) { const I=icons[name] || RiInformationLine; return <I size={size} aria-hidden="true" {...props}/>; }
export function Button({icon,children,variant='outline',to,className='',...props}) {
 const cls=`sk-btn sk-btn-${variant} ${className}`;
 const body=<>{icon && <Icon name={icon} size={18}/>}<span>{children}</span></>;
 return to ? <Link className={cls} to={to} {...props}>{body}</Link> : <button type="button" className={cls} {...props}>{body}</button>;
}
export function Badge({ children, tone='neutral', dot=false }) { return <span className={`sk-badge tone-${tone}`}>{dot && <i className="sk-dot"/>}{children}</span>; }
export function Avatar({name='',size='normal'}) {
 const words=name.split(/\s+|@/).filter(Boolean); const initials=(words.length>1?words[0][0]+words[1][0]:name.slice(0,2)).toUpperCase()||'?';
 const tone=['purple','blue','amber','green','neutral'][Array.from(name).reduce((a,c)=>a+c.charCodeAt(0),0)%5];
 return <span className={`sk-avatar sk-avatar-${size} tone-${tone}`}>{initials}</span>;
}
export function Panel({title,icon,action,children,className=''}) {return <section className={`sk-panel ${className}`}>{title && <div className="sk-panel-heading"><h2>{icon&&<Icon name={icon}/>}<span>{title}</span></h2>{action}</div>}{children}</section>;}
export function Metric({icon,title,value,detail,tone='green',badge}) {return <section className="sk-metric"><span className={`sk-metric-icon tone-${tone}`}><Icon name={icon} size={27}/></span><div className="sk-metric-title">{title}</div><div className="sk-metric-value">{value??'—'}{badge}</div><div className="sk-muted sk-metric-detail">{detail}</div></section>;}
export function Empty({children='Brak danych.',icon='info'}) {return <div className="sk-empty"><Icon name={icon} size={26}/><span>{children}</span></div>;}
export function ErrorNotice({error,onRetry}) {return error ? <div className="sk-notice tone-red" role="alert"><Icon name="warning"/><span>{errorText(error)}</span>{onRetry&&<Button onClick={onRetry}>Spróbuj ponownie</Button>}</div>:null;}
export function errorText(err) {let message=typeof err==='string'?err:err?.message;try{const d=JSON.parse(message)?.detail;if(typeof d==='string')return d;if(Array.isArray(d))return d.map(x=>x.msg).join(' ');if(d?.errors)return d.errors.map(x=>x.message).join(' ');}catch{}return message||'Nie udało się wykonać operacji.';}
export function dateTime(value,opts={}) {if(!value)return '—';const d=new Date(/[zZ]|[+-]\d\d:\d\d$/.test(value)?value:value+'Z');return Number.isNaN(+d)?'—':d.toLocaleString('pl-PL',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',...opts});}
export const statusLabels={active:'Aktywny',contacted:'Wysłano',completed:'Zakończony',replied:'Odpowiedział',bounced:'Odbicie',unsubscribed:'Wypisany',paused:'Wstrzymany',new:'Nowy',invalid:'Niepoprawny',valid:'Poprawny',pending:'Oczekuje',interested:'Zainteresowany',not_interested:'Niezainteresowany',needs_custom_email:'Do przygotowania',wrong_person:'Inny odbiorca',out_of_office:'Poza biurem',auto_reply:'Automatyczna odpowiedź'};
export function ContactStatus({lead}) {const cs=lead?.campaigns||[];const s=lead?.email_verification_status==='invalid'?'invalid':cs.some(c=>c.status==='unsubscribed')?'unsubscribed':cs.some(c=>c.replied||c.status==='replied')?'replied':cs[0]?.status || lead?.lead_status || 'new';return <Badge dot tone={['bounced','invalid','unsubscribed'].includes(s)?'red':s==='replied'?'blue':s==='active'?'green':'neutral'}>{statusLabels[s]||s}</Badge>;}
