// Food detail / edit screen — opened from a meal card.
// Hero image, editable nutrition, meal type, serving, and AI-fix action.

function CXFoodDetailScreen({ mode = 'light', editing = true }) {
  const t = cxTheme(mode);
  return (
    <div style={{
      position: 'relative', width: '100%', height: '100%',
      background: t.bg, overflow: 'hidden',
      fontFamily: CX_FONT, color: t.ink,
    }}>
      {/* Hero image */}
      <div style={{
        position: 'relative', height: 320,
        background: 'radial-gradient(110% 90% at 50% 60%, #c89970 0%, #8a5d36 50%, #2a221d 100%)',
        overflow: 'hidden',
      }}>
        {/* simulated plate */}
        <div style={{
          position: 'absolute', left: '50%', top: '54%', transform: 'translate(-50%,-50%)',
          width: 260, height: 260, borderRadius: 999,
          background: 'radial-gradient(closest-side, #efe6d8 0%, #d6c8b2 70%, #aa8e6d 100%)',
          boxShadow: '0 30px 60px rgba(0,0,0,0.35), inset 0 0 30px rgba(0,0,0,0.15)',
        }}>
          <div style={{
            position: 'absolute', inset: 22, borderRadius: 999,
            background: 'radial-gradient(closest-side, #c89970 20%, #8a5d36 70%)',
          }}/>
        </div>
        {/* top chrome */}
        <div style={{
          position: 'absolute', top: 56, left: 18, right: 18,
          display: 'flex', justifyContent: 'space-between',
        }}>
          <CXChip><CXIcon name="chevL" size={14} color="#F2F3F5"/> Back</CXChip>
          <div style={{ display: 'flex', gap: 8 }}>
            <CXChip><CXIcon name="copy"  size={14} color="#F2F3F5"/></CXChip>
            <CXChip><CXIcon name="trash" size={14} color="#F2F3F5"/></CXChip>
          </div>
        </div>
        {/* confidence overlay — lifted clear of the sheet's top edge */}
        <div style={{
          position: 'absolute', left: 18, bottom: 40,
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '6px 12px 6px 8px', borderRadius: 999,
          background: 'rgba(8,10,13,0.55)', backdropFilter: 'blur(12px)',
          border: '0.5px solid rgba(255,255,255,0.12)',
        }}>
          <span style={{ width: 7, height: 7, borderRadius: 99, background: CX.green, boxShadow: '0 0 0 3px rgba(31,204,116,0.18)' }}/>
          <span style={{ fontFamily: CX_MONO, fontSize: 10.5, color: '#F2F3F5', letterSpacing: '0.08em' }}>
            AI · 91% CONFIDENCE
          </span>
        </div>
      </div>

      {/* Sheet body */}
      <div style={{
        position: 'absolute', left: 0, right: 0, top: 296, bottom: 92,
        background: t.bg,
        borderRadius: '28px 28px 0 0',
        boxShadow: '0 -2px 12px rgba(0,0,0,0.04)',
        overflow: 'auto',
        padding: '8px 0 16px',
      }}>
        {/* grabber */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 14px' }}>
          <div style={{ width: 36, height: 4, borderRadius: 999, background: t.hairline2 }}/>
        </div>

        {/* Title + serving */}
        <div style={{ padding: '0 20px 4px' }}>
          <CXLabel color={t.muted}>Detected · Lunch · 12:48</CXLabel>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginTop: 6 }}>
            <div>
              <div style={{
                fontFamily: CX_FONT, fontSize: 24, fontWeight: 600, letterSpacing: '-0.03em', color: t.ink,
              }}>Chicken Rice Bowl</div>
              <div style={{
                fontFamily: CX_FONT, fontSize: 13, color: t.muted, marginTop: 2,
              }}>1 bowl · ≈ 380g · home cooked</div>
            </div>
            <div style={{
              padding: '6px 10px', borderRadius: 12,
              background: editing ? t.ink : t.card,
              border: editing ? `0.5px solid ${t.ink}` : `0.5px solid ${t.hairline2}`,
              boxShadow: editing ? 'inset 0 1px 2px rgba(0,0,0,0.25)' : 'none',
              display: 'flex', alignItems: 'center', gap: editing ? 0 : 6, height: 32,
            }}>
              <CXIcon name="edit" size={14} color={editing ? t.bg : t.ink2}/>
              {!editing && <span style={{ fontFamily: CX_FONT, fontSize: 12, color: t.ink2, fontWeight: 500 }}>Edit</span>}
            </div>
          </div>
        </div>

        {/* kcal banner */}
        <div style={{
          margin: '16px 16px 0', padding: '14px 16px',
          borderRadius: 20, background: t.card, border: `0.5px solid ${t.hairline}`,
          boxShadow: t.shadow,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <CXLabel color={t.muted}>Calories</CXLabel>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 2 }}>
              <CXNum size={28} weight={600} color={t.ink}>620</CXNum>
              <span style={{ fontFamily: CX_FONT, fontSize: 12, color: t.muted }}>kcal</span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Stepper theme={t}/>
          </div>
        </div>

        {/* Macro editors */}
        <div style={{
          margin: '10px 16px 0', borderRadius: 20,
          background: t.card, border: `0.5px solid ${t.hairline}`, boxShadow: t.shadow,
          overflow: 'hidden',
        }}>
          <MacroEditRow theme={t} label="Protein" value={48} color={CX.blue}  pct={0.66}/>
          <RowDiv theme={t}/>
          <MacroEditRow theme={t} label="Carbs"   value={72} color={CX.cyan}  pct={0.45}/>
          <RowDiv theme={t}/>
          <MacroEditRow theme={t} label="Fat"     value={16} color={CX.green} pct={0.30}/>
        </div>

        {/* Detected items chips */}
        <div style={{ padding: '18px 20px 8px' }}>
          <CXLabel color={t.muted}>Detected items · tap to adjust</CXLabel>
        </div>
        <div style={{ padding: '0 16px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {[
            { n: 'Grilled chicken thigh', g: '120g' },
            { n: 'Jasmine rice', g: '180g' },
            { n: 'Avocado', g: '40g' },
            { n: 'Sesame oil', g: '8g' },
            { n: 'Scallion', g: '12g' },
          ].map((it) => (
            <div key={it.n} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '7px 10px 7px 8px', borderRadius: 999,
              background: t.card, border: `0.5px solid ${t.hairline}`,
              fontFamily: CX_FONT, fontSize: 12, color: t.ink,
            }}>
              <span style={{ width: 5, height: 5, borderRadius: 99, background: CX.cyan }}/>
              {it.n}
              <span style={{ fontFamily: CX_MONO, fontSize: 10.5, color: t.muted }}>{it.g}</span>
            </div>
          ))}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '7px 10px', borderRadius: 999,
            background: 'transparent', border: `1px dashed ${t.hairline2}`,
            fontFamily: CX_FONT, fontSize: 12, color: t.muted, fontWeight: 500,
          }}>
            <CXIcon name="plus" size={12} color={t.muted}/> Add item
          </div>
        </div>

        {/* AI Fix CTA */}
        <div style={{
          margin: '18px 16px 0', padding: 14,
          borderRadius: 20,
          background: mode === 'dark' ? 'rgba(25,211,217,0.06)' : 'rgba(25,211,217,0.08)',
          border: `0.5px solid ${mode === 'dark' ? 'rgba(25,211,217,0.20)' : 'rgba(25,211,217,0.30)'}`,
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: CX.gradAI, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <CXIcon name="ai" size={16} color="#0B0D10"/>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: CX_FONT, fontSize: 13.5, fontWeight: 600, color: t.ink }}>
              Not right?  Ask AI to fix this
            </div>
            <div style={{ fontFamily: CX_FONT, fontSize: 11.5, color: t.muted, marginTop: 1 }}>
              Describe the meal in your words — we'll re-estimate macros.
            </div>
          </div>
          <CXIcon name="chevR" size={16} color={t.ink2}/>
        </div>

        <div style={{ height: 90 }}/>
      </div>

      {/* Bottom action bar — only visible while editing.
           Original state has no save / undo because there are no pending changes. */}
      {editing && (
        <div style={{
          position: 'absolute', left: 12, right: 12, bottom: 108,
          display: 'flex', gap: 8, zIndex: 10,
        }}>
          <button style={{
            flex: 1, height: 50, borderRadius: 16, border: `0.5px solid ${t.hairline2}`,
            background: t.card, color: t.ink,
            fontFamily: CX_FONT, fontWeight: 600, fontSize: 14, letterSpacing: '-0.01em',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>
            <CXIcon name="undo" size={16} color={t.ink2}/> Undo
          </button>
          <button style={{
            flex: 1.6, height: 50, borderRadius: 16, border: 'none',
            background: t.ink, color: t.bg,
            fontFamily: CX_FONT, fontWeight: 600, fontSize: 14, letterSpacing: '-0.01em',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            boxShadow: '0 10px 24px rgba(11,13,16,0.18)',
          }}>
            <CXIcon name="check" size={16} color={t.bg}/> Save to Today
          </button>
        </div>
      )}

      <CXBottomNav active="today" theme={t}/>
    </div>
  );
}

