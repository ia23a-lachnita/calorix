// Today dashboard — works in light & dark.
// New layout: a single hero card with the macro ring centered at top, then
// three full-width macro sub-cards below. The whole thing has a fill-in
// entry animation: rings fill, numbers count up, ring grows and slides to top.

const { useState: useStateT, useEffect: useEffectT, useRef: useRefT } = React;

// Animated tween hook — animates a value from `from` to `to` over `dur` ms with ease.
function useCount(to, dur = 1200, from = 0) {
  const [v, setV] = useStateT(from);
  const startRef = useRefT(null);
  useEffectT(() => {
    let raf;
    startRef.current = null;
    const ease = (x) => 1 - Math.pow(1 - x, 3); // easeOutCubic
    const step = (ts) => {
      if (!startRef.current) startRef.current = ts;
      const t = Math.min(1, (ts - startRef.current) / dur);
      setV(from + (to - from) * ease(t));
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to, dur, from]);
  return v;
}

function CXTodayScreen({ mode = 'light' }) {
  const t = cxTheme(mode);

  // Targets / current values
  const KCAL = { current: 1420, target: 2400 };
  const MACROS = {
    protein: { c: 96,  t: 170, color: CX.blue,  label: 'Protein' },
    carbs:   { c: 132, t: 250, color: CX.cyan,  label: 'Carbs'   },
    fat:     { c: 38,  t: 70,  color: CX.green, label: 'Fat'     },
  };

  // Tween everything together
  const kcal = useCount(KCAL.current, 1400);
  const p    = useCount(MACROS.protein.c, 1400);
  const c    = useCount(MACROS.carbs.c,   1400);
  const f    = useCount(MACROS.fat.c,     1400);

  return (
    <div style={{
      position: 'relative', width: '100%', height: '100%',
      background: t.bg, overflow: 'hidden',
      fontFamily: CX_FONT, color: t.ink,
    }}>
      <div style={{ height: 'calc(100% - 100px)', overflow: 'auto', position: 'relative' }}>
        {/* Header */}
        <div style={{
          padding: '54px 20px 8px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <CXLabel color={t.muted}>Friday · May 15</CXLabel>
            <div style={{
              fontFamily: CX_FONT, fontSize: 30, fontWeight: 600,
              letterSpacing: '-0.04em', color: t.ink, lineHeight: 1, marginTop: 4,
            }}>Today</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{
              width: 38, height: 38, borderRadius: 999,
              background: t.card, border: `0.5px solid ${t.hairline2}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <CXIcon name="bell" size={18} color={t.ink2}/>
            </div>
            <CXAvatar initials="EK" theme={t}/>
          </div>
        </div>

        {/* Hero macro card — ring top, three full-width sub-cards stacked below */}
        <div style={{
          margin: '14px 16px 0', padding: 14,
          borderRadius: 28, background: t.card, boxShadow: t.shadow,
          border: `0.5px solid ${t.hairline}`,
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          {/* Ring at top, centered */}
          <div style={{
            display: 'flex', justifyContent: 'center', paddingTop: 8, paddingBottom: 4,
          }}>
            <BigMacroRing
              size={222} stroke={10} gap={4}
              kcal={{ current: kcal, target: KCAL.target }}
              macros={{
                protein: { c: p, t: MACROS.protein.t },
                carbs:   { c, t: MACROS.carbs.t },
                fat:     { c: f, t: MACROS.fat.t },
              }}
              theme={t}
            />
          </div>

          {/* Three macro sub-cards, full width of outer card */}
          <MacroSubCard theme={t} info={MACROS.protein} current={p}/>
          <MacroSubCard theme={t} info={MACROS.carbs}   current={c}/>
          <MacroSubCard theme={t} info={MACROS.fat}     current={f}/>
        </div>

        {/* Recent meals */}
        <div style={{
          margin: '20px 20px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        }}>
          <div style={{
            fontFamily: CX_FONT, fontSize: 14, fontWeight: 600,
            letterSpacing: '-0.01em', color: t.ink,
          }}>Recent scans</div>
          <CXLabel color={t.muted}>3 today</CXLabel>
        </div>

        <div style={{ padding: '0 16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <MealCard theme={t}
            name="Chicken Rice Bowl" time="12:48 · Lunch"
            kcal={620} p={48} c={72} f={16}
            confidence={91} status="confirmed"
            colorA="#d6b487" colorB="#8a5d36"/>
          <MealCard theme={t}
            name="Protein Yogurt"   time="09:12 · Breakfast"
            kcal={180} p={25} c={12} f={3}
            confidence={88} status="confirmed"
            colorA="#f4ecd8" colorB="#cbb88c"/>
          <MealCard theme={t}
            name="Espresso · Oat"   time="08:05 · Drink"
            kcal={45} p={1} c={8} f={1}
            confidence={62} status="review"
            colorA="#3a2a1c" colorB="#1a0f06"/>
        </div>
      </div>

      <style>{`
        /* Subtle bar shimmer — not required for the bar to be visible */
        @keyframes cxBarFill {
          from { transform: scaleX(0); }
          to   { transform: scaleX(var(--p,1)); }
        }
      `}</style>

      <CXBottomNav active="today" theme={t}/>
    </div>
  );
}

// Large ring component — three concentric ring + counter inside.
function BigMacroRing({ size = 196, stroke = 12, gap = 6, kcal, macros, theme }) {
  const t = theme;
  const trackColor = t.mode === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(11,13,16,0.05)';
  const ringFor = (m, color, idx) => {
    const r = (size - stroke) / 2 - 4 - idx * (stroke + gap);
    const c = 2 * Math.PI * r;
    const pct = Math.min(1, m.c / m.t);
    return (
      <g key={idx}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={trackColor} strokeWidth={stroke}/>
        <circle cx={size/2} cy={size/2} r={r} fill="none"
          stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={`${c * pct} ${c}`}
          transform={`rotate(-90 ${size/2} ${size/2})`}/>
      </g>
    );
  };
  const remaining = Math.max(0, Math.round(kcal.target - kcal.current));
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size}>
        {ringFor(macros.protein, CX.blue,  0)}
        {ringFor(macros.carbs,   CX.cyan,  1)}
        {ringFor(macros.fat,     CX.green, 2)}
      </svg>
      <div style={{
        position: 'absolute', inset: 0, display: 'flex',
        flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        textAlign: 'center', padding: 18,
      }}>
        <div style={{
          fontFamily: CX_MONO, fontSize: 9.5, letterSpacing: '0.16em',
          textTransform: 'uppercase', color: t.muted,
        }}>kcal eaten</div>
        <CXNum size={36} weight={600} color={t.ink} style={{
          lineHeight: 1, marginTop: 4,
        }}>{Math.round(kcal.current).toLocaleString()}</CXNum>
        <div style={{
          fontFamily: CX_FONT, fontSize: 11, color: t.muted, marginTop: 6,
        }}>
          of <CXNum size={11} color={t.ink2}>{kcal.target.toLocaleString()}</CXNum>
        </div>
        <div style={{
          marginTop: 6, padding: '3px 8px', borderRadius: 99,
          background: 'rgba(31,204,116,0.10)',
          fontFamily: CX_MONO, fontSize: 10, color: CX.green, fontWeight: 600, letterSpacing: '0.04em',
        }}>
          {remaining.toLocaleString()} kcal left
        </div>
      </div>
    </div>
  );
}

// Each macro gets its own card row — full-width inside the outer hero card.
function MacroSubCard({ theme, info, current }) {
  const t = theme;
  const pct = Math.min(1, current / info.t);
  return (
    <div style={{
      padding: '12px 14px', borderRadius: 18,
      background: t.mode === 'dark' ? 'rgba(255,255,255,0.03)' : '#FAF8F3',
      border: `0.5px solid ${t.hairline}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 9, height: 9, borderRadius: 99, background: info.color,
                          boxShadow: `0 0 0 3px ${info.color}22` }}/>
          <span style={{ fontFamily: CX_FONT, fontSize: 13.5, fontWeight: 600, color: t.ink, letterSpacing: '-0.01em' }}>
            {info.label}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4,
                       fontVariantNumeric: 'tabular-nums', fontFamily: CX_MONO, fontSize: 12 }}>
          <span style={{ color: t.ink, fontWeight: 600 }}>{Math.round(current)}</span>
          <span style={{ color: t.muted }}>/ {info.t}g</span>
          <span style={{ marginLeft: 6, padding: '1px 6px', borderRadius: 6,
                          background: t.mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(11,13,16,0.05)',
                          color: t.ink2, fontSize: 10.5, fontWeight: 600 }}>
            {Math.round(pct*100)}%
          </span>
        </div>
      </div>
      <div style={{
        marginTop: 10, height: 6, borderRadius: 999,
        background: t.mode === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(11,13,16,0.05)',
        overflow: 'hidden', position: 'relative',
      }}>
        <div style={{
          height: '100%', borderRadius: 999, background: info.color,
          width: `${pct * 100}%`,
          transition: 'width 1200ms cubic-bezier(.2,.7,.2,1)',
        }}/>
      </div>
    </div>
  );
}

