const footerTemplatePath = '/footer.html';

function normalizePath(pathname) {
  return (pathname || '/').split('?')[0].split('#')[0];
}

function isFilePath(pathname) {
  const parts = normalizePath(pathname).split('/').filter(Boolean);
  if (!parts.length) return false;
  return parts[parts.length - 1].includes('.');
}

function relativePath(fromPath, toPath) {
  const fromParts = normalizePath(fromPath).split('/').filter(Boolean);
  const toParts = normalizePath(toPath).split('/').filter(Boolean);
  const fromDir = isFilePath(fromPath) ? fromParts.slice(0, -1) : fromParts;

  let i = 0;
  while (i < fromDir.length && i < toParts.length && fromDir[i] === toParts[i]) {
    i += 1;
  }

  const up = Array(Math.max(0, fromDir.length - i)).fill('..');
  const down = toParts.slice(i);
  const rel = [...up, ...down].join('/');

  if (!rel) return './';
  if (rel.startsWith('.') || rel.startsWith('..')) return rel;
  return `./${rel}`;
}

function applyFooterLinks(root) {
  if (!root) return;
  const current = window.location.pathname;
  root.querySelectorAll('[data-cw-href]').forEach((node) => {
    const target = node.getAttribute('data-cw-href');
    if (!target) return;
    node.setAttribute('href', relativePath(current, target));
  });
}

function shouldRenderFooter(pathname) {
  const current = normalizePath(pathname || '/').toLowerCase();
  return !(current.includes('/app/') || current.startsWith('/app') || current.includes('/auth/') || current.startsWith('/auth'));
}

let footerTemplatePromise;
function getFooterTemplate() {
  if (!footerTemplatePromise) {
    footerTemplatePromise = fetch(footerTemplatePath).then((resp) => {
      if (!resp.ok) {
        throw new Error(`Footer fetch failed: ${resp.status}`);
      }
      return resp.text();
    });
  }

  return footerTemplatePromise;
}

class CWFooter extends HTMLElement {
  async connectedCallback() {
    if (this.dataset.loaded === 'true') {
      return;
    }

    if (!shouldRenderFooter(window.location.pathname)) {
      this.remove();
      return;
    }

    try {
      const html = await getFooterTemplate();
      this.innerHTML = html;
      this.dataset.loaded = 'true';
      applyFooterLinks(this);
      const footer = this.querySelector('footer');
      if (footer && document.body?.dataset?.hasBottomNav === 'true') {
        footer.classList.add('max-md:pb-[calc(32px+56px)]');
      }
    } catch (err) {
      console.error('[CW] Footer load error:', err);
      this.remove();
    }
  }
}

if (!customElements.get('cw-footer')) {
  customElements.define('cw-footer', CWFooter);
}

function debugFooterLayout() {
  if (!window.CW_DEBUG_FOOTER) return;
  const targets = document.querySelectorAll('header, main, section, footer, .app-layout, .auth-page');
  const outlineClasses = ['outline', 'outline-1', 'outline-dashed', 'outline-accent/60'];
  targets.forEach((el) => {
    el.classList.add(...outlineClasses);
    const rect = el.getBoundingClientRect();
    console.log('[CW] Layout', el.tagName, el.className, Math.round(rect.height));
  });
}

window.addEventListener('load', () => {
  requestAnimationFrame(debugFooterLayout);
});
