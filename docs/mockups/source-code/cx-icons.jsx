// Calorix custom iconography — hairline strokes, 24px grid.

function CXIcon({ name, size = 22, color = 'currentColor', stroke = 1.6, style = {} }) {
  const s = { width: size, height: size, display: 'block', ...style };
  const p = { fill: 'none', stroke: color, strokeWidth: stroke, strokeLinecap: 'round', strokeLinejoin: 'round' };
  switch (name) {
    case 'today':   // sunrise + horizon
      return (<svg viewBox="0 0 24 24" style={s}><path d="M3 17h18M6 14a6 6 0 0 1 12 0M12 5v2M5.6 7.6l1.4 1.4M18.4 7.6 17 9" {...p}/></svg>);
    case 'history':
      return (<svg viewBox="0 0 24 24" style={s}><path d="M4 12a8 8 0 1 0 2.5-5.8M4 4v3.5H7.5M12 8v4l3 2" {...p}/></svg>);
    case 'goals':   // target with arrow piercing the bullseye
      return (<svg viewBox="0 0 24 24" style={s}>
        <circle cx="11" cy="13" r="8" {...p}/>
        <circle cx="11" cy="13" r="4" {...p}/>
        <path d="M11 13 L20.5 3.5" {...p}/>
        <path d="M16.5 3.5h4v4" {...p}/>
        <circle cx="11" cy="13" r="1.1" fill={color} stroke="none"/>
      </svg>);
    case 'eye':     // open eye w/ iris — Scan tab
      return (<svg viewBox="0 0 24 24" style={s}>
        <path d="M2.5 12s3.6-6 9.5-6 9.5 6 9.5 6-3.6 6-9.5 6-9.5-6-9.5-6z" {...p}/>
        <circle cx="12" cy="12" r="3.2" {...p}/>
        <circle cx="13" cy="11" r="0.9" fill={color} stroke="none"/>
      </svg>);
    case 'ai':      // 4-point sparkle
      return (<svg viewBox="0 0 24 24" style={s}><path d="M12 3.5 13.3 9.5 19.5 11 13.3 12.5 12 18.5 10.7 12.5 4.5 11 10.7 9.5z M19 18l.5 1.8L21.5 20 19.5 20.5 19 22.5 18.5 20.5 16.5 20 18.5 19.8z" fill={color} stroke="none"/></svg>);
    case 'lens':    // camera lens
      return (<svg viewBox="0 0 24 24" style={s}><circle cx="12" cy="12" r="8" {...p}/><circle cx="12" cy="12" r="3.5" {...p}/><circle cx="10" cy="10" r="1" fill={color}/></svg>);
    case 'flash':
      return (<svg viewBox="0 0 24 24" style={s}><path d="M13 3 5 14h6l-1 7 8-11h-6l1-7z" {...p}/></svg>);
    case 'flashOff':
      return (<svg viewBox="0 0 24 24" style={s}><path d="M13 3 5 14h6l-1 7 8-11h-6l1-7zM4 4l16 16" {...p}/></svg>);
    case 'gallery':
      return (<svg viewBox="0 0 24 24" style={s}><rect x="3" y="5" width="18" height="14" rx="3" {...p}/><circle cx="9" cy="10" r="1.4" fill={color}/><path d="m4.5 17 4-4 4 4 3-3 4 4" {...p}/></svg>);
    case 'profile':
      return (<svg viewBox="0 0 24 24" style={s}><circle cx="12" cy="9" r="3.4" {...p}/><path d="M4.5 20a7.5 7.5 0 0 1 15 0" {...p}/></svg>);
    case 'plus':
      return (<svg viewBox="0 0 24 24" style={s}><path d="M12 5v14M5 12h14" {...p}/></svg>);
    case 'check':
      return (<svg viewBox="0 0 24 24" style={s}><path d="m4.5 12.5 5 5 10-11" {...p}/></svg>);
    case 'chevR':
      return (<svg viewBox="0 0 24 24" style={s}><path d="m9 5 7 7-7 7" {...p}/></svg>);
    case 'chevL':
      return (<svg viewBox="0 0 24 24" style={s}><path d="m15 5-7 7 7 7" {...p}/></svg>);
    case 'chevD':
      return (<svg viewBox="0 0 24 24" style={s}><path d="m5 9 7 7 7-7" {...p}/></svg>);
    case 'close':
      return (<svg viewBox="0 0 24 24" style={s}><path d="M6 6l12 12M18 6 6 18" {...p}/></svg>);
    case 'edit':
      return (<svg viewBox="0 0 24 24" style={s}><path d="m4 20 4-1 11-11-3-3L5 16l-1 4zM14 6l3 3" {...p}/></svg>);
    case 'trash':
      return (<svg viewBox="0 0 24 24" style={s}><path d="M4.5 7h15M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M6.5 7l1 13a2 2 0 0 0 2 2h5a2 2 0 0 0 2-2l1-13" {...p}/></svg>);
    case 'copy':
      return (<svg viewBox="0 0 24 24" style={s}><rect x="8" y="8" width="12" height="12" rx="2.5" {...p}/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" {...p}/></svg>);
    case 'send':
      return (<svg viewBox="0 0 24 24" style={s}><path d="M4 20 21 12 4 4l3 8-3 8zM7 12h14" {...p}/></svg>);
    case 'sliders':
      return (<svg viewBox="0 0 24 24" style={s}><path d="M4 7h6M14 7h6M4 17h2M10 17h10M4 12h12M20 12h0" {...p}/><circle cx="12" cy="7" r="2" {...p}/><circle cx="8" cy="17" r="2" {...p}/><circle cx="18" cy="12" r="2" {...p}/></svg>);
    case 'flame':
      return (<svg viewBox="0 0 24 24" style={s}><path d="M12 3s5 4 5 9a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-2-5 1-8zM9 14a3 3 0 0 0 6 0c0-2-2-2-3-4-1 2-3 2-3 4z" {...p}/></svg>);
    case 'bell':
      return (<svg viewBox="0 0 24 24" style={s}><path d="M5.5 17h13l-1.5-2v-4a5 5 0 0 0-10 0v4l-1.5 2zM10 20a2 2 0 0 0 4 0" {...p}/></svg>);
    case 'cloud':
      return (<svg viewBox="0 0 24 24" style={s}><path d="M7 18a4 4 0 0 1-.4-7.97A6 6 0 0 1 18.5 11 3.5 3.5 0 0 1 18 18H7z" {...p}/></svg>);
    case 'scale':
      return (<svg viewBox="0 0 24 24" style={s}><rect x="3.5" y="5" width="17" height="14" rx="3" {...p}/><path d="M9 5V3.5h6V5M9 15h6M9 12h6M9 18h6" {...p}/></svg>);
    case 'undo':
      return (<svg viewBox="0 0 24 24" style={s}><path d="M9 7H5V3M5 7l3-3a8 8 0 1 1-2 12" {...p}/></svg>);
    case 'mic':
      return (<svg viewBox="0 0 24 24" style={s}><rect x="9" y="3" width="6" height="12" rx="3" {...p}/><path d="M5 11a7 7 0 0 0 14 0M12 18v3" {...p}/></svg>);
    case 'arrowUp':
      return (<svg viewBox="0 0 24 24" style={s}><path d="M12 19V5M5 12l7-7 7 7" {...p}/></svg>);
    default: return null;
  }
}

// Calorix mark — abstract "C" combining aperture + ring.
function CXLogo({ size = 28, color = '#0B0D10', glow = false }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} style={{ display: 'block' }}>
      <defs>
        <linearGradient id="cxg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#3A5BFF"/>
          <stop offset="55%" stopColor="#19D3D9"/>
          <stop offset="100%" stopColor="#1FCC74"/>
        </linearGradient>
      </defs>
      <circle cx="16" cy="16" r="13.5" fill="none" stroke={color} strokeWidth="1.5" strokeOpacity="0.18"/>
      <path d="M27 11a12 12 0 1 0 0 10" fill="none"
        stroke={glow ? 'url(#cxg)' : color} strokeWidth="3" strokeLinecap="round"/>
      <circle cx="22" cy="10" r="1.6" fill={glow ? '#1FCC74' : color}/>
    </svg>
  );
}

Object.assign(window, { CXIcon, CXLogo });
