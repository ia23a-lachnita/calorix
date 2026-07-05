// Goals / macro setup screen — body goal, calorie/macro targets, weight tracker.

function CXGoalsScreen({ mode = 'light', period = 'idle' }) {
  const t = cxTheme(mode);
  const isOpen = period === 'select';
  return (
    <div style={{
      position: 'relative', width: '100%', height: '100%',
      background: t.bg, overflow: 'hidden',
      fontFamily: CX_FONT, color: t.ink,
    }}>
      <div style={{ height: 'calc(100% - 92px)', overflow: 'auto' }}>
        {/* Header */}
        <div style={{ padding: '54px 20px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div style={{ position: 'relative' }}>
            {/* Period selector — acts like a dropdown */}
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '4px 8px 4px 10px', borderRadius: 999,
              background: isOpen
                ? (t.mode === 'dark' ? 'rgba(255,255,255,0.05)' : '#FFFFFF')
                : (t.mode === 'dark' ? 'rgba(255,255,255,0.04)' : '#FBFAF6'),
              border: `0.5px solid ${t.hairline2}`,
              boxShadow: isOpen ? t.shadow : 'none',
              cursor: 'pointer',
            }}>
              <span style={{ width: 5, height: 5, borderRadius: 99, background: CX.cyan }}/>
              <span style={{ fontFamily: CX_MONO, fontSize: 10, color: t.muted, letterSpacing: '0.10em', textTransform: 'uppercase' }}>
                Plan · Cut phase ·
              </span>
              <span style={{ fontFamily: CX_FONT, fontSize: 12, color: t.ink, fontWeight: 600 }}>Week 4</span>
              <CXIcon name="chevD" size={11} color={t.ink2}/>
            </div>
            {isOpen && <PeriodDropdown theme={t}/>}
            <div style={{
              fontFamily: CX_FONT, fontSize: 30, fontWeight: 600,
              letterSpacing: '-0.04em', color: t.ink, lineHeight: 1, marginTop: 8,
            }}>Goals</div>
          </div>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '6px 10px', borderRadius: 10,
            background: t.card, border: `0.5px solid ${t.hairline2}`,
          }}>
            <CXIcon name="sliders" size={13} color={t.ink2}/>
            <span style={{ fontFamily: CX_FONT, fontSize: 12, color: t.ink2, fontWeight: 500 }}>Adjust</span>
          </div>
        </div>

        {/* Body goal segmented */}
        <div style={{ padding: '14px 20px 0' }}>
          <CXLabel color={t.muted}>Body goal</CXLabel>
        </div>
        <div style={{ padding: '8px 16px 0' }}>
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6,
            padding: 4, borderRadius: 16,
            background: t.mode === 'dark' ? 'rgba(255,255,255,0.04)' : '#EDE9E1',
            border: `0.5px solid ${t.hairline}`,
          }}>
            {[
              { id: 'lose', label: 'Lose fat', sub: '-0.5kg/wk' },
              { id: 'maint', label: 'Maintain', sub: '' },
              { id: 'lean', label: 'Lean+', sub: '+0.2kg/wk' },
              { id: 'custom', label: 'Custom', sub: '' },
            ].map((g) => (
              <div key={g.id} style={{
                padding: '10px 6px', borderRadius: 12, textAlign: 'center',
                background: g.id === 'lose' ? t.card : 'transparent',
                boxShadow: g.id === 'lose' ? t.shadow : 'none',
                border: g.id === 'lose' ? `0.5px solid ${t.hairline2}` : '0.5px solid transparent',
              }}>
                <div style={{
                  fontFamily: CX_FONT, fontSize: 12.5, fontWeight: g.id==='lose' ? 600 : 500,
                  color: g.id === 'lose' ? t.ink : t.muted,
                }}>{g.label}</div>
                {g.sub && (
                  <div style={{
                    fontFamily: CX_MONO, fontSize: 9.5, marginTop: 2,
                    color: g.id === 'lose' ? CX.green : t.muted, letterSpacing: '0.04em',
                  }}>{g.sub}</div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Calorie dial card */}
        <div style={{
          margin: '14px 16px 0', padding: '18px 16px',
          borderRadius: 22, background: t.card, boxShadow: t.shadow,
          border: `0.5px solid ${t.hairline}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <CXLabel color={t.muted}>Daily calorie target</CXLabel>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 4 }}>
                <CXNum size={32} weight={600} color={t.ink}>2,400</CXNum>
                <span style={{ fontFamily: CX_FONT, fontSize: 13, color: t.muted }}>kcal</span>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 6, alignItems: 'center' }}>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '3px 8px', borderRadius: 99,
                  background: 'rgba(58,91,255,0.10)',
                }}>
                  <CXIcon name="ai" size={11} color={CX.blue}/>
                  <span style={{ fontFamily: CX_MONO, fontSize: 10, color: CX.blue, fontWeight: 600, letterSpacing: '0.04em' }}>
                    AI · TDEE 2,820 − 420
                  </span>
                </span>
              </div>
            </div>
            <Stepper theme={t}/>
          </div>

          {/* Slider */}
          <div style={{ marginTop: 18 }}>
            <div style={{
              position: 'relative', height: 32, display: 'flex', alignItems: 'center',
            }}>
              <div style={{
                width: '100%', height: 6, borderRadius: 999,
                background: `linear-gradient(90deg, ${CX.blue}40 0%, ${CX.cyan}40 50%, ${CX.green}40 100%)`,
              }}/>
              <div style={{
                position: 'absolute', left: 0, width: '52%', height: 6, borderRadius: 999,
                background: `linear-gradient(90deg, ${CX.blue}, ${CX.cyan}, ${CX.green})`,
              }}/>
              <div style={{
                position: 'absolute', left: 'calc(52% - 13px)', width: 26, height: 26, borderRadius: 999,
                background: t.card, border: `1.5px solid ${t.ink}`,
                boxShadow: '0 4px 12px rgba(11,13,16,0.18)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <div style={{ width: 8, height: 8, borderRadius: 99, background: t.ink }}/>
              </div>
            </div>
            <div style={{
              display: 'flex', justifyContent: 'space-between', marginTop: 6,
              fontFamily: CX_MONO, fontSize: 9.5, color: t.muted, letterSpacing: '0.06em',
            }}>
              <span>1,500</span><span>BMR 1,950</span><span>TDEE 2,820</span><span>3,500</span>
            </div>
          </div>
        </div>

        {/* Macro split */}
        <div style={{
          margin: '12px 16px 0', padding: '16px',
          borderRadius: 22, background: t.card, boxShadow: t.shadow,
          border: `0.5px solid ${t.hairline}`,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <CXLabel color={t.muted}>Macro split</CXLabel>
            <div style={{ fontFamily: CX_MONO, fontSize: 10.5, color: t.muted, letterSpacing: '0.06em' }}>
              28% / 42% / 26%
            </div>
          </div>
          {/* Stacked bar */}
          <div style={{
            display: 'flex', height: 10, borderRadius: 99, marginTop: 10, overflow: 'hidden',
            border: `0.5px solid ${t.hairline}`,
          }}>
            <div style={{ width: '28%', background: CX.blue }}/>
            <div style={{ width: '42%', background: CX.cyan }}/>
            <div style={{ width: '26%', background: CX.green }}/>
            <div style={{ width: '4%', background: t.mode === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(11,13,16,0.05)' }}/>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginTop: 14 }}>
            <TargetTile theme={t} label="Protein" value={170} color={CX.blue}  per="2.1g/kg"/>
            <TargetTile theme={t} label="Carbs"   value={250} color={CX.cyan}  per="3.1g/kg"/>
            <TargetTile theme={t} label="Fat"     value={70}  color={CX.green} per="0.9g/kg"/>
          </div>
        </div>

        {/* Weight tracker */}
        <div style={{
          margin: '12px 16px 0', padding: '16px',
          borderRadius: 22, background: t.card, boxShadow: t.shadow,
          border: `0.5px solid ${t.hairline}`,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <div>
              <CXLabel color={t.muted}>Weight · 30 days</CXLabel>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
                <CXNum size={22} weight={600} color={t.ink}>81.4</CXNum>
                <span style={{ fontFamily: CX_FONT, fontSize: 12, color: t.muted }}>kg</span>
                <span style={{
                  fontFamily: CX_MONO, fontSize: 11, color: CX.green, fontWeight: 600,
                  marginLeft: 4, letterSpacing: '0.04em',
                }}>−1.8 KG</span>
              </div>
            </div>
            <div style={{
              padding: '4px 10px', borderRadius: 10,
              background: t.mode === 'dark' ? 'rgba(255,255,255,0.04)' : '#F4F2EE',
              border: `0.5px solid ${t.hairline}`,
              fontFamily: CX_FONT, fontSize: 11, color: t.ink2, fontWeight: 500,
            }}>Log weight</div>
          </div>
          <div style={{ marginTop: 12, height: 70 }}>
            <WeightChart theme={t}/>
          </div>
          <div style={{
            marginTop: 10, padding: '10px 12px', borderRadius: 14,
            background: t.mode === 'dark' ? 'rgba(31,204,116,0.06)' : 'rgba(31,204,116,0.08)',
            border: `0.5px solid ${t.mode === 'dark' ? 'rgba(31,204,116,0.18)' : 'rgba(31,204,116,0.25)'}`,
            fontFamily: CX_FONT, fontSize: 12, color: t.ink, display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <CXIcon name="check" size={14} color={CX.green}/>
            <span>On pace — finish cut <b>Jun 12</b>, est. body fat 14.2%</span>
          </div>
        </div>

        <div style={{ height: 14 }}/>
      </div>

      <CXBottomNav active="goals" theme={t}/>
    </div>
  );
}

function PeriodDropdown({ theme }) {
  const t = theme;
  const items = [
    { kind: 'group', label: 'Weeks' },
    { id: 'w6', label: 'Week 6', sub: 'May 25 – 31' },
    { id: 'w5', label: 'Week 5', sub: 'May 18 – 24', dim: true },
    { id: 'w4', label: 'Week 4', sub: 'May 11 – 17', active: true },
    { id: 'w3', label: 'Week 3', sub: 'May 4 – 10', dim: true },
    { id: 'w2', label: 'Week 2', sub: 'Apr 27 – May 3', dim: true },
    { kind: 'group', label: 'Months' },
    { id: 'm5', label: 'May 2026', sub: 'cut phase · 4 wk in' },
    { id: 'm4', label: 'April 2026', sub: 'prep' },
    { id: 'm3', label: 'March 2026', sub: 'bulk · last week' },
  ];
  return (
    <div style={{
      position: 'absolute', top: 32, left: 0, zIndex: 20,
      minWidth: 230, padding: 6, borderRadius: 16,
      background: t.card, border: `0.5px solid ${t.hairline2}`,
      boxShadow: t.shadowLg,
    }}>
      {items.map((it, i) => {
        if (it.kind === 'group') {
          return (
            <div key={i} style={{
              padding: '8px 10px 4px',
              fontFamily: CX_MONO, fontSize: 9, letterSpacing: '0.14em',
              textTransform: 'uppercase', color: t.muted,
            }}>{it.label}</div>
          );
        }
        return (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
            padding: '7px 10px', borderRadius: 10,
            background: it.active ? (t.mode === 'dark' ? 'rgba(25,211,217,0.10)' : 'rgba(25,211,217,0.12)') : 'transparent',
            opacity: it.dim ? 0.7 : 1,
          }}>
            <div>
              <div style={{ fontFamily: CX_FONT, fontSize: 12.5, fontWeight: 600, color: t.ink }}>{it.label}</div>
              <div style={{ fontFamily: CX_MONO, fontSize: 10, color: t.muted, marginTop: 1, letterSpacing: '0.02em' }}>{it.sub}</div>
            </div>
            {it.active && <CXIcon name="check" size={13} color={CX.cyan}/>}
          </div>
        );
      })}
    </div>
  );
}

function TargetTile({ theme, label, value, per, color }) {
  return (
    <div style={{
      padding: '10px 12px', borderRadius: 14,
      background: theme.mode === 'dark' ? 'rgba(255,255,255,0.03)' : '#F8F6F1',
      border: `0.5px solid ${theme.hairline}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{ width: 6, height: 6, borderRadius: 99, background: color }}/>
        <CXLabel color={theme.muted}>{label}</CXLabel>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 3, marginTop: 4 }}>
        <CXNum size={18} weight={600} color={theme.ink}>{value}</CXNum>
        <span style={{ fontFamily: CX_FONT, fontSize: 11, color: theme.muted }}>g</span>
      </div>
      <div style={{ fontFamily: CX_MONO, fontSize: 9.5, color: theme.muted, marginTop: 2, letterSpacing: '0.04em' }}>
        {per}
      </div>
    </div>
  );
}

function WeightChart({ theme }) {
  const values = [83.2, 83.0, 82.9, 82.7, 82.6, 82.4, 82.3, 82.0, 82.1, 81.8, 81.7, 81.5, 81.4];
  const min = 81.0, max = 83.5;
  const w = 320, h = 70;
  const pts = values.map((v, i) => ({
    x: (i / (values.length - 1)) * w,
    y: h - ((v - min) / (max - min)) * (h - 8) - 4,
  }));
  const path = pts.map((p,i) => i===0 ? `M${p.x} ${p.y}` : `L${p.x} ${p.y}`).join(' ');
  // Smoothing
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id="wfill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={CX.green} stopOpacity="0.22"/>
          <stop offset="100%" stopColor={CX.green} stopOpacity="0"/>
        </linearGradient>
      </defs>
      <path d={`${path} L${w} ${h} L0 ${h} Z`} fill="url(#wfill)"/>
      <path d={path} fill="none" stroke={CX.green} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx={pts[pts.length-1].x} cy={pts[pts.length-1].y} r="3.5" fill={theme.bg} stroke={CX.green} strokeWidth="2"/>
    </svg>
  );
}

Object.assign(window, { CXGoalsScreen });
