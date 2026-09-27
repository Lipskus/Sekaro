const fields={sent:'sent',totalOpens:'total_opens',uniqueOpens:'unique_opens',totalReplies:'total_replies',totalClicks:'total_clicks',uniqueClicks:'unique_clicks'};
const dateValue=v=>/^\d{4}-\d{2}-\d{2}$/.test(v||'')?Date.parse(`${v}T00:00:00Z`):NaN;
export function analyticsRangeError(start,end){
 const first=dateValue(start),last=dateValue(end);
 if(!Number.isFinite(first)||!Number.isFinite(last)||new Date(first).toISOString().slice(0,10)!==start||new Date(last).toISOString().slice(0,10)!==end||first>last)return 'Wybierz poprawny zakres dat: data końcowa nie może poprzedzać początkowej.';
 if((last-first)/86400000>=366)return 'Wybierz zakres nie dłuższy niż 366 dni.';
 return null;
}
export function campaignDailyRows(rows,start,end){
 if(analyticsRangeError(start,end))return [];
 const empty=()=>Object.fromEntries(Object.keys(fields).map(k=>[k,0]));
 const byDate=new Map();
 for(const row of rows){
  if(row.date<start||row.date>end)continue;
  const aggregate=byDate.get(row.date)||{date:row.date,...empty()};
  for(const [key,source]of Object.entries(fields))aggregate[key]+=Number(row[source])||0;
  byDate.set(row.date,aggregate);
 }
 const result=[];
 for(let date=dateValue(start);date<=dateValue(end);date+=86400000){const key=new Date(date).toISOString().slice(0,10);result.push(byDate.get(key)||{date:key,...empty()});}
 return result;
}
export function analyticsCsv(rows){return '\uFEFF'+[['Dzień','Wysłane','Otwarcia','Unikalne IP otwarć (dziennie)','Odpowiedzi','Kliknięcia','Unikalne IP kliknięć (dziennie)'],...rows.map(row=>[row.date,...Object.keys(fields).map(key=>row[key])])].map(row=>row.map(value=>'"'+String(value).replace(/"/g,'""')+'"').join(',')).join('\r\n')+'\r\n';}
