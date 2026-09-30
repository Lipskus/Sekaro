import {useMemo} from 'react';
import {useUiLanguage} from './LanguageContext';
import {campaignText} from './campaignLanguage';
import copy from '../i18n/operations.json';

// Only call for interface copy; customer messages and stored titles stay unchanged.
export function operationsText(language, source, params = {}) {
  if (typeof source !== 'string') return source ?? '';
  const text = copy[language]?.[source] ?? copy.en[source];
  if (text === undefined) return campaignText(language, source, params);
  return text.replace(/\{(\w+)\}/g, (match, key) => Object.hasOwn(params, key) ? String(params[key]) : match);
}
export function useOperationsLanguage() {
  const {language} = useUiLanguage();
  return useMemo(() => ({language, ct:(source, params)=>operationsText(language, source, params)}), [language]);
}
