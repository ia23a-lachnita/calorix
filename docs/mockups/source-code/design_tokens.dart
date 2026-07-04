// Calorix design tokens — Flutter translation of tokens/*.css and src/cx-theme.jsx.
// Values are exact; do not round.

import 'dart:ui';
import 'package:flutter/material.dart';

// ── Brand accents (mode-independent) ────────────────────────────
class CxAccent {
  static const blue  = Color(0xFF3A5BFF); // protein
  static const cyan  = Color(0xFF19D3D9); // carbs · AI · scan glow
  static const green = Color(0xFF1FCC74); // fat · confirmed
  static const amber = Color(0xFFF2A93B); // low confidence / review

  static const gradAI = LinearGradient(
    begin: Alignment.topLeft, end: Alignment.bottomRight, // 135deg
    colors: [blue, cyan, green], stops: [0.0, 0.55, 1.0],
  );
  static const gradCool = LinearGradient(
    begin: Alignment.topLeft, end: Alignment.bottomRight,
    colors: [blue, cyan],
  );
  static const gradWarm = LinearGradient(
    begin: Alignment.topLeft, end: Alignment.bottomRight,
    colors: [cyan, green],
  );

  static const ctaInk = Color(0xFF0B0D10); // ink on gradient, BOTH themes
}

// ── Surfaces & ink, per mode ────────────────────────────────────
class CxThemeData {
  final Color bg, card, cardAlt, ink, ink2, muted, hairline, hairline2, chip;
  final List<BoxShadow> shadow, shadowLg;
  const CxThemeData({
    required this.bg, required this.card, required this.cardAlt,
    required this.ink, required this.ink2, required this.muted,
    required this.hairline, required this.hairline2, required this.chip,
    required this.shadow, required this.shadowLg,
  });
}

const cxLight = CxThemeData(
  bg:        Color(0xFFF4F2EE), // warm off-white canvas
  card:      Color(0xFFFFFFFF),
  cardAlt:   Color(0xFFFBFAF6),
  ink:       Color(0xFF0B0D10),
  ink2:      Color(0xFF3A4048),
  muted:     Color(0xFF7B8088),
  hairline:  Color(0x120B0D10), // rgba(11,13,16,0.07)
  hairline2: Color(0x1F0B0D10), // rgba(11,13,16,0.12)
  chip:      Color(0xFFEEEBE5),
  shadow: [
    BoxShadow(color: Color(0x0A0B0D10), offset: Offset(0, 1), blurRadius: 2),
    BoxShadow(color: Color(0x0A0B0D10), offset: Offset(0, 8), blurRadius: 24),
  ],
  shadowLg: [
    BoxShadow(color: Color(0x0A0B0D10), offset: Offset(0, 2), blurRadius: 4),
    BoxShadow(color: Color(0x0F0B0D10), offset: Offset(0, 18), blurRadius: 40),
  ],
);

const cxDark = CxThemeData(
  bg:        Color(0xFF0C0F13), // deep blue-graphite
  card:      Color(0xFF14181E),
  cardAlt:   Color(0xFF181D24),
  ink:       Color(0xFFF2F3F5),
  ink2:      Color(0xC7F2F3F5), // 0.78
  muted:     Color(0x80F2F3F5), // 0.50
  hairline:  Color(0x12FFFFFF), // 0.07
  hairline2: Color(0x21FFFFFF), // 0.13
  chip:      Color(0x0FFFFFFF), // 0.06
  shadow: [
    // + inset 0 1px rgba(255,255,255,0.04) top highlight — fake with a 0.5px top border if needed
    BoxShadow(color: Color(0x66000000), offset: Offset(0, 12), blurRadius: 28),
  ],
  shadowLg: [
    BoxShadow(color: Color(0x80000000), offset: Offset(0, 30), blurRadius: 60),
  ],
);

// ── Typography ──────────────────────────────────────────────────
// Families: Geist (UI), Geist Mono (labels + numerals) — Google Fonts.
class CxType {
  // display: screen titles
  static const displaySize = 30.0, displayWeight = FontWeight.w600, displaySpacing = -0.04 * 30;
  // title: sheet titles
  static const titleSize = 21.0, titleWeight = FontWeight.w600, titleSpacing = -0.03 * 21;
  // body
  static const bodySize = 13.5, bodyWeight = FontWeight.w500, bodyHeight = 1.45;
  // eyebrow label: Geist Mono, UPPERCASE
  static const labelSize = 10.0, labelSpacing = 0.16 * 10;
  // numerals: Geist Mono + tabularFigures, ls -0.02em
  static const numFeatures = [FontFeature.tabularFigures()];
}

// ── Geometry ────────────────────────────────────────────────────
class CxGeo {
  static const space = [4.0, 8.0, 12.0, 16.0, 20.0, 24.0];
  static const radiusPill   = 999.0; // chips, capture ring
  static const radiusField  = 14.0;  // inputs, small buttons
  static const radiusCta    = 16.0;  // primary buttons
  static const radiusCard   = 22.0;  // meal cards, forms
  static const radiusCardLg = 28.0;  // hero cards, bottom sheets
  static const hairlineWidth = 0.5;
  static const screenGutter = 16.0;
}

// ── Semantic aliases ────────────────────────────────────────────
class CxSemantic {
  static const macroProtein    = CxAccent.blue;
  static const macroCarbs      = CxAccent.cyan;
  static const macroFat        = CxAccent.green;
  static const statusConfirmed = CxAccent.green; // confidence >= 80
  static const statusReview    = CxAccent.amber; // confidence < 80
}

// ── Branding placeholders ───────────────────────────────────────
// Final name + logo TBD. Keep swappable.
const cxAppName = 'AppName';
