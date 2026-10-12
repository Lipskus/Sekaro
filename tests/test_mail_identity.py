import base64
import subprocess
from datetime import datetime, timezone, timedelta
from types import SimpleNamespace
import pytest
from cryptography import x509
from cryptography.x509.oid import NameOID, ExtendedKeyUsageOID
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.serialization import pkcs12
from app import security
from app.mail_identity import certificate_data, SigningError, identity_context, finalize_mime, append_footer, sanitize_email_html
from app.sender import _build_email_message, send_email, SendFailure

@pytest.fixture
def identity(monkeypatch):
    monkeypatch.setattr(security,'_fernet',security._fernet);security.init_encryption('test-only-key')
    key=rsa.generate_private_key(public_exponent=65537,key_size=2048)
    name=x509.Name([x509.NameAttribute(NameOID.COMMON_NAME,'Test certificate')])
    now=datetime.now(timezone.utc)
    cert=(x509.CertificateBuilder().subject_name(name).issuer_name(name).public_key(key.public_key()).serial_number(x509.random_serial_number())
          .not_valid_before(now-timedelta(days=1)).not_valid_after(now+timedelta(days=1))
          .add_extension(x509.SubjectAlternativeName([x509.RFC822Name('sender@example.com')]),False)
          .add_extension(x509.ExtendedKeyUsage([ExtendedKeyUsageOID.EMAIL_PROTECTION]),False).sign(key,hashes.SHA256()))
    blob=pkcs12.serialize_key_and_certificates(b'test',key,cert,None,serialization.BestAvailableEncryption(b'password'))
    return {'smime_enabled':True,'certificate':base64.b64encode(blob).decode(),'password':'password',
            'footer_enabled':True,'footer_text':'Adam — Sekaro','footer_html':'<strong>Adam — Sekaro</strong>'}

@pytest.mark.parametrize('html',[False,True])
def test_signed_final_mime_verifies_and_detects_tampering(identity,tmp_path,html):
    token=identity_context.set(identity)
    try:
        msg=_build_email_message('to@example.com','Subject','<p>Hello unsubscribe-link</p>' if html else 'Hello unsubscribe-link','sender@example.com',is_html=html,list_unsubscribe_url='https://example.com/u/token')
        raw=finalize_mime(msg)
    finally:identity_context.reset(token)
    path=tmp_path/'message.eml';path.write_bytes(raw)
    result=subprocess.run(['openssl','smime','-verify','-noverify','-in',str(path)],capture_output=True)
    assert result.returncode==0,result.stderr.decode()
    assert b'unsubscribe-link' in result.stdout and b'Adam' in result.stdout
    assert b'List-Unsubscribe: <https://example.com/u/token>' in raw
    path.write_bytes(raw.replace(b'unsubscribe-link',b'changed-link'))
    assert subprocess.run(['openssl','smime','-verify','-noverify','-in',str(path)],capture_output=True).returncode!=0

def test_wrong_address_password_and_no_key_block(identity,monkeypatch):
    with pytest.raises(SigningError):certificate_data(identity,'other@example.com')
    with pytest.raises(SigningError):certificate_data({**identity,'password':'wrong'},'sender@example.com')
    monkeypatch.setattr(security,'_fernet',None)
    with pytest.raises(SigningError):certificate_data(identity,'sender@example.com')

def test_optional_footer_and_sanitization():
    assert append_footer('Body',False,None)=='Body'
    assert append_footer('Body',False,{'footer_enabled':False,'footer_text':'Hidden'})=='Body'
    assert 'footer</div></body>' in append_footer('<html><body>Body</body></html>',True,{'footer_enabled':True,'footer_html':'footer'})
    assert sanitize_email_html('<script>bad()</script><b onclick="bad()">Good</b><a href="javascript:bad()">Link</a>')=='<b>Good</b><a>Link</a>'

def test_invalid_signing_fails_before_smtp_connection(identity,monkeypatch):
    from app.settings_manager import settings
    monkeypatch.setattr(settings,'test_mode',False)
    monkeypatch.setattr('app.smtp_utils._smtp_connect',lambda *a,**kw:pytest.fail('Transport must not be called'))
    account=SimpleNamespace(smtp_host='smtp.example.com')
    result=send_email('to@example.com','Subject','Body','other@example.com',provider='smtp',smtp_account=account,mail_identity=identity)
    assert isinstance(result,SendFailure) and result.error_type=='signing_failed'
    assert identity_context.get() is None

