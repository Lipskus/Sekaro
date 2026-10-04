"""CRM grouping never rewrites delivery identity, message IDs, or unsubscribe tokens."""
import hashlib
import json
from fastapi import HTTPException
from sqlalchemy import select, or_
from app.models import Lead, CampaignLead, ContactOperation
from app.crm_models import CrmProfile, ContactAddress, Company, CompanyContact, CrmNote
from app.contact_lifecycle import record_operation, set_archived
from app.suppression import is_suppressed, suppress_email

async def writable(db, lead_id):
    lead = (await db.execute(select(Lead).where(Lead.id == lead_id).with_for_update().execution_options(populate_existing=True))).scalar_one_or_none()
    if not lead:
        raise HTTPException(404, 'Contact not found')
    profile = await db.get(CrmProfile, lead_id)
    if profile and profile.merged_into:
        raise HTTPException(409, f'Contact merged into #{profile.merged_into}; open that profile')
    return lead

async def protect_delete(db, ids):
    await db.execute(select(Lead.id).where(Lead.id.in_(ids)).order_by(Lead.id).with_for_update())
    if (await db.execute(select(CrmProfile.lead_id).where(or_(
        CrmProfile.lead_id.in_(ids) & CrmProfile.merged_into.is_not(None),
        CrmProfile.merged_into.in_(ids)
    )).limit(1))).first():
        raise HTTPException(409, 'Merged contact history cannot be deleted; archive the surviving contact')

async def profile_for(db, lead):
    profile = await db.get(CrmProfile, lead.id)
    if profile is None:
        profile = CrmProfile(lead_id=lead.id, kind='unspecified')
        db.add(profile)
        await db.flush()
    return profile

async def contact_view(db, lead_id):
    lead = await db.get(Lead, lead_id)
    if not lead:
        raise HTTPException(404, 'Contact not found')
    profile = await db.get(CrmProfile, lead_id)
    members = list((await db.execute(select(Lead).join(CrmProfile, CrmProfile.lead_id == Lead.id).where(CrmProfile.merged_into == lead_id).order_by(Lead.id))).scalars())
    ids = [lead_id] + [x.id for x in members]
    addresses = [{'id':None,'lead_id':x.id,'email':x.email,'label':'outreach','primary':True} for x in [lead]+members]
    addresses += [dict(id=x.id,lead_id=x.lead_id,email=x.email,label=x.label,primary=False) for x in (await db.execute(select(ContactAddress).where(ContactAddress.lead_id.in_(ids)).order_by(ContactAddress.id))).scalars()]
    for address in addresses:
        address['suppressed'] = await is_suppressed(db, address['email'])
    notes = [dict(id=x.id,lead_id=x.lead_id,body=x.body,actor_name=x.actor_name,created_at=x.created_at) for x in (await db.execute(select(CrmNote).where(CrmNote.lead_id.in_(ids)).order_by(CrmNote.id.desc()))).scalars()]
    companies = [dict(id=c.id,name=c.name,archived_at=c.archived_at,relation_id=r.id,lead_id=r.lead_id,role=r.role) for r,c in (await db.execute(select(CompanyContact,Company).join(Company,Company.id==CompanyContact.company_id).where(CompanyContact.lead_id.in_(ids)).order_by(CompanyContact.id))).all()]
    operations = [dict(id=x.id,lead_id=x.lead_id,action=x.action,actor_name=x.actor_name,at=x.occurred_at,details=x.details) for x in (await db.execute(select(ContactOperation).where(ContactOperation.lead_id.in_(ids)).order_by(ContactOperation.id.desc()).limit(500))).scalars()]
    return dict(id=lead.id,name=lead.name,email=lead.email,custom_data=lead.custom_data or {},status=lead.status,archived_at=lead.archived_at,kind=profile.kind if profile else 'unspecified',merged_into=profile.merged_into if profile else None,
                members=[dict(id=x.id,name=x.name,email=x.email,status=x.status) for x in members],addresses=addresses,notes=notes,companies=companies,operations=operations)

