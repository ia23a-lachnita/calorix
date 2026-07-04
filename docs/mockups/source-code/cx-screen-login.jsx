// Calorix login / sign-in screen — first-run / signed-out state.
// Premium, minimal, theme-aware. Email + password with social options,
// and an "explore as guest" affordance.

const { useState: useStateLg } = React;

function CXLoginScreen({ mode = 'light' }) {
  const t = cxTheme(mode);
  const dark = mode === 'dark';

  const [email, setEmail] = useStateLg('elias@example.com');
  const [pwd, setPwd]     = useStateLg('••••••••••');
  const [remember, setR]  = useStateLg(true);

  const surface = dark ? 'rgba(255,255,255,0.04)' : '#FFFFFF';
  const fieldBg = dark ? 'rgba(255,255,255,0.04)' : '#FBFAF6';

  return (
    <div style={{
      position: 'relative', width: '100%', height: '100%',
      background: t.bg, color: t.ink, overflow: 'hidden',
      fontFamily: CX_FONT,
    }}>
      {/* Decorative halos */}
      <div style={{
        position: 'absolute', right: -120, top: -100, width: 360, height: 360, borderRadius: 999,
        background: dark
          ? 'radial-gradient(closest-side, rgba(25,211,217,0.22), transparent 70%)'
          : 'radial-gradient(closest-side, rgba(25,211,217,0.28), transparent 70%)',
        filter: 'blur(18px)', pointerEvents: 'none',
      }}/>
      <div style={{
        position: 'absolute', left: -140, bottom: 140, width: 320, height: 320, borderRadius: 999,
        background: dark
          ? 'radial-gradient(closest-side, rgba(58,91,255,0.18), transparent 70%)'
          : 'radial-gradient(closest-side, rgba(58,91,255,0.18), transparent 70%)',
        filter: 'blur(18px)', pointerEvents: 'none',
      }}/>

      <div style={{
        position: 'relative', zIndex: 2,
        padding: '60px 24px 40px',
        height: '100%', display: 'flex', flexDirection: 'column',
      }}>
        {/* Brand */}
        <div>
          <CXWordmark height={30} mode={mode}/>
        </div>

        {/* Headline */}
        <div style={{ marginTop: 28 }}>
          <CXLabel color={t.muted}>Welcome back</CXLabel>
          <div style={{
            marginTop: 8, fontSize: 30, fontWeight: 600, letterSpacing: '-0.04em',
            lineHeight: 1.05, color: t.ink,
          }}>
            Snap. Track.<br/>Stay on target.
          </div>
          <div style={{
            marginTop: 8, fontSize: 13.5, color: t.muted, lineHeight: 1.45,
            letterSpacing: '-0.005em', maxWidth: 320,
          }}>
            Sign in to sync today's scans, macros and goals across your devices.
          </div>
        </div>

        {/* Form */}
        <div style={{
          marginTop: 22, padding: 14, borderRadius: 22,
          background: surface, border: `0.5px solid ${t.hairline}`,
          boxShadow: t.shadow,
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          <FieldLG theme={t} label="Email" icon="profile" value={email} onChange={setEmail} bg={fieldBg}/>
          <FieldLG theme={t} label="Password" icon="lock" value={pwd}
            onChange={setPwd} bg={fieldBg} type="password" trailing={
            <span style={{
              fontFamily: CX_MONO, fontSize: 10, color: CX.cyan,
              letterSpacing: '0.14em', textTransform: 'uppercase', cursor: 'pointer',
            }}>Show</span>
          }/>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            paddingTop: 2,
          }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
              onClick={() => setR(!remember)}>
              <span style={{
                width: 18, height: 18, borderRadius: 6,
                border: `1px solid ${remember ? 'transparent' : t.hairline2}`,
                background: remember ? CX.gradAI : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {remember && <CXIcon name="check" size={12} color="#0B0D10" stroke={2.4}/>}
              </span>
              <span style={{ fontSize: 12.5, color: t.ink2, fontWeight: 500 }}>Stay signed in</span>
            </label>
            <span style={{
              fontSize: 12.5, color: t.ink2, fontWeight: 500, cursor: 'pointer',
              borderBottom: `0.5px dashed ${t.hairline2}`, paddingBottom: 1,
            }}>Forgot?</span>
          </div>
        </div>

        {/* Primary CTA */}
        <button style={{
          marginTop: 14, height: 54, borderRadius: 18, border: 'none',
          background: CX.gradAI, color: '#0B0D10',
          fontFamily: CX_FONT, fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em',
          boxShadow: '0 12px 30px rgba(25,211,217,0.35), inset 0 0 0 1px rgba(255,255,255,0.18)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          cursor: 'pointer',
        }}>
          Continue
          <span style={{
            width: 24, height: 24, borderRadius: 999, background: 'rgba(11,13,16,0.12)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <CXIcon name="chevR" size={14} color="#0B0D10" stroke={2.2}/>
          </span>
        </button>

        {/* Divider */}
        <div style={{
          marginTop: 18, display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ flex: 1, height: 1, background: t.hairline }}/>
          <span style={{
            fontFamily: CX_MONO, fontSize: 9.5, letterSpacing: '0.18em',
            textTransform: 'uppercase', color: t.muted,
          }}>or continue with</span>
          <span style={{ flex: 1, height: 1, background: t.hairline }}/>
        </div>

        {/* Social */}
        <div style={{
          marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10,
        }}>
          <SocialBtn theme={t} label="Apple" mark={
            <svg viewBox="0 0 24 24" width="18" height="18" fill={t.ink}>
              <path d="M16.4 12.7c0-2.7 2.2-4 2.3-4-1.3-1.8-3.2-2.1-3.9-2.1-1.7-.2-3.2.9-4 .9s-2.1-.9-3.5-.9c-1.8 0-3.5 1-4.4 2.7-1.9 3.2-.5 8 1.4 10.6.9 1.3 2 2.8 3.5 2.7 1.4-.1 1.9-.9 3.6-.9s2.1.9 3.5.8c1.4 0 2.4-1.3 3.3-2.6.7-1 1-1.5 1.6-2.7-3.5-1.3-3.4-3.9-3.4-4.5zM13.7 4.8c.7-.9 1.2-2.1 1.1-3.3-1 0-2.3.7-3 1.5-.6.8-1.2 2-1.1 3.2 1.2 0 2.3-.6 3-1.4z"/>
            </svg>
          }/>
          <SocialBtn theme={t} label="Google" mark={
            <svg viewBox="0 0 24 24" width="18" height="18">
              <path d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.9h5.4c-.2 1.3-.9 2.3-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.4z" fill="#4285F4"/>
              <path d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.7-5.6-4.1H3.1v2.6C4.7 19.8 8.1 22 12 22z" fill="#34A853"/>
              <path d="M6.4 14c-.2-.6-.3-1.3-.3-2s.1-1.3.3-2V7.4H3.1C2.4 8.8 2 10.3 2 12s.4 3.2 1.1 4.6l3.3-2.6z" fill="#FBBC05"/>
              <path d="M12 5.9c1.5 0 2.8.5 3.8 1.5l2.9-2.9C16.9 3 14.7 2 12 2 8.1 2 4.7 4.2 3.1 7.4l3.3 2.6C7.2 7.6 9.4 5.9 12 5.9z" fill="#EA4335"/>
            </svg>
          }/>
        </div>

        {/* Trust + footer */}
        <div style={{ flex: 1 }}/>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
          marginBottom: 14,
        }}>
          <TrustChip theme={t} icon="cloud"  label="No food photos sold"/>
          <TrustChip theme={t} icon="check"  label="GDPR · iCloud sync"/>
        </div>

        <div style={{
          textAlign: 'center', fontSize: 12.5, color: t.ink2,
        }}>
          New to {CX_APPNAME}? <span style={{
            color: t.ink, fontWeight: 600, borderBottom: `1px solid ${t.ink}`, paddingBottom: 1,
          }}>Create an account</span>
        </div>

        <button style={{
          marginTop: 12, height: 44, width: '100%', borderRadius: 14,
          background: 'transparent', border: `1px solid ${t.hairline2}`,
          fontFamily: CX_FONT, fontSize: 13, fontWeight: 600, color: t.ink2,
          letterSpacing: '-0.005em', cursor: 'pointer',
        }}>
          Continue as guest
        </button>
      </div>
    </div>
  );
}

function FieldLG({ theme, label, value, onChange, icon, type = 'text', bg, trailing }) {
  const t = theme;
  return (
    <div style={{
      padding: '10px 12px', borderRadius: 14, background: bg,
      border: `0.5px solid ${t.hairline}`,
      display: 'flex', alignItems: 'center', gap: 10,
    }}>
      <span style={{
        width: 32, height: 32, borderRadius: 9, flexShrink: 0,
        background: t.mode === 'dark' ? 'rgba(255,255,255,0.05)' : '#FFFFFF',
        border: `0.5px solid ${t.hairline}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {icon === 'lock'
          ? <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke={t.ink2} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>
            </svg>
          : <CXIcon name={icon} size={14} color={t.ink2}/>}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: CX_MONO, fontSize: 9.5, letterSpacing: '0.16em',
          textTransform: 'uppercase', color: t.muted,
        }}>{label}</div>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          type={type === 'password' ? 'text' : type}
          style={{
            width: '100%', border: 'none', outline: 'none', background: 'transparent',
            fontFamily: CX_FONT, fontSize: 14, fontWeight: 500,
            color: t.ink, padding: 0, marginTop: 2, letterSpacing: '-0.005em',
          }}
        />
      </div>
      {trailing}
    </div>
  );
}

function SocialBtn({ theme, label, mark }) {
  const t = theme;
  return (
    <button style={{
      height: 48, borderRadius: 14, cursor: 'pointer',
      background: t.mode === 'dark' ? 'rgba(255,255,255,0.04)' : '#FFFFFF',
      border: `0.5px solid ${t.hairline2}`,
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      fontFamily: CX_FONT, fontSize: 13.5, fontWeight: 600, color: t.ink,
      letterSpacing: '-0.01em',
    }}>
      {mark}
      {label}
    </button>
  );
}

function TrustChip({ theme, icon, label }) {
  const t = theme;
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '5px 9px', borderRadius: 99,
      background: t.mode === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.65)',
      border: `0.5px solid ${t.hairline}`,
      backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
    }}>
      <CXIcon name={icon} size={11} color={CX.green}/>
      <span style={{
        fontFamily: CX_MONO, fontSize: 9.5, color: t.ink2,
        letterSpacing: '0.14em', textTransform: 'uppercase',
      }}>{label}</span>
    </div>
  );
}

Object.assign(window, { CXLoginScreen });
