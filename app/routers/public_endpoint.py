"""Private read-only endpoint diagnostics; secrets never leave server configuration."""
from fastapi import APIRouter, Depends
from app.auth import require_admin
from app.database import get_db
from app.models import EndpointCursor
from app.endpoint_client import configuration, client, request

router=APIRouter(prefix='/api/public-endpoint',dependencies=[Depends(require_admin)])

@router.get('/status')
async def status(db=Depends(get_db)):
    try:
        config=configuration()
        rows=[]
        for p in config['endpoints']:
            item={'id':p['id'],'public_url':p['public_url'],'inbox_ids':p.get('inbox_ids',[]),'retired':bool(p.get('retired'))}
            try:
                async with client(p) as c:
                    health=await request(c,'GET','/v1/status')
                cursor=await db.get(EndpointCursor,p['id'])
                local=cursor.cursor if cursor else 0
                ready=(health.get('protocol')==1 and health.get('epoch')==p['epoch']
                       and (not cursor or cursor.epoch==p['epoch'])
                       and health.get('ack',0)<=local<=health.get('high',-1))
                item.update(ready=ready,pending=health.get('pending'))
            except Exception:
                item['ready']=False
            rows.append(item)
        return {'mode':config['mode'],'endpoints':rows}
    except Exception:
        return {'mode':'invalid','endpoints':[]}
