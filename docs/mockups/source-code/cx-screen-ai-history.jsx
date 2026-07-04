// Calorix AI — chat history screen.
// Mirrors the History screen patterns: card list, mono eyebrow labels,
// small status pip + tag chip per row. Tap a row to open that thread.

function CXAIHistoryScreen({ mode = 'light' }) {
  const t = cxTheme(mode);

  // Synthetic but plausible threads. `actions` is # of plan edits the
  // AI applied in that thread (drives the green pip on the right).
  const pinned = [
    {
      id: 'p1',
      title: 'Macro plan for 5×/week training',
      preview: "Raised protein to 180 g/day, pulled carbs slightly to keep 2,400 kcal.",
      tag: 'PLAN',
      when: 'Today',
      actions: 1,
    },
  ];

  const groups = [
    {
      label: 'Today',
      rows: [
        {
          id: 't1',
          title: 'Chicken Rice Bowl — wrong scan',
          preview: 'Re-estimated 12:48 lunch to 620 kcal · 48P/72C/16F.',
          tag: 'MEAL EDIT',
          when: '13:04',
          actions: 1,
          unread: true,
        },
        {
          id: 't2',
          title: 'What can I still eat tonight?',
          preview: '980 kcal left, ~72 g protein. Try 200 g salmon, rice, veg.',
          tag: 'PLAN',
          when: '11:20',
          actions: 0,
        },
      ],
    },
    {
      label: 'Yesterday',
      rows: [
        {
          id: 'y1',
          title: 'Greek yogurt brand swap',
          preview: 'Switched default to Fage 0% — saved as your usual breakfast.',
          tag: 'MEAL EDIT',
          when: '21:42',
          actions: 1,
        },
        {
          id: 'y2',
          title: 'Why are my carbs low?',
          preview: 'Two skipped snacks. I added a 80 g carb suggestion to today.',
          tag: 'NUTRITION',
          when: '19:08',
          actions: 0,
        },
      ],
    },
    {
      label: 'Earlier this week',
      rows: [
        {
          id: 'e1',
          title: 'Cut vs. maintain — May plan',
          preview: '14-day soft cut at −300 kcal. Auto-applied to weekday goals.',
          tag: 'PLAN',
          when: 'Wed',
          actions: 2,
        },
        {
          id: 'e2',
          title: 'Grocery list from this week',
          preview: 'Compiled 18 items from logged meals. Tap to export.',
          tag: 'EXPORT',
          when: 'Tue',
          actions: 0,
        },
        {
          id: 'e3',
          title: 'Travel day — eating out',
          preview: 'Flagged 2 best options at JFK Terminal 5 under 700 kcal.',
          tag: 'NUTRITION',
          when: 'Mon',
          actions: 0,
        },
      ],
    },
  ];

  return (
    <div style={{
      position: 'relative', width: '100%', height: '100%',
      background: t.bg, overflow: 'hidden',
      fontFamily: CX_FONT, color: t.ink,
    }}>
      <div style={{ height: 'calc(100% - 92px)', overflow: 'auto', paddingBottom: 88 }}>
        {/* Header */}
        <div style={{ padding: '54px 20px 8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <CXIcon name="chevL" size={20} color={t.ink2}/>
            <CXLabel color={t.muted}>{CX_APPNAME} AI</CXLabel>
            <CXIcon name="sliders" size={18} color={t.ink2}/>
          </div>
          <div style={{
            marginTop: 14,
            display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
          }}>
            <div style={{
              fontFamily: CX_FONT, fontSize: 30, fontWeight: 600,
              letterSpacing: '-0.04em', color: t.ink, lineHeight: 1,
            }}>Chats</div>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '4px 10px', borderRadius: 99,
              background: t.mode === 'dark' ? 'rgba(25,211,217,0.10)' : 'rgba(25,211,217,0.14)',
              border: `0.5px solid ${t.mode === 'dark' ? 'rgba(25,211,217,0.25)' : 'rgba(25,211,217,0.30)'}`,
            }}>
              <CXIcon name="ai" size={11} color={CX.cyan}/>
              <span style={{
                fontFamily: CX_MONO, fontSize: 10, color: CX.cyan,
                fontWeight: 600, letterSpacing: '0.08em',
              }}>12 THREADS</span>
            </div>
          </div>
          <div style={{
            fontFamily: CX_FONT, fontSize: 13, color: t.muted, marginTop: 6, lineHeight: 1.4,
          }}>
            Every conversation with {CX_APPNAME} AI, including any plan or meal edits it made.
          </div>
        </div>

        {/* Search */}
        <div style={{ padding: '12px 16px 0' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 12px', borderRadius: 12,
            background: t.card, border: `0.5px solid ${t.hairline}`,
            boxShadow: t.shadow,
          }}>
            <SearchIcon color={t.muted}/>
            <span style={{
              flex: 1, fontFamily: CX_FONT, fontSize: 13.5, color: t.muted,
            }}>Search chats and meal edits…</span>
            <span style={{
              fontFamily: CX_MONO, fontSize: 9.5, color: t.muted,
              padding: '2px 6px', borderRadius: 5,
              border: `0.5px solid ${t.hairline2}`, letterSpacing: '0.06em',
            }}>⌘K</span>
          </div>
        </div>

        {/* Filter chips */}
        <div style={{
          padding: '12px 16px 4px', display: 'flex', gap: 6, overflow: 'auto',
        }}>
          {[
            { l: 'All',         active: true,  count: 12 },
            { l: 'Plan',        count: 4 },
            { l: 'Meal edits',  count: 5 },
            { l: 'Nutrition',   count: 3 },
          ].map((c) => (
            <div key={c.l} style={{
              flexShrink: 0, padding: '6px 12px', borderRadius: 999,
              background: c.active
                ? t.ink
                : t.card,
              border: c.active
                ? '0.5px solid transparent'
                : `0.5px solid ${t.hairline2}`,
              color: c.active ? t.bg : t.ink2,
              fontFamily: CX_FONT, fontSize: 12, fontWeight: 500,
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
              {c.l}
              <span style={{
                fontFamily: CX_MONO, fontSize: 10, opacity: 0.75,
                color: c.active ? t.bg : t.muted,
              }}>{c.count}</span>
            </div>
          ))}
        </div>

        {/* Pinned section */}
        <div style={{
          margin: '14px 20px 8px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontFamily: CX_FONT, fontSize: 14, fontWeight: 600,
            color: t.ink, letterSpacing: '-0.01em',
          }}>
            <PinIcon color={t.ink2}/>
            Pinned
          </div>
          <CXLabel color={t.muted}>1</CXLabel>
        </div>

        <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {pinned.map((r) => <ChatRow key={r.id} row={r} theme={t} featured/>)}
        </div>

        {/* Grouped recent threads */}
        {groups.map((g) => (
          <React.Fragment key={g.label}>
            <div style={{
              margin: '18px 20px 8px',
              display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
            }}>
              <div style={{
                fontFamily: CX_FONT, fontSize: 14, fontWeight: 600,
                color: t.ink, letterSpacing: '-0.01em',
              }}>{g.label}</div>
              <CXLabel color={t.muted}>{g.rows.length}</CXLabel>
            </div>
            <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {g.rows.map((r) => <ChatRow key={r.id} row={r} theme={t}/>)}
            </div>
          </React.Fragment>
        ))}

        {/* Footer — privacy note */}
        <div style={{
          margin: '22px 20px 4px',
          fontFamily: CX_MONO, fontSize: 10, color: t.muted,
          letterSpacing: '0.08em', textAlign: 'center',
        }}>
          CHATS STORED LOCALLY · END-TO-END ENCRYPTED IN SYNC
        </div>
      </div>

      {/* New chat floating button — sits above the bottom nav */}
      <button style={{
        position: 'absolute', right: 16, bottom: 108,
        height: 46, padding: '0 16px 0 6px',
        borderRadius: 999, border: `0.5px solid ${t.hairline2}`,
        background: t.card, color: t.ink,
        display: 'inline-flex', alignItems: 'center', gap: 10,
        fontFamily: CX_FONT, fontWeight: 600, fontSize: 13.5,
        letterSpacing: '-0.01em', cursor: 'pointer',
        boxShadow: t.mode === 'dark'
          ? '0 12px 28px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(255,255,255,0.04)'
          : '0 10px 24px rgba(11,13,16,0.10), 0 2px 4px rgba(11,13,16,0.04)',
        backdropFilter: 'blur(12px) saturate(160%)',
        WebkitBackdropFilter: 'blur(12px) saturate(160%)',
      }}>
        <span style={{
          width: 34, height: 34, borderRadius: 999,
          background: CX.gradAI,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 10px rgba(25,211,217,0.30), inset 0 0 0 1px rgba(255,255,255,0.18)',
        }}>
          <CXIcon name="plus" size={16} color="#0B0D10" stroke={2}/>
        </span>
        <span style={{ paddingRight: 4 }}>New chat</span>
      </button>

      <CXBottomNav active="ai" theme={t}/>
    </div>
  );
}

// One chat row in the list.
function ChatRow({ row, theme, featured = false }) {
  const t = theme;
  const tagColor =
    row.tag === 'PLAN'      ? CX.blue  :
    row.tag === 'MEAL EDIT' ? CX.cyan  :
    row.tag === 'NUTRITION' ? CX.green :
    row.tag === 'EXPORT'    ? CX.amber : t.muted;

  return (
    <div style={{
      display: 'flex', alignItems: 'stretch', gap: 12,
      padding: 12, borderRadius: 18,
      background: featured
        ? (t.mode === 'dark' ? 'rgba(25,211,217,0.06)' : 'rgba(25,211,217,0.07)')
        : t.card,
      border: featured
        ? `0.5px solid ${t.mode === 'dark' ? 'rgba(25,211,217,0.22)' : 'rgba(25,211,217,0.28)'}`
        : `0.5px solid ${t.hairline}`,
      boxShadow: featured ? 'none' : t.shadow,
      position: 'relative',
    }}>
      {/* Avatar block — gradient AI tile for featured, soft tile for others */}
      <div style={{
        width: 42, height: 42, borderRadius: 12, flexShrink: 0,
        background: featured
          ? CX.gradAI
          : (t.mode === 'dark' ? 'rgba(255,255,255,0.04)' : '#F8F6F1'),
        border: featured ? 'none' : `0.5px solid ${t.hairline}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: featured ? '0 6px 14px rgba(25,211,217,0.20)' : 'none',
        position: 'relative',
      }}>
        <CXIcon name="ai" size={featured ? 20 : 18}
          color={featured ? '#0B0D10' : t.ink2}/>
        {row.unread && (
          <span style={{
            position: 'absolute', top: -2, right: -2,
            width: 10, height: 10, borderRadius: 99,
            background: CX.green,
            border: `2px solid ${featured
              ? (t.mode === 'dark' ? '#0F1B1F' : '#E6F7F8')
              : t.card}`,
          }}/>
        )}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8,
        }}>
          <div style={{
            fontFamily: CX_FONT, fontSize: 14, fontWeight: 600,
            color: t.ink, letterSpacing: '-0.01em',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            flex: 1, minWidth: 0,
          }}>{row.title}</div>
          <span style={{
            fontFamily: CX_MONO, fontSize: 10.5, color: t.muted,
            letterSpacing: '0.04em', flexShrink: 0,
          }}>{row.when}</span>
        </div>

        <div style={{
          fontFamily: CX_FONT, fontSize: 12.5, color: t.ink2,
          lineHeight: 1.4, marginTop: 3,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}>{row.preview}</div>

        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, marginTop: 8,
        }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '2px 7px 2px 6px', borderRadius: 6,
            background: t.mode === 'dark'
              ? `${tagColor}22`
              : `${tagColor}1A`,
          }}>
            <span style={{ width: 5, height: 5, borderRadius: 99, background: tagColor }}/>
            <span style={{
              fontFamily: CX_MONO, fontSize: 9.5, color: tagColor,
              fontWeight: 600, letterSpacing: '0.08em',
            }}>{row.tag}</span>
          </span>
          {row.actions > 0 && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              fontFamily: CX_MONO, fontSize: 10, color: CX.green,
              fontWeight: 600, letterSpacing: '0.04em',
            }}>
              <CXIcon name="check" size={11} color={CX.green}/>
              {row.actions} APPLIED
            </span>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center' }}>
        <CXIcon name="chevR" size={14} color={t.muted}/>
      </div>
    </div>
  );
}

// Local inline icons we don't have in the global set yet.
function SearchIcon({ color }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" style={{ display: 'block' }}>
      <circle cx="11" cy="11" r="6.5" fill="none" stroke={color} strokeWidth="1.6"/>
      <path d="m16 16 4 4" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round"/>
    </svg>
  );
}
function PinIcon({ color }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" style={{ display: 'block' }}>
      <path d="M14 3l7 7-4 1-3 3 1 4-3-3-6 6 1-5-5-5 4 1 3-3 1-4z"
        fill="none" stroke={color} strokeWidth="1.6"
        strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

Object.assign(window, { CXAIHistoryScreen });
