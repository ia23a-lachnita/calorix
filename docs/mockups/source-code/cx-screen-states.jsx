// Flow-branch screens: camera permission, low-confidence review, manual add.
// These cover the paths around the happy scan flow.

// ————————————————————————————————————————————————
// 1 · Camera permission — iOS system alert over dimmed camera.
function CXPermissionScreen({ mode = 'dark' }) {
  const isDark = mode !== 'light';
  const alertBg = isDark ? 'rgba(36,40,46,0.82)' : 'rgba(246,246,248,0.88)';
  const ink = isDark ? '#F2F3F5' : '#0B0D10';
  const ink2 = isDark ? 'rgba(242,243,245,0.70)' : 'rgba(11,13,16,0.60)';
  const hair = isDark ? 'rgba(255,255,255,0.14)' : 'rgba(11,13,16,0.14)';
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: '#0a0d12' }}>
      <CXCameraPlaceholder label=""/>
      {/* dim + blur while permission undecided */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'rgba(0,0,0,0.45)',
        backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
      }}></div>

      {/* iOS-style system alert */}
      <div style={{
        position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-56%)',
        width: 286, borderRadius: 16, overflow: 'hidden',
        background: alertBg,
        backdropFilter: 'blur(30px) saturate(180%)', WebkitBackdropFilter: 'blur(30px) saturate(180%)',
        boxShadow: '0 24px 60px rgba(0,0,0,0.45)',
        fontFamily: CX_FONT, textAlign: 'center',
      }}>
        <div style={{ padding: '20px 18px 16px' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
            <CXLogo size={40}/>
          </div>
          <div style={{ fontSize: 15, fontWeight: 600, color: ink, letterSpacing: '-0.01em', lineHeight: 1.3 }}>
            "{CX_APPNAME}" Would Like to Access the Camera
          </div>
          <div style={{ marginTop: 6, fontSize: 12.5, color: ink2, lineHeight: 1.45 }}>
            Scanning meals needs the camera. Photos are analyzed in the cloud and never sold or shared.
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderTop: `0.5px solid ${hair}` }}>
          <button style={{
            height: 44, background: 'transparent', border: 'none',
            borderRight: `0.5px solid ${hair}`,
            fontFamily: CX_FONT, fontSize: 15, color: '#3A7BFF', cursor: 'pointer',
          }}>Don't Allow</button>
          <button style={{
            height: 44, background: 'transparent', border: 'none',
            fontFamily: CX_FONT, fontSize: 15, fontWeight: 600, color: '#3A7BFF', cursor: 'pointer',
          }}>Allow</button>
        </div>
      </div>

      {/* Fallback path if denied — follows theme */}
      <div style={{
        position: 'absolute', left: 20, right: 20, bottom: 56,
        borderRadius: 18, padding: '14px 16px',
        background: isDark ? 'rgba(20,24,30,0.62)' : 'rgba(255,255,255,0.72)',
        backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        border: `0.5px solid ${isDark ? 'rgba(255,255,255,0.10)' : 'rgba(11,13,16,0.10)'}`,
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: CX_FONT, fontSize: 13, fontWeight: 600, color: ink }}>
            No camera? No problem.
          </div>
          <div style={{ fontFamily: CX_FONT, fontSize: 12, color: ink2, marginTop: 2 }}>
            You can log any meal by search instead.
          </div>
        </div>
        <button style={{
          height: 36, padding: '0 14px', borderRadius: 999,
          border: `0.5px solid ${isDark ? 'rgba(255,255,255,0.18)' : 'rgba(11,13,16,0.16)'}`,
          background: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(11,13,16,0.06)',
          color: ink,
          fontFamily: CX_FONT, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', flexShrink: 0,
        }}>Add manually</button>
      </div>
    </div>
  );
}

