/* Isolated frontend QA. Every API request is intercepted; no backend or mailbox is used.
 * Run npm run build in frontend first; this script starts its own local server.
 * P0_PLAYWRIGHT_MODULE=/path/to/playwright P0_CHROMIUM=/path/to/chromium node scripts/check-p0-ui.cjs
 * Screenshots are QA evidence with fixtures, never new design references or live-server proof.
 */
const {chromium}=require(process.env.P0_PLAYWRIGHT_MODULE || 'playwright');
const fs=require('fs');
const path=require('path');
const out=process.env.P0_UI_OUTPUT || 'docs/qa/evidence-2026-09-29';
const base='http://127.0.0.1:4173';
const http=require('http');
const routes=process.env.P0_UI_ROUTES?.split(',') || ['/','/campaigns','/campaigns/add','/campaigns/1','/leads','/leads/1','/contacts-tools','/templates','/inboxes','/unibox','/domains','/schedule','/analytics','/settings','/deliverability-tips','/system-health','/notifications','/login'];
const languages=(process.env.P0_UI_LANGUAGES || 'pl').split(',');
const copy=require('../frontend/src/i18n/workspace.json');
const workflowMode=process.env.P0_UI_WORKFLOWS==='1';
const workflowCases=[['contact-create','/leads'],['contact-import','/leads'],['contact-fields','/leads'],['sequence-preview','/campaigns/1#sequences'],['mailbox-retention','/inboxes'],['mobile-menu','/']];
const inbox={id:1,email:'sender@example.test',display_name:'Nadawca QA',provider:'smtp',paused:false,max_emails_per_day:100,max_emails_per_hour:10,wait_minutes_between:5};
const campaign={id:1,name:'QA — kampania testowa',paused:true,created_at:'2026-09-29T10:00:00Z',sending_days:[0,1,2,3,4],sending_hours_start:'09:00',sending_hours_end:'17:00',timezone:'Europe/Warsaw',inbox_ids:[1],stats:{total_leads:1,emails_sent:0,replies:0,scheduled:0},stop_on_reply:true};
const lead={id:1,name:'QA — Aleksandra Żółkiewska',email:'qa@example.com',created_at:'2026-09-29T10:00:00Z',custom_data:{company:'Przykładowa firma testowa'},campaigns:[],interactions:[]};
function fixture(p){
 if(p==='/api/auth/setup-status')return {setup_complete:true};
 if(p==='/api/auth/refresh')return {access_token:'isolated-qa-fixture'};
 if(p==='/api/auth/me')return {id:1,username:'qa',email:'qa@example.com',role:'admin',is_active:true};
 if(workflowMode){
  if(p==='/api/inboxes')return [inbox];
  if(p==='/api/leads/import/preview')return {headers:['email','name','company'],suggested_mapping:{email:'email',name:'name',company:'custom:company'},total_rows:1,sample_rows:[{email:'qa@example.com',name:'Aleksandra',company:'Przykładowa firma z długą nazwą'}]};
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
 if(p==='/api/campaigns/1/preflight')return {ready:false,checks:[],errors:['QA: brak skrzynki']};
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
 if(p==='/api/settings/backup/config')return {enabled:false,local_disk_enabled:false};
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
 await new Promise(r=>server.listen(4173,'127.0.0.1',r));
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
   if(state==='error' && dataRequest)return route.fulfill({status:503,json:{detail:'Izolowany błąd QA'}});
   if(state==='loading' && dataRequest)await new Promise(r=>setTimeout(r,3000));
   return route.fulfill({json:fixture(u.pathname)}).catch(()=>{});
  });
  await page.goto(base+routePath);
  // Wait for authentication/bootstrap before measuring the requested page state.
  if(routePath!=='/login')await page.locator('.sk-sidebar').waitFor({state:'attached'});
  await page.waitForTimeout(state==='loading'?250:400);
  if(workflowMode){
   if(flow==='contact-create')await page.getByRole('button',{name:'Dodaj kontakt',exact:true}).click();
   if(flow==='contact-import'){
    await page.locator('input[type=file]').setInputFiles({name:'qa.csv',mimeType:'text/csv',buffer:Buffer.from('email,name,company\nqa@example.com,Aleksandra,Przykładowa firma\n')});
    await page.getByRole('button',{name:copy[language].readFile,exact:true}).click();
    await page.getByRole('combobox',{name:copy[language].mapping.replace('{column}','email')}).waitFor();
   }
   if(flow==='contact-fields')await page.getByRole('button',{name:'Zarządzaj polami',exact:true}).click();
   if(flow==='sequence-preview'){
    await page.getByRole('button',{name:'Podgląd',exact:true}).click();
    await page.getByText('Temat podglądu QA',{exact:true}).waitFor();
   }
   if(flow==='mailbox-retention'){
    await page.getByRole('button',{name:'sender@example.test Nadawca QA',exact:true}).click();
    await page.getByRole('button',{name:'Edytuj',exact:true}).click();
    await page.getByRole('button',{name:'Przechowywanie',exact:true}).click();
    await page.getByRole('combobox',{name:'Oryginały na serwerze'}).selectOption({label:'Usuń po określonej liczbie dni'});
   }
   if(flow==='mobile-menu'&&width<761)await page.getByRole('button',{name:'Otwórz menu',exact:true}).click();
  }
  await page.evaluate(()=>document.fonts.ready);
  const measurements=await page.evaluate(()=>({
   viewport:innerWidth,documentWidth:document.documentElement.scrollWidth,
   bodyWidth:document.body.scrollWidth,theme:document.documentElement.dataset.theme,
   font:getComputedStyle(document.body).fontFamily,figtreeLoaded:document.fonts.check('14px Figtree'),
   headings:[...document.querySelectorAll('h1,h2')].map(e=>e.textContent),
   bodyLength:document.body.innerText.length,
   dialogs:[...document.querySelectorAll('[role=dialog]')].map(el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,scrollWidth:el.scrollWidth,clientWidth:el.clientWidth,focusInside:el.contains(document.activeElement)};}),
   backgroundLocked:document.body.style.overflow==='hidden',
   previewOverflow:[...document.querySelectorAll('.sk-preview-message')].some(el=>el.scrollWidth>el.clientWidth+1),
  }));
  const name=`${workflowMode?flow+'-':''}${routePath.replace(/\//g,'-').replace(/^-+/,'').replace(/[^a-zA-Z0-9-]/g,'-')||'dashboard'}-${width}-${theme}-${state}${language==='pl'?'':'-'+language}.png`;
  await page.screenshot({path:path.join(out,name),fullPage:false});
  results.push({flow,route:routePath,width,height,theme,language,state,...measurements,errors,mutations,screenshot:name});
  await context.close();
 }
 await browser.close();
 await new Promise(r=>server.close(r));
 fs.writeFileSync(path.join(out,'ui-matrix.json'),JSON.stringify(results,null,2)+'\n');
 const failures=results.filter(r=>r.documentWidth>r.viewport || r.errors.length || r.bodyLength<100 || !r.figtreeLoaded || r.previewOverflow || r.dialogs.some(d=>d.left<0||d.right>r.width||d.top<0||d.bottom>r.height||d.scrollWidth>d.clientWidth+1||!d.focusInside)||r.dialogs.length&&!r.backgroundLocked);
 console.log(JSON.stringify({captures:results.length,failures},null,2));
 process.exitCode=failures.length?1:0;
})().catch(e=>{console.error(e);process.exit(1)});
