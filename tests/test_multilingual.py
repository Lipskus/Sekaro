import pytest
from types import SimpleNamespace
from pydantic import ValidationError
from sqlalchemy import select,func
from app.models import Campaign,Sequence,SequenceVariant,Lead,Inbox,CampaignInbox,SmtpAccount
from app.languages import localized_sequence,message_language
from app.schemas import LeadCreate,SequenceUpdate
from app.mail_identity import MailIdentity,load_identity,append_footer

@pytest.mark.asyncio
async def test_language_selection_variants_and_whole_step_fallback(session):
    c=Campaign(name='Translations',multilingual=True,default_language='en',missing_translation='block')
    session.add(c);await session.flush()
    s=Sequence(campaign_id=c.id,position=0,subject='Hello',body='English',translations={'de':{'subject':'Hallo','body':'Deutsch'}},variants=[])
    l=Lead(email='test@example.org',preferred_language='de');session.add_all([s,l]);await session.flush()
    out,lang=localized_sequence(s,c,l)
    assert (out.subject,out.body,lang)==('Hallo','Deutsch','de')
    assert s.body=='English'  # resolver never changes persistent default content
    v=SequenceVariant(sequence_id=s.id,label='B',body='English B',enabled=True)
    s.variants.append(v);await session.flush()
    with pytest.raises(ValueError):localized_sequence(s,c,l)
    c.missing_translation='default'
    assert localized_sequence(s,c,l)==(s,'en')
    v.translations={'de':{'body':'Deutsch B'}}
    out,lang=localized_sequence(s,c,l)
    assert out.variants[0].body=='Deutsch B' and lang=='de'
    c.multilingual=False
    assert message_language(c,l)=='en'
    c.multilingual=True;l.preferred_language=''
    assert message_language(c,l)=='en'

@pytest.mark.asyncio
async def test_language_signature_and_preview_match(session,monkeypatch):
    from app.routers.campaigns import preview_email,PreviewRequest,send_test_email,TestEmailRequest
    import app.sender as sender
    c=Campaign(name='Preview',multilingual=True,default_language='en');i=Inbox(email='sender@example.org',provider='smtp');l=Lead(email='person@example.org',name='Anna',preferred_language='de')
    session.add_all([c,i,l]);await session.flush()
    s=Sequence(campaign_id=c.id,position=0,subject='Hi',body='Hi {{name}}',is_html=False,translations={'de':{'subject':'Hallo','body':'Hallo {{name}}','is_html':False}})
    session.add_all([s,CampaignInbox(campaign_id=c.id,inbox_id=i.id),SmtpAccount(inbox_id=i.id,smtp_password='secret'),MailIdentity(inbox_id=i.id,footer_enabled=True,footer_text='Regards',footer_translations={'de':{'footer_text':'Viele Grüße','footer_html':'<b>Viele Grüße</b>'}})])
    await session.flush()
    preview=await preview_email(c.id,PreviewRequest(sequence_id=s.id,lead_id=l.id),session)
    assert preview['subject']=='Hallo' and 'Hallo Anna' in preview['body'] and 'Viele Grüße' in preview['body'] and preview['language']=='de'
    captured={}
    def fake_send(**kwargs):captured.update(kwargs);return sender.SendResult(message_id='test',thread_id='t')
    monkeypatch.setattr(sender,'send_email',fake_send)
    await send_test_email(c.id,TestEmailRequest(sequence_id=s.id,lead_id=l.id,to_email='test@example.org'),session)
    assert captured['subject']=='[TEST] Hallo' and captured['mail_identity']['footer_text']=='Viele Grüße'
    assert append_footer('Message',False,await load_identity(session,i.id,'fr')).endswith('Regards')

@pytest.mark.asyncio
async def test_draft_smtp_test_does_not_create_records(session,monkeypatch):
    from app.routers.smtp import test_draft,SmtpAccountUpsert
    from app.smtp_utils import SmtpTestResult
    import app.routers.smtp as router
    monkeypatch.setattr(router,'test_account_connections',lambda a:(SmtpTestResult(ok=True),SmtpTestResult(ok=False,error='authentication failed')))
    result=await test_draft(SmtpAccountUpsert(smtp_host='smtp.example.org',smtp_username='user',smtp_password='secret',imap_host='imap.example.org',imap_username='user',imap_password='secret'),object())
    assert not result['ok'] and result['smtp']['ok'] and not result['imap']['ok']
    assert await session.scalar(select(func.count(Inbox.id)))==0
    assert await session.scalar(select(func.count(SmtpAccount.id)))==0
    assert 'secret' not in str(result)