// ————————————————————————————————————————————————
// 2 · Low-confidence review — the "not sure" branch after processing.
function CXScanReviewScreen({ mode = 'dark' }) {
  const t = cxTheme(mode);
  const options = [
    { name: 'Chicken Rice Bowl',   kcal: 620, sel: true  },
    { name: 'Teriyaki Chicken Bowl', kcal: 655, sel: false },
    { name: 'Pork Katsu Bowl',     kcal: 690, sel: false },
  ];
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', background: '#0a0d12' }}>
      {/* frozen capture */}
      <img src="assets/chicken_rice_bowl_highformat.jpg" alt="" style={{
        position: 'absolute', inset: 0, width: '100%', height: '55%', objectFit: 'cover',
      }}/>
      <div style={{
        position: 'absolute', inset: 0, height: '58%',
        background: 'linear-gradient(180deg, rgba(0,0,0,0.35) 0%, transparent 30%, transparent 65%, rgba(10,13,18,0.9) 100%)',
      }}></div>

      {/* close / retake chrome */}
      <div style={{ position: 'absolute', top: 56, left: 18, right: 18, display: 'flex', justifyContent: 'space-between', zIndex: 5 }}>
        <CXGlassChip dark chipBg="rgba(20,24,30,0.55)" chipBorder="rgba(255,255,255,0.12)" square>
          <CXIcon name="close" size={16} color="#F2F3F5"/>
        </CXGlassChip>
        <CXGlassChip dark chipBg="rgba(20,24,30,0.55)" chipBorder="rgba(255,255,255,0.12)">
          <CXIcon name="lens" size={14} color="#F2F3F5"/>
          <span style={{ color: '#F2F3F5' }}>Retake</span>
        </CXGlassChip>
      </div>

      {/* review sheet */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0,
        borderRadius: '28px 28px 0 0', padding: '10px 18px 40px',
        background: t.mode === 'dark' ? '#12161C' : '#FFFFFF',
        boxShadow: '0 -20px 60px rgba(0,0,0,0.45)',
      }}>
        <div style={{ width: 40, height: 4, borderRadius: 99, background: t.hairline2, margin: '6px auto 14px' }}></div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '4px 10px 4px 8px', borderRadius: 99,
            background: 'rgba(242,169,59,0.12)', border: '0.5px solid rgba(242,169,59,0.30)',
          }}>
            <span style={{ width: 6, height: 6, borderRadius: 99, background: CX.amber }}></span>
            <span style={{ fontFamily: CX_MONO, fontSize: 10, color: CX.amber, letterSpacing: '0.10em', fontWeight: 600 }}>
              62% CONFIDENCE
            </span>
          </span>
          <span style={{ fontFamily: CX_MONO, fontSize: 10, color: t.muted, letterSpacing: '0.10em' }}>NEEDS A LOOK</span>
        </div>

        <div style={{
          marginTop: 12, fontFamily: CX_FONT, fontSize: 21, fontWeight: 600,
          letterSpacing: '-0.03em', color: t.ink, lineHeight: 1.15,
        }}>
          Which one is it?
        </div>
        <div style={{ marginTop: 4, fontFamily: CX_FONT, fontSize: 13, color: t.muted, lineHeight: 1.45 }}>
          The photo matched a few dishes. Pick the closest — you can fine-tune grams after.
        </div>

        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {options.map((o) => (
            <div key={o.name} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '12px 14px', borderRadius: 16,
              background: o.sel
                ? (t.mode === 'dark' ? 'rgba(25,211,217,0.08)' : 'rgba(25,211,217,0.07)')
                : (t.mode === 'dark' ? 'rgba(255,255,255,0.03)' : '#FBFAF6'),
              border: `1px solid ${o.sel ? 'rgba(25,211,217,0.45)' : t.hairline}`,
              cursor: 'pointer',
            }}>
              <span style={{
                width: 18, height: 18, borderRadius: 99, boxSizing: 'border-box',
                border: o.sel ? 'none' : `1.5px solid ${t.hairline2}`,
                background: o.sel ? CX.gradCool : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                {o.sel && <CXIcon name="check" size={11} color="#0B0D10" stroke={2.6}/>}
              </span>
              <span style={{ flex: 1, fontFamily: CX_FONT, fontSize: 14.5, fontWeight: 600, color: t.ink, letterSpacing: '-0.01em' }}>
                {o.name}
              </span>
              <CXNum size={13} color={t.ink2}>{o.kcal} kcal</CXNum>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1.6fr', gap: 10 }}>
          <button style={{
            height: 50, borderRadius: 16, cursor: 'pointer',
            background: 'transparent', border: `1px solid ${t.hairline2}`,
            fontFamily: CX_FONT, fontSize: 14, fontWeight: 600, color: t.ink2,
          }}>None of these</button>
          <button style={{
            height: 50, borderRadius: 16, border: 'none', cursor: 'pointer',
            background: CX.gradAI, color: '#0B0D10',
            fontFamily: CX_FONT, fontSize: 14.5, fontWeight: 600, letterSpacing: '-0.01em',
            boxShadow: '0 10px 26px rgba(25,211,217,0.30), inset 0 0 0 1px rgba(255,255,255,0.18)',
          }}>Confirm · 620 kcal</button>
        </div>

        <div style={{
          marginTop: 12, textAlign: 'center',
          fontFamily: CX_MONO, fontSize: 10, color: t.muted,
          letterSpacing: '0.16em', textTransform: 'uppercase', cursor: 'pointer',
        }}>Ask {CX_APPNAME} AI instead →</div>
      </div>
    </div>
  );
}

// ————————————————————————————————————————————————
// 3 · Manual add — search fallback when the camera can't (or shouldn't) be used.
function CXManualAddScreen({ mode = 'dark' }) {
  const t = cxTheme(mode);
  const foods = [
    { name: 'Chicken Rice Bowl', meta: 'Recent · 1 bowl · 420 g', kcal: 620 },
    { name: 'Protein Yogurt',    meta: 'Recent · 1 cup · 200 g',  kcal: 180 },
    { name: 'Oatmeal w/ Berries',meta: 'Favorite · 1 serving',    kcal: 320 },
    { name: 'Espresso · Oat Milk', meta: 'Favorite · double shot', kcal: 45 },
    { name: 'Greek Salad',       meta: 'Custom food',             kcal: 260 },
  ];
  const chips = ['Recent', 'Favorites', 'My foods', 'Meals'];
  return (
    <div style={{
      position: 'relative', width: '100%', height: '100%',
      background: t.bg, overflow: 'hidden', fontFamily: CX_FONT, color: t.ink,
    }}>
      {/* Header */}
      <div style={{ padding: '54px 20px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <CXLabel color={t.muted}>Camera-free logging</CXLabel>
          <div style={{ fontSize: 26, fontWeight: 600, letterSpacing: '-0.035em', lineHeight: 1.1, marginTop: 4 }}>Add food</div>
        </div>
        <div style={{
          width: 36, height: 36, borderRadius: 999,
          background: t.card, border: `0.5px solid ${t.hairline2}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
        }}>
          <CXIcon name="close" size={16} color={t.ink2}/>
        </div>
      </div>

      {/* Search */}
      <div style={{ padding: '14px 16px 0' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '13px 14px', borderRadius: 16,
          background: t.card, border: `1px solid ${t.hairline2}`,
          boxShadow: t.shadow,
        }}>
          <CXIcon name="lens" size={17} color={t.muted}/>
          <span style={{ flex: 1, fontSize: 14.5, color: t.muted }}>Search foods, brands, meals…</span>
          <CXIcon name="mic" size={16} color={t.muted}/>
        </div>
      </div>

      {/* Filter chips */}
      <div style={{ display: 'flex', gap: 8, padding: '12px 16px 4px' }}>
        {chips.map((c, i) => (
          <span key={c} style={{
            padding: '7px 13px', borderRadius: 999,
            fontFamily: CX_FONT, fontSize: 12.5, fontWeight: 600,
            background: i === 0 ? (t.mode === 'dark' ? 'rgba(255,255,255,0.92)' : '#0B0D10') : t.chip,
            color: i === 0 ? (t.mode === 'dark' ? '#0B0D10' : '#F2F3F5') : t.ink2,
            border: i === 0 ? 'none' : `0.5px solid ${t.hairline}`,
            cursor: 'pointer',
          }}>{c}</span>
        ))}
      </div>

      {/* Results */}
      <div style={{ padding: '8px 16px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {foods.map((f) => (
          <div key={f.name} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '12px 14px', borderRadius: 18,
            background: t.card, border: `0.5px solid ${t.hairline}`, boxShadow: t.shadow,
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14.5, fontWeight: 600, letterSpacing: '-0.01em', color: t.ink }}>{f.name}</div>
              <div style={{ fontFamily: CX_MONO, fontSize: 10.5, color: t.muted, marginTop: 3, letterSpacing: '0.03em' }}>{f.meta}</div>
            </div>
            <CXNum size={13} color={t.ink2}>{f.kcal}</CXNum>
            <button style={{
              width: 34, height: 34, borderRadius: 999, border: `1px solid ${t.hairline2}`,
              background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', flexShrink: 0,
            }}>
              <CXIcon name="plus" size={16} color={t.ink}/>
            </button>
          </div>
        ))}
      </div>

      {/* Create custom */}
      <div style={{ position: 'absolute', left: 16, right: 16, bottom: 118 }}>
        <button style={{
          width: '100%', height: 50, borderRadius: 16, cursor: 'pointer',
          background: 'transparent', border: `1px dashed ${t.hairline2}`,
          fontFamily: CX_FONT, fontSize: 13.5, fontWeight: 600, color: t.ink2,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
          <CXIcon name="plus" size={15} color={t.ink2}/>
          Create custom food
        </button>
      </div>

      <CXBottomNav active="today" theme={t}/>
    </div>
  );
}

Object.assign(window, { CXPermissionScreen, CXScanReviewScreen, CXManualAddScreen });
