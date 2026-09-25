import { useState, useRef, useEffect } from 'react';

const DAYS = ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd'];
const MONTHS = ['styczeń','luty','marzec','kwiecień','maj','czerwiec','lipiec','sierpień','wrzesień','październik','listopad','grudzień'];

function localDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function startDay(year, month) {
  const d = new Date(year, month, 1).getDay();
  return d === 0 ? 6 : d - 1; // Monday = 0
}

/**
 * Modern date picker component.
 * @param {string} value - ISO date string (YYYY-MM-DD)
 * @param {function} onChange - Callback with new ISO date string
 * @param {string} className - Additional classes for the wrapper
 */
export default function DatePicker({ value, onChange, className = '' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const today = localDateKey(new Date());

  // Parse value or default to today
  const parsed = value ? new Date(value + 'T00:00:00') : new Date();
  const [viewYear, setViewYear] = useState(parsed.getFullYear());
  const [viewMonth, setViewMonth] = useState(parsed.getMonth());

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Sync view when value changes externally
  useEffect(() => {
    if (value) {
      const d = new Date(value + 'T00:00:00');
      setViewYear(d.getFullYear());
      setViewMonth(d.getMonth());
    }
  }, [value]);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };

  const selectDate = (day) => {
    const iso = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    onChange(iso);
    setOpen(false);
  };

  const selectToday = () => {
    const now = new Date();
    setViewYear(now.getFullYear());
    setViewMonth(now.getMonth());
    onChange(localDateKey(now));
    setOpen(false);
  };

  const days = daysInMonth(viewYear, viewMonth);
  const start = startDay(viewYear, viewMonth);
  const cells = [];
  for (let i = 0; i < start; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(d);

  const displayValue = value
    ? new Date(value + 'T00:00:00').toLocaleDateString('pl-PL', { year: 'numeric', month: 'short', day: 'numeric' })
    : '';

  return (
    <div className={`sk-date-picker relative inline-block ${className}`} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="sk-date-trigger flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm transition-colors min-w-[140px] text-left"
      >
        <svg className="w-4 h-4 sk-date-muted shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <span className={value ? 'sk-date-value' : 'sk-date-muted'}>
          {displayValue || 'Wybierz datę'}
        </span>
      </button>

      {open && (
        <div
          className="sk-date-popover absolute z-50 mt-1 rounded-xl p-3 w-[280px] animate-in fade-in-0 zoom-in-95"
          style={{ animationDuration: '150ms' }}
          role="dialog"
          aria-label="Kalendarz"
        >
          {/* Month nav */}
          <div className="flex items-center justify-between mb-2">
            <button type="button" onClick={prevMonth} aria-label="Poprzedni miesiąc" className="sk-date-nav p-1 rounded">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <span className="sk-date-value text-sm font-semibold">
              {MONTHS[viewMonth]} {viewYear}
            </span>
            <button type="button" onClick={nextMonth} aria-label="Następny miesiąc" className="sk-date-nav p-1 rounded">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 mb-1">
            {DAYS.map(d => (
              <div key={d} className="sk-date-muted text-center text-xs font-medium py-1">{d}</div>
            ))}
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-7">
            {cells.map((day, i) => {
              if (day === null) return <div key={`empty-${i}`} />;
              const iso = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const isSelected = iso === value;
              const isToday = iso === today;
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => selectDate(day)}
                  aria-label={`${day} ${MONTHS[viewMonth]} ${viewYear}`}
                  aria-pressed={isSelected}
                  aria-current={isToday ? 'date' : undefined}
                  className={`
                    w-9 h-9 rounded-lg text-sm transition-colors flex items-center justify-center mx-auto
                    ${isSelected
                      ? 'sk-date-day is-selected font-semibold'
                      : isToday
                        ? 'sk-date-day is-today font-medium'
                        : 'sk-date-day'
                    }
                  `}
                >
                  {day}
                </button>
              );
            })}
          </div>

          {/* Today shortcut */}
          <div className="sk-date-footer mt-2 pt-2 border-t flex justify-center">
            <button
              type="button"
              onClick={selectToday}
              className="sk-date-today text-xs font-medium"
            >
              Dzisiaj
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