@pytest.mark.asyncio
async def test_settings_auth_encryption_revision_and_preview(identity,session):
    import httpx
    from app.main import app
    from app.database import get_db
    from app.auth import create_access_token
    from app.models import User,Inbox
    from sqlalchemy import text,select
    from app.access import AccessAudit
    admin=User(username='identity_admin',email='admin@example.com',role='admin',is_active=True)
    member=User(username='identity_member',email='member@example.com',role='user',is_active=True)
    inbox=Inbox(email='sender@example.com',provider='smtp',paused=False)
    session.add_all([admin,member,inbox]);await session.commit()
    old=dict(app.dependency_overrides)
    async def db():yield session
    app.dependency_overrides[get_db]=db
    try:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url='https://test') as c:
            url=f'/api/inboxes/{inbox.id}/identity'
            assert (await c.get(url)).status_code==401
            member_headers={'Authorization':'Bearer '+create_access_token(member.id,member.role)}
            assert (await c.put(url,headers=member_headers,json={'revision':0})).status_code==403
            headers={'Authorization':'Bearer '+create_access_token(admin.id,admin.role)}
            defaults=(await c.get(url,headers=headers)).json()
            assert not defaults['footer_enabled'] and not defaults['smime_enabled']
            response=await c.put(url,headers=headers,json={**identity,'revision':0})
            assert response.status_code==200,response.text
            assert response.json()['has_certificate'] and 'certificate' not in response.json() and 'password' not in response.json()
            raw=(await session.execute(text('SELECT certificate,password FROM mail_identity'))).one()
            assert all(security.is_encrypted(value) for value in raw)
            assert (await c.put(url,headers=headers,json={**identity,'revision':0})).status_code==409
            preview=(await c.post(url+'-preview',headers=member_headers,json={'body':'Hello'})).json()
            assert 'Adam' in preview['body'] and preview['smime_enabled']
            assert (await c.put(url,headers=headers,json={'revision':1,'smime_enabled':True,'remove_certificate':True})).status_code==422
            audit=await session.scalar(select(AccessAudit))
            assert 'password' not in str(audit.detail) and identity['certificate'] not in str(audit.detail)
            response=await c.put(url,headers=headers,json={'revision':1,'remove_certificate':True})
            assert response.status_code==200 and not response.json()['has_certificate']
    finally:app.dependency_overrides.clear();app.dependency_overrides.update(old)

@pytest.mark.parametrize('reply',[False,True])
def test_microsoft_sends_signed_mime_without_modifying_draft(identity,monkeypatch,tmp_path,reply):
    import json
    from app import sender
    from app.settings_manager import settings
    monkeypatch.setattr(settings,'test_mode',False)
    captured=[]
    class Response:
        def __init__(self,request):self.request=request
        def __enter__(self):return self
        def __exit__(self,*args):pass
        def getcode(self):return 201 if self.request.full_url.endswith('createReply') else 202
        def read(self):return json.dumps({'id':'draft','conversationId':'conversation'}).encode()
    def open(request,**kwargs):captured.append(request);return Response(request)
    monkeypatch.setattr(sender.urllib.request,'urlopen',open)
    monkeypatch.setattr(sender,'_fetch_sent_message_ids',lambda *args:None)
    result=sender.send_email('to@example.com','Subject','Body','sender@example.com',provider='office365',
        office365_account=SimpleNamespace(access_token='token',refresh_token='refresh'),
        reply_graph_message_id='original/id' if reply else None,mail_identity=identity)
    assert result is not None
    assert all(req.get_method()!='PUT' for req in captured)
    raw=base64.b64decode(captured[0].data)
    path=tmp_path/'graph.eml';path.write_bytes(raw)
    assert subprocess.run(['openssl','smime','-verify','-noverify','-in',str(path)],capture_output=True).returncode==0
    assert captured[0].headers['Content-type']=='text/plain'
    assert ('original%2Fid/createReply' in captured[0].full_url) if reply else captured[0].full_url.endswith('/sendMail')
    assert len(captured)==(2 if reply else 1)


def test_expired_certificate_fails_closed(identity,monkeypatch):
    from app import mail_identity
    class Future(datetime):
        @classmethod
        def now(cls,tz=None):return datetime.now(tz)+timedelta(days=3)
    monkeypatch.setattr(mail_identity,'datetime',Future)
    with pytest.raises(SigningError,match='expired'):certificate_data(identity,'sender@example.com')


def test_signed_gmail_payload_verifies(identity,monkeypatch,tmp_path):
    from app import sender
    from app.settings_manager import settings
    captured=[]
    class Operation:
        def __init__(self,data):self.data=data
        def execute(self,**kwargs):return self.data
    class Messages:
        def send(self,**kwargs):captured.append(kwargs['body']['raw']);return Operation({'id':'gmail-id','threadId':'thread'})
        def get(self,**kwargs):return Operation({'payload':{'headers':[]}})
    monkeypatch.setattr(settings,'test_mode',False)
    monkeypatch.setattr(sender,'build',lambda *args,**kwargs:SimpleNamespace(users=lambda:SimpleNamespace(messages=lambda:Messages())))
    result=sender.send_email('to@example.com','Subject','Body','sender@example.com',provider='gmail',gmail_access_token='token',mail_identity=identity)
    assert result is not None
    path=tmp_path/'gmail.eml';path.write_bytes(base64.urlsafe_b64decode(captured[0]))
    assert subprocess.run(['openssl','smime','-verify','-noverify','-in',str(path)],capture_output=True).returncode==0
