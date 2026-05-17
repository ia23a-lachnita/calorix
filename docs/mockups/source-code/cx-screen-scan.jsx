// Scan / camera home screen — default landing.
// Camera-first, large capture button, processing state visible after capture.

// Subtle "food in viewfinder" placeholder — striped warm gradient, no real imagery.
function CXCameraPlaceholder({ label = 'CAMERA PREVIEW' }) {
  return (
    <div style={{
      position: 'absolute', inset: 0,
      background: `
        radial-gradient(60% 50% at 50% 55%, #c1a283 0%, #8a6b4c 45%, #2a221d 100%),
        repeating-linear-gradient(45deg, rgba(0,0,0,0.07) 0 6px, transparent 6px 14px)
      `,
      backgroundBlendMode: 'overlay',
    }}>
      {/* simulated plate */}
      <div style={{
        position: 'absolute', left: '50%', top: '52%', transform: 'translate(-50%,-50%)',
        width: 280, height: 280, borderRadius: 999,
        background: 'radial-gradient(closest-side, #efe6d8 0%, #d6c8b2 70%, #aa8e6d 100%)',
        boxShadow: '0 30px 60px rgba(0,0,0,0.35), inset 0 0 30px rgba(0,0,0,0.15)',
      }}>
        <div style={{
          position: 'absolute', inset: 26, borderRadius: 999,
          background: 'radial-gradient(closest-side, #c89970 20%, #8a5d36 70%)',
          boxShadow: 'inset 0 -10px 30px rgba(0,0,0,0.3)',
        }}/>
        <div style={{
          position: 'absolute', top: 38, left: 50, width: 60, height: 18, borderRadius: 99,
          background: '#fff9ec', opacity: 0.6, transform: 'rotate(-20deg)',
        }}/>
      </div>
      {/* placeholder watermark */}
      <div style={{
        position: 'absolute', bottom: 18, left: 0, right: 0, textAlign: 'center',
        fontFamily: CX_MONO, fontSize: 9, letterSpacing: '0.24em',
        color: 'rgba(255,255,255,0.35)',
      }}>{label}</div>
    </div>
  );
}

// Reticle: 4 corner brackets + thin center crosshair
function CXReticle({ size = 280, glow = false }) {
  const corner = (rot) => (
    <div style={{
      position: 'absolute', width: 28, height: 28,
      borderTop: '1.5px solid #F2F3F5', borderLeft: '1.5px solid #F2F3F5',
      transform: rot, opacity: 0.85,
      filter: glow ? 'drop-shadow(0 0 6px rgba(25,211,217,0.6))' : 'none',
    }}/>
  );
  return (
    <div style={{
      position: 'absolute', left: '50%', top: '50%',
      width: size, height: size, transform: 'translate(-50%,-50%)',
      pointerEvents: 'none',
    }}>
      <div style={{ position: 'absolute', top: 0, left: 0 }}>{corner('rotate(0)')}</div>
      <div style={{ position: 'absolute', top: 0, right: 0 }}>{corner('scaleX(-1)')}</div>
      <div style={{ position: 'absolute', bottom: 0, left: 0 }}>{corner('scaleY(-1)')}</div>
      <div style={{ position: 'absolute', bottom: 0, right: 0 }}>{corner('scale(-1,-1)')}</div>
    </div>
  );
}

function CXChip({ children, dark = true, glass = true, style = {} }) {
  return (
    <div style={{
      height: 36, padding: '0 12px', borderRadius: 999,
      display: 'inline-flex', alignItems: 'center', gap: 6,
      background: glass ? (dark ? 'rgba(20,24,30,0.45)' : 'rgba(255,255,255,0.85)') : 'transparent',
      backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
      border: `0.5px solid ${dark ? 'rgba(255,255,255,0.12)' : 'rgba(11,13,16,0.08)'}`,
      color: dark ? '#F2F3F5' : '#0B0D10',
      fontFamily: CX_FONT, fontSize: 12, fontWeight: 500,
      ...style,
    }}>{children}</div>
  );
}

