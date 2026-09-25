import { useState, useEffect, useRef, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { api, apiCache } from '../api';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { PageFrame, Metric, ErrorNotice, Empty, StatePanel } from '../redesign/ui';
import DatePicker from '../components/ui/DatePicker';
// Recharts for charts
import {
  ResponsiveContainer,
  AreaChart as ReAreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from 'recharts';

// Fill every day in [start, end] with zeros where no data exists
function fillDateRange(dataMap, startDate, endDate) {
  const result = [];
  if (!startDate || !endDate) return Object.values(dataMap).sort((a,b)=>a.date.localeCompare(b.date));
  const cur = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00');
  while (cur <= end) {
    const iso = localIso(cur);
    result.push(dataMap[iso] || { date: iso, sent: 0, totalOpens: 0, uniqueOpens: 0, totalReplies: 0, totalClicks: 0, uniqueClicks: 0 });
    cur.setDate(cur.getDate() + 1);
  }
  return result;
}

function localIso(dt) {
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
}

function buildPresets(serverToday) {
  const t = serverToday || new Date();
  const todayStr = localIso(t);
  const d = (offset) => { const dt = new Date(t); dt.setDate(dt.getDate() + offset); return localIso(dt); };
  const monday = (dt) => { const x = new Date(dt); const day = x.getDay(); x.setDate(x.getDate() - (day === 0 ? 6 : day - 1)); return x; };
  const lastWeekEnd = new Date(monday(t)); lastWeekEnd.setDate(lastWeekEnd.getDate() - 1);
  const lastWeekStart = localIso(monday(lastWeekEnd));
  const lastMonthStart = localIso(new Date(t.getFullYear(), t.getMonth() - 1, 1));
  const lastMonthEnd = localIso(new Date(t.getFullYear(), t.getMonth(), 0));
  return [
    { label: 'Ostatnie 7 dni',  start: d(-6),          end: todayStr },
    { label: 'Poprzedni tydzień',    start: lastWeekStart,  end: localIso(lastWeekEnd) },
    { label: 'Ostatnie 30 dni', start: d(-29),         end: todayStr },
    { label: 'Poprzedni miesiąc',   start: lastMonthStart, end: lastMonthEnd },
    { label: 'Ostatnie 90 dni', start: d(-89),         end: todayStr },
  ];
}

export default function Analytics() {
  const [campaigns, setCampaigns] = useState(() => apiCache.get('/campaigns') || []);
  // current dropdown choice and list of selected campaign ids
  const [currentChoice, setCurrentChoice] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [error, setError] = useState(null);
  const [analyticsData, setAnalyticsData] = useState([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState(null);
  const [retry, setRetry] = useState(0);
  const [serverToday, setServerToday] = useState(null);

  const [presets, setPresets] = useState(() => buildPresets(new Date()));
  const [activePreset, setActivePreset] = useState('Ostatnie 7 dni');
  const defaultRange = presets.find(p => p.label === 'Ostatnie 7 dni') || presets[0];
  const [startDate, setStartDate] = useState(defaultRange.start);
  const [endDate, setEndDate] = useState(defaultRange.end);

  // state for whether each series should be hidden
  const [hideSeries, setHideSeries] = useState({
    sent: false,
    totalOpens: false,
    uniqueOpens: false,
    totalReplies: false,
    totalClicks: false,
    uniqueClicks: false,
  });
  // initialize hide flags for any series that are all zero; run only once when data arrives
  const initializedRef = useRef(false);
  const [zoomRange, setZoomRange] = useState({ start: 0, end: 0 });
  const activeChartIdxRef = useRef(null);
  const chartContainerRef = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const [camps, offsetData] = await Promise.all([
          api.get('/campaigns'),
          api.get('/settings/time-offset').catch(() => ({ time_offset_days: 0 })),
        ]);
        setCampaigns(camps);
        // compute server today using offset
        const off = parseInt(offsetData.time_offset_days || 0, 10);
        const t = new Date();
        t.setDate(t.getDate() + off);
        setServerToday(t);
        // Rebuild presets using server time
        const newPresets = buildPresets(t);
        setPresets(newPresets);
        const last7 = newPresets.find(p => p.label === 'Ostatnie 7 dni') || newPresets[0];
        setStartDate(last7.start);
        setEndDate(last7.end);
        setActivePreset('Ostatnie 7 dni');
      } catch (e) {
        setError('Nie udało się wczytać analityki.');
      }
    })();
  }, []);

  // Re-fetch analytics data whenever the date range or campaign selection changes
  useEffect(() => {
    let current = true;
    if (!startDate || !endDate || startDate > endDate) {
      setDataLoading(false);
      setDataError('Wybierz poprawny zakres dat: data końcowa nie może poprzedzać początkowej.');
      return;
    }
    setDataLoading(true);
    setDataError(null);
    const params = new URLSearchParams({ start_date: startDate, end_date: endDate });
    if (selectedIds.length) selectedIds.forEach(id => params.append('campaign_id', id));
    api.get(`/analytics/daily?${params}`)
      .then(data => { if (current) setAnalyticsData(data); })
      .catch(() => { if (current) setDataError('Nie udało się pobrać wyników analityki.'); })
      .finally(() => { if (current) setDataLoading(false); });
    return () => { current = false; };
  }, [startDate, endDate, selectedIds, retry]);

  const applyPreset = (preset) => {
    setActivePreset(preset.label);
    setStartDate(preset.start);
    setEndDate(preset.end);
  };

  const filtered = selectedIds.length
    ? campaigns.filter(c => selectedIds.includes(String(c.id)))
    : campaigns;

  // compute aggregated stats for open/click rates (used to approximate uniques)
  const totalSentForRates = filtered.reduce((acc,c)=>acc + ((c.stats?.emails_sent)||0),0);
  const totalOpened = filtered.reduce((acc,c)=>acc + ((c.stats?.open_rate||0) * ((c.stats?.emails_sent)||0)),0);
  const totalClicked = filtered.reduce((acc,c)=>acc + ((c.stats?.click_rate||0) * ((c.stats?.emails_sent)||0)),0);
  const openRateAll = totalSentForRates>0 ? Math.round((totalOpened/totalSentForRates)*100) : 0;
  const clickRateAll = totalSentForRates>0 ? Math.round((totalClicked/totalSentForRates)*100) : 0;

  // per-campaign range stats from server-aggregated daily data
  const filteredStatsByCampaign = useMemo(() => {
    const map = {};
    analyticsData.forEach(row => {
      const cid = String(row.campaign_id);
      if (!map[cid]) map[cid] = { sent: 0, replies: 0, totalOpens: 0, totalClicks: 0, uniqueLeads: 0 };
      map[cid].sent += row.sent;
      map[cid].replies += row.total_replies;
      map[cid].totalOpens += row.total_opens;
      map[cid].totalClicks += row.total_clicks;
    });
    return map;
  }, [analyticsData]);
  // aggregate server-side daily rows across campaigns for the chart
  const chartData = useMemo(() => {
    const dailyMap = {};
    analyticsData.forEach(row => {
      const d = row.date;
      if (!dailyMap[d]) {
        dailyMap[d] = { date: d, sent: 0, totalOpens: 0, uniqueOpens: 0, totalReplies: 0, totalClicks: 0, uniqueClicks: 0 };
      }
      dailyMap[d].sent        += row.sent;
      dailyMap[d].totalOpens  += row.total_opens;
      dailyMap[d].uniqueOpens += row.unique_opens;
      dailyMap[d].totalReplies+= row.total_replies;
      dailyMap[d].totalClicks += row.total_clicks;
      dailyMap[d].uniqueClicks+= row.unique_clicks;
    });
    return fillDateRange(dailyMap, startDate, endDate);
  }, [analyticsData, startDate, endDate]);

  // series metadata for chart and legend
  const seriesList = [
    { key: 'sent', name: 'Wysłane', stroke: 'rgba(59,130,246,0.8)', fill: 'rgba(59,130,246,0.4)' },
    { key: 'totalOpens', name: 'Wszystkie otwarcia', stroke: 'rgba(234,179,8,0.8)', fill: 'rgba(234,179,8,0.4)' },
    { key: 'uniqueOpens', name: 'Unikalne otwarcia', stroke: 'rgba(16,185,129,0.8)', fill: 'rgba(16,185,129,0.4)' },
    { key: 'totalReplies', name: 'Odpowiedzi', stroke: 'rgba(45,212,191,0.8)', fill: 'rgba(45,212,191,0.4)' },
    { key: 'totalClicks', name: 'Wszystkie kliknięcia', stroke: 'rgba(234,88,12,0.8)', fill: 'rgba(234,88,12,0.4)' },
    { key: 'uniqueClicks', name: 'Unikalne kliknięcia', stroke: 'rgba(236,72,153,0.8)', fill: 'rgba(236,72,153,0.4)' },
  ];

  // once chartData is computed, initialize hide state for any all-zero series (only first time)
  useEffect(() => {
    if (!initializedRef.current && chartData.length > 0 && chartData.some(d => seriesList.some(s => d[s.key] > 0))) {
      const newHide = {};
      seriesList.forEach(s => {
        newHide[s.key] = chartData.every(d => d[s.key] === 0);
      });
      setHideSeries(prev => ({ ...prev, ...newHide }));
      initializedRef.current = true;
    }
  }, [chartData]);

  // Reset zoom when chartData changes (new date range selected)
  useEffect(() => {
    setZoomRange({ start: 0, end: Math.max(0, chartData.length - 1) });
  }, [chartData]);

  // Attach wheel listener with passive:false so we can preventDefault
  useEffect(() => {
    const el = chartContainerRef.current;
    if (!el) return;
    const onWheel = (e) => {
      e.preventDefault();
      setZoomRange(prev => {
        const len = chartData.length;
        if (len <= 2) return prev;
        const windowSize = prev.end - prev.start + 1;
        const pivot = activeChartIdxRef.current ?? Math.floor((prev.start + prev.end) / 2);
        const factor = e.deltaY < 0 ? 0.75 : 1.35;
        const newSize = Math.max(3, Math.min(len, Math.round(windowSize * factor)));
        const pivotRatio = windowSize > 1 ? (pivot - prev.start) / (windowSize - 1) : 0.5;
        let newStart = Math.round(pivot - pivotRatio * (newSize - 1));
        let newEnd = newStart + newSize - 1;
        if (newStart < 0) { newStart = 0; newEnd = newSize - 1; }
        if (newEnd >= len) { newEnd = len - 1; newStart = Math.max(0, len - newSize); }
        return { start: newStart, end: newEnd };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [chartData]);

  const displayData = chartData.slice(zoomRange.start, zoomRange.end + 1);
  const handleChartMouseMove = (state) => {
    if (state?.activeTooltipIndex != null)
      activeChartIdxRef.current = zoomRange.start + state.activeTooltipIndex;
  };

  const toggleSeries = key => {
    setHideSeries(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // calculate totals for selected range
  const rangeSent = chartData.reduce((a,d)=>a+d.sent,0);
  const rangeReplies = chartData.reduce((a,d)=>a+d.totalReplies,0);
  const rangeClicks = chartData.reduce((a,d)=>a+d.totalClicks,0);
  const totalRepliesFromStats = filtered.reduce((a,c)=>a+(c.stats?.replies||0),0);
  const totalSentFromStats = filtered.reduce((a,c)=>a+(c.stats?.emails_sent||0),0);
  const replyRateRange = totalSentFromStats > 0 ? Math.round((totalRepliesFromStats / totalSentFromStats) * 100) : 0;
  const clickRateRange = rangeSent > 0 ? Math.round((rangeClicks / rangeSent) * 100) : 0;

  // Format x-axis dates short
  const formatXDate = (d) => {
    if (!d) return '';
    const parts = d.split('-');
    return `${parseInt(parts[1])}/${parseInt(parts[2])}`;
  };

  return (
    <PageFrame
      className="sk-analytics-page"
      title="Analityka"
      description="Monitoruj wysyłkę, odpowiedzi, otwarcia i kliknięcia w wybranym zakresie czasu."
    >
      <ErrorNotice error={error} />

      {!dataLoading && !dataError && <div className="sk-analytics-metrics">
        <Metric icon="send" title="Wysłane" value={rangeSent.toLocaleString('pl-PL')} detail="w wybranym zakresie" tone="blue" />
        <Metric icon="reply" title="Wskaźnik odpowiedzi" value={`${replyRateRange}%`} detail={`${rangeReplies.toLocaleString('pl-PL')} odpowiedzi`} tone="green" />
        <Metric icon="link" title="Wskaźnik kliknięć" value={`${clickRateRange}%`} detail={`${rangeClicks.toLocaleString('pl-PL')} kliknięć`} tone="purple" />
        <Metric icon="campaign" title="Kampanie" value={filtered.length} detail={selectedIds.length ? 'wybrane do porównania' : 'wszystkie kampanie'} tone="green" />
      </div>}

      {/* Date range presets */}
      <div className="sk-analytics-presets">
        {presets.map(p => (
          <button
            key={p.label}
            onClick={() => applyPreset(p)}
            className={activePreset === p.label ? 'is-active' : ''}
          >
            {p.label}
          </button>
        ))}
        <button
          onClick={() => setActivePreset('custom')}
          className={activePreset === 'custom' ? 'is-active' : ''}
        >
          Własny zakres
        </button>
      </div>

      {activePreset === 'custom' && (
        <div className="sk-analytics-custom-range">
          <label>Od <DatePicker value={startDate} onChange={v => { setStartDate(v); setActivePreset('custom'); }} /></label>
          <label>Do <DatePicker value={endDate} onChange={v => { setEndDate(v); setActivePreset('custom'); }} /></label>
        </div>
      )}

      {/* timeline area chart — scroll to zoom, centered on hovered day */}
      <ErrorNotice error={dataError} onRetry={() => setRetry(n => n + 1)} />
      {dataLoading ? <StatePanel icon="refresh" title="Ładowanie danych" description="Pobieramy wyniki dla wybranego okresu." /> : !dataError && analyticsData.length === 0 ? (
        <StatePanel icon="chart" title="Brak danych" description="W wybranym okresie nie ma zdarzeń. Wybierz inny zakres lub kampanię." />
      ) : !dataError && <Card className="sk-analytics-chart-panel p-4">
        <div ref={chartContainerRef} style={{ width: '100%', height: 290 }}>
          <ResponsiveContainer>
            <ReAreaChart data={displayData} onMouseMove={handleChartMouseMove} margin={{ top: 20, right: 30, left: 0, bottom: 20 }}>
              <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={formatXDate} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip wrapperStyle={{ zIndex: 1000 }} contentStyle={{ background: 'var(--sk-surface)', color: 'var(--sk-text)', borderColor: 'var(--sk-line)', borderRadius: 8 }} labelStyle={{ color: 'var(--sk-text)' }} />
              <CartesianGrid stroke="var(--sk-line)" strokeDasharray="3 3" />
              {seriesList.map(s => (
                <Area
                  key={s.key}
                  name={s.name}
                  type="monotone"
                  dataKey={s.key}
                  stroke={s.stroke}
                  fill={s.fill}
                  hide={hideSeries[s.key]}
                />
              ))}
              <Legend
                verticalAlign="bottom"
                align="center"
                content={() => (
                  <div className="flex flex-wrap justify-center gap-3 mt-2">
                    {seriesList.map(s => (
                      <button
                        type="button"
                        aria-pressed={!hideSeries[s.key]}
                        key={s.key}
                        onClick={() => toggleSeries(s.key)}
                        className={`flex items-center gap-1 cursor-pointer select-none text-xs transition-opacity ${hideSeries[s.key] ? 'opacity-40' : ''}`}
                      >
                        <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: s.stroke }} />
                        {s.name}
                      </button>
                    ))}
                  </div>
                )}
              />
            </ReAreaChart>
          </ResponsiveContainer>
        </div>
      </Card>}
      <div className="sk-analytics-campaign-filter">
        <div className="flex-1">
          <label htmlFor="campaign-select" className="sr-only">Kampanie</label>
          <div className="sk-analytics-campaign-picker">
            <select
              id="campaign-select"
              value={currentChoice}
              onChange={e => setCurrentChoice(e.target.value)}
              className="border rounded px-2 py-1"
            >
              <option value="">Dodaj kampanię…</option>
              {campaigns
                .filter(c => !selectedIds.includes(String(c.id)))
                .map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
            </select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (currentChoice && !selectedIds.includes(currentChoice)) {
                  setSelectedIds([...selectedIds, currentChoice]);
                }
                setCurrentChoice('');
              }}
              disabled={!currentChoice}
            >
              Add
            </Button>
          </div>
          {selectedIds.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {selectedIds.map(id => {
                const camp = campaigns.find(c => String(c.id) === id);
                return (
                  <span
                    key={id}
                    className="inline-flex items-center bg-gray-200 rounded-full px-2 py-0.5 text-sm"
                  >
                    {camp?.name || id}
                    <button
                      className="ml-1 text-gray-500 hover:text-gray-700"
                      onClick={() => setSelectedIds(selectedIds.filter(x => x !== id))}
                    >
                      ×
                    </button>
                  </span>
                );
              })}
            </div>
          )}
        </div>
        {/* reply-rate bar chart removed per request */}
        <div className="flex-1 space-y-2"></div>
      </div>

      {dataLoading || dataError || error ? null : filtered.length === 0 ? (
        <Card><Empty icon="chart">{campaigns.length === 0 ? 'Brak kampanii do analizy.' : 'Brak kampanii pasujących do filtra.'}</Empty></Card>
      ) : (
        <Card className="sk-analytics-table-panel overflow-auto">
          <table className="sk-table">
            <thead>
              <tr>
                <th>Nazwa</th>
                <th className="text-center">Kontakty</th>
                <th className="text-center">Wysłane</th>
                <th className="text-center">Oczekujące</th>
                <th className="text-center">Postęp</th>
                <th className="text-center">Odpowiedzi</th>
                <th className="text-center">Odpowiedzi %</th>
                <th className="text-center">Otwarcia %</th>
                <th className="text-center">Kliknięcia %</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => {
                const allTimeStats = c.stats || {};
                const rStats = filteredStatsByCampaign[String(c.id)] || {};
                const sent = rStats.sent || 0;
                const leads = rStats.uniqueLeads || 0;
                const replies = rStats.replies || 0;
                const openRate = sent > 0 ? Math.round((rStats.totalOpens || 0) / sent * 100) : 0;
                const replyRate = sent > 0 ? Math.round(replies / sent * 100) : 0;
                const clickRate = sent > 0 ? Math.round((rStats.totalClicks || 0) / sent * 100) : 0;
                // progress is all-time (scheduled vs sent) — no range equivalent
                const allTimeSent = allTimeStats.emails_sent || 0;
                const scheduled = allTimeStats.scheduled || 0;
                const denom = allTimeSent + scheduled;
                const progress = denom > 0 ? Math.round((allTimeSent / denom) * 100) : 0;
                return (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="py-2">
                      <Link to={`/campaigns/${c.id}#analytics`} className="text-teal-500">
                        {c.name}
                      </Link>
                    </td>
                    <td className="py-2 text-center font-mono">{leads}</td>
                    <td className="py-2 text-center font-mono">{sent}</td>
                    <td className="py-2 text-center font-mono">{scheduled}</td>
                    <td className="py-2 text-center">
                      <div className="bg-gray-200 h-2 rounded overflow-hidden mx-auto w-32">
                        <div className="bg-teal-500 h-2" style={{width: `${progress}%`}} />
                      </div>
                      <div className="text-xs mt-1">{progress}%</div>
                    </td>
                    <td className="py-2 text-center font-mono">{replies}</td>
                    <td className="py-2 text-center">
                      <div className="bg-gray-200 h-2 rounded overflow-hidden mx-auto w-24">
                        <div className="bg-teal-500 h-2" style={{width: `${replyRate}%`}} />
                      </div>
                      <div className="text-xs mt-1">{replyRate}%</div>
                    </td>
                    <td className="py-2 text-center">{openRate}%</td>
                    <td className="py-2 text-center">{clickRate}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </PageFrame>
  );
}
