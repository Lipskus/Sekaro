/* Isolated frontend QA. Every API request is intercepted; no backend or mailbox is used.
 * Run npm run build in frontend first; this script starts its own local server.
 * P0_PLAYWRIGHT_MODULE=/path/to/playwright P0_CHROMIUM=/path/to/chromium node scripts/check-p0-ui.cjs
 * Screenshots are QA evidence with fixtures, never new design references or live-server proof.
 */
const {chromium}=require(process.env.P0_PLAYWRIGHT_MODULE || 'playwright');
const fs=require('fs');
const path=require('path');
const out=process.env.P0_UI_OUTPUT || 'docs/qa/evidence-2026-09-29';
const port=Number(process.env.P0_UI_PORT || 4173);
const base=`http://127.0.0.1:${port}`;
const http=require('http');
const routes=process.env.P0_UI_ROUTES?.split(',') || ['/','/campaigns','/campaigns/add','/campaigns/1','/leads','/leads/1','/contacts-tools','/templates','/inboxes','/unibox','/domains','/schedule','/analytics','/settings','/deliverability-tips','/system-health','/notifications','/login'];
const languages=(process.env.P0_UI_LANGUAGES || 'pl').split(',');
const copy=require('../frontend/src/i18n/workspace.json');
const contactCopy=require('../frontend/src/i18n/contacts.json');
const outreachCopy=require('../frontend/src/i18n/outreach.json');
const campaignCopy=require('../frontend/src/i18n/campaign.json');
const operationsCopy=require('../frontend/src/i18n/operations.json');
const op=(language,source)=>operationsCopy[language][source]??campaignCopy[language][source]??source;
const workflowMode=process.env.P0_UI_WORKFLOWS==='1';
const workflowCases=[['contact-tools-import','/contacts-tools?tab=bounced'],['contact-tools-recovery','/contacts-tools?tab=bounced'],['contact-tools-suppression','/contacts-tools?tab=bounced'],['settings-ai-expanded','/settings#ai'],['settings-custom-verification','/settings#verification'],['settings-restore-preview','/settings#backup-restore'],['health-unknown','/system-health'],['settings-general','/settings#general'],['settings-appearance','/settings#appearance'],['settings-account','/settings#account'],['settings-known-ips','/settings#known-ips'],['settings-backup-restore','/settings#backup-restore'],['settings-ai','/settings#ai'],['settings-verification','/settings#verification'],['settings-other','/settings#other'],['settings-api-keys','/settings#api-keys'],['settings-webhooks','/settings#webhooks'],['settings-mcp','/settings#mcp'],['health-localized','/system-health'],['tips-localized','/deliverability-tips'],['mailbox-tracking-dns','/inboxes'],['mailbox-tracking-beacon','/inboxes'],['dashboard-localized','/'],['domains-localized','/domains'],['mailbox-smtp','/inboxes'],['mailbox-sender','/inboxes'],['mailbox-add','/inboxes'],['schedule-calendar','/schedule'],['schedule-queue','/schedule'],['schedule-preview','/schedule'],['template-editor','/templates'],['template-preview','/templates'],['notification-detail','/notifications'],['notification-preferences','/notifications'],['campaign-recipients','/campaigns/1#leads'],['campaign-recipient-add','/campaigns/1#leads'],['campaign-analytics','/campaigns/1#analytics'],['global-analytics','/analytics'],['campaign-overview','/campaigns/1'],['campaign-schedule','/campaigns/1?setup=1#schedule'],['campaign-inboxes','/campaigns/1?setup=1#inboxes'],['campaign-settings','/campaigns/1#settings'],['campaign-preflight','/campaigns/1?setup=1#overview'],['campaign-activity','/campaigns/1#queue'],['sequence-edit','/campaigns/1#sequences'],['sequence-variant','/campaigns/1#sequences'],['sequence-personalized','/campaigns/1#sequences'],['inbox-thread','/unibox'],['inbox-confirm','/unibox'],['campaign-list','/campaigns'],['campaign-delete','/campaigns'],['campaign-draft','/campaigns/add'],['contact-list','/leads'],['contact-summary','/leads/1'],['contact-activity','/leads/1'],['contact-campaigns','/leads/1'],['contact-messages','/leads/1'],['contact-suppression','/leads'],['contact-create','/leads'],['contact-import','/leads'],['contact-fields','/leads'],['sequence-preview','/campaigns/1#sequences'],['mailbox-retention','/inboxes'],['mobile-menu','/']];
const inbox={id:1,email:'sender@example.test',display_name:'Nadawca QA',provider:'smtp',paused:false,max_emails_per_day:100,max_emails_per_hour:10,wait_minutes_between:5};
const campaign={id:1,name:'QA — kampania testowa',paused:true,created_at:'2026-09-29T10:00:00Z',sending_days:[0,1,2,3,4],sending_hours_start:'09:00',sending_hours_end:'17:00',timezone:'Europe/Warsaw',inbox_ids:[1],stats:{total_leads:1,emails_sent:0,replies:0,scheduled:0},stop_on_reply:true};
const lead={id:1,name:'QA — Aleksandra Żółkiewska',email:'qa@example.com',created_at:'2026-09-29T10:00:00Z',custom_data:{company:'Przykładowa firma testowa'},campaigns:[],interactions:[]};
function fixture(p,flow){
 if(flow.startsWith('contact-tools-')&&p==='/api/leads')return [{...lead,email_verification_status:'invalid',campaigns:[]}];
 if(flow==='settings-ai-expanded'){
  if(p==='/api/settings/ai')return {features:[{id:'reply_classifier',label:'Reply Interest Classifier',description:Object.keys(operationsCopy.en).find(k=>k.startsWith('Classifies lead replies')),enabled:false,provider:'openai',model:'qa-model',api_key_set:false}]};
  if(p==='/api/settings/ai/providers')return {providers:[{id:'openai',name:'OpenAI'}]};
 }
 if(flow==='settings-custom-verification'&&p==='/api/settings/email-verification')return {provider:'custom',providers:['custom'],custom_url:'https://custom.example.test/verify?email={email}',custom_method:'POST',custom_field_path:'data.status',custom_valid_values:['deliverable'],custom_invalid_values:['blocked']};
 if(flow==='settings-restore-preview'){
  if(p==='/api/settings/backup/restore/metadata')return {encrypted:false,backup_preview:{lead_count:2,inbox_count:1,campaign_count:1},current_database:{lead_count:3}};
  if(p==='/api/settings/backup/restore/preview')return {restore_token:'mock-only',backup:{lead_count:2,inbox_count:1,campaign_count:1},current_database:{lead_count:3}};
 }

 if(flow.startsWith('mailbox-')&&p==='/api/smtp/inboxes/1')return {smtp_host:'smtp.example.test',smtp_port:587,smtp_username:'sender',has_smtp_password:true,imap_host:'imap.example.test',imap_port:993,imap_username:'sender',has_imap_password:true};
 if(flow.startsWith('schedule-')){
  const scheduled={type:'scheduled',slot_id:1,lead_id:1,lead_email:lead.email,lead_name:lead.name,campaign_id:1,campaign_name:campaign.name,campaign_timezone:'Europe/Warsaw',inbox_id:1,inbox_email:inbox.email,scheduled_at:new Date().toISOString().slice(0,10)+'T10:00:00Z',subject:'Temat klienta QA',sequence_body:'DługiTekstBezSpacji'.repeat(15),sequence_index:0,campaign_sending_days:[0,1,2,3,4],lead_status:'active'};
  if(p==='/api/schedule/scheduled')return [scheduled];
  if(p==='/api/schedule/sent')return [];
  if(p==='/api/schedule/stats')return {total_scheduled:1,total_sent:0,total_campaigns:1};
 }

 if(['template-editor','template-preview','notification-detail','notification-preferences'].includes(flow)){
  const version={id:1,version:1,subject:'Temat klienta QA',body:'Tekst klienta QA',is_html:false,created_at:'2026-09-30T10:00:00Z'};
  const template={id:1,name:'QA — szablon klienta',latest_version:version,versions:[version]};
  if(p==='/api/status')return {app_mode:'production',demo:true};
  if(p==='/api/templates')return [template];
  if(p==='/api/templates/1')return template;
  if(p==='/api/templates/preview/render')return {subject:version.subject,body:'DługiTekstBezSpacji'.repeat(15),is_html:false,missing_variables:[],variables:['company'],context:{company:'Nazwa klienta QA'}};
  if(p==='/api/notifications')return {items:[{id:1,title:'QA — wiadomość klienta',message:'Historyczna treść powiadomienia QA',event_type:'lead.replied',created_at:'2026-09-30T09:00:00Z',read_at:null,lead_id:1}],total:1,unread:1};
  if(p==='/api/notifications/config')return {enabled:true,notification_email:'notify@example.test',events:['lead.replied'],rate_limit_per_hour:10};
  if(p==='/api/settings/webhooks/events')return {events:['lead.replied','email.sent','email.bounced','lead.unsubscribed','feature.error','token_expired']};
 }

 if(flow==='sequence-personalized'&&p==='/api/campaigns/1/sequences')return [{id:1,position:0,sequence_type:'personalized',fallback_subject:'Temat indywidualny QA',fallback_body:'Treść zastępcza QA',wait_days_after_previous:0,is_html:false}];
 if(flow==='sequence-personalized'&&p==='/api/campaigns/1/leads')return [{...lead,lead_id:1,status:'active',personalized:[{sequence_id:1,written:false,already_sent:false}]}];
 if(['campaign-recipients','campaign-recipient-add','campaign-analytics','global-analytics'].includes(flow)){
  if(p==='/api/campaigns/1/leads')return [{...lead,lead_id:1,status:'unsubscribed',enrolled_at:'2026-09-01T10:00:00Z',opened:true,replied:true,email_verification_status:'valid'}];
  if(p==='/api/analytics/daily')return [{date:new Date().toISOString().slice(0,10),campaign_id:1,sent:12,total_opens:18,total_replies:3,total_clicks:2,unique_opens:8,unique_clicks:2}];
  if(p==='/api/campaigns/1/analytics/steps')return [{sequence_id:1,sequence_index:0,subject:'Temat klienta QA',total_sent:12,total_opens:18,total_clicks:2,total_replies:3,total_opportunities:0,variants:[]}];
 }
 if(p==='/api/auth/setup-status')return {setup_complete:true};
 if(p==='/api/auth/refresh')return {access_token:'isolated-qa-fixture'};
 if(p==='/api/auth/me')return {id:1,username:'qa',email:'qa@example.com',role:'admin',is_active:true};
 if(workflowMode){
  if(p==='/api/ui/unibox')return {items:[{inbox_id:1,thread_id:'qa-thread',lead_id:1,lead_email:lead.email,lead_name:lead.name,subject:'Temat wiadomości klienta',needs_reply:true}],total:1,counts:{all:1,unread:1,needs_reply:1}};
  if(p==='/api/unibox/threads/qa-thread')return {subject:'Temat wiadomości klienta',inbox_account:inbox.email,messages:[{message_id:'qa-message',direction:'received',from:lead.email,to:inbox.email,timestamp:'2026-09-30T08:00:00Z',body_plain:'Treść klienta pozostaje w oryginalnym języku.'}]};
  if(p==='/api/leads/1')return {...lead,email_verification_status:'unknown',campaigns:[{campaign_id:1,campaign_name:campaign.name,status:'unsubscribed',sending_paused:true,enrolled_at:'2026-09-01T10:00:00Z'}],interactions:[{kind:'sent',direction:'outbound',at:'2026-09-02T10:00:00Z',subject:'Przykładowy temat klienta',campaign_id:1},{kind:'reply_marker',direction:'inbound',at:'2026-09-03T10:00:00Z',campaign_id:1}]};
  if(p==='/api/leads/suppression')return [{id:1,email:'blocked@example.test',reason:'unsubscribe',created_at:'2026-09-01T10:00:00Z'}];
  if(p==='/api/inboxes')return [inbox];
  if(p==='/api/leads/import/preview')return {filename:'qa.csv',valid_unique_emails:1,existing_contacts:0,suppressed_contacts:0,duplicates_in_file:0,invalid_count:0,headers:['email','name','company'],suggested_mapping:{email:'email',name:'name',company:'custom:company'},total_rows:1,sample_rows:[{email:'qa@example.com',name:'Aleksandra',company:'Przykładowa firma z długą nazwą'}]};
  if(p==='/api/contact-fields')return [{id:1,key:'company',label:'Firma z bardzo długą nazwą pola testowego',field_type:'text',system:false}];
  if(p==='/api/campaigns/1/sequences')return [{id:1,position:0,subject:'Podgląd bardzo długiego tematu wiadomości — sprawdzenie zawijania',body:'Treść QA',wait_days_after_previous:0,is_html:false}];
  if(p==='/api/campaigns/1/preview')return {subject:'Temat podglądu QA',body:'DługiAdresBezSpacji'.repeat(24)+'\n'+('Przykładowa treść do kontroli przewijania. '.repeat(80)),is_html:false};
  if(p.includes('/archive'))return {mode:'keep',days:30,imap_configured:true,count:0,bytes:0,messages:[]};
 }
 if(p==='/api/status')return {app_mode:'production',test_mode:false};
 if(p==='/api/system-health')return {security:{external_mailbox_encryption_key:true,smtp_account_count:0},smtp:{accounts:[]},inboxes:[],ai_features:[],storage:{available:true,total_bytes:10737418240,free_bytes:8589934592,used_percent:20}};
 if(p==='/api/campaigns')return [campaign];
 if(p==='/api/campaigns/1')return campaign;
 if(p==='/api/campaigns/has-leads')return {has_leads:true};
 if(p==='/api/campaigns/1/preflight')return {ready:false,summary:{sendable_contacts:1},issues:[{code:'uncertain_send_attempts',severity:'error',message:'QA: wynik wysyłki wymaga sprawdzenia u dostawcy.',details:{count:1,slot_ids:[9]}}]};
 if(p==='/api/campaigns/1/queue')return [{slot_id:9,lead_email:lead.email,lead_name:lead.name,inbox_id:1,inbox_email:inbox.email,sequence_index:0,scheduled_date:'2026-09-30T10:00:00Z'}];
 if(p==='/api/leads')return [lead];
 if(p==='/api/leads/1')return lead;
 if(p==='/api/ui/unibox')return {items:[],total:0,page:1,page_size:50,counts:{all:0,unread:0,needs_reply:0,bounced:0}};
 if(p==='/api/notifications')return {items:[],total:0,unread:0};
 if(p.includes('unread-count') || p==='/api/unibox/notifications')return {unread:0,count:0};
 if(p==='/api/notifications/config')return {enabled:false,notification_email:'',events:[]};
 if(p==='/api/settings/scheduling-strategy')return {scheduling_strategy:'priority'};
 if(p==='/api/settings/test-mode')return {test_mode:false};
 if(p==='/api/settings/webhooks/events')return {events:[]};
 if(p==='/api/settings/ai')return {features:[]};
 if(p==='/api/settings/ai/providers')return {providers:[]};
 if(p==='/api/settings/known-ips')return {known_ips:[],current_ip:'127.0.0.1'};
 if(p==='/api/settings/mcp-setup')return {api_base_url:base+'/api',mcp_http_url:base+'/api/mcp',cursor_mcp_fragment:{mcpServers:{}}};
 if(p==='/api/settings/backup/config')return {schedule_enabled:false,local_disk_available:true,save_local:true,encrypt_backups:true,backup_encryption_configured:true};
 if(p==='/api/settings/time-offset')return {time_offset_days:0};
 if(p==='/api/schedule/stats')return {total_scheduled:0,total_sent:0};
 if(p==='/api/unibox/status')return {inboxes:[],syncing:false};
 return [];
}
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 const dist=path.resolve('frontend/dist');
 const server=http.createServer((req,res)=>{
  const requested=path.resolve(dist,'.'+decodeURIComponent(new URL(req.url,base).pathname));
  const file=requested.startsWith(dist+path.sep)&&fs.existsSync(requested)&&fs.statSync(requested).isFile()?requested:path.join(dist,'index.html');
  const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.svg':'image/svg+xml'};
  res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');
  fs.createReadStream(file).pipe(res);
 });
 await new Promise(r=>server.listen(port,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,executablePath:process.env.P0_CHROMIUM || undefined,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
 const results=[];
 const states=(process.env.P0_UI_STATES || 'fixture').split(',');
 const cases=workflowMode?workflowCases.filter(([flow])=>!process.env.P0_UI_FLOWS||process.env.P0_UI_FLOWS.split(',').includes(flow)):routes.map(route=>['page',route]);
 for(const [width,height] of [[1600,900],[768,1024],[390,844]])for(const theme of ['dark','light'])for(const language of languages)for(const state of states)for(const [flow,routePath] of cases){
  const context=await browser.newContext({viewport:{width,height},colorScheme:theme,reducedMotion:'reduce'});
  await context.addInitScript(({theme,language})=>{localStorage.setItem('sekaro.theme',theme);localStorage.setItem('sekaro.language',language);localStorage.setItem('onboardingCompleted','true')},{theme,language});
  const page=await context.newPage(), errors=[], mutations=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{
   const u=new URL(route.request().url());
   if(u.origin!==base)return route.abort();
   if(!u.pathname.startsWith('/api/'))return route.continue();
   if(route.request().method()!=='GET' && u.pathname!=='/api/auth/refresh')mutations.push(u.pathname);
   if(routePath==='/login' && u.pathname==='/api/auth/refresh')return route.fulfill({status:401,json:{detail:'QA logged out'}});
   const dataRequest=!u.pathname.startsWith('/api/auth/') && !['/api/status','/api/system-health'].includes(u.pathname);
   if((flow==='health-unknown'&&u.pathname==='/api/system-health')||(state==='error' && dataRequest))return route.fulfill({status:503,json:{detail:'Izolowany błąd QA'}});
   if(state==='loading' && dataRequest)await new Promise(r=>setTimeout(r,3000));
   return route.fulfill({json:fixture(u.pathname,flow)}).catch(()=>{});
  });
  await page.goto(base+routePath);
  // Wait for authentication/bootstrap before measuring the requested page state.
  if(routePath!=='/login')await page.locator('.sk-sidebar').waitFor({state:'attached'});
  await page.waitForTimeout(state==='loading'?250:400);
  if(workflowMode){
   if(flow.startsWith('contact-tools-')){await page.getByRole('textbox',{name:op(language,'Nowy e-mail')+': '+lead.email}).fill('corrected@example.test');await page.getByRole('checkbox',{name:op(language,'Select {p0}').replace('{p0}',lead.email)}).check();if(flow==='contact-tools-suppression')await page.getByRole('button',{name:op(language,'Lista wykluczeń'),exact:true}).click();}
   if(flow==='contact-tools-import'){await page.locator('input[type=file]').nth(1).setInputFiles({name:'qa.csv',mimeType:'text/csv',buffer:Buffer.from('email,name,company\nqa@example.com,Aleksandra,QA')});await page.getByRole('dialog').waitFor();}
   if(flow==='settings-ai-expanded'){const button=page.getByRole('button',{name:op(language,'Konfiguracja: {name}').replace('{name}',op(language,'Reply Interest Classifier'))});await button.focus();await page.keyboard.press('Enter');}
   if(flow==='settings-custom-verification'){const button=page.locator('#settings-verification').getByRole('button',{name:op(language,'Weryfikacja e-mail'),exact:true});await button.focus();await page.keyboard.press('Enter');await page.keyboard.press('Space');}
   if(flow==='settings-restore-preview'){await page.locator('input[type=file]').setInputFiles({name:'qa.qbk',mimeType:'application/octet-stream',buffer:Buffer.from('mock QA fixture')});await page.getByRole('button',{name:op(language,'Sprawdź kopię'),exact:true}).click();await page.getByRole('button',{name:op(language,'Potwierdź i przywróć'),exact:true}).waitFor();await page.getByText(op(language,'Zweryfikowano — potwierdź przywracanie'),{exact:true}).scrollIntoViewIfNeeded();}
   if(flow==='tips-localized'){await page.getByRole('button',{name:new RegExp(op(language,'Reputacja nadawcy'))}).click();await page.getByRole('button',{name:new RegExp(op(language,'Respektuj każde wypisanie'))}).click();}
   if(flow.startsWith('inbox-')){
    await page.getByRole('button',{name:/QA — Aleksandra/}).click();
    await page.getByRole('button',{name:outreachCopy[language].addSuppression,exact:true,includeHidden:true}).waitFor({state:'attached'});
    await page.getByRole('textbox',{name:outreachCopy[language].replyBody}).fill('Niezapisana odpowiedź QA — zachowanie szkicu.');
    if(flow==='inbox-confirm'){await page.getByRole('button',{name:outreachCopy[language].send,exact:true}).click();await page.getByRole('dialog').waitFor();}
   }
   if(flow==='campaign-delete'){await page.getByRole('checkbox',{name:outreachCopy[language].selectVisible,exact:true}).check();await page.getByRole('button',{name:outreachCopy[language].deleteSelected,exact:true}).click();await page.getByRole('dialog').waitFor();}
   if(flow==='campaign-draft')await page.getByRole('textbox',{name:outreachCopy[language].nameRequired}).fill('Kampania QA — zachowanie nazwy');
   if(flow==='contact-suppression'){await page.getByRole('button',{name:contactCopy[language].suppression,exact:true}).click();await page.getByRole('dialog',{name:contactCopy[language].suppressionTitle}).waitFor();}
   if(['contact-activity','contact-campaigns','contact-messages'].includes(flow)){await page.getByRole('tab',{name:contactCopy[language][flow.slice(8)],exact:true}).click();}
   if(flow==='contact-create')await page.getByRole('button',{name:contactCopy[language].add,exact:true}).click();
   if(flow==='contact-import'){
    await page.locator('input[type=file]').setInputFiles({name:'qa.csv',mimeType:'text/csv',buffer:Buffer.from('email,name,company\nqa@example.com,Aleksandra,Przykładowa firma\n')});
    await page.getByRole('button',{name:copy[language].readFile,exact:true}).click();
    await page.getByRole('combobox',{name:copy[language].mapping.replace('{column}','email')}).waitFor();
   }
   if(flow==='contact-fields')await page.getByRole('button',{name:contactCopy[language].manageFields,exact:true}).click();
   if(flow==='template-editor'||flow==='template-preview'){
    await page.getByRole('button',{name:/QA — szablon klienta/}).click();
    await page.getByRole('textbox',{name:op(language,'Temat wiadomości'),exact:true}).fill('Szkic klienta QA');
    if(flow==='template-preview'){
     await page.getByRole('button',{name:op(language,'Podgląd'),exact:true}).click();
     await page.getByRole('button',{name:op(language,'Generuj podgląd'),exact:true}).click();
     await page.getByRole('heading',{name:op(language,'Temat:')+' Temat klienta QA'}).waitFor();
    }
   }
   if(flow==='schedule-queue'){
    await page.getByRole('button',{name:op(language,'Lista wiadomości'),exact:true}).click();
    await page.locator('.email-row').first().click();
   }
   if(flow==='schedule-preview'){
    await page.locator('.sk-calendar-agenda-items button').first().click();
    await page.getByRole('heading',{name:op(language,'Podgląd wiadomości w kolejce'),exact:true}).waitFor();
   }
   if(flow==='notification-detail')await page.getByRole('button',{name:/QA — wiadomość klienta/}).click();
   if(flow==='notification-preferences'){
    await page.getByRole('tab',{name:op(language,'Preferencje'),exact:true}).click();
    await page.getByRole('textbox',{name:op(language,'Adres powiadomień (opcjonalny)')}).fill('draft@example.test');
   }
   if(flow==='campaign-recipient-add'){await page.getByRole('button',{name:campaignCopy[language]['Dodaj kontakty'],exact:true}).click();await page.getByRole('textbox',{name:campaignCopy[language]['E-mail kontaktu']}).fill('draft@example.test');}
   if(flow==='campaign-recipients')await page.getByRole('button',{name:campaignCopy[language]['Filtry'],exact:true}).click();
   if(flow==='sequence-edit'){await page.getByRole('button',{name:campaignCopy[language]['Edytuj krok {step}'].replace('{step}','1'),exact:true}).click();await page.getByRole('textbox',{name:campaignCopy[language]['Temat wiadomości'],exact:true}).fill('Niezapisany temat QA');}
   if(flow==='sequence-variant')await page.getByRole('button',{name:campaignCopy[language]['Dodaj wariant'],exact:true}).click();
   if(flow==='sequence-preview'){
    await page.getByRole('button',{name:campaignCopy[language]['Podgląd'],exact:true}).click();
    await page.getByText('Temat podglądu QA',{exact:true}).waitFor();
   }
   if(flow==='mailbox-add')await page.getByRole('button',{name:op(language,'Dodaj skrzynkę'),exact:true}).first().click();
   if(['mailbox-retention','mailbox-smtp','mailbox-sender','mailbox-tracking-dns','mailbox-tracking-beacon'].includes(flow)){
    await page.getByRole('button',{name:'sender@example.test Nadawca QA',exact:true}).click();
    await page.getByRole('button',{name:op(language,'Edytuj'),exact:true}).click();
    if(flow.startsWith('mailbox-tracking-')){
     await page.getByRole('button',{name:op(language,'Śledzenie'),exact:true}).click();
     if(flow.endsWith('-dns')){
      await page.getByRole('radio',{name:op(language,'Konfiguracja DNS'),exact:true}).check();
      await page.getByPlaceholder('mail.twojadomena.pl').fill('track.example.test');
     }else{
      await page.getByRole('radio',{name:op(language,'Beacon (zalecane)'),exact:true}).check();
      await page.getByPlaceholder('https://track.example.com/?token=…').fill('https://track.example.test/?token=qa-only');
     }
     const help=page.getByRole('button',{name:op(language,'Pokaż informacje'),exact:true});
     while(await help.count())await help.first().click();
    }
    if(flow==='mailbox-retention'){
     await page.getByRole('button',{name:op(language,'Przechowywanie'),exact:true}).click();
     await page.getByRole('combobox',{name:op(language,'Oryginały na serwerze')}).selectOption('days');
    }
    if(flow==='mailbox-smtp'){
     await page.getByRole('button',{name:'SMTP / IMAP',exact:true}).click();
     await page.getByRole('textbox',{name:op(language,'Host SMTP'),exact:true}).fill('draft.example.test');
    }
    if(flow==='mailbox-sender')await page.getByRole('textbox',{name:op(language,'Nazwa nadawcy'),exact:true}).fill('Nadawca klienta QA');
   }
   if(flow==='mobile-menu'&&width<761)await page.locator('.sk-mobile-menu').click();
  }
  await page.evaluate(()=>document.fonts.ready);
  const measurements=await page.evaluate(()=>({
   viewport:innerWidth,documentWidth:document.documentElement.scrollWidth,
   overflowCandidates:document.documentElement.scrollWidth>innerWidth?[...document.querySelectorAll(".sk-page-header,.sk-page-header *, .sk-page-actions, .sk-page-actions *, .sk-contact-tools-page > *")].map(el=>({tag:el.tagName,cls:el.className,right:el.getBoundingClientRect().right,width:el.getBoundingClientRect().width,text:el.textContent.slice(0,90)})).filter(el=>el.right>innerWidth+1).slice(0,20):[],
   sidebarContentOverflow:[...document.querySelectorAll('.sk-system-card,.sk-selfhost')].some(el=>{const sidebar=el.closest('.sk-sidebar')?.getBoundingClientRect(),r=el.getBoundingClientRect();return sidebar?.right>0&&(r.right>sidebar.right+1||el.scrollWidth>el.clientWidth+1);}),
   bodyWidth:document.body.scrollWidth,theme:document.documentElement.dataset.theme,
   font:getComputedStyle(document.body).fontFamily,figtreeLoaded:document.fonts.check('14px Figtree'),
   headings:[...document.querySelectorAll('h1,h2')].map(e=>e.textContent),
   contactToolsTitleCramped:[...document.querySelectorAll('.sk-contact-tools-page h1')].some(el=>el.getBoundingClientRect().height>parseFloat(getComputedStyle(el).lineHeight)*3+1),
   bodyLength:document.body.innerText.length,
   dialogs:[...document.querySelectorAll('[role=dialog]')].map(el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,scrollWidth:el.scrollWidth,clientWidth:el.clientWidth,focusInside:el.contains(document.activeElement)};}),
   backgroundLocked:document.body.style.overflow==='hidden',
   previewOverflow:[...document.querySelectorAll('.sk-preview-message')].some(el=>el.scrollWidth>el.clientWidth+1),
   personalizedButtonOverflow:[...document.querySelectorAll('.sk-personalized-heading button')].some(el=>el.scrollHeight>el.clientHeight+1||el.scrollWidth>el.clientWidth+1),
  }));
  const name=`${workflowMode?flow+'-':''}${routePath.replace(/\//g,'-').replace(/^-+/,'').replace(/[^a-zA-Z0-9-]/g,'-')||'dashboard'}-${width}-${theme}-${state}${language==='pl'?'':'-'+language}.png`;
  await page.screenshot({path:path.join(out,name),fullPage:false});
  results.push({flow,route:routePath,width,height,theme,language,state,...measurements,errors,mutations,screenshot:name});
  await context.close();
 }
 await browser.close();
 await new Promise(r=>server.close(r));
 fs.writeFileSync(path.join(out,'ui-matrix.json'),JSON.stringify(results,null,2)+'\n');
 const failures=results.filter(r=>r.documentWidth>r.viewport || r.sidebarContentOverflow || r.errors.length || r.bodyLength<100 || !r.figtreeLoaded || r.previewOverflow || r.personalizedButtonOverflow || r.contactToolsTitleCramped || r.dialogs.some(d=>d.left<0||d.right>r.width||d.top<0||d.bottom>r.height||d.scrollWidth>d.clientWidth+1||!d.focusInside)||r.dialogs.length&&!r.backgroundLocked);
 console.log(JSON.stringify({captures:results.length,failures},null,2));
 process.exitCode=failures.length?1:0;
})().catch(e=>{console.error(e);process.exit(1)});