function FoodThumb({ size = 60, colorA = '#d6b487', colorB = '#8a5d36', radius = 16 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: radius, flexShrink: 0,
      background: `radial-gradient(circle at 40% 40%, ${colorA} 0%, ${colorB} 70%, #2a221d 110%)`,
      position: 'relative', overflow: 'hidden',
      boxShadow: 'inset 0 0 0 0.5px rgba(255,255,255,0.08), inset 0 -8px 16px rgba(0,0,0,0.18)',
    }}>
      <div style={{
        position: 'absolute', top: '20%', left: '24%', width: '24%', height: '12%',
        background: 'rgba(255,255,255,0.45)', borderRadius: 999, transform: 'rotate(-20deg)',
      }}/>
    </div>
  );
}

function MealCard({ theme, name, time, kcal, p, c, f, confidence, status, colorA, colorB }) {
  const low = confidence < 75;
  return (
    <div style={{
      display: 'flex', gap: 12, padding: 12, borderRadius: 22,
      background: theme.card, boxShadow: theme.shadow,
      border: `0.5px solid ${theme.hairline}`,
      alignItems: 'center',
    }}>
      <FoodThumb colorA={colorA} colorB={colorB}/>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
          <div style={{ fontFamily: CX_FONT, fontSize: 15, fontWeight: 600, color: theme.ink, letterSpacing: '-0.01em' }}>
            {name}
          </div>
          <CXNum size={15} weight={600} color={theme.ink}>{kcal}<span style={{ fontSize: 10, color: theme.muted, marginLeft: 2 }}>kcal</span></CXNum>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
          <span style={{ fontFamily: CX_MONO, fontSize: 11, color: theme.muted, letterSpacing: '0.02em' }}>
            {time}
          </span>
          <span style={{ width: 3, height: 3, borderRadius: 99, background: theme.muted, opacity: 0.5 }}/>
          <MacroPip color={CX.blue}  value={p}/>
          <MacroPip color={CX.cyan}  value={c}/>
          <MacroPip color={CX.green} value={f}/>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
          <ConfidenceBadge confidence={confidence} status={status} theme={theme}/>
          {low && (
            <span style={{
              fontFamily: CX_FONT, fontSize: 10.5, color: CX.amber, fontWeight: 500,
            }}>Needs review →</span>
          )}
        </div>
      </div>
    </div>
  );
}

function MacroPip({ color, value }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
      <span style={{ width: 5, height: 5, borderRadius: 99, background: color }}/>
      <span style={{ fontFamily: CX_MONO, fontSize: 11, color: 'currentColor', opacity: 0.85 }}>{value}g</span>
    </span>
  );
}

function ConfidenceBadge({ confidence, status, theme }) {
  const good = confidence >= 80;
  const dot = good ? CX.green : CX.amber;
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 8px 3px 6px', borderRadius: 99,
      background: theme.mode === 'dark' ? 'rgba(255,255,255,0.04)' : '#F4F2EE',
      border: `0.5px solid ${theme.hairline}`,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: 99, background: dot }}/>
      <span style={{ fontFamily: CX_MONO, fontSize: 10, color: theme.ink2, letterSpacing: '0.06em' }}>
        {confidence}% · {status === 'confirmed' ? 'Confirmed' : 'Review'}
      </span>
    </div>
  );
}

Object.assign(window, { CXTodayScreen, MealCard, FoodThumb, ConfidenceBadge });
