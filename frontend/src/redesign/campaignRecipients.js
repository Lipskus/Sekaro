export const recipientFilters = [
  ['status', 'Status', [['all','Wszystkie'],['active','Aktywne'],['contacted','Skontaktowane'],['replied','Odpowiedziały'],['completed','Zakończone'],['bounced','Odbite'],['unsubscribed','Wypisane'],['wrong_person','Niewłaściwa osoba'],['needs_custom_email','Wymagają treści']]],
  ['interest', 'Zainteresowanie', [['all','Wszystkie'],['unset','Brak oceny'],['interested','Zainteresowane'],['not_interested','Niezainteresowane'],['out_of_office','Poza biurem'],['auto_reply','Automatyczna odpowiedź']]],
  ...[['opened','Otwarcia'],['replied','Odpowiedzi'],['clicked','Kliknięcia']].map(([key,label])=>[key,label,[['all','Wszystkie'],['yes','Tak'],['no','Nie']]]),
  ['verification', 'Weryfikacja', [['all','Wszystkie'],['valid','Poprawne'],['invalid','Niepoprawne'],['risky','Ryzykowne'],['catch_all','Catch-all'],['unknown','Nieznane'],['pending','W toku'],['unverified','Niezweryfikowane']]],
];
export const emptyRecipientFilters = Object.fromEntries(recipientFilters.map(([key])=>[key,'all']));
const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/ł/g,'l').replace(/Ł/g,'L').toLowerCase();
export function filterRecipients(leads, filters, query='') {
  const q=normalize(query.trim());
  return leads.filter(lead=>{
    if(q && !normalize([lead.email,lead.name,...Object.values(lead.custom_data||{})].join(' ')).includes(q)) return false;
    if(filters.status!=='all' && lead.status!==filters.status) return false;
    const interest=lead.interest ?? lead.interest_status ?? '';
    if(filters.interest!=='all' && (filters.interest==='unset' ? !!interest : interest!==filters.interest)) return false;
    for(const key of ['opened','replied','clicked']) {
      if(filters[key]==='yes' && !lead[key]) return false;
      if(filters[key]==='no' && lead[key]) return false;
    }
    if(filters.verification!=='all' && (filters.verification==='unverified' ? !!lead.email_verification_status : lead.email_verification_status!==filters.verification)) return false;
    return true;
  });
}

// Export the entire filtered set, independent of pagination and visible columns.
export function recipientsCsv(leads) {
  const fields=[...new Set(leads.flatMap(l=>Object.keys(l.custom_data||{})))].sort();
  const cell=value=>{
    let text=String(value ?? '');
    if(/^[\s]*[=+@-]|^[\t\r\n]/.test(text)) text="'"+text;
    return '"'+text.replace(/"/g,'""')+'"';
  };
  const header=['email','name','status','interest','verification_status','opened','clicked','replied',...fields];
  const rows=leads.map(l=>[l.email,l.name,l.status||'active',l.interest??l.interest_status,l.email_verification_status,...['opened','clicked','replied'].map(k=>l[k]?'1':'0'),...fields.map(k=>l.custom_data?.[k])]);
  return '\uFEFF'+[header,...rows].map(row=>row.map(cell).join(',')).join('\r\n')+'\r\n';
}
