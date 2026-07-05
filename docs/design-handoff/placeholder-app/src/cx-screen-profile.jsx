// Placeholder app profile / account screen. Lives behind the avatar in the top-right
// of Today / camera screens. Data-driven, premium, theme-aware.

function CXProfileScreen({ mode = 'light' }) {
  const t = cxTheme(mode);
  const dark = mode === 'dark';

  return (
    <div style={{
      position: 'relative', width: '100%', height: '100%',
      background: t.bg, color: t.ink, overflow: 'hidden',
      fontFamily: CX_FONT,
    }}>
      <div style={{ height: 'calc(100% - 100px)', overflow: 'auto' }}>
        {/* Header */}
        <div style={{
          padding: '54px 20px 8px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <button style={{
            width: 38, height: 38, borderRadius: 999, border: 'none', cursor: 'pointer',
            background: t.card, boxShadow: t.shadow,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <CXIcon name="chevL" size={18} color={t.ink} stroke={1.8}/>
          </button>
          <div style={{
            fontFamily: CX_MONO, fontSize: 10.5, color: t.muted,
            letterSpacing: '0.18em', textTransform: 'uppercase',
          }}>Account</div>
          <button style={{
            width: 38, height: 38, borderRadius: 999, border: 'none', cursor: 'pointer',
            background: t.card, boxShadow: t.shadow,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <CXIcon name="sliders" size={18} color={t.ink} stroke={1.8}/>
          </button>
        </div>

        {/* Identity card */}
        <div style={{
          margin: '14px 16px 0', padding: 18, borderRadius: 28,
          background: t.card, boxShadow: t.shadow,
          border: `0.5px solid ${t.hairline}`,
          position: 'relative', overflow: 'hidden',
        }}>
          {/* corner halo */}
          <div style={{
            position: 'absolute', right: -60, top: -60, width: 200, height: 200, borderRadius: 999,
            background: 'radial-gradient(closest-side, rgba(25,211,217,0.22), transparent 70%)',
            filter: 'blur(8px)', pointerEvents: 'none',
          }}/>

          <div style={{ display: 'flex', alignItems: 'center', gap: 14, position: 'relative' }}>
            <div style={{
              position: 'relative', width: 76, height: 76, borderRadius: 999,
              padding: 2.5, background: CX.gradAI,
              boxShadow: '0 12px 28px rgba(25,211,217,0.28)',
            }}>
              <div style={{
                width: '100%', height: '100%', borderRadius: 999,
                background: dark ? '#1A1F26' : '#EFEDE7',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: CX_FONT, fontWeight: 600, fontSize: 26, color: t.ink,
                letterSpacing: '0.01em',
              }}>EK</div>
              <span style={{
                position: 'absolute', right: -2, bottom: -2, width: 22, height: 22, borderRadius: 999,
                background: CX.green, border: `2px solid ${t.card}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <CXIcon name="check" size={11} color="#0B0D10" stroke={2.4}/>
              </span>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 20, fontWeight: 600, letterSpacing: '-0.02em', color: t.ink,
              }}>Elias Karlsson</div>
              <div style={{
                fontFamily: CX_MONO, fontSize: 11, color: t.muted,
                letterSpacing: '0.06em', marginTop: 2,
              }}>elias@example.com</div>
              <div style={{
                marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '3px 8px 3px 6px', borderRadius: 99,
                background: 'rgba(25,211,217,0.10)',
                border: `0.5px solid rgba(25,211,217,0.25)`,
              }}>
                <CXIcon name="ai" size={10} color={CX.cyan}/>
                <span style={{
                  fontFamily: CX_MONO, fontSize: 9.5, color: CX.cyan,
                  letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 600,
                }}>{CX_APPNAME} Pro · trial</span>
              </div>
            </div>
          </div>

          {/* Quick stats */}
          <div style={{
            marginTop: 18, display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8,
            position: 'relative',
          }}>
            <StatTile theme={t} label="Streak"    value="14"   unit="days" color={CX.green}/>
            <StatTile theme={t} label="Scans"     value="312"  unit="total" color={CX.cyan}/>
            <StatTile theme={t} label="Adherence" value="92"   unit="%"     color={CX.blue}/>
          </div>
        </div>

        {/* Body snapshot */}
        <div style={{ margin: '14px 16px 0' }}>
          <CXLabel color={t.muted} style={{ marginBottom: 10, paddingLeft: 4 }}>Body snapshot</CXLabel>
          <div style={{
            padding: 14, borderRadius: 22, background: t.card, boxShadow: t.shadow,
            border: `0.5px solid ${t.hairline}`,
          }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <BodyTile theme={t} icon="scale"  label="Weight"    value="78.4" unit="kg"   delta="-1.2"/>
              <BodyTile theme={t} icon="goals"  label="Goal"      value="74.0" unit="kg"   delta="lean cut"/>
              <BodyTile theme={t} icon="flame"  label="Maint."    value="2 410" unit="kcal" delta="TDEE"/>
            </div>
            <div style={{
              marginTop: 12, padding: 10, borderRadius: 14,
              background: dark ? 'rgba(255,255,255,0.03)' : '#FAF8F3',
              border: `0.5px solid ${t.hairline}`,
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <div style={{
                width: 34, height: 34, borderRadius: 10,
                background: CX.gradAI,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.18)',
              }}>
                <CXIcon name="ai" size={16} color="#0B0D10"/>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{
                  fontFamily: CX_FONT, fontSize: 13, fontWeight: 600, color: t.ink, letterSpacing: '-0.005em',
                }}>You're 1.2 kg ahead of plan</div>
                <div style={{
                  fontFamily: CX_FONT, fontSize: 11.5, color: t.muted, marginTop: 1,
                }}>AI can tune your macro split — review changes anytime.</div>
              </div>
              <CXIcon name="chevR" size={14} color={t.ink2}/>
            </div>
          </div>
        </div>

        {/* Settings list */}
        <div style={{ margin: '18px 16px 0' }}>
          <CXLabel color={t.muted} style={{ marginBottom: 10, paddingLeft: 4 }}>Preferences</CXLabel>
          <div style={{
            borderRadius: 20, background: t.card, boxShadow: t.shadow,
            border: `0.5px solid ${t.hairline}`, overflow: 'hidden',
          }}>
            <Row theme={t} icon="goals"   label="Goals & macros"     trail="2 400 kcal · 170P/250C/70F"/>
            <Row theme={t} icon="bell"    label="Notifications"      trail="On · scans, streaks"/>
            <Row theme={t} icon="cloud"   label="Sync · iCloud"      trail={
              <span style={{ color: CX.green, fontFamily: CX_MONO, fontSize: 10.5, letterSpacing: '0.06em' }}>
                ● Live
              </span>
            }/>
            <Row theme={t} icon="lens"    label="Camera & scan"      trail="Auto-HDR · grid"/>
            <Row theme={t} icon="sliders" label="Units"              trail="Metric · kcal · kg"/>
            <Row theme={t} icon="ai"      label={`${CX_APPNAME} AI`}    trail="Haiku · streaming" last/>
          </div>
        </div>

        <div style={{ margin: '18px 16px 0' }}>
          <CXLabel color={t.muted} style={{ marginBottom: 10, paddingLeft: 4 }}>Account</CXLabel>
          <div style={{
            borderRadius: 20, background: t.card, boxShadow: t.shadow,
            border: `0.5px solid ${t.hairline}`, overflow: 'hidden',
          }}>
            <Row theme={t} icon="profile"  label="Personal data"   trail="178 cm · 27 yrs"/>
            <Row theme={t} icon="check"    label="Privacy"         trail="On-device first"/>
            <Row theme={t} icon="bell"     label="Help & support"  trail=""/>
            <Row theme={t} icon="undo"     label="Sign out"        tone="warn" last/>
          </div>
        </div>

        <div style={{
          margin: '20px 16px 28px', textAlign: 'center',
          fontFamily: CX_MONO, fontSize: 10, color: t.muted,
          letterSpacing: '0.16em', textTransform: 'uppercase',
        }}>
          {CX_APPNAME} · v1.0.0 (build 24)
        </div>
      </div>

      <CXBottomNav active="today" theme={t}/>
    </div>
  );
}

function StatTile({ theme, label, value, unit, color }) {
  const t = theme;
  return (
    <div style={{
      padding: '10px 12px', borderRadius: 14,
      background: t.mode === 'dark' ? 'rgba(255,255,255,0.03)' : '#FAF8F3',
      border: `0.5px solid ${t.hairline}`,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        fontFamily: CX_MONO, fontSize: 9.5, color: t.muted,
        letterSpacing: '0.14em', textTransform: 'uppercase',
      }}>
        <span style={{ width: 7, height: 7, borderRadius: 99, background: color,
          boxShadow: `0 0 0 3px ${color}22` }}/>
        {label}
      </div>
      <div style={{
        marginTop: 6, display: 'flex', alignItems: 'baseline', gap: 4,
        fontVariantNumeric: 'tabular-nums',
      }}>
        <CXNum size={22} weight={600} color={t.ink}>{value}</CXNum>
        <span style={{ fontFamily: CX_MONO, fontSize: 10.5, color: t.muted }}>{unit}</span>
      </div>
    </div>
  );
}

function BodyTile({ theme, icon, label, value, unit, delta }) {
  const t = theme;
  return (
    <div style={{
      flex: 1, padding: '10px 12px', borderRadius: 16,
      background: t.mode === 'dark' ? 'rgba(255,255,255,0.03)' : '#FAF8F3',
      border: `0.5px solid ${t.hairline}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <CXIcon name={icon} size={12} color={t.muted}/>
        <span style={{
          fontFamily: CX_MONO, fontSize: 9.5, color: t.muted,
          letterSpacing: '0.14em', textTransform: 'uppercase',
        }}>{label}</span>
      </div>
      <div style={{
        marginTop: 6, display: 'flex', alignItems: 'baseline', gap: 3,
      }}>
        <CXNum size={17} weight={600} color={t.ink}>{value}</CXNum>
        <span style={{ fontFamily: CX_MONO, fontSize: 10, color: t.muted }}>{unit}</span>
      </div>
      <div style={{
        marginTop: 2, fontFamily: CX_MONO, fontSize: 10, color: t.ink2,
        letterSpacing: '0.04em',
      }}>{delta}</div>
    </div>
  );
}

function Row({ theme, icon, label, trail, last = false, tone }) {
  const t = theme;
  const warn = tone === 'warn';
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
      borderBottom: last ? 'none' : `0.5px solid ${t.hairline}`,
      cursor: 'pointer',
    }}>
      <div style={{
        width: 34, height: 34, borderRadius: 10, flexShrink: 0,
        background: warn
          ? 'rgba(242,169,59,0.10)'
          : (t.mode === 'dark' ? 'rgba(255,255,255,0.04)' : '#F4F2EE'),
        border: `0.5px solid ${warn ? 'rgba(242,169,59,0.30)' : t.hairline}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <CXIcon name={icon} size={15} color={warn ? CX.amber : t.ink2}/>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: CX_FONT, fontSize: 14, fontWeight: 600,
          color: warn ? CX.amber : t.ink, letterSpacing: '-0.005em',
        }}>{label}</div>
        {trail && typeof trail === 'string' && (
          <div style={{ fontFamily: CX_FONT, fontSize: 11.5, color: t.muted, marginTop: 1 }}>
            {trail}
          </div>
        )}
        {trail && typeof trail !== 'string' && (
          <div style={{ marginTop: 2 }}>{trail}</div>
        )}
      </div>
      {!warn && <CXIcon name="chevR" size={14} color={t.muted}/>}
    </div>
  );
}

Object.assign(window, { CXProfileScreen });
