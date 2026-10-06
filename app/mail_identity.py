"""Optional per-mailbox footer and S/MIME. No private material in public responses."""
import base64
import copy
from contextvars import ContextVar
from datetime import datetime, timezone
from html import escape
from cryptography import x509
from cryptography.x509.oid import NameOID, ExtendedKeyUsageOID
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa, ec
from cryptography.hazmat.primitives.serialization import pkcs12, pkcs7
from sqlalchemy import Column, Integer, Boolean, Text, ForeignKey
from app.database import Base
from app.security import EncryptedText, encryption_enabled

class MailIdentity(Base):
    __tablename__ = 'mail_identity'
    inbox_id = Column(Integer, ForeignKey('inbox.id', ondelete='CASCADE'), primary_key=True)
    footer_enabled = Column(Boolean, default=False, nullable=False)
    footer_html = Column(Text, default='', nullable=False)
    footer_text = Column(Text, default='', nullable=False)
    smime_enabled = Column(Boolean, default=False, nullable=False)
    certificate = Column(EncryptedText, default='', nullable=False)
    password = Column(EncryptedText, default='', nullable=False)
    revision = Column(Integer, default=1, nullable=False)

identity_context = ContextVar('mail_identity', default=None)

class SigningError(ValueError):
    pass

async def load_identity(db, inbox_id):
    row = await db.get(MailIdentity, inbox_id, populate_existing=True)
    if row is None:
        return None
    return {name: getattr(row, name) for name in ('footer_enabled','footer_html','footer_text','smime_enabled','certificate','password')}

def certificate_data(identity, email):
    if not encryption_enabled():
        raise SigningError('Encryption key is required for S/MIME')
    try:
        key, cert, chain = pkcs12.load_key_and_certificates(base64.b64decode(identity.get('certificate',''), validate=True),
            (identity.get('password') or '').encode() or None)
        if key is None or cert is None:
            raise ValueError()
        if not ((isinstance(key, rsa.RSAPrivateKey) and key.key_size >= 2048) or
                (isinstance(key, ec.EllipticCurvePrivateKey) and key.key_size >= 256)):
            raise SigningError('S/MIME requires RSA 2048+ or EC 256+')
        if key.public_key().public_bytes(serialization.Encoding.DER,serialization.PublicFormat.SubjectPublicKeyInfo) != cert.public_key().public_bytes(serialization.Encoding.DER,serialization.PublicFormat.SubjectPublicKeyInfo):
            raise ValueError()
        now = datetime.now(timezone.utc)
        if not cert.not_valid_before_utc <= now < cert.not_valid_after_utc:
            raise SigningError('S/MIME certificate is expired or not yet valid')
        addresses = [a.value for a in cert.subject.get_attributes_for_oid(NameOID.EMAIL_ADDRESS)]
        try: addresses += cert.extensions.get_extension_for_class(x509.SubjectAlternativeName).value.get_values_for_type(x509.RFC822Name)
        except x509.ExtensionNotFound: pass
        if email.strip().lower() not in {a.lower() for a in addresses}:
            raise SigningError('S/MIME certificate does not match the sender address')
        try:
            if ExtendedKeyUsageOID.EMAIL_PROTECTION not in cert.extensions.get_extension_for_class(x509.ExtendedKeyUsage).value:
                raise SigningError('Certificate does not allow email protection')
        except x509.ExtensionNotFound:
            raise SigningError('Certificate must include email protection usage') from None
        try:
            if not cert.extensions.get_extension_for_class(x509.KeyUsage).value.digital_signature:
                raise SigningError('Certificate does not allow digital signatures')
        except x509.ExtensionNotFound: pass
        try:
            if cert.extensions.get_extension_for_class(x509.BasicConstraints).value.ca:
                raise SigningError('Use a personal certificate, not a CA certificate')
        except x509.ExtensionNotFound: pass
        return key, cert, chain
    except SigningError:
        raise
    except Exception:
        raise SigningError('Cannot read P12/PFX certificate. Check the file and password.') from None

def append_footer(body, is_html, identity):
    if not identity or not identity.get('footer_enabled'):
        return body
    footer = identity.get('footer_html') if is_html else identity.get('footer_text')
    if not footer and is_html:
        footer = escape(identity.get('footer_text','')).replace('\n','<br>')
    if not footer: return body
    if is_html:
        # Insert inside complete HTML documents so MIME wrapper stripping retains the footer.
        import re
        addition = '<div class="sekaro-signature">'+footer+'</div>'
        if re.search(r'</body\s*>',body,re.I):
            return re.sub(r'</body\s*>',lambda m:addition+m.group(),body,count=1,flags=re.I)
        return body+'\n'+addition
    return body.rstrip()+'\n\n-- \n'+footer

def finalize_mime(message):
    identity = identity_context.get()
    if not identity or not identity.get('smime_enabled'):
        return message.as_bytes()
    from email.utils import parseaddr
    key, cert, chain = certificate_data(identity, parseaddr(message['From'])[1])
    content = copy.deepcopy(message)
    envelope = copy.deepcopy(message)
    for name in list(content.keys()):
        if not name.lower().startswith('content-') and name.lower() != 'mime-version':
            del content[name]
    for name in list(envelope.keys()):
        if name.lower().startswith('content-') or name.lower() == 'mime-version':
            del envelope[name]
    builder = pkcs7.PKCS7SignatureBuilder().set_data(content.as_bytes()).add_signer(cert,key,hashes.SHA256())
    for item in chain or ():
        builder = builder.add_certificate(item)
    signed = builder.sign(serialization.Encoding.SMIME,[pkcs7.PKCS7Options.DetachedSignature,pkcs7.PKCS7Options.Binary])
    # Preserve signed bytes exactly; never reserialize the signed MIME payload.
    envelope.set_payload('')
    headers = envelope.as_bytes().split(b'\r\n\r\n',1)[0]
    return headers+b'\r\n'+signed

def sanitize_email_html(value):
    """Small formatting allowlist for a footer, with no images or active content."""
    from html.parser import HTMLParser
    from urllib.parse import urlparse
    class Cleaner(HTMLParser):
        allowed = {'p','div','br','strong','b','em','i','u','ul','ol','li','span','a'}
        def __init__(self):super().__init__(convert_charrefs=True);self.parts=[];self.block=0
        def handle_starttag(self,tag,attrs):
            if tag in {'script','style','iframe','object'}:self.block+=1;return
            if self.block or tag not in self.allowed:return
            attr=''
            if tag=='a':
                href=dict(attrs).get('href','').strip()
                if urlparse(href).scheme.lower() in {'https','http','mailto'} and not any(ord(c)<32 for c in href):
                    attr=' href="'+escape(href,quote=True)+'"'
            self.parts.append('<'+tag+attr+'>')
        def handle_endtag(self,tag):
            if tag in {'script','style','iframe','object'}:self.block=max(0,self.block-1);return
            if not self.block and tag in self.allowed and tag!='br':self.parts.append('</'+tag+'>')
        def handle_data(self,data):
            if not self.block:self.parts.append(escape(data))
    parser=Cleaner();parser.feed(value);parser.close();return ''.join(parser.parts)
