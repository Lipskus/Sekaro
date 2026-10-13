"""Standard contact language and explicit migration of existing custom fields."""
from fastapi import APIRouter,Depends,HTTPException
from pydantic import BaseModel,Field
from sqlalchemy import select
from app.auth import get_current_user
from app.database import get_db
from app.models import Lead
from app.languages import LANGUAGES,ContactLanguage,normalize_language
router=APIRouter(prefix='/api/leads/languages',dependencies=[Depends(get_current_user)])
@router.get('')
async def languages():return LANGUAGES
class LanguageUpdate(BaseModel):
    lead_ids:list[int]=Field(min_length=1,max_length=5000)
    language:ContactLanguage=''
    custom_field:str|None=Field(default=None,max_length=64)
    value_mapping:dict[str,ContactLanguage]=Field(default_factory=dict)
    preview:bool=False
@router.post('')
async def update(body:LanguageUpdate,db=Depends(get_db)):
    rows=(await db.execute(select(Lead).where(Lead.id.in_(body.lead_ids)).with_for_update())).scalars().all()
    changes=[];unknown=[]
    for lead in rows:
        language=body.language
        if body.custom_field:
            raw=str((lead.custom_data or {}).get(body.custom_field,'')).strip()
            try:language=body.value_mapping[raw] if raw in body.value_mapping else normalize_language(raw)
            except ValueError:
                unknown.append({'id':lead.id,'value':raw});continue
        changes.append((lead,language))
    if unknown and not body.preview:raise HTTPException(422,{'message':'Map unrecognized values before applying','unrecognized':unknown[:100]})
    if not body.preview:
        for lead,language in changes:lead.preferred_language=language
        await db.flush()
    return {'updated':0 if body.preview else len(changes),'matched':len(changes),'unrecognized':unknown[:100]}
