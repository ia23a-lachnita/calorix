// History screen — week strip, day list, weekly stats.

function CXHistoryScreen({ mode = 'light', view = 'week' }) {
  const t = cxTheme(mode);
  const days = [
    { d: 'Mon', n: 12, kcal: 2280, pct: 0.95, on: true },
    { d: 'Tue', n: 13, kcal: 2410, pct: 1.00, on: true },
    { d: 'Wed', n: 14, kcal: 1980, pct: 0.82, on: false },
    { d: 'Thu', n: 15, kcal: 2350, pct: 0.98, on: true },
    { d: 'Fri', n: 16, kcal: 1420, pct: 0.59, on: false, today: true },
    { d: 'Sat', n: 17, kcal: null, pct: 0 },
    { d: 'Sun', n: 18, kcal: null, pct: 0 },
  ];

  return (
    <div style={{
      position: 'relative', width: '100%', height: '100%',
      background: t.bg, overflow: 'hidden',
      fontFamily: CX_FONT, color: t.ink,
    }}>
      <div style={{ height: 'calc(100% - 92px)', overflow: 'auto' }}>
        {/* Header */}
        <div style={{ padding: '54px 20px 8px' }}>
          <CXLabel color={t.muted}>Week 20 · May</CXLabel>
          <div style={{
            display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 4,
          }}>
            <div style={{
              fontFamily: CX_FONT, fontSize: 30, fontWeight: 600,
              letterSpacing: '-0.04em', color: t.ink, lineHeight: 1,
            }}>History</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <CXIcon name="chevL" size={18} color={t.muted}/>
              <CXIcon name="chevR" size={18} color={t.ink2}/>
            </div>
          </div>
        </div>

        {/* Calendar card — expandable week → month, with a draggable grabber */}
        <div style={{
          margin: '12px 16px 0', borderRadius: 22,
          background: t.card, border: `0.5px solid ${t.hairline}`, boxShadow: t.shadow,
          overflow: 'hidden', position: 'relative',
        }}>
          <div style={{
            padding: '12px 14px 4px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
          }}>
            <CXLabel color={t.muted}>{view === 'month' ? 'May 2026' : 'This week'}</CXLabel>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 2,
              padding: 2, borderRadius: 8,
              background: t.mode === 'dark' ? 'rgba(255,255,255,0.04)' : '#F4F2EE',
              border: `0.5px solid ${t.hairline}`,
            }}>
              <span style={{
                padding: '2px 8px', borderRadius: 6,
                background: view === 'week' ? t.card : 'transparent',
                boxShadow: view === 'week' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                fontFamily: CX_MONO, fontSize: 10, color: view === 'week' ? t.ink : t.muted,
                fontWeight: 600, letterSpacing: '0.08em',
              }}>W</span>
              <span style={{
                padding: '2px 8px', borderRadius: 6,
                background: view === 'month' ? t.card : 'transparent',
                boxShadow: view === 'month' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                fontFamily: CX_MONO, fontSize: 10, color: view === 'month' ? t.ink : t.muted,
                fontWeight: 600, letterSpacing: '0.08em',
              }}>M</span>
            </div>
          </div>

          {view === 'week' ? (
            <div style={{
              padding: '6px 8px 0',
              display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4,
            }}>
              {days.map((day) => (<DayPill key={day.d} day={day} theme={t}/>))}
            </div>
          ) : (
            <MonthGrid theme={t}/>
          )}

          {/* Draggable grabber — same in both views so it never just vanishes */}
          <div style={{
            padding: '14px 0 10px', display: 'flex', justifyContent: 'center',
            cursor: 'ns-resize',
          }}>
            <div style={{
              width: 44, height: 5, borderRadius: 999,
              background: t.hairline2,
              boxShadow: `0 0 0 3px ${t.mode === 'dark' ? 'rgba(255,255,255,0.02)' : 'rgba(11,13,16,0.02)'}`,
            }}/>
          </div>
        </div>

        {/* Weekly stats */}
        <div style={{
          margin: '12px 16px 0', padding: 16, borderRadius: 22,
          background: t.card, border: `0.5px solid ${t.hairline}`, boxShadow: t.shadow,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <div>
              <CXLabel color={t.muted}>Weekly average</CXLabel>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 4 }}>
                <CXNum size={26} weight={600} color={t.ink}>2,288</CXNum>
                <span style={{ fontFamily: CX_FONT, fontSize: 12, color: t.muted }}>kcal / day</span>
              </div>
            </div>
            <div style={{
              padding: '4px 10px', borderRadius: 10,
              background: 'rgba(31,204,116,0.10)',
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
              <CXIcon name="arrowUp" size={12} color={CX.green}/>
              <span style={{ fontFamily: CX_MONO, fontSize: 11, color: CX.green, fontWeight: 600 }}>
                95% target
              </span>
            </div>
          </div>

          {/* Mini sparkline */}
          <div style={{ marginTop: 16, height: 84, position: 'relative' }}>
            <Sparkline theme={t}/>
          </div>

          {/* macro split */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginTop: 14 }}>
            <MiniStat theme={t} label="Protein" value="168" unit="g/d" color={CX.blue}/>
            <MiniStat theme={t} label="Carbs"   value="241" unit="g/d" color={CX.cyan}/>
            <MiniStat theme={t} label="Fat"     value="69"  unit="g/d" color={CX.green}/>
          </div>
        </div>

        {/* Streak + section header */}
        <div style={{
          margin: '16px 20px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        }}>
          <div style={{ fontFamily: CX_FONT, fontSize: 14, fontWeight: 600, color: t.ink, letterSpacing: '-0.01em' }}>
            Day log
          </div>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '3px 8px', borderRadius: 99,
            background: 'rgba(31,204,116,0.10)',
          }}>
            <CXIcon name="flame" size={11} color={CX.green}/>
            <span style={{ fontFamily: CX_MONO, fontSize: 10.5, color: CX.green, fontWeight: 600, letterSpacing: '0.04em' }}>
              5 DAY STREAK
            </span>
          </div>
        </div>

        {/* Day rows */}
        <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <DayRow theme={t} d="Thu · May 14" kcal={2350} p={172} c={245} f={68} pct={0.98} meals={5}/>
          <DayRow theme={t} d="Wed · May 13" kcal={1980} p={148} c={220} f={56} pct={0.82} meals={4} under/>
          <DayRow theme={t} d="Tue · May 12" kcal={2410} p={178} c={258} f={71} pct={1.00} meals={6}/>
          <DayRow theme={t} d="Mon · May 11" kcal={2280} p={166} c={245} f={66} pct={0.95} meals={5}/>
        </div>
      </div>

      <CXBottomNav active="history" theme={t}/>
    </div>
  );
}