// The Scan screen.
function CXScanScreen({ state = 'idle', mode = 'dark' }) {
  const t = cxTheme(mode);
  const isDark = mode !== 'light';
  // Camera bg matches theme
  const chipBg     = isDark ? 'rgba(20,24,30,0.55)' : 'rgba(255,255,255,0.72)';
  const chipBorder = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(11,13,16,0.12)';
  const chipInk    = isDark ? '#F2F3F5' : '#0B0D10';
  const segBg      = isDark ? 'rgba(20,24,30,0.55)' : 'rgba(255,255,255,0.72)';
  const segBorder  = isDark ? 'rgba(255,255,255,0.10)' : 'rgba(11,13,16,0.10)';
  const hintColor  = isDark ? 'rgba(242,243,245,0.55)' : 'rgba(242,243,245,0.75)';
  return (
    <div style={{
      position: 'relative', width: '100%', height: '100%',
      background: t.bg, overflow: 'hidden',
    }}>
      <CXCameraPlaceholder />

      {/* darkening vignette */}
      <div style={{
        position: 'absolute', inset: 0,
        pointerEvents: 'none',
      }}/>

      {/* top chrome */}
      <div style={{
        position: 'absolute', top: 56, left: 0, right: 0,
        display: 'flex', justifyContent: 'space-between', padding: '0 18px',
        zIndex: 5,
      }}>
        <CXChip dark={isDark} style={{ background: chipBg, border: `0.5px solid ${chipBorder}` }}>
          <CXIcon name="flash" size={14} color={chipInk}/>
          <span style={{ color: chipInk }}>Flash · Auto</span>
        </CXChip>
        <CXChip dark={isDark} style={{ background: chipBg, border: `0.5px solid ${chipBorder}` }}>
          <CXIcon name="profile" size={14} color={chipInk}/>
        </CXChip>
      </div>

      {/* mode segmented control */}
      <div style={{
        position: 'absolute', top: 110, left: '50%', transform: 'translateX(-50%)', zIndex: 5,
      }}>
        <div style={{
          display: 'flex', padding: 4, borderRadius: 999,
          background: segBg,
          backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
          border: `0.5px solid ${segBorder}`,
        }}>
          {['Meal', 'Barcode', 'Label'].map((m, i) => (
            <div key={m} style={{
              padding: '7px 14px', borderRadius: 999,
              fontFamily: CX_FONT, fontSize: 12, fontWeight: 600,
              background: i === 0 ? (isDark ? 'rgba(255,255,255,0.95)' : 'rgba(11,13,16,0.90)') : 'transparent',
              color: i === 0 ? (isDark ? '#0B0D10' : '#F2F3F5') : (isDark ? 'rgba(255,255,255,0.7)' : 'rgba(11,13,16,0.65)'),
            }}>{m}</div>
          ))}
        </div>
      </div>

      {/* center reticle */}
      <CXReticle glow={state !== 'idle'}/>

      {/* AI scanning shimmer overlay when capturing — scans top → bottom */}
      {state === 'capturing' && (
        <div style={{
          position: 'absolute', left: '50%', top: '50%',
          width: 280, height: 280, transform: 'translate(-50%,-50%)',
          borderRadius: 16, overflow: 'hidden', pointerEvents: 'none',
        }}>
          <div style={{
            position: 'absolute', left: 0, right: 0, height: '60%',
            background: 'linear-gradient(180deg, transparent 0%, rgba(25,211,217,0.55) 50%, transparent 100%)',
            mixBlendMode: 'screen',
            animation: 'cxScanLine 1.6s cubic-bezier(.45,0,.55,1) infinite',
          }}/>
          {/* glowing scan-line */}
          <div style={{
            position: 'absolute', left: 0, right: 0, height: 2,
            background: CX.cyan, opacity: 0.95,
            boxShadow: `0 0 16px ${CX.cyan}, 0 0 32px ${CX.cyan}`,
            animation: 'cxScanEdge 1.6s cubic-bezier(.45,0,.55,1) infinite',
          }}/>
        </div>
      )}
      <style>{`
        @keyframes cxScanLine {
          0%   { transform: translateY(-100%); }
          100% { transform: translateY(100%); }
        }
        @keyframes cxScanEdge {
          0%   { top: 0%; }
          100% { top: 100%; }
        }
      `}</style>

      {/* hint text */}
      <div style={{
        position: 'absolute', left: 0, right: 0, top: 'calc(50% + 160px)',
        textAlign: 'center', pointerEvents: 'none',
      }}>
      </div>

      {/* capture controls row above bottom nav */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 150,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 48,
        zIndex: 6,
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          <CXChip dark={isDark} style={{
            width: 48, height: 48, borderRadius: 999, padding: 0, justifyContent: 'center',
            background: chipBg, border: `0.5px solid ${chipBorder}`
          }}>
            <CXIcon name="gallery" size={20} color={chipInk}/>
          </CXChip>
          <CXLabel color={isDark ? 'rgba(242,243,245,0.55)' : 'rgba(242,243,245,0.78)'}>Library</CXLabel>
        </div>

        <CaptureButton state={state} mode={mode}/>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          <CXChip dark={isDark} style={{
            width: 48, height: 48, borderRadius: 999, padding: 0, justifyContent: 'center',
            background: chipBg, border: `0.5px solid ${chipBorder}`
          }}>
            <CXIcon name="flame" size={20} color={chipInk}/>
          </CXChip>
          <CXLabel color={isDark ? 'rgba(242,243,245,0.55)' : 'rgba(242,243,245,0.78)'}>Recent</CXLabel>
        </div>
      </div>

      {/* status pill removed — it was redundant; the capture button glow is enough cue. */}

      {/* Bottom nav floats over camera — theme follows global mode */}
      <CXBottomNav active="scan" theme={t} floating={!isDark}/>
    </div>
  );
}

function CaptureButton({ state, mode = 'dark' }) {
  const t = cxTheme(mode);
  const isDark = mode !== 'light';
  // Camera bg matches theme; keep the dark-mode ring subtle so it does not
  // read as an extra white halo around the capture button.
  const outerRing = state === 'capturing'
    ? `conic-gradient(from 0deg, ${CX.blue}, ${CX.cyan}, ${CX.green}, ${CX.blue})`
    : isDark ? 'rgba(255,255,255,0.10)' : 'rgba(11,13,16,0.58)';
  return (
    <div style={{ position: 'relative', width: 92, height: 92 }}>
      <div style={{
        position: 'absolute', inset: 0, borderRadius: 999,
        background: outerRing,
        padding: 3,
        animation: state === 'capturing' ? 'cxSpin 1.2s linear infinite' : 'none',
      }}>
        <div style={{
          width: '100%', height: '100%', borderRadius: 999,
          background: t.cardAlt,
        }}/>
      </div>
      <div style={{
        position: 'absolute', inset: 8, borderRadius: 999,
        background: 'transparent',
        boxShadow: 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {state === 'idle' ? (
          <div style={{
            width: 28, height: 28, borderRadius: 999,
            background: CX.gradAI, opacity: 0.95,
            boxShadow: '0 0 18px rgba(25,211,217,0.45)',
          }}/>
        ) : (
          <div style={{
            width: 28, height: 28, borderRadius: 6,
            background: isDark ? 'rgba(242,243,245,0.90)' : '#0B0D10',
            boxShadow: '0 0 18px rgba(25,211,217,0.35)',
          }}/>
        )}
      </div>
      <style>{`@keyframes cxSpin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

Object.assign(window, { CXScanScreen, CXCameraPlaceholder, CXReticle, CXChip });
