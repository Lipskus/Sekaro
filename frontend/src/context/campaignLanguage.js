import {useMemo} from 'react';
import {useUiLanguage} from './LanguageContext';
import copy from '../i18n/campaign.json';

// Source-text keys localize existing campaign controls; API codes and user content stay unchanged.
export function campaignText(language, source, params = {}) {
  if (typeof source !== 'string') return source ?? '';
  const text = copy[language]?.[source] ?? copy.en[source] ?? source;
  return text.replace(/\{(\w+)\}/g, (match, key) => Object.hasOwn(params, key) ? String(params[key]) : match);
}
export function useCampaignLanguage() {
  const {language} = useUiLanguage();
  return useMemo(() => ({language, ct: (source, params) => campaignText(language, source, params)}), [language]);
}
export function campaignWeekdays(language, polish = ['Pon','Wt','Śr','Czw','Pt','Sob','Nie']) {
  if (language === 'pl') return polish;
  return Array.from({length:7}, (_, i) => new Date(Date.UTC(2024,0,1+i)).toLocaleDateString(language,{weekday:'short',timeZone:'UTC'}));
}
