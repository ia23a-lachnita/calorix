// Scan / camera home screen — default landing.
// Camera-first, large capture button, processing state visible after capture.

// Real photo of a meal — used as the camera's viewfinder background.
// The dark vignette around the edges helps the white camera chrome read.
function CXCameraPlaceholder({ label = 'CAMERA PREVIEW' }) {
  return (
    <div style={{
      position: 'absolute', inset: 0, overflow: 'hidden',
      background: '#0a0d12',
    }}>
      <img
        src="../assets/food/chicken_rice_bowl_highformat.jpg"
        alt=""
        style={{
          position: 'absolute', inset: 0,
          width: '100%', height: '100%', objectFit: 'cover',
          // Slight saturation + contrast for that "camera preview" pop
          filter: 'saturate(1.05) contrast(1.02)',
        }}
      />
      {/* Subtle vignette so chrome stays readable */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background:
          'radial-gradient(70% 80% at 50% 50%, transparent 55%, rgba(0,0,0,0.25) 90%)',
      }}/>
      {/* placeholder watermark */}
      <div style={{
        position: 'absolute', bottom: 110, left: 0, right: 0, textAlign: 'center',
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
      position: 'absolute', width: 32, height: 32,
      borderTop: '2.5px solid #F2F3F5', borderLeft: '2.5px solid #F2F3F5',
      borderTopLeftRadius: 6,
      transform: rot, opacity: 0.95,
      filter: glow
        ? 'drop-shadow(0 0 8px rgba(25,211,217,0.85)) drop-shadow(0 0 2px rgba(0,0,0,0.4))'
        : 'drop-shadow(0 1px 2px rgba(0,0,0,0.45))',
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

// Unified liquid-glass chip used by all the camera chrome buttons (flash,
// profile, library, recent). One implementation = uniform glass treatment.
//   round  → 48×48 circle (library / recent)
//   square → 36×36 square-ish (profile button, icon only)
//   default → pill (flash · Auto)
// Layered like IOSGlassPill: tint + blur + inset shine + hairline border.
function CXGlassChip({ children, dark = true, chipBg, chipBorder, round = false, square = false }) {
  const isRound = round;
  const w = isRound ? 48 : square ? 36 : 'auto';
  const h = isRound ? 48 : 36;
  const padding = isRound || square ? 0 : '0 12px';
  const radius = 999;
  const shine = dark
    ? 'inset 1.5px 1.5px 1px rgba(255,255,255,0.16), inset -1px -1px 1px rgba(255,255,255,0.06)'
    : 'inset 1.5px 1.5px 1px rgba(255,255,255,0.85), inset -1px -1px 1px rgba(255,255,255,0.45)';
  return (
    <div style={{
      position: 'relative', width: w, height: h, padding,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
      borderRadius: radius,
      fontFamily: CX_FONT, fontSize: 12, fontWeight: 500,
      color: dark ? '#F2F3F5' : '#0B0D10',
      isolation: 'isolate',
    }}>
      {/* tint + backdrop blur */}
      <div style={{
        position: 'absolute', inset: 0, borderRadius: radius,
        background: chipBg,
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        zIndex: -1,
      }}/>
      {/* inset shine + hairline */}
      <div style={{
        position: 'absolute', inset: 0, borderRadius: radius,
        boxShadow: shine,
        border: `0.5px solid ${chipBorder}`,
        pointerEvents: 'none', zIndex: -1,
      }}/>
      {children}
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

      {/* top chrome — liquid-glass pills */}
      <div style={{
        position: 'absolute', top: 56, left: 0, right: 0,
        display: 'flex', justifyContent: 'space-between', padding: '0 18px',
        zIndex: 5,
      }}>
        <CXGlassChip dark={isDark} chipBg={chipBg} chipBorder={chipBorder}>
          <CXIcon name="flash" size={14} color={chipInk}/>
          <span style={{ color: chipInk }}>Flash · Auto</span>
        </CXGlassChip>
        <CXGlassChip dark={isDark} chipBg={chipBg} chipBorder={chipBorder} square>
          <CXIcon name="profile" size={14} color={chipInk}/>
        </CXGlassChip>
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
        display: 'flex', justifyContent: 'center', pointerEvents: 'none',
      }}>
        <span style={{
          fontFamily: CX_MONO, fontSize: 10, letterSpacing: '0.20em', textTransform: 'uppercase',
          color: 'rgba(255,255,255,0.80)',
          padding: '7px 14px', borderRadius: 999,
          background: 'rgba(0,0,0,0.28)',
          backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
        }}>{state === 'capturing' ? 'Analyzing…' : 'Frame your meal · tap once'}</span>
      </div>

      {/* capture controls row above bottom nav */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 150,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 48,
        zIndex: 6,
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          <CXGlassChip dark={isDark} chipBg={chipBg} chipBorder={chipBorder} round>
            <CXIcon name="gallery" size={20} color={chipInk}/>
          </CXGlassChip>
          <CXLabel color={isDark ? 'rgba(242,243,245,0.55)' : 'rgba(242,243,245,0.78)'}>Library</CXLabel>
        </div>

        <CaptureButton state={state} mode={mode}/>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          <CXGlassChip dark={isDark} chipBg={chipBg} chipBorder={chipBorder} round>
            <CXIcon name="history" size={20} color={chipInk}/>
          </CXGlassChip>
          <CXLabel color={isDark ? 'rgba(242,243,245,0.55)' : 'rgba(242,243,245,0.78)'}>Recent</CXLabel>
        </div>
      </div>

      {/* status pill removed — it was redundant; the capture button glow is enough cue. */}

      {/* Bottom nav floats over camera — keep the glass treatment in both modes
          since the food background is real and visible behind. */}
      <CXBottomNav active="scan" theme={t} floating={true}/>
    </div>
  );
}

function CaptureButton({ state, mode = 'dark' }) {
  const isDark = mode !== 'light';
  const size = 80;
  const outerW = 6;
  const animW  = 2.5;
  // Outer ring matches mode — same alpha as the centre square so the two
  // always read at the same weight.
  const outerColor = isDark
    ? 'rgba(11,13,16,0.92)'
    : 'rgba(242,243,245,0.92)';
  // Idle animation ring — very strong-transparent grey, mode-agnostic.
  const idleAnimColor = 'rgba(140,140,140,0.06)';
  // Capturing: outer ring becomes a spinning conic gradient.
  const capturingRing =
    `conic-gradient(from 0deg, ${CX.blue}, ${CX.cyan}, ${CX.green}, ${CX.blue})`;

  // Mask that turns a filled disc into a ring of the requested thickness.
  // closest-side anchors the gradient to the element's half-width (not the
  // diagonal-to-corner default), so the ring is exactly `thicknessPx` wide.
  const ringMask = (thicknessPx) =>
    `radial-gradient(circle closest-side, transparent calc(100% - ${thicknessPx}px), #000 calc(100% - ${thicknessPx}px))`;

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      {/* Outer ring — same colour and thickness across states (only the
          animation ring animates). */}
      <div style={{
        position: 'absolute', inset: 0, borderRadius: 999,
        background: outerColor,
        backdropFilter: 'blur(10px) saturate(140%)',
        WebkitBackdropFilter: 'blur(10px) saturate(140%)',
        WebkitMask: ringMask(outerW), mask: ringMask(outerW),
        boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
      }}/>

      {/* Animation ring — touches the outer's inner edge. Idle = grey glass;
          capturing = spinning conic gradient. */}
      <div style={{
        position: 'absolute', inset: outerW, borderRadius: 999,
        background: state === 'capturing' ? capturingRing : idleAnimColor,
        WebkitMask: ringMask(animW), mask: ringMask(animW),
        animation: state === 'capturing' ? 'cxCapSpin 1.0s linear infinite' : 'none',
      }}/>

      {/* Inner core — gradient circle when idle; small rounded square in the
          outer-ring colour when capturing (a literal "recording" stop glyph). */}
      <div style={{
        position: 'absolute', top: '50%', left: '50%',
        transform: 'translate(-50%,-50%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {state === 'idle' ? (
          <div style={{
            width: 30, height: 30, borderRadius: 999,
            background: CX.gradAI,
            boxShadow: '0 0 18px rgba(25,211,217,0.50), inset 0 0 0 1px rgba(255,255,255,0.20)',
          }}/>
        ) : (
          <div style={{
            width: 24, height: 24, borderRadius: 6,
            background: outerColor,
            boxShadow: '0 0 14px rgba(25,211,217,0.30)',
          }}/>
        )}
      </div>

      <style>{`@keyframes cxCapSpin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

Object.assign(window, { CXScanScreen, CXCameraPlaceholder, CXReticle, CXChip, CXGlassChip });