@pytest.mark.asyncio
async def test_bulk_custom_language_mapping_is_atomic(session):
    from app.routers.contact_languages import update,LanguageUpdate
    from fastapi import HTTPException
    a=Lead(email='a@example.org',custom_data={'lang':'Polish'});b=Lead(email='b@example.org',custom_data={'lang':'German customer'})
    session.add_all([a,b]);await session.flush()
    body=dict(lead_ids=[a.id,b.id],custom_field='lang')
    report=await update(LanguageUpdate(**body,preview=True),session)
    assert report['matched']==1 and a.preferred_language==''
    with pytest.raises(HTTPException):await update(LanguageUpdate(**body),session)
    assert a.preferred_language==''
    await update(LanguageUpdate(**body,value_mapping={'German customer':'de'}),session)
    assert (a.preferred_language,b.preferred_language)==('pl','de') and b.custom_data['lang']=='German customer'

def test_language_schema_and_import():
    from app.contact_import import suggest_mapping,apply_mapping
    assert LeadCreate(email='x',preferred_language='Polish').preferred_language=='pl'
    with pytest.raises(ValidationError):LeadCreate(email='x',preferred_language='xx-invalid')
    with pytest.raises(ValidationError):SequenceUpdate(translations={'de':{'body':33}})
    mapping=suggest_mapping(['email','language'])
    assert mapping['language']=='preferred_language'
    assert apply_mapping({'email':'x@example.org','language':'DE'},mapping)[2]['__preferred_language']=='DE'

@pytest.mark.asyncio
@pytest.mark.parametrize('worker',['slot','batch'])
async def test_real_queue_paths_select_language_before_transport(session,engine,monkeypatch,worker):
    import app.jobs as jobs
    import app.endpoint_client as endpoint
    from app.models import CampaignLead,QueueSlot,EmailLog
    from app.sender import SendResult
    from sqlalchemy.ext.asyncio import async_sessionmaker
    from datetime import datetime
    monkeypatch.setattr(jobs,'AsyncSessionLocal',async_sessionmaker(engine,expire_on_commit=False))
    private=lambda:{'mode':'private','endpoints':[]}
    monkeypatch.setattr(endpoint,'configuration',private)
    monkeypatch.setattr(jobs,'endpoint_configuration',private)
    monkeypatch.setattr(jobs,'_in_sending_window',lambda *args:True)
    monkeypatch.setattr(jobs.settings,'test_mode',False)
    async def claim(*args):return 'test-claim'
    async def release(*args):pass
    monkeypatch.setattr(jobs,'_claim_send_attempt',claim);monkeypatch.setattr(jobs,'_release_send_attempt',release)
    c=Campaign(name='Queue',multilingual=True,default_language='en',paused=False,sending_days=list(range(7)),sending_hours_start='00:00',sending_hours_end='23:59',stop_on_reply=False)
    i=Inbox(email='sender@example.org',provider='smtp',max_emails_per_day=100,max_jitter_seconds=0)
    l=Lead(email='person@example.org',preferred_language='de',status='active')
    session.add_all([c,i,l]);await session.flush()
    cl=CampaignLead(campaign_id=c.id,lead_id=l.id,enrollment_status='active')
    s=Sequence(campaign_id=c.id,position=0,subject='English',body='English body',is_html=False,translations={'de':{'subject':'Deutsch','body':'Deutscher Text','is_html':False}})
    session.add_all([cl,s,CampaignInbox(campaign_id=c.id,inbox_id=i.id),SmtpAccount(inbox_id=i.id,smtp_host='smtp.example.org',smtp_username='sender',smtp_password='secret'),MailIdentity(inbox_id=i.id,footer_enabled=True,footer_text='Regards',footer_translations={'de':{'footer_text':'Grüße'}})])
    await session.flush()
    q=QueueSlot(campaign_lead_id=cl.id,inbox_id=i.id,sequence_index=0,position_in_day=0,scheduled_date=jobs.time_provider.now())
    session.add(q);await session.commit();captured=[]
    def send(**kw):captured.append(kw);return SendResult(message_id='queue-test',thread_id='queue-thread')
    monkeypatch.setattr(jobs,'send_email',send)
    if worker=='slot':await jobs.send_slot_job(q.id)
    else:await jobs.run_send_job()
    assert len(captured)==1
    assert captured[0]['subject']=='Deutsch'
    assert captured[0]['mail_identity']['footer_text']=='Grüße'
    row=await session.scalar(select(EmailLog))
    assert row.message_language=='de' and row.rendered_body=='Deutscher Text'
