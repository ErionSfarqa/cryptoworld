// UI Module
import { log } from './config.js';

let toastContainer = null;

function applyToastPlacement(container) {
    if (!container) return;
    const isMobile = window.matchMedia('(max-width: 768px)').matches;
    if (isMobile) {
        const hasBottomNav = document.body?.dataset?.hasBottomNav === 'true';
        container.style.top = 'auto';
        container.style.bottom = hasBottomNav ? 'calc(16px + 56px)' : '16px';
    } else {
        container.style.bottom = 'auto';
        container.style.top = '';
    }
}

function ensureToastContainer() {
    if (toastContainer) return toastContainer;

    toastContainer = document.createElement('div');
    toastContainer.className = 'fixed top-6 right-6 z-[10000] flex flex-col gap-2';
    document.body.appendChild(toastContainer);
    applyToastPlacement(toastContainer);
    window.addEventListener('resize', () => applyToastPlacement(toastContainer));
    return toastContainer;
}

function getToastIcon(type) {
    if (type === 'success') return '&#10003;';
    if (type === 'error') return '&#10005;';
    if (type === 'warning') return '&#9888;';
    return '&#8505;';
}

export function showToast(message, type = 'info', duration = 3000) {
    const container = ensureToastContainer();
    const toast = document.createElement('div');

    const typeClass = {
        success: 'border-l-3 border-l-success',
        error: 'border-l-3 border-l-danger',
        warning: 'border-l-3 border-l-warning',
        info: 'border-l-3 border-l-info',
    }[type] || 'border-l-3 border-l-info';

    toast.className = `flex items-center gap-2 py-3.5 px-5 rounded-cw-sm bg-bg-tertiary border border-border shadow-cw-lg text-text-primary text-xs-9 translate-x-[120%] opacity-0 transition-all duration-350 ease-toast max-w-380 ${typeClass}`;
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    toast.innerHTML = `
    <span class="text-base">${getToastIcon(type)}</span>
    <span class="flex-1">${message}</span>
  `;

    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('translate-x-0', 'opacity-100'));

    setTimeout(() => {
        toast.classList.remove('translate-x-0', 'opacity-100');
        toast.classList.add('translate-x-[120%]', 'opacity-0');
        setTimeout(() => toast.remove(), 400);
    }, duration);
}

export function showLoading(container, message = 'Loading...') {
    const loader = document.createElement('div');
    loader.className = 'flex flex-col items-center justify-center p-16 text-center gap-4 min-h-[200px]';
    loader.innerHTML = `<div class="w-10 h-10 border-[3px] border-border border-t-accent rounded-full animate-spin-slow"></div><p class="text-text-secondary">${message}</p>`;
    container.innerHTML = '';
    container.appendChild(loader);
    return loader;
}

export function hideLoading(container) {
    const loader = container.querySelector('.loading-state');
    if (loader) loader.remove();
}

export function setButtonLoading(btn, isLoading, originalText = '') {
    if (isLoading) {
        btn.dataset.originalText = btn.textContent;
        btn.innerHTML = '<span class="inline-block w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin-fast"></span>';
        btn.disabled = true;
        btn.classList.add('pointer-events-none', 'opacity-70');
    } else {
        btn.textContent = originalText || btn.dataset.originalText || 'Submit';
        btn.disabled = false;
        btn.classList.remove('pointer-events-none', 'opacity-70');
    }
}

export function initRevealAnimations() {
    const sections = document.querySelectorAll('.reveal-section');
    if (!sections.length) return;

    document.body.classList.add('reveal-ready');

    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                entry.target.classList.add('revealed');

                if (window.gsap && entry.target.dataset.gsapReveal) {
                    animateReveal(entry.target);
                }

                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.15, rootMargin: '0px 0px -50px 0px' });

    sections.forEach((section) => observer.observe(section));
    log('Reveal observer initialized for', sections.length, 'sections');
}

function animateReveal(el) {
    const children = el.querySelectorAll('.reveal-item');

    if (children.length) {
        gsap.from(children, {
            y: 40,
            opacity: 0,
            duration: 0.7,
            stagger: 0.12,
            ease: 'power2.out',
        });
    } else {
        gsap.from(el, {
            y: 40,
            opacity: 0,
            duration: 0.7,
            ease: 'power2.out',
        });
    }
}

export function showError(container, message, onRetry) {
    container.innerHTML = `
    <div class="flex flex-col items-center justify-center p-16 text-center gap-4 min-h-[200px]">
      <div class="text-[2.5rem] opacity-50">&#9888;</div>
      <p class="text-text-secondary">${message}</p>
      ${onRetry ? '<button type="button" data-retry class="inline-flex items-center justify-center gap-2 font-body text-xs-85 font-semibold py-2 px-4 rounded-cw-sm cursor-pointer transition-all duration-250 ease-cw-ease relative overflow-hidden whitespace-nowrap bg-transparent text-text-primary">Retry</button>' : ''}
    </div>
  `;

    if (onRetry) {
        container.querySelector('[data-retry]').addEventListener('click', onRetry);
    }
}

export function showEmpty(container, message) {
    container.innerHTML = `
    <div class="flex flex-col items-center justify-center p-16 text-center gap-4 min-h-[200px]">
      <div class="text-[2.5rem] opacity-50">&#128228;</div>
      <p class="text-text-secondary">${message}</p>
    </div>
  `;
}

