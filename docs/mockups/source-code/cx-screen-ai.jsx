// AI chat screen — integrated assistant with confirmation cards.

function CXAIScreen({ mode = 'light' }) {
  const t = cxTheme(mode);
  return (
    <div style={{
      position: 'relative', width: '100%', height: '100%',
      background: t.bg, overflow: 'hidden',
      fontFamily: CX_FONT, color: t.ink,
    }}>
      <div style={{ height: 'calc(100% - 92px)', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{
          padding: '54px 16px 12px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          borderBottom: `0.5px solid ${t.hairline}`, background: t.bg,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 38, height: 38, borderRadius: 12,
              background: CX.gradAI,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 6px 16px rgba(25,211,217,0.25)',
            }}>
              <CXIcon name="ai" size={18} color="#0B0D10"/>
            </div>
            <div>
              <div style={{ fontFamily: CX_FONT, fontSize: 16, fontWeight: 600, color: t.ink, letterSpacing: '-0.02em' }}>
                Calorix AI
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 6, height: 6, borderRadius: 99, background: CX.green }}/>
                <span style={{ fontFamily: CX_MONO, fontSize: 10.5, color: t.muted, letterSpacing: '0.06em' }}>
                  CAN EDIT YOUR PLAN
                </span>
              </div>
            </div>
          </div>
          <CXIcon name="close" size={20} color={t.muted}/>
        </div>

        {/* Messages */}
        <div style={{
          flex: 1, overflow: 'auto', padding: '16px 14px 8px',
          display: 'flex', flexDirection: 'column', gap: 12,
        }}>
          {/* Date divider */}
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <CXLabel color={t.muted}>Today · 13:02</CXLabel>
          </div>

          {/* User msg */}
          <Bubble side="user" theme={t}>
            That last scan is wrong — it was chicken and rice, not a curry.
          </Bubble>

          {/* AI msg */}
          <Bubble side="ai" theme={t}>
            Got it. I re-estimated your <b>12:48 Lunch</b> as a chicken rice bowl, ~380g. The macros come down a bit:
          </Bubble>

          {/* Confirmation card — meal correction */}
          <ConfirmCard theme={t}
            title="Correct meal to Chicken Rice Bowl"
            rows={[
              { l: 'Calories', a: '740 kcal', b: '620 kcal', delta: '−120' },
              { l: 'Protein',  a: '42 g',     b: '48 g',     delta: '+6',  color: CX.blue },
              { l: 'Carbs',    a: '68 g',     b: '72 g',     delta: '+4',  color: CX.cyan },
              { l: 'Fat',      a: '28 g',     b: '16 g',     delta: '−12', color: CX.green },
            ]}
            primary="Apply correction"
            secondary="Keep original"
          />

          {/* User msg */}
          <Bubble side="user" theme={t}>
            Also bump protein up — I'm hitting the gym 5×/week now.
          </Bubble>

          {/* AI msg w/ inline reasoning */}
          <Bubble side="ai" theme={t}>
            Reasonable. At your current weight (81.4 kg) and training load I'd raise protein to <b>180 g/day</b> and pull carbs slightly to keep calories at 2,400.
          </Bubble>

          <ConfirmCard theme={t}
            title="Update macro targets"
            rows={[
              { l: 'Protein', a: '170 g', b: '180 g', delta: '+10', color: CX.blue },
              { l: 'Carbs',   a: '250 g', b: '238 g', delta: '−12', color: CX.cyan },
              { l: 'Fat',     a: '70 g',  b: '70 g',  delta: '0',   color: CX.green },
            ]}
            primary="Update plan"
            secondary="Not now"
          />
        </div>

        {/* Suggested prompts strip */}
        <div style={{
          padding: '8px 14px 6px', display: 'flex', gap: 6, overflow: 'auto',
        }}>
          {[
            'Plan my remaining macros',
            'Adjust for fat loss',
            'Why are my carbs low?',
          ].map((p) => (
            <div key={p} style={{
              flexShrink: 0, padding: '8px 12px', borderRadius: 999,
              background: t.card, border: `0.5px solid ${t.hairline2}`,
              fontFamily: CX_FONT, fontSize: 12, color: t.ink2, fontWeight: 500,
            }}>{p}</div>
          ))}
        </div>

        {/* Composer */}
        <div style={{ padding: '8px 12px 12px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 8px 8px 16px', borderRadius: 999,
            background: t.card, boxShadow: t.shadow,
            border: `0.5px solid ${t.hairline2}`,
          }}>
            <CXIcon name="plus" size={18} color={t.muted}/>
            <div style={{
              flex: 1, fontFamily: CX_FONT, fontSize: 14,
              color: t.muted, padding: '6px 0',
            }}>Ask anything about your day…</div>
            <div style={{
              width: 36, height: 36, borderRadius: 999,
              background: t.mode === 'dark' ? 'rgba(255,255,255,0.04)' : '#F4F2EE',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <CXIcon name="mic" size={16} color={t.ink2}/>
            </div>
            <div style={{
              width: 36, height: 36, borderRadius: 999,
              background: CX.gradAI,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(25,211,217,0.30)',
            }}>
              <CXIcon name="arrowUp" size={16} color="#0B0D10"/>
            </div>
          </div>
        </div>
      </div>

      <CXBottomNav active="ai" theme={t}/>
    </div>
  );
}

function Bubble({ side, children, theme }) {
  const isUser = side === 'user';
  return (
    <div style={{
      display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start',
    }}>
      <div style={{
        maxWidth: '82%', padding: '10px 14px',
        borderRadius: isUser ? '18px 18px 6px 18px' : '18px 18px 18px 6px',
        background: isUser
          ? (theme.mode === 'dark' ? 'rgba(58,91,255,0.18)' : 'rgba(58,91,255,0.10)')
          : theme.card,
        border: isUser
          ? `0.5px solid ${theme.mode === 'dark' ? 'rgba(58,91,255,0.35)' : 'rgba(58,91,255,0.22)'}`
          : `0.5px solid ${theme.hairline}`,
        fontFamily: CX_FONT, fontSize: 13.5, lineHeight: 1.45, color: theme.ink,
        boxShadow: isUser ? 'none' : theme.shadow,
      }}>{children}</div>
    </div>
  );
}

function ConfirmCard({ theme, title, rows, primary, secondary }) {
  const t = theme;
  return (
    <div style={{
      maxWidth: '92%', alignSelf: 'flex-start',
      borderRadius: 20, padding: 14,
      background: t.card, boxShadow: t.shadowLg,
      border: `0.5px solid ${t.hairline2}`,
      position: 'relative',
    }}>
      <div style={{
        position: 'absolute', top: 14, right: 14,
        padding: '3px 7px', borderRadius: 6,
        background: t.mode === 'dark' ? 'rgba(25,211,217,0.10)' : 'rgba(25,211,217,0.14)',
        fontFamily: CX_MONO, fontSize: 9.5, color: CX.cyan, letterSpacing: '0.10em', fontWeight: 600,
      }}>AI ACTION</div>
      <div style={{
        fontFamily: CX_FONT, fontSize: 14, fontWeight: 600, color: t.ink, letterSpacing: '-0.01em',
        paddingRight: 80,
      }}>{title}</div>

      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column' }}>
        {rows.map((r, i) => (
          <div key={r.l} style={{
            display: 'grid', gridTemplateColumns: '1fr auto auto auto', alignItems: 'center', gap: 10,
            padding: '8px 0',
            borderBottom: i === rows.length - 1 ? 'none' : `0.5px solid ${t.hairline}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {r.color && <span style={{ width: 5, height: 5, borderRadius: 99, background: r.color }}/>}
              <span style={{ fontFamily: CX_FONT, fontSize: 12.5, color: t.ink2 }}>{r.l}</span>
            </div>
            <CXNum size={12} color={t.muted} style={{ textDecoration: 'line-through', opacity: 0.7 }}>{r.a}</CXNum>
            <CXIcon name="chevR" size={10} color={t.muted}/>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <CXNum size={13} weight={600} color={t.ink}>{r.b}</CXNum>
              <span style={{
                fontFamily: CX_MONO, fontSize: 10, fontWeight: 600,
                color: r.delta.startsWith('−') ? CX.green : r.delta.startsWith('+') ? CX.blue : t.muted,
                letterSpacing: '0.04em',
              }}>{r.delta}</span>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button style={{
          flex: 1, height: 40, borderRadius: 12, border: `0.5px solid ${t.hairline2}`,
          background: 'transparent', color: t.ink2,
          fontFamily: CX_FONT, fontWeight: 500, fontSize: 13,
        }}>{secondary}</button>
        <button style={{
          flex: 1.4, height: 40, borderRadius: 12, border: 'none',
          background: t.ink, color: t.bg,
          fontFamily: CX_FONT, fontWeight: 600, fontSize: 13,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        }}>
          <CXIcon name="check" size={14} color={t.bg}/> {primary}
        </button>
      </div>
    </div>
  );
}

Object.assign(window, { CXAIScreen });
