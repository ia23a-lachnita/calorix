function IOSDevice({ width = 402, height = 874, dark = true, children }) {
  return (
    <div style={{
      width, height, position: 'relative', overflow: 'hidden',
      borderRadius: 44,
      background: dark ? '#05070A' : '#F4F2EE',
      boxShadow: '0 30px 80px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.08)',
    }}>
      {children}
    </div>
  );
}

function DesignCanvas({ children }) {
  return (
    <div style={{
      minHeight: '100vh',
      padding: 32,
      display: 'flex',
      gap: 24,
      alignItems: 'flex-start',
      justifyContent: 'center',
    }}>
      {children}
    </div>
  );
}

function useTweaks(defaults) {
  const [values, setValues] = React.useState(defaults);
  const setTweak = (key, value) => setValues((current) => ({ ...current, [key]: value }));
  return [values, setTweak];
}

function TweaksPanel({ title, children }) {
  return (
    <aside style={{
      width: 260,
      padding: 16,
      borderRadius: 18,
      background: 'rgba(20,24,30,0.92)',
      border: '1px solid rgba(255,255,255,0.08)',
      color: '#F2F3F5',
      fontFamily: 'ui-sans-serif, system-ui, sans-serif',
    }}>
      <h2 style={{ margin: '0 0 14px', fontSize: 16 }}>{title}</h2>
      {children}
    </aside>
  );
}

function TweakSection({ label, children }) {
  return (
    <section style={{ marginTop: 14 }}>
      <div style={{ marginBottom: 8, fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase', opacity: 0.65 }}>
        {label}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {children}
      </div>
    </section>
  );
}

function TweakRadio({ value, current, onChange, children }) {
  const active = value === current;
  return (
    <button onClick={() => onChange(value)} style={{
      border: `1px solid ${active ? '#19D3D9' : 'rgba(255,255,255,0.12)'}`,
      background: active ? 'rgba(25,211,217,0.14)' : 'rgba(255,255,255,0.04)',
      color: '#F2F3F5',
      borderRadius: 999,
      padding: '6px 10px',
      font: 'inherit',
      fontSize: 12,
      cursor: 'pointer',
    }}>
      {children}
    </button>
  );
}

Object.assign(window, {
  IOSDevice,
  DesignCanvas,
  useTweaks,
  TweaksPanel,
  TweakSection,
  TweakRadio,
});
