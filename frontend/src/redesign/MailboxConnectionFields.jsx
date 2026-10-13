import {useEffect,useRef,useState} from 'react';
import {Icon} from './ui';
import {useMessageText} from './MessageLanguage';
export default function MailboxConnectionFields({value,onChange}){
 const text=useMessageText(),[imapEnabled,setImapEnabled]=useState(true),[shared,setShared]=useState(!value.imap_username&&!value.imap_password),[visible,setVisible]=useState({});
 const previousHost=useRef(value.imap_host);
 useEffect(()=>{
  if(shared&&(value.imap_username!==value.smtp_username||value.imap_password!==value.smtp_password))onChange(f=>({...f,imap_username:f.smtp_username,imap_password:f.smtp_password}));
 },[shared,value.smtp_username,value.smtp_password,value.imap_username,value.imap_password,onChange]);
 const set=(key,val)=>onChange(f=>({...f,[key]:val}));
 function field(protocol,key,label,id,type='text',placeholder=''){
  const sharedField=protocol==='imap'&&shared&&['username','password'].includes(key),name=`${protocol}_${key}`,displayed=sharedField?value[`smtp_${key}`]:value[name];
  return <div className="sk-mailbox-field"><label htmlFor={id}>{label}</label><div className={type==='password'?'sk-mailbox-password':undefined}><input id={id} type={type==='password'&&visible[protocol]?'text':type} value={displayed} disabled={sharedField} placeholder={placeholder} autoComplete={type==='password'?'new-password':'off'} min={type==='number'?1:undefined} max={type==='number'?65535:undefined} onChange={e=>set(name,type==='number'?+e.target.value:e.target.value)}/>{type==='password'&&<button type="button" aria-label={`${visible[protocol]?text('Ukryj hasło','Hide password'):text('Pokaż hasło','Show password')} ${protocol.toUpperCase()}`} onClick={()=>setVisible(v=>({...v,[protocol]:!v[protocol]}))}><Icon name="eye" size={18}/></button>}</div></div>;
 }
 return <div className="sk-mailbox-protocols">{['smtp','imap'].map(protocol=><section className="sk-mailbox-card" key={protocol} aria-label={protocol.toUpperCase()}>
  <div className="sk-mailbox-card-heading"><div className="sk-mailbox-protocol-title"><span className="sk-mailbox-protocol-icon"><Icon name={protocol==='smtp'?'send':'mail'}/></span><div><h3>{protocol.toUpperCase()}</h3><p>{protocol==='smtp'?text('Wysyłanie wiadomości','Sending messages'):text('Odbieranie odpowiedzi','Receiving replies')}</p></div></div>{protocol==='imap'&&<label className="sk-mailbox-check"><input type="checkbox" checked={imapEnabled} onChange={e=>{setImapEnabled(e.target.checked);if(!e.target.checked){previousHost.current=value.imap_host;set('imap_host','');}else set('imap_host',previousHost.current);}}/>{text('Włącz IMAP','Enable IMAP')}</label>}</div>
  <fieldset className="sk-mailbox-protocol-fields" disabled={protocol==='imap'&&!imapEnabled}>
   <div className="sk-mailbox-host-row">{field(protocol,'host','Host',protocol==='smtp'?'inbox-add-9':'inbox-add-13','text',protocol==='smtp'?'smtp.example.com':'imap.example.com')}{field(protocol,'port',text('Port','Port'),protocol==='smtp'?'inbox-add-10':'inbox-add-14','number')}</div>
   {field(protocol,'username',text('Login','Login'),protocol==='smtp'?'inbox-add-11':'inbox-add-15')}
   {field(protocol,'password',text('Hasło','Password'),protocol==='smtp'?'inbox-add-12':'inbox-add-16','password')}
   <div className="sk-mailbox-field"><label htmlFor={`mailbox-${protocol}-security`}>{text('Zabezpieczenie','Security')}</label><select id={`mailbox-${protocol}-security`} value={protocol==='smtp'?(value.smtp_use_ssl?'ssl':value.smtp_use_tls?'tls':'none'):(value.imap_use_ssl?'ssl':'tls')} onChange={e=>onChange(f=>protocol==='smtp'?{...f,smtp_use_ssl:e.target.value==='ssl',smtp_use_tls:e.target.value==='tls',smtp_port:e.target.value==='ssl'?465:e.target.value==='tls'?587:25}:{...f,imap_use_ssl:e.target.value==='ssl',imap_port:e.target.value==='ssl'?993:143})}><option value="tls">STARTTLS</option><option value="ssl">SSL / TLS</option>{protocol==='smtp'&&<option value="none">{text('Bez szyfrowania','No encryption')}</option>}</select></div>
   {protocol==='imap'&&<label className="sk-mailbox-check"><input type="checkbox" checked={shared} onChange={e=>{setShared(e.target.checked);onChange(f=>({...f,imap_username:f.smtp_username,imap_password:f.smtp_password}));}}/>{text('Użyj loginu i hasła SMTP','Use SMTP login and password')}</label>}
  </fieldset>
 </section>)}</div>;
}
