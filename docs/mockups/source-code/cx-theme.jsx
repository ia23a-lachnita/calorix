// Calorix design tokens + tiny helpers.
// One shared theme object, switched by mode ('light' | 'dark').

const CX = {
  // Brand accents — share roughly equal chroma/lightness
  blue:   '#3A5BFF',  // protein
  cyan:   '#19D3D9',  // carbs / AI / scan glow
  green:  '#1FCC74',  // fat / confirmed
  amber:  '#F2A93B',  // gentle warning / low-confidence

  // Gradients
  gradAI:   'linear-gradient(135deg, #3A5BFF 0%, #19D3D9 55%, #1FCC74 100%)',
  gradCool: 'linear-gradient(135deg, #3A5BFF 0%, #19D3D9 100%)',
  gradWarm: 'linear-gradient(135deg, #19D3D9 0%, #1FCC74 100%)',
};

const CX_LIGHT = {
  mode: 'light',
  bg:        '#F4F2EE',     // warm off-white canvas
  card:      '#FFFFFF',
  cardAlt:   '#FBFAF6',
  ink:       '#0B0D10',
  ink2:      '#3A4048',
  muted:     '#7B8088',
  hairline:  'rgba(11,13,16,0.07)',
  hairline2: 'rgba(11,13,16,0.12)',
  chip:      '#EEEBE5',
  shadow:    '0 1px 2px rgba(11,13,16,0.04), 0 8px 24px rgba(11,13,16,0.04)',
  shadowLg:  '0 2px 4px rgba(11,13,16,0.04), 0 18px 40px rgba(11,13,16,0.06)',
  ...CX,
};

const CX_DARK = {
  mode: 'dark',
  bg:        '#0C0F13',     // deep blue-graphite
  card:      '#14181E',
  cardAlt:   '#181D24',
  ink:       '#F2F3F5',
  ink2:      'rgba(242,243,245,0.78)',
  muted:     'rgba(242,243,245,0.50)',
  hairline:  'rgba(255,255,255,0.07)',
  hairline2: 'rgba(255,255,255,0.13)',
  chip:      'rgba(255,255,255,0.06)',
  shadow:    '0 1px 0 rgba(255,255,255,0.04) inset, 0 12px 28px rgba(0,0,0,0.4)',
  shadowLg:  '0 1px 0 rgba(255,255,255,0.04) inset, 0 30px 60px rgba(0,0,0,0.5)',
  ...CX,
};

const cxTheme = (mode) => (mode === 'dark' ? CX_DARK : CX_LIGHT);

// Body font stack — Geist (loaded via @fontsource link in HTML)
const CX_FONT = '"Geist", "Inter Tight", ui-sans-serif, system-ui, sans-serif';
const CX_MONO = '"Geist Mono", ui-monospace, "JetBrains Mono", "SF Mono", Menlo, monospace';

// Tabular numeric run — use this for kcal/g values.
function CXNum({ children, weight = 600, size, color, mono = true, style = {} }) {
  return (
    <span style={{
      fontFamily: mono ? CX_MONO : CX_FONT,
      fontWeight: weight,
      fontSize: size,
      color,
      fontVariantNumeric: 'tabular-nums',
      letterSpacing: mono ? '-0.02em' : '-0.03em',
      ...style,
    }}>{children}</span>
  );
}

// Tiny eyebrow label, used everywhere
function CXLabel({ children, color, style = {} }) {
  return (
    <div style={{
      fontFamily: CX_MONO,
      fontSize: 10,
      letterSpacing: '0.16em',
      textTransform: 'uppercase',
      color,
      ...style,
    }}>{children}</div>
  );
}

Object.assign(window, { CX, CX_LIGHT, CX_DARK, cxTheme, CX_FONT, CX_MONO, CXNum, CXLabel });