function Stepper({ theme }) {
  const t = theme;
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center',
      background: t.mode === 'dark' ? 'rgba(255,255,255,0.04)' : '#F4F2EE',
      borderRadius: 12, padding: 3, gap: 4,
      border: `0.5px solid ${t.hairline}`,
    }}>
      <div style={{
        width: 28, height: 28, borderRadius: 9,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ fontFamily: CX_MONO, fontSize: 16, color: t.ink2 }}>−</span>
      </div>
      <CXNum size={13} color={t.ink} style={{ width: 36, textAlign: 'center' }}>1.0×</CXNum>
      <div style={{
        width: 28, height: 28, borderRadius: 9, background: t.card,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
      }}>
        <span style={{ fontFamily: CX_MONO, fontSize: 16, color: t.ink }}>+</span>
      </div>
    </div>
  );
}

function MacroEditRow({ theme, label, value, color, pct }) {
  return (
    <div style={{ padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: 99, background: color }}/>
          <span style={{ fontFamily: CX_FONT, fontSize: 14, fontWeight: 500, color: theme.ink }}>{label}</span>
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 4,
          padding: '4px 10px', borderRadius: 10,
          background: theme.mode === 'dark' ? 'rgba(255,255,255,0.04)' : '#F4F2EE',
          border: `0.5px solid ${theme.hairline}`,
        }}>
          <CXNum size={14} color={theme.ink} weight={600}>{value}</CXNum>
          <span style={{ fontFamily: CX_FONT, fontSize: 11, color: theme.muted }}>g</span>
        </div>
      </div>
      <div style={{ height: 4, borderRadius: 999, background: theme.mode === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(11,13,16,0.06)', marginTop: 10, overflow: 'hidden' }}>
        <div style={{ width: `${pct*100}%`, height: '100%', borderRadius: 999, background: color }}/>
      </div>
      <div style={{
        marginTop: 4, fontFamily: CX_MONO, fontSize: 10.5, color: theme.muted,
        letterSpacing: '0.04em',
      }}>{Math.round(pct*100)}% of {label.toLowerCase()} target</div>
    </div>
  );
}

function RowDiv({ theme }) {
  return <div style={{ height: 0.5, background: theme.hairline, margin: '0 16px' }}/>;
}

Object.assign(window, { CXFoodDetailScreen });
