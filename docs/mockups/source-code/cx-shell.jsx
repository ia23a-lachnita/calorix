// Calorix bottom navigation — 5 tabs with a centered Scan FAB.
// Used across all main screens.

function CXBottomNav({ active = 'today', theme, floating = false, onSelect = () => {} }) {
  const t = theme;
  const tabs = [
  { id: 'today', label: 'Today', icon: 'today' },
  { id: 'history', label: 'History', icon: 'history' },
  { id: 'scan', label: 'Scan', icon: 'eye' },
  { id: 'goals', label: 'Goals', icon: 'goals' },
  { id: 'ai', label: 'AI', icon: 'ai' }];


  // If floating over camera, keep the glass treatment but still respect theme.
  const barBg = floating
    ? (t.mode === 'dark' ? 'rgba(12,15,19,0.55)' : 'rgba(255,255,255,0.64)')
    : (t.mode === 'dark' ? 'rgba(20,24,30,0.92)' : 'rgba(255,255,255,0.92)');
  const inkOn = t.mode === 'dark' ? '#F2F3F5' : '#0B0D10';
  const inkOff = floating
    ? (t.mode === 'dark' ? 'rgba(242,243,245,0.55)' : 'rgba(11,13,16,0.52)')
    : t.muted;
  const hair = floating
    ? (t.mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(11,13,16,0.08)')
    : t.hairline;

  return (
    <div style={{
      position: 'absolute', left: 0, right: 0, bottom: 0,
      paddingBottom: 36, // accommodate home indicator + scan label
      paddingTop: 14,
      background: barBg,
      backdropFilter: 'blur(28px) saturate(160%)',
      WebkitBackdropFilter: 'blur(28px) saturate(160%)',
      borderTop: `0.5px solid ${hair}`,
      zIndex: 30
    }}>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(5,1fr)',
        alignItems: 'center', padding: '0 6px',
        position: 'relative'
      }}>
        {tabs.map((tab) => {
          if (tab.id === 'scan') {
            const isActive = active === 'scan';
            return (
              <div key={tab.id} style={{ display: 'flex', justifyContent: 'center', position: 'relative' }}>
                <div style={{
                  position: 'absolute', top: -34, width: 76, height: 76, borderRadius: 999,
                  background: 'radial-gradient(closest-side, rgba(25,211,217,0.35), rgba(58,91,255,0.05) 60%, transparent 75%)',
                  filter: 'blur(2px)', pointerEvents: 'none'
                }} />
                <button onClick={() => onSelect(tab.id)} style={{
                  width: 60, height: 60, borderRadius: 999, border: 'none',
                  background: CX.gradAI,
                  marginTop: -28,
                  boxShadow: '0 8px 24px rgba(25,211,217,0.35), 0 2px 6px rgba(58,91,255,0.30), inset 0 0 0 1px rgba(255,255,255,0.18)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', position: 'relative'
                }}>
                  <div style={{
                    position: 'absolute', inset: 6, borderRadius: 999,
                    background: t.mode === 'light' ? 'rgba(255,255,255,0.92)' : 'rgba(8,12,16,0.85)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}>
                    <CXIcon name="eye" size={24} color={t.mode === 'light' ? '#0B0D10' : '#F2F3F5'} stroke={1.6} />
                  </div>
                </button>
                <div style={{
                  position: 'absolute', bottom: -28,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                }}>
                  <div style={{
                    fontFamily: CX_MONO, fontSize: 9.5, textTransform: 'uppercase',
                    color: isActive ? inkOn : inkOff,
                    fontWeight: isActive ? 600 : 500,
                    letterSpacing: '0.17em', lineHeight: 1,
                  }}>Scan</div>
                  {isActive && (
                    <div style={{
                      width: 4, height: 4, borderRadius: 999, background: CX.green,
                      boxShadow: `0 0 0 3px ${CX.green}33`,
                    }}/>
                  )}
                </div>
              </div>);

          }
          const isActive = active === tab.id;
          return (
            <button key={tab.id} onClick={() => onSelect(tab.id)} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              padding: '4px 0 0',
              color: isActive ? inkOn : inkOff
            }}>
              <CXIcon name={tab.icon} size={22} stroke={isActive ? 2 : 1.6} />
              <div style={{
                fontFamily: CX_FONT, fontSize: 10.5,
                fontWeight: isActive ? 600 : 500, letterSpacing: "0.21px"
              }}>{tab.label}</div>
              {isActive &&
              <div style={{
                width: 4, height: 4, borderRadius: 999,
                background: CX.cyan, marginTop: -2
              }} />
              }
            </button>);

        })}
      </div>
    </div>);

}

