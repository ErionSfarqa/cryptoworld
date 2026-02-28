const ICONS = {
    dashboard: `
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
  <path d="M3 3v18h18"></path>
  <path d="M8 17v-3"></path>
  <path d="M13 17V5"></path>
  <path d="M18 17V9"></path>
</svg>`,
    markets: `
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
  <path d="M3 3v18h18"></path>
  <path d="m19 9-5 5-4-4-3 3"></path>
</svg>`,
    trade: `
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
  <path d="m16 3 4 4-4 4"></path>
  <path d="M20 7H9"></path>
  <path d="m8 21-4-4 4-4"></path>
  <path d="M4 17h11"></path>
</svg>`,
    history: `
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
  <rect x="9" y="2" width="6" height="4" rx="1"></rect>
  <path d="M9 4H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2"></path>
</svg>`,
    positions: `
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
  <rect x="2" y="7" width="20" height="14" rx="2"></rect>
  <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"></path>
  <path d="M2 13h20"></path>
</svg>`,
    logout: `
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
  <path d="m16 17 5-5-5-5"></path>
  <path d="M21 12H9"></path>
</svg>`
};

function applyNavIcons(root = document) {
    const nodes = root.querySelectorAll('[data-icon]');
    nodes.forEach((node) => {
        const iconName = node.dataset.icon;
        const iconMarkup = ICONS[iconName];
        if (iconMarkup) {
            node.innerHTML = iconMarkup;
        }
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => applyNavIcons());
} else {
    applyNavIcons();
}