async def merge_preview(db, target_id, source_id):
    if target_id == source_id:
        raise HTTPException(422, 'Choose two different contacts')
    # Lock in stable order, shared with ordinary contact/CRM mutations.
    for lead_id in sorted([target_id,source_id]):
        await writable(db,lead_id)
    target, source = await contact_view(db,target_id), await contact_view(db,source_id)
    if source['members']:
        raise HTTPException(409,'A group can be the target, not the source of a merge')
    if source['kind'] != 'person' or target['kind'] != 'person':
        raise HTTPException(409,'Confirm both contacts are people before merging; shared mailboxes are not people')
    fields = ['name'] + sorted(set(target['custom_data']) | set(source['custom_data']))
    conflicts = []
    for field in fields:
        a = target['name'] if field == 'name' else target['custom_data'].get(field)
        b = source['name'] if field == 'name' else source['custom_data'].get(field)
        if a not in (None,'') and b not in (None,'') and a != b:
            conflicts.append(dict(field=field,target=a,source=b))
    state = dict(target=target,source=source,conflicts=conflicts)
    digest = hashlib.sha256(json.dumps(state,sort_keys=True,default=str,ensure_ascii=False).encode()).hexdigest()
    return {**state,'fingerprint':digest}

async def merge_contacts(db, target_id, source_id, fingerprint, choices, actor):
    preview = await merge_preview(db,target_id,source_id)
    if preview['fingerprint'] != fingerprint:
        raise HTTPException(409,'Contact changed; refresh the merge preview')
    required = {x['field'] for x in preview['conflicts']}
    if set(choices) != required or any(x not in ('source','target') for x in choices.values()):
        raise HTTPException(422,'Choose a value for every conflict')
    target,source = await db.get(Lead,target_id), await db.get(Lead,source_id)
    before = {side:{key:preview[side][key] for key in ('id','name','email','custom_data','kind','status','archived_at')} for side in ('target','source')}
    original_archived = target.archived_at
    await set_archived(db,[target_id,source_id],True,actor)
    if original_archived is None:
        await set_archived(db,[target_id],False,actor)
    # Even already archived contacts must remain paused.
    for row in (await db.execute(select(CampaignLead).where(CampaignLead.lead_id.in_([target_id,source_id])))).scalars():
        row.sending_paused = True
        row.archive_sending_paused = True
    profile = await profile_for(db,source)
    profile.merged_into = target_id
    if choices.get('name') == 'source' or not target.name:
        target.name = source.name
    custom = dict(target.custom_data or {})
    for key,value in (source.custom_data or {}).items():
        if custom.get(key) in (None,'') or choices.get(key) == 'source':
            custom[key] = value
    target.custom_data = custom
    # Person-wide unsubscribe wins over a merge; address-specific bounce remains intact.
    all_addresses = preview['target']['addresses'] + preview['source']['addresses']
    if source.status == 'unsubscribed' or target.status == 'unsubscribed' or any(a['suppressed'] for a in all_addresses):
        for address in all_addresses:
            await suppress_email(db,address['email'],reason='',source='',stop_active_sends=False)
    details = json.loads(json.dumps(dict(source_id=source_id,target_id=target_id,choices=choices,before=before),default=str))
    record_operation(db,target_id,'merge',actor,details)
    record_operation(db,source_id,'merged',actor,{'target_id':target_id})
    await db.flush()
    return await contact_view(db,target_id)

async def crm_block_reason(db, recipient):
    """Unsubscribe on an old identity also blocks its surviving person's addresses."""
    from sqlalchemy import func, exists
    from app.models import SuppressionEntry
    norm = recipient.strip().lower()
    direct = list((await db.execute(select(Lead.id).where(or_(
        func.lower(Lead.email) == norm,
        exists(select(1).where(ContactAddress.lead_id == Lead.id, func.lower(ContactAddress.email) == norm)),
    )))).scalars())
    if not direct:
        return None
    roots = set(direct)
    for p in (await db.execute(select(CrmProfile).where(CrmProfile.lead_id.in_(direct)))).scalars():
        if p.merged_into:
            roots.discard(p.lead_id)
            roots.add(p.merged_into)
    members = set((await db.execute(select(CrmProfile.lead_id).where(CrmProfile.merged_into.in_(roots)))).scalars()) | roots
    leads = (await db.execute(select(Lead.id,Lead.email,Lead.status,Lead.archived_at).where(Lead.id.in_(members)).order_by(Lead.id).with_for_update())).all()
    if any(x.archived_at and x.id in roots for x in leads):
        return 'archived'
    addresses = {x.email.strip().lower() for x in leads}
    addresses.update((await db.execute(select(ContactAddress.email).where(ContactAddress.lead_id.in_(members)))).scalars())
    suppressed = (await db.execute(select(SuppressionEntry.id).where(func.lower(SuppressionEntry.email).in_(addresses)).limit(1))).first()
    if suppressed or any(x.status == 'unsubscribed' for x in leads):
        return 'suppressed'
    return None
