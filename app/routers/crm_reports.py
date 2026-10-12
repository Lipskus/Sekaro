"""Server-side CRM totals with explicit dates, currencies and single-source attribution."""
from collections import defaultdict
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from app.database import get_db
from app.auth import get_current_user
from app.time import utcnow
from app.models import Lead, EmailLog, Campaign, Inbox
from app.crm_models import CrmProfile
from app.sales_models import Pipeline, Opportunity, SalesActivity
router=APIRouter(prefix='/api/crm/reports',tags=['crm reports'],dependencies=[Depends(get_current_user)])

@router.get('')
async def report(date_from:datetime|None=None,date_to:datetime|None=None,date_basis:Literal['created','closed']='created',pipeline_id:int|None=None,campaign_id:int|None=None,inbox_id:int|None=None,custom_field:str=Query('',max_length=120),custom_value:str=Query('',max_length=255),inactive_days:int=Query(30,ge=1,le=365),db=Depends(get_db)):
    def utc(v):
        if not v:return None
        if v.tzinfo is None or v.utcoffset() is None:raise HTTPException(422,'Include timezone offset')
        return v.astimezone(timezone.utc).replace(tzinfo=None)
    start,end=utc(date_from),utc(date_to)
    if start and end and end<=start:raise HTTPException(422,'End must follow start')
    if custom_value and not custom_field:raise HTTPException(422,'Select a custom field')
    profiles=(await db.scalars(select(CrmProfile))).all();roots={p.lead_id:p.merged_into or p.lead_id for p in profiles}
    leads={r.id:r for r in (await db.scalars(select(Lead))).all()}
    pipelines={p.id:p for p in (await db.scalars(select(Pipeline))).all()}
    campaigns={c.id:c.name for c in (await db.scalars(select(Campaign))).all()}
    inboxes={i.id:i.email for i in (await db.scalars(select(Inbox))).all()}
    logs=defaultdict(list)
    for row in (await db.scalars(select(EmailLog).order_by(EmailLog.sent_at.desc(),EmailLog.id.desc()))).all():logs[roots.get(row.lead_id,row.lead_id)].append(row)
    def in_dates(value):return value is not None and (not start or value>=start) and (not end or value<end)
    def matches_contact(id):
        lead=leads.get(roots.get(id,id))
        return not custom_field or bool(lead and str((lead.custom_data or {}).get(custom_field,''))==custom_value)
    stage_totals=defaultdict(lambda:{'count':0,'value':Decimal(0)})
    money=defaultdict(lambda:{'open':Decimal(0),'won':Decimal(0),'lost':Decimal(0)})
    counts={'open':0,'won':0,'lost':0};sources=defaultdict(lambda:{'count':0,'value':Decimal(0)});included=[];inactive=[]
    for deal in (await db.scalars(select(Opportunity).where(Opportunity.archived_at.is_(None)))).all():
        if pipeline_id and deal.pipeline_id!=pipeline_id:continue
        if not in_dates(deal.created_at if date_basis=='created' else deal.closed_at) or not matches_contact(deal.lead_id):continue
        source=next((x for x in logs[roots.get(deal.lead_id,deal.lead_id)] if x.sent_at and x.sent_at<=deal.created_at),None)
        if campaign_id and (not source or source.campaign_id!=campaign_id):continue
        if inbox_id and (not source or source.inbox_id!=inbox_id):continue
        included.append(deal.id);counts[deal.outcome]+=1;money[deal.currency][deal.outcome]+=deal.value
        key=(deal.pipeline_id,deal.stage,deal.currency);stage_totals[key]['count']+=1;stage_totals[key]['value']+=deal.value
        key=(source.campaign_id if source else None,source.inbox_id if source else None,deal.currency);sources[key]['count']+=1;sources[key]['value']+=deal.value
        if deal.outcome=='open' and deal.updated_at<utcnow()-timedelta(days=inactive_days):inactive.append({'id':deal.id,'title':deal.title,'lead_id':deal.lead_id,'updated_at':deal.updated_at.isoformat()+'Z'})
    all_deals={d.id:d for d in (await db.scalars(select(Opportunity))).all()}
    activity_counts=defaultdict(int);overdue=[];planned_contacts=set()
    for row in (await db.scalars(select(SalesActivity))).all():
        activity_lead=row.lead_id or (all_deals[row.opportunity_id].lead_id if row.opportunity_id in all_deals else None)
        if row.status=='planned' and activity_lead:planned_contacts.add(roots.get(activity_lead,activity_lead))
        # Activities always use due date. Source/pipeline filters use their linked opportunity.
        if not in_dates(row.due_at) or not matches_contact(activity_lead):continue
        if (pipeline_id or campaign_id or inbox_id) and row.opportunity_id not in included:continue
        activity_counts[(row.kind,row.status)]+=1
        if row.status=='planned' and row.due_at<utcnow():overdue.append({'id':row.id,'title':row.title,'lead_id':row.lead_id,'due_at':row.due_at.isoformat()+'Z'})
    followup=[]
    linked={d.lead_id for d in (await db.scalars(select(Opportunity).where(Opportunity.id.in_(included),Opportunity.outcome=='open'))).all() if d.lead_id}
    for lid in sorted(linked):
        root=roots.get(lid,lid);lead=leads.get(root)
        if lead and not lead.archived_at and root not in planned_contacts and not any(x['id']==root for x in followup):followup.append({'id':root,'name':lead.name,'email':lead.email})
    denominator=counts['won']+counts['lost']
    return {'counts':counts,'conversion':{'numerator':counts['won'],'denominator':denominator,'percent':round(100*counts['won']/denominator,2) if denominator else None},'currencies':[{'currency':c,**{k:str(v) for k,v in values.items()}} for c,values in sorted(money.items())],
      'stages':[{'pipeline_id':p,'pipeline':pipelines[p].name if p in pipelines else str(p),'stage':s,'stage_name':next((x['name'] for x in pipelines[p].stages if x['key']==s),s) if p in pipelines else s,'currency':c,'count':v['count'],'value':str(v['value'])} for (p,s,c),v in stage_totals.items()],
      'sources':[{'campaign_id':c,'campaign':campaigns.get(c),'inbox_id':i,'inbox':inboxes.get(i),'currency':currency,'count':v['count'],'value':str(v['value'])} for (c,i,currency),v in sources.items()],
      'activities':[{'kind':kind,'status':status,'count':count} for (kind,status),count in activity_counts.items()],
      'overdue':overdue,'inactive':inactive,'followup':followup,'definitions':{'date_basis':date_basis,'date_from':date_from,'date_to_exclusive':date_to,'activity_date':'due_at','inactive_days':inactive_days,'attribution':'last_sent_before_opportunity; ties: highest email_log.id; merged identities included','value':'opportunity_value_not_accounting_revenue','total_opportunities':len(included)}}