// Month calendar grid with status dots per day.
function MonthGrid({ theme }) {
  const t = theme;
  // May 2026: starts Friday. 31 days.
  // Build leading blanks for Mon-Thu, then 1..31.
  const firstDow = 4; // 0=Mon
  const total = 31;
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let n = 1; n <= total; n++) cells.push(n);
  // Status per day (synthetic but plausible)
  const status = (n) => {
    if (n == null) return null;
    if (n > 16) return 'future';
    if (n === 16) return 'today';
    // some misses, mostly on track
    if ([3, 9, 14].includes(n)) return 'under';
    return 'on';
  };
  const colorFor = (s) =>
    s === 'on'    ? CX.green :
    s === 'under' ? CX.amber :
    s === 'today' ? CX.cyan  : null;

  return (
    <div style={{ padding: '8px 12px 0' }}>
      {/* dow header */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2,
        marginBottom: 4,
      }}>
        {['M','T','W','T','F','S','S'].map((d, i) => (
          <div key={i} style={{
            fontFamily: CX_MONO, fontSize: 9, letterSpacing: '0.12em',
            color: t.muted, textAlign: 'center', padding: '2px 0',
          }}>{d}</div>
        ))}
      </div>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2,
      }}>
        {cells.map((n, i) => {
          if (n == null) return <div key={i} style={{ height: 38 }}/>;
          const s = status(n);
          const c = colorFor(s);
          const isToday = s === 'today';
          const isFuture = s === 'future';
          return (
            <div key={i} style={{
              height: 38, borderRadius: 10,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
              background: isToday ? (t.mode === 'dark' ? 'rgba(25,211,217,0.10)' : 'rgba(25,211,217,0.12)') : 'transparent',
              border: isToday ? `0.5px solid ${CX.cyan}55` : '0.5px solid transparent',
            }}>
              <div style={{
                fontFamily: CX_MONO, fontSize: 11.5,
                fontWeight: isToday ? 700 : 500,
                color: isFuture ? t.muted : t.ink,
                opacity: isFuture ? 0.45 : 1,
              }}>{n}</div>
              {c && !isFuture && !isToday && (
                <div style={{ width: 4, height: 4, borderRadius: 99, background: c }}/>
              )}
              {isToday && (
                <div style={{ width: 4, height: 4, borderRadius: 99, background: CX.green }}/>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DayPill({ day, theme }) {
  const t = theme;
  const empty = day.kcal == null;
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
      padding: '8px 0', borderRadius: 14,
      background: day.today ? (t.mode === 'dark' ? 'rgba(25,211,217,0.08)' : 'rgba(25,211,217,0.12)') : 'transparent',
      border: day.today ? `0.5px solid ${CX.cyan}55` : '0.5px solid transparent',
    }}>
      <CXLabel color={t.muted}>{day.d}</CXLabel>
      <CXNum size={15} weight={day.today ? 700 : 600} color={empty ? t.muted : t.ink}>{day.n}</CXNum>
      <div style={{ position: 'relative', width: 24, height: 24 }}>
        <svg width="24" height="24" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="9" fill="none" stroke={t.mode==='dark' ? 'rgba(255,255,255,0.07)' : 'rgba(11,13,16,0.07)'} strokeWidth="3"/>
          <circle cx="12" cy="12" r="9" fill="none"
            stroke={empty ? 'transparent' : (day.on ? CX.green : CX.amber)}
            strokeWidth="3" strokeLinecap="round"
            strokeDasharray={`${2*Math.PI*9*day.pct} ${2*Math.PI*9}`}
            transform="rotate(-90 12 12)"/>
        </svg>
      </div>
    </div>
  );
}

function MiniStat({ theme, label, value, unit, color }) {
  return (
    <div style={{
      padding: '8px 10px', borderRadius: 12,
      background: theme.mode === 'dark' ? 'rgba(255,255,255,0.03)' : '#F8F6F1',
      border: `0.5px solid ${theme.hairline}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{ width: 5, height: 5, borderRadius: 99, background: color }}/>
        <CXLabel color={theme.muted}>{label}</CXLabel>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 3, marginTop: 4 }}>
        <CXNum size={16} weight={600} color={theme.ink}>{value}</CXNum>
        <span style={{ fontFamily: CX_FONT, fontSize: 10.5, color: theme.muted }}>{unit}</span>
      </div>
    </div>
  );
}

function Sparkline({ theme }) {
  const values = [0.95, 1.00, 0.82, 0.98, 0.59, 0, 0];
  const w = 320, h = 84;
  const padX = 8, padY = 8;
  const stepW = (w - padX*2) / (values.length - 1);
  const target = h - padY - (1.0 * (h - padY*2));
  const pts = values.map((v, i) => ({
    x: padX + i * stepW,
    y: h - padY - (v * (h - padY*2)),
  }));
  const path = pts.map((p,i) => (i===0 ? `M${p.x} ${p.y}` : `L${p.x} ${p.y}`)).join(' ');
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id="spkfill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={CX.cyan} stopOpacity="0.20"/>
          <stop offset="100%" stopColor={CX.cyan} stopOpacity="0"/>
        </linearGradient>
      </defs>
      {/* target line */}
      <line x1={padX} x2={w-padX} y1={target} y2={target}
        stroke={theme.mode==='dark' ? 'rgba(255,255,255,0.15)' : 'rgba(11,13,16,0.15)'}
        strokeDasharray="3 5"/>
      <text x={w-padX} y={target-4} textAnchor="end"
        fontFamily={CX_MONO} fontSize="9" fill={theme.muted}
        letterSpacing="0.08em">2400 KCAL</text>
      <path d={`${path} L${pts[pts.length-1].x} ${h-padY} L${pts[0].x} ${h-padY} Z`} fill="url(#spkfill)"/>
      <path d={path} fill="none" stroke={CX.cyan} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      {pts.map((p, i) => values[i] > 0 && (
        <circle key={i} cx={p.x} cy={p.y} r={i === 4 ? 4 : 2.5} fill={theme.bg} stroke={CX.cyan} strokeWidth="1.5"/>
      ))}
    </svg>
  );
}

function DayRow({ theme, d, kcal, p, c, f, pct, meals, under }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: 12,
      borderRadius: 18,
      background: theme.card, border: `0.5px solid ${theme.hairline}`, boxShadow: theme.shadow,
    }}>
      <div style={{ position: 'relative', width: 40, height: 40 }}>
        <svg width="40" height="40" viewBox="0 0 40 40">
          <circle cx="20" cy="20" r="16" fill="none"
            stroke={theme.mode==='dark' ? 'rgba(255,255,255,0.06)' : 'rgba(11,13,16,0.05)'} strokeWidth="4"/>
          <circle cx="20" cy="20" r="16" fill="none"
            stroke={under ? CX.amber : CX.green} strokeWidth="4" strokeLinecap="round"
            strokeDasharray={`${2*Math.PI*16*pct} ${2*Math.PI*16}`}
            transform="rotate(-90 20 20)"/>
        </svg>
        <div style={{
          position: 'absolute', inset: 0, display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          fontFamily: CX_MONO, fontSize: 9.5, fontWeight: 600,
          color: theme.ink, letterSpacing: '0.02em',
        }}>{Math.round(pct*100)}</div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div style={{ fontFamily: CX_FONT, fontSize: 14, fontWeight: 600, color: theme.ink }}>{d}</div>
          <CXNum size={14} weight={600} color={theme.ink}>{kcal.toLocaleString()}<span style={{ fontSize: 10, color: theme.muted, marginLeft: 2 }}>kcal</span></CXNum>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
          <span style={{ fontFamily: CX_MONO, fontSize: 10.5, color: theme.muted, letterSpacing: '0.04em' }}>
            {meals} meals
          </span>
          <span style={{ width: 3, height: 3, borderRadius: 99, background: theme.muted, opacity: 0.5 }}/>
          <MacroPip color={CX.blue}  value={p}/>
          <MacroPip color={CX.cyan}  value={c}/>
          <MacroPip color={CX.green} value={f}/>
        </div>
      </div>
      <CXIcon name="chevR" size={14} color={theme.muted}/>
    </div>
  );
}

Object.assign(window, { CXHistoryScreen });