// Status bar look that matches the theme (we mostly use IOSDevice's built-in one,
// but the Scan camera screen overrides it with white text).
function CXTopBar({ theme, title, eyebrow, trailing }) {
  const t = theme;
  return (
    <div style={{
      padding: '54px 20px 12px',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
      gap: 12
    }}>
      <div>
        {eyebrow &&
        <CXLabel color={t.muted} style={{ marginBottom: 4 }}>{eyebrow}</CXLabel>
        }
        <div style={{
          fontFamily: CX_FONT, fontSize: 28, fontWeight: 600,
          letterSpacing: '-0.035em', color: t.ink, lineHeight: 1.05
        }}>{title}</div>
      </div>
      {trailing}
    </div>);

}

function CXAvatar({ initials = 'EK', size = 36, theme }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: 999,
      background: theme.mode === 'dark' ? '#1E242C' : '#EFEDE7',
      border: `0.5px solid ${theme.hairline2}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: CX_FONT, fontWeight: 600, fontSize: size * 0.35,
      color: theme.ink, letterSpacing: '0.02em'
    }}>{initials}</div>);

}

// Macro ring — composite ring with 3 segments for protein/carbs/fat over kcal core.
function CXMacroRing({ size = 200, stroke = 14, gap = 4,
  kcal = { current: 1420, target: 2400 },
  macros = { protein: { c: 96, t: 170 }, carbs: { c: 132, t: 250 }, fat: { c: 38, t: 70 } },
  theme }) {
  const t = theme;
  const r = (size - stroke) / 2 - 4;
  const c = 2 * Math.PI * r;
  const pct = (m) => Math.min(1, m.c / m.t);
  const ring = (color, p, offset) =>
  <circle cx={size / 2} cy={size / 2} r={r} fill="none"
  stroke={color} strokeWidth={stroke} strokeLinecap="round"
  strokeDasharray={`${c * p} ${c}`}
  strokeDashoffset={-offset}
  transform={`rotate(-90 ${size / 2} ${size / 2})`} />;

  // Three rings nested: outer, middle, inner (each thinner)
  const trackColor = t.mode === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(11,13,16,0.05)';
  const ringFor = (m, color, idx) => {
    const rr = r - idx * (stroke + gap);
    const cc = 2 * Math.PI * rr;
    return (
      <g key={idx}>
        <circle cx={size / 2} cy={size / 2} r={rr} fill="none" stroke={trackColor} strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={rr} fill="none"
        stroke={color} strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={`${cc * pct(m)} ${cc}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </g>);

  };
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size}>
        {ringFor(macros.protein, CX.blue, 0)}
        {ringFor(macros.carbs, CX.cyan, 1)}
        {ringFor(macros.fat, CX.green, 2)}
      </svg>
      <div style={{
        position: 'absolute', inset: 0, display: 'flex',
        flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
      }}>
        <CXLabel color={t.muted} style={{ marginBottom: 2 }}>kcal eaten</CXLabel>
        <CXNum size={36} weight={600} color={t.ink} style={{ lineHeight: 1 }}>{kcal.current.toLocaleString()}</CXNum>
        <div style={{ fontFamily: CX_FONT, fontSize: 12, color: t.muted, marginTop: 4 }}>
          of <CXNum size={12} color={t.ink2}>{kcal.target.toLocaleString()}</CXNum> · <CXNum size={12} color={CX.green}>{kcal.target - kcal.current}</CXNum> left
        </div>
      </div>
    </div>);

}

Object.assign(window, { CXBottomNav, CXTopBar, CXAvatar, CXMacroRing });
