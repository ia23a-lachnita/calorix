// Calorix loading / splash screen — shown when the app first opens
// while the camera + cloud session warm up. Premium AI-fitness feel:
// soft theme-aware backdrop, halo + ring around the brand mark,
// determinate progress with status copy, no spinners-only.

const { useState: useStateL, useEffect: useEffectL } = React;

function CXLoadingScreen({ mode = 'light' }) {
  const t = cxTheme(mode);
  const dark = mode === 'dark';

  // Cycle through the status messages a real cold start would surface.
  const STAGES = [
    { pct: 18, label: 'WAKING SENSORS' },
    { pct: 46, label: 'CONNECTING · AI CLOUD' },
    { pct: 74, label: 'SYNCING TODAY' },
    { pct: 96, label: 'READY' },
  ];
  const [stage, setStage] = useStateL(0);
  useEffectL(() => {
    const id = setInterval(() => setStage((s) => (s + 1) % STAGES.length), 1100);
    return () => clearInterval(id);
  }, []);
  const cur = STAGES[stage];

  // Backdrop — two soft accent halos behind a deep, soft surface.
  const backdrop = dark
    ? `radial-gradient(60% 50% at 30% 22%, rgba(58,91,255,0.22) 0%, transparent 65%),
       radial-gradient(60% 50% at 80% 78%, rgba(31,204,116,0.18) 0%, transparent 65%),
       radial-gradient(80% 80% at 50% 50%, #0F1319 0%, #0A0D11 100%)`
    : `radial-gradient(60% 50% at 30% 22%, rgba(58,91,255,0.18) 0%, transparent 65%),
       radial-gradient(60% 50% at 80% 78%, rgba(25,211,217,0.16) 0%, transparent 65%),
       radial-gradient(80% 80% at 50% 50%, #F7F5F0 0%, #ECE9E3 100%)`;

  return (
    <div style={{
      position: 'relative', width: '100%', height: '100%',
      background: backdrop, color: t.ink, overflow: 'hidden',
      fontFamily: CX_FONT,
    }}>
      {/* Subtle dot mesh — bigger pitch so it reads as texture, not noise.
          In light mode we slightly darken so the mesh is legible against
          the warm canvas; in dark mode we lift it just enough. */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        opacity: dark ? 0.30 : 0.32,
        backgroundImage: dark
          ? `radial-gradient(rgba(255,255,255,0.55) 1.1px, transparent 1.5px)`
          : `radial-gradient(rgba(11,13,16,0.42) 1.1px, transparent 1.5px)`,
        backgroundSize: '14px 14px',
        backgroundPosition: '0 0',
        maskImage: 'radial-gradient(120% 120% at 50% 50%, #000 60%, transparent 100%)',
        WebkitMaskImage: 'radial-gradient(120% 120% at 50% 50%, #000 60%, transparent 100%)',
      }}/>

      {/* Top status row — system-like */}
      <div style={{
        position: 'absolute', top: 64, left: 0, right: 0,
        display: 'flex', justifyContent: 'center',
      }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '6px 12px 6px 9px', borderRadius: 999,
          background: dark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.72)',
          border: `0.5px solid ${dark ? 'rgba(255,255,255,0.10)' : 'rgba(11,13,16,0.07)'}`,
          backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: 99, background: CX.green,
            boxShadow: `0 0 0 3px ${CX.green}33`,
          }}/>
          <span style={{
            fontFamily: CX_MONO, fontSize: 10.5, letterSpacing: '0.16em',
            color: t.ink2, textTransform: 'uppercase',
          }}>v1.0 · ios</span>
        </div>
      </div>

      {/* Center: brand mark + ring */}
      <div style={{
        position: 'absolute', inset: 0, display: 'flex',
        alignItems: 'center', justifyContent: 'center', flexDirection: 'column',
      }}>
        <div style={{ position: 'relative', width: 196, height: 196 }}>
          {/* Pulsing halo */}
          <div style={{
            position: 'absolute', inset: -12, borderRadius: 999,
            background: 'radial-gradient(closest-side, rgba(25,211,217,0.40), transparent 70%)',
            filter: 'blur(10px)',
            animation: 'cxHalo 2.6s ease-in-out infinite',
          }}/>

          {/* Track ring */}
          <svg width={196} height={196} style={{ position: 'absolute', inset: 0 }}>
            <defs>
              <linearGradient id="cxLoad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#3A5BFF"/>
                <stop offset="55%" stopColor="#19D3D9"/>
                <stop offset="100%" stopColor="#1FCC74"/>
              </linearGradient>
            </defs>
            <circle cx={98} cy={98} r={84} fill="none"
              stroke={dark ? 'rgba(255,255,255,0.06)' : 'rgba(11,13,16,0.06)'} strokeWidth={2}/>
            {/* Tick marks */}
            {Array.from({ length: 60 }).map((_, i) => {
              const a = (i / 60) * Math.PI * 2;
              const x1 = 98 + Math.cos(a) * 70;
              const y1 = 98 + Math.sin(a) * 70;
              const x2 = 98 + Math.cos(a) * (i % 5 === 0 ? 64 : 67);
              const y2 = 98 + Math.sin(a) * (i % 5 === 0 ? 64 : 67);
              return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
                stroke={dark ? 'rgba(255,255,255,0.18)' : 'rgba(11,13,16,0.18)'}
                strokeWidth={i % 5 === 0 ? 1 : 0.5}/>;
            })}
            {/* Animated arc — rotation applied to a <g> so transform-origin
                is honored. Static −90° brings the arc start to the top. */}
            <g style={{ transformOrigin: '98px 98px', animation: 'cxSpin 1.8s linear infinite' }}>
              <circle cx={98} cy={98} r={84} fill="none"
                stroke="url(#cxLoad)" strokeWidth={2.5} strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 84 * 0.28} ${2 * Math.PI * 84}`}
                transform="rotate(-90 98 98)"/>
            </g>
          </svg>

          {/* Logo center plate */}
          <div style={{
            position: 'absolute', inset: 30, borderRadius: 999,
            background: dark ? '#0E1217' : '#FFFFFF',
            border: `0.5px solid ${dark ? 'rgba(255,255,255,0.10)' : 'rgba(11,13,16,0.06)'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: dark
              ? '0 18px 40px rgba(0,0,0,0.45), inset 0 0 0 1px rgba(255,255,255,0.04)'
              : '0 18px 40px rgba(11,13,16,0.10), inset 0 0 0 1px rgba(255,255,255,0.8)',
          }}>
            <CXLogo size={68}/>
          </div>
        </div>

        {/* Wordmark */}
        <div style={{ marginTop: 28 }}>
          <CXWordmark height={32} mode={mode}/>
        </div>
        <div style={{
          fontFamily: CX_MONO, fontSize: 10.5, color: t.muted,
          letterSpacing: '0.22em', marginTop: 10, textTransform: 'uppercase',
        }}>Snap · Track · Stay on target</div>
      </div>

      {/* Bottom: status + progress */}
      <div style={{
        position: 'absolute', left: 24, right: 24, bottom: 56,
      }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
          marginBottom: 10,
        }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            fontFamily: CX_MONO, fontSize: 10.5, color: t.ink2,
            letterSpacing: '0.16em', textTransform: 'uppercase',
          }}>
            <span style={{
              width: 6, height: 6, borderRadius: 99, background: CX.cyan,
              boxShadow: `0 0 0 3px ${CX.cyan}33`,
              animation: 'cxDot 1.2s ease-in-out infinite',
            }}/>
            {cur.label}
          </div>
          <div style={{
            fontFamily: CX_MONO, fontSize: 11, color: t.ink,
            fontVariantNumeric: 'tabular-nums', fontWeight: 600,
          }}>{cur.pct}%</div>
        </div>

        <div style={{
          height: 4, borderRadius: 999,
          background: dark ? 'rgba(255,255,255,0.06)' : 'rgba(11,13,16,0.07)',
          overflow: 'hidden', position: 'relative',
        }}>
          <div style={{
            height: '100%', borderRadius: 999, width: `${cur.pct}%`,
            background: CX.gradAI,
            transition: 'width 900ms cubic-bezier(.2,.7,.2,1)',
            boxShadow: '0 0 12px rgba(25,211,217,0.45)',
          }}/>
        </div>

        <div style={{
          marginTop: 14, display: 'flex', justifyContent: 'space-between',
          fontFamily: CX_MONO, fontSize: 9.5, color: t.muted, letterSpacing: '0.14em',
          textTransform: 'uppercase',
        }}>
          <span>{CX_APPNAME} Engine · v1.0</span>
          <span>Secure · End-to-end</span>
        </div>
      </div>

      <style>{`
        @keyframes cxSpin { to { transform: rotate(360deg); } }
        @keyframes cxHalo { 0%,100% { transform: scale(1); opacity: 0.65; } 50% { transform: scale(1.06); opacity: 0.95; } }
        @keyframes cxDot { 0%,100% { opacity: 0.6; } 50% { opacity: 1; } }
      `}</style>
    </div>
  );
}

Object.assign(window, { CXLoadingScreen });
