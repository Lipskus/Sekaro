"""Deterministic campaign language resolution shared by preview and both send paths."""
from typing import Annotated
from types import SimpleNamespace
from pydantic import AfterValidator

LANGUAGES = {'en':'English','pl':'Polski','de':'Deutsch','fr':'Français','es':'Español','it':'Italiano','pt':'Português','nl':'Nederlands','da':'Dansk','sv':'Svenska','no':'Norsk','fi':'Suomi','et':'Eesti','lv':'Latviešu','lt':'Lietuvių','cs':'Čeština','sk':'Slovenčina','hu':'Magyar','ro':'Română','bg':'Български','hr':'Hrvatski','sl':'Slovenščina','el':'Ελληνικά','tr':'Türkçe','uk':'Українська','ru':'Русский','ar':'العربية','he':'עברית','zh':'中文','ja':'日本語','ko':'한국어'}
def normalize_language(value):
    value = (value or '').strip().lower().replace('_','-')
    aliases = {'polish':'pl','polski':'pl','english':'en','angielski':'en','german':'de','niemiecki':'de','deutsch':'de','unknown':'','nieznany':''}
    value=aliases.get(value,value)
    if value in LANGUAGES or value=='': return value
    raise ValueError('Choose a supported language code (for example en, pl, de)')
def required_language(value):
    value=normalize_language(value)
    if not value: raise ValueError('Campaign language is required')
    return value
ContactLanguage=Annotated[str,AfterValidator(normalize_language)]
CampaignLanguage=Annotated[str,AfterValidator(required_language)]
def validate_translations(value):
    result={}
    if len(value)>len(LANGUAGES): raise ValueError('Too many translations')
    for language,item in value.items():
        code=required_language(language)
        if code in result: raise ValueError('Duplicate language')
        if not isinstance(item,dict) or set(item)-{'subject','body','is_html','preview_text','fallback_subject','fallback_body'}: raise ValueError('Invalid translation fields')
        for key,text in item.items():
            if key=='is_html':
                if text is not None and not isinstance(text,bool): raise ValueError('is_html must be boolean')
            elif text is not None and (not isinstance(text,str) or len(text)>(512 if key in ('subject','fallback_subject') else 200000)):
                raise ValueError('Invalid translation text')
        result[code]=item
    return result
Translations=Annotated[dict,AfterValidator(validate_translations)]

def message_language(campaign,lead=None):
    default=getattr(campaign,'default_language',None) or 'en'
    return (getattr(lead,'preferred_language',None) or default) if getattr(campaign,'multilingual',False) else default

def translated(obj,language,default):
    if language==default:return obj
    values=(getattr(obj,'translations',None) or {}).get(language)
    if not values or not (values.get('body') or '').strip():raise ValueError(f'Missing {language} message translation')
    result=SimpleNamespace(**{c.key:getattr(obj,c.key) for c in obj.__table__.columns})
    result.subject=values.get('subject')
    result.body=values['body']
    result.preview_text=values.get('preview_text')
    result.is_html=values.get('is_html',getattr(obj,'is_html',None))
    if hasattr(obj,'fallback_body'):
        result.fallback_body=values.get('fallback_body');result.fallback_subject=values.get('fallback_subject')
    return result

def localized_sequence(sequence,campaign,lead=None,language=None):
    """Fallback applies to the whole step (including A/B variants), never mixed languages."""
    default=getattr(campaign,'default_language',None) or 'en'
    requested=language or message_language(campaign,lead)
    variants=getattr(sequence,'variants',[]) if 'variants' in sequence.__dict__ else []
    try:
        result=translated(sequence,requested,default)
        localized=[translated(v,requested,default) if v.enabled else v for v in variants]
        if result is not sequence:result.variants=localized
        if requested!=default and sequence.position==0 and not (result.subject or '').strip():raise ValueError(f'Missing {requested} subject')
        return result,requested
    except ValueError:
        if getattr(campaign,'missing_translation','block')=='default':return sequence,default
        raise
