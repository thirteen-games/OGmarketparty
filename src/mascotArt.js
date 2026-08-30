// Original SVG mascot art (the prototype used watermarked stock clipart,
// which we can't ship — these are simple original stand-ins).

export function mascotSvg(mascotId, size = 40) {
  const svgs = {
    1: mousey,
    2: bizarro,
    3: wolf,
    4: flixy,
    5: lev,
    6: joey,
  };
  return svgs[mascotId](size);
}

function mousey(s) {
  return `<svg viewBox="0 0 100 100" width="${s}" height="${s}" aria-label="Mousey">
    <circle cx="26" cy="26" r="18" fill="#8e97a8"/><circle cx="26" cy="26" r="10" fill="#f2b8c6"/>
    <circle cx="74" cy="26" r="18" fill="#8e97a8"/><circle cx="74" cy="26" r="10" fill="#f2b8c6"/>
    <circle cx="50" cy="58" r="34" fill="#8e97a8"/>
    <circle cx="38" cy="52" r="5" fill="#22252b"/><circle cx="62" cy="52" r="5" fill="#22252b"/>
    <circle cx="39.5" cy="50.5" r="1.6" fill="#fff"/><circle cx="63.5" cy="50.5" r="1.6" fill="#fff"/>
    <ellipse cx="50" cy="66" rx="7" ry="5" fill="#f2b8c6"/>
    <path d="M42 76 Q50 82 58 76" stroke="#22252b" stroke-width="3" fill="none" stroke-linecap="round"/>
    <line x1="20" y1="62" x2="34" y2="64" stroke="#666e7d" stroke-width="2"/>
    <line x1="80" y1="62" x2="66" y2="64" stroke="#666e7d" stroke-width="2"/>
  </svg>`;
}

function bizarro(s) {
  return `<svg viewBox="0 0 100 100" width="${s}" height="${s}" aria-label="Bizarro">
    <path d="M18 34 Q2 22 8 6 Q22 12 30 26 Z" fill="#c9cdd6"/>
    <path d="M82 34 Q98 22 92 6 Q78 12 70 26 Z" fill="#c9cdd6"/>
    <path d="M50 20 Q76 22 78 52 Q78 76 50 84 Q22 76 22 52 Q24 22 50 20 Z" fill="#e2504c"/>
    <circle cx="37" cy="48" r="11" fill="#fff"/><circle cx="63" cy="48" r="9" fill="#fff"/>
    <circle cx="38" cy="50" r="4" fill="#22252b"/><circle cx="61" cy="49" r="4" fill="#22252b"/>
    <ellipse cx="50" cy="74" rx="15" ry="9" fill="#f2a9b4"/>
    <circle cx="44" cy="74" r="2.5" fill="#8c3a44"/><circle cx="56" cy="74" r="2.5" fill="#8c3a44"/>
  </svg>`;
}

function wolf(s) {
  return `<svg viewBox="0 0 100 100" width="${s}" height="${s}" aria-label="Wolf">
    <path d="M22 40 L14 10 L40 26 Z" fill="#5d6d8e"/>
    <path d="M78 40 L86 10 L60 26 Z" fill="#5d6d8e"/>
    <path d="M22 40 L18 18 L36 28 Z" fill="#aeb8cc"/>
    <path d="M78 40 L82 18 L64 28 Z" fill="#aeb8cc"/>
    <circle cx="50" cy="56" r="32" fill="#5d6d8e"/>
    <path d="M50 60 Q34 60 30 78 Q40 88 50 88 Q60 88 70 78 Q66 60 50 60 Z" fill="#dfe4ee"/>
    <circle cx="38" cy="50" r="5" fill="#f4c542"/><circle cx="62" cy="50" r="5" fill="#f4c542"/>
    <circle cx="38" cy="50" r="2.4" fill="#22252b"/><circle cx="62" cy="50" r="2.4" fill="#22252b"/>
    <ellipse cx="50" cy="70" rx="6" ry="4.5" fill="#22252b"/>
    <path d="M44 80 Q50 84 56 80" stroke="#22252b" stroke-width="2.5" fill="none" stroke-linecap="round"/>
  </svg>`;
}

function lev(s) {
  return `<svg viewBox="0 0 100 100" width="${s}" height="${s}" aria-label="Lev">
    <path d="M14 50 Q4 36 6 26 Q20 32 26 42 Q20 58 6 74 Q4 62 14 50 Z" fill="#1f6396"/>
    <ellipse cx="58" cy="50" rx="36" ry="26" fill="#2b7fc2"/>
    <path d="M50 24 Q58 12 70 18 Q66 28 56 30 Z" fill="#1f6396"/>
    <path d="M46 72 Q52 84 64 80 Q62 70 52 68 Z" fill="#1f6396"/>
    <ellipse cx="58" cy="58" rx="24" ry="12" fill="#7db8e0"/>
    <circle cx="72" cy="44" r="8" fill="#fff"/>
    <circle cx="74" cy="45" r="3.6" fill="#22252b"/>
    <path d="M84 56 Q88 58 86 62" stroke="#153a57" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    <path d="M44 40 Q50 46 44 52" stroke="#1f6396" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    <circle cx="93" cy="30" r="3" fill="#a8d4f0"/>
    <circle cx="97" cy="20" r="2" fill="#a8d4f0"/>
  </svg>`;
}

function joey(s) {
  return `<svg viewBox="0 0 100 100" width="${s}" height="${s}" aria-label="Joey">
    <path d="M30 34 Q20 8 32 4 Q42 12 40 32 Z" fill="#8b5a2b"/>
    <path d="M70 34 Q80 8 68 4 Q58 12 60 32 Z" fill="#8b5a2b"/>
    <path d="M32 30 Q26 12 33 9 Q39 16 38 30 Z" fill="#d9a96b"/>
    <path d="M68 30 Q74 12 67 9 Q61 16 62 30 Z" fill="#d9a96b"/>
    <circle cx="50" cy="56" r="32" fill="#8b5a2b"/>
    <ellipse cx="50" cy="70" rx="18" ry="14" fill="#d9a96b"/>
    <circle cx="39" cy="48" r="5" fill="#22252b"/><circle cx="61" cy="48" r="5" fill="#22252b"/>
    <circle cx="40.5" cy="46.5" r="1.6" fill="#fff"/><circle cx="62.5" cy="46.5" r="1.6" fill="#fff"/>
    <ellipse cx="50" cy="60" rx="6.5" ry="5" fill="#5a3a1a"/>
    <path d="M43 72 Q50 78 57 72" stroke="#5a3a1a" stroke-width="3" fill="none" stroke-linecap="round"/>
  </svg>`;
}

function flixy(s) {
  return `<svg viewBox="0 0 100 100" width="${s}" height="${s}" aria-label="Flixy">
    <path d="M20 52 Q4 44 6 28 Q22 32 30 44 Z" fill="#2c8069"/>
    <path d="M80 52 Q96 44 94 28 Q78 32 70 44 Z" fill="#2c8069"/>
    <circle cx="50" cy="52" r="32" fill="#3aa789"/>
    <path d="M38 24 Q42 12 50 20 Q54 10 60 20 Q66 14 66 26 Z" fill="#2c8069"/>
    <circle cx="39" cy="46" r="8" fill="#fff"/><circle cx="61" cy="46" r="8" fill="#fff"/>
    <circle cx="41" cy="47" r="3.5" fill="#22252b"/><circle cx="59" cy="47" r="3.5" fill="#22252b"/>
    <path d="M42 64 L50 74 L58 64 Q50 58 42 64 Z" fill="#f2a23c"/>
  </svg>`;
}
