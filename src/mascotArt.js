// Original SVG mascot art (the prototype used watermarked stock clipart,
// which we can't ship — these are simple original stand-ins).

export function mascotSvg(mascotId, size = 40) {
  const svgs = {
    1: mousey,
    2: bizarro,
    3: wolf,
    4: flixy,
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
