import pytest
from app import backup_antivirus as av


def test_disabled_scanner_has_no_network(monkeypatch):
    monkeypatch.delenv('SEKARO_CLAMAV_HOST',raising=False)
    monkeypatch.setattr(av.socket,'create_connection',lambda *_a,**_k:pytest.fail('unexpected network'))
    av._scan(b'data')


@pytest.mark.parametrize('reply,ok',[(b'stream: OK\0',True),(b'stream: Eicar-Test FOUND\0',False),(b'INSTREAM size limit exceeded. ERROR\0',False),(b'',False)])
def test_clamav_replies_fail_closed(reply,ok,monkeypatch):
    monkeypatch.setenv('SEKARO_CLAMAV_HOST','clamav')
    class Socket:
        sent=[]
        def __enter__(self): return self
        def __exit__(self,*_): pass
        def settimeout(self,*_): pass
        def sendall(self,data): self.sent.append(data)
        def recv(self,*_): return reply
    sock=Socket()
    monkeypatch.setattr(av.socket,'create_connection',lambda *_a,**_k:sock)
    if ok: av._scan(b'payload')
    else:
        with pytest.raises(ValueError): av._scan(b'payload')
    assert sock.sent[0]==b'zINSTREAM\0'
