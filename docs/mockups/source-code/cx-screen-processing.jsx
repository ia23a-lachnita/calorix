// Processing state — capture flowed into a cloud-processing card with skeletons,
// plus a realistic iOS push-notification preview that appears alongside.

function CXProcessingScreen({ mode = 'dark' }) {
  const t = cxTheme(mode);
  const isDark = mode !== 'light';
  const cardBg = isDark ? 'rgba(20,24,30,0.85)' : 'rgba(255,255,255,0.92)';
  const cardBorder = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(11,13,16,0.08)';
  const textPri = isDark ? '#F2F3F5' : '#0B0D10';
  const textSec = isDark ? 'rgba(242,243,245,0.65)' : 'rgba(11,13,16,0.60)';
  const bannerBg = isDark ? 'rgba(28,32,38,0.78)' : 'rgba(255,255,255,0.88)';
  const bannerBorder = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(11,13,16,0.10)';
  const analysisBg = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.82)';
  const analysisBorder = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(11,13,16,0.10)';
  const analysisText = isDark ? '#F2F3F5' : '#0B0D10';
  const veil = isDark
    ? 'linear-gradient(180deg, rgba(8,10,13,0.65) 0%, rgba(8,10,13,0.92) 75%)'
    : 'linear-gradient(180deg, rgba(8,10,13,0.42) 0%, rgba(8,10,13,0.70) 75%)';
  const skelBase = isDark ? '#1c2128' : '#E8E4DC';
  const skelShine = isDark ? '#2a3038' : '#F0EDE6';
  return (
    <div style={{
      position: 'relative', width: '100%', height: '100%',
      background: t.bg, overflow: 'hidden'
    }}>
      <CXCameraPlaceholder label="CAPTURED · 0:01" />
      {/* heavy darken with focus blob */}
      <div style={{
        position: 'absolute', inset: 0,
        background: veil
      }} />

      {/* Top "safe to leave" banner */}
      <div style={{
        position: 'absolute', top: 56, left: 12, right: 12, zIndex: 6
      }}>
        <div style={{
          padding: '10px 14px', borderRadius: 18,
          background: bannerBg,
          backdropFilter: 'blur(40px) saturate(160%)',
          WebkitBackdropFilter: 'blur(40px) saturate(160%)',
          border: `0.5px solid ${bannerBorder}`,
          boxShadow: '0 12px 30px rgba(0,0,0,0.18)',
          display: 'flex', alignItems: 'center', gap: 10
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: 9, flexShrink: 0,
            background: CX.gradAI,
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <CXIcon name="bell" size={16} color="#0B0D10" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: CX_FONT, fontSize: 13, fontWeight: 600, color: textPri }}>
              You can close the app
            </div>
            <div style={{ fontFamily: CX_FONT, fontSize: 11.5, color: textSec }}>
              We’ll push a notification when your scan is ready
            </div>
          </div>
          <div style={{ position: 'relative', width: 16, height: 16 }}>
            <div style={{
              position: 'absolute', inset: 0, borderRadius: 999,
              border: '1.5px solid rgba(25,211,217,0.25)'
            }} />
            <div style={{
              position: 'absolute', inset: 0, borderRadius: 999,
              border: '1.5px solid transparent', borderTopColor: CX.cyan,
              animation: 'cxSpinP 0.9s linear infinite'
            }} />
          </div>
        </div>
      </div>

      {/* Analyzing chip moved closer to card */}
      <div style={{
        position: 'absolute', top: 130, left: 0, right: 0,
        display: 'flex', justifyContent: 'center', zIndex: 5
      }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '6px 12px 6px 9px', borderRadius: 999,
          background: analysisBg,
          border: `0.5px solid ${analysisBorder}`,
          backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)'
        }}>
          <CXIcon name="cloud" size={12} color={CX.cyan} />
          <span style={{ fontFamily: CX_MONO, fontSize: 10.5, color: analysisText, letterSpacing: '0.10em' }}>
            ANALYZING IN CLOUD · EST. 4s
          </span>
        </div>
      </div>

      {/* Processing card */}
      <div style={{
          position: 'absolute', left: 16, right: 16, top: 170,
          borderRadius: 28, padding: 18,
          background: cardBg,
          backdropFilter: 'blur(28px)', WebkitBackdropFilter: 'blur(28px)',
          border: `0.5px solid ${cardBorder}`,
          boxShadow: '0 24px 60px rgba(0,0,0,0.30)'
        }}>
        {/* image skeleton */}
        <div style={{
          width: '100%', aspectRatio: '4 / 3', borderRadius: 18,
          background: `linear-gradient(115deg, ${skelBase} 30%, ${skelShine} 50%, ${skelBase} 70%)`,
          backgroundSize: '300% 100%',
          animation: 'cxShimmer 1.4s ease-in-out infinite',
          marginBottom: 14, position: 'relative', overflow: 'hidden'
        }}>
          <div style={{
            position: 'absolute', top: 12, left: 12,
            display: 'inline-flex', gap: 6, alignItems: 'center',
            padding: '5px 9px', borderRadius: 999,
            background: 'rgba(8,10,13,0.55)', border: '0.5px solid rgba(255,255,255,0.10)',
            fontFamily: CX_MONO, fontSize: 10, color: 'rgba(242,243,245,0.7)', letterSpacing: '0.12em'
          }}>
            <CXIcon name="ai" size={10} color="#19D3D9" /> AI
          </div>
        </div>

        {/* title skeleton */}
        <SkelLine w="60%" h={16} base={skelBase} shine={skelShine} />
        <div style={{ height: 8 }} />
        <SkelLine w="40%" h={11} base={skelBase} shine={skelShine} />

        {/* macro bars loading */}
        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <SkelBar label="Protein" color={CX.blue} base={skelBase} shine={skelShine} />
          <SkelBar label="Carbs" color={CX.cyan} base={skelBase} shine={skelShine} />
          <SkelBar label="Fat" color={CX.green} base={skelBase} shine={skelShine} />
        </div>

        {/* footer line */}
        <div style={{
          marginTop: 16, paddingTop: 12,
          borderTop: `0.5px solid ${cardBorder}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <CXIcon name="cloud" size={16} color={textSec} />
            <span style={{ fontFamily: CX_FONT, fontSize: 12, color: textSec }}>
              Processing in cloud · est. 4s
            </span>
          </div>
          <div style={{
            fontFamily: CX_MONO, fontSize: 10, letterSpacing: '0.16em',
            color: textSec
          }}>3 / 4</div>
        </div>
      </div>

      {/* the redundant in-screen notification was removed — the lock-screen push artboard shows that. */}

      <style>{`
        @keyframes cxShimmer { 0% { background-position: 200% 0; } 100% { background-position: -100% 0; } }
        @keyframes cxSpinP { to { transform: rotate(360deg); } }
      `}</style>

      <CXBottomNav active="scan" theme={isDark ? CX_DARK : CX_LIGHT} floating={!isDark} />
    </div>);

}

function SkelLine({ w = '60%', h = 14, base = '#1c2128', shine = '#2a3038' }) {
  return (
    <div style={{
      width: w, height: h, borderRadius: 8,
      background: `linear-gradient(115deg, ${base} 30%, ${shine} 50%, ${base} 70%)`,
      backgroundSize: '300% 100%',
      animation: 'cxShimmer 1.4s ease-in-out infinite'
    }} />);

}

function SkelBar({ label, color, base = '#1c2128', shine = '#2a3038' }) {
  const labelColor = base === '#1c2128' ? 'rgba(242,243,245,0.55)' : 'rgba(11,13,16,0.45)';
  const trackColor = base === '#1c2128' ? 'rgba(255,255,255,0.06)' : 'rgba(11,13,16,0.06)';
  const dashColor = base === '#1c2128' ? 'rgba(242,243,245,0.35)' : 'rgba(11,13,16,0.35)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{
        width: 48, fontFamily: CX_MONO, fontSize: 10,
        letterSpacing: '0.14em', textTransform: 'uppercase',
        color: labelColor
      }}>{label}</div>
      <div style={{ flex: 1, height: 6, borderRadius: 4, background: trackColor, overflow: 'hidden', position: 'relative' }}>
        <div style={{
          position: 'absolute', inset: 0,
          background: `linear-gradient(90deg, ${color}33, ${color} 50%, ${color}33)`,
          backgroundSize: '200% 100%', animation: 'cxShimmer 1.4s ease-in-out infinite',
          width: '55%'
        }} />
      </div>
      <div style={{
        width: 28, fontFamily: CX_MONO, fontSize: 11,
        color: dashColor
      }}>—g</div>
    </div>);

}

Object.assign(window, { CXProcessingScreen, SkelLine, SkelBar });
