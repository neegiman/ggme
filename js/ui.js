export const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function icon(name, className = '') {
  const paths = {
    arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
    lock: '<rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    copy: '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    people: '<circle cx="12" cy="7" r="3"/><path d="M6 21v-3a6 6 0 0 1 12 0v3M4 7a3 3 0 0 0 0 6m16-6a3 3 0 0 1 0 6M2 21v-3m20 3v-3"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    play: '<path d="m9 5 11 7-11 7Z"/>',
    pause: '<path d="M8 5v14M16 5v14"/>',
    reset: '<path d="M4 10a8 8 0 1 1 1 8M4 4v6h6"/>',
    share: '<path d="M12 16V3m-4 4 4-4 4 4M5 11v9h14v-9"/>',
    trophy: '<path d="M7 3h10v5a5 5 0 0 1-10 0V3Zm0 2H3v3a4 4 0 0 0 4 4m10-7h4v3a4 4 0 0 1-4 4m-5 1v6m-5 2h10"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/>',
    mask: '<path d="M3 6c5 2 13 2 18 0v7a6 6 0 0 1-9 5 6 6 0 0 1-9-5V6Z"/><path d="m6 11 3 1m6 0 3-1m-8 4h4"/>',
    spy: '<path d="m6 10 2-7h8l2 7M2 10h20M5 14h5l2 2 2-2h5l-1 5h-4l-2-3-2 3H6Z"/>',
    chat: '<path d="M21 11a8 8 0 0 1-8 8H8l-5 3 1-6a8 8 0 0 1 7-13h2a8 8 0 0 1 8 8Z"/><path d="M8 9h8m-8 4h5"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>'
  };
  return `<svg class="icon ${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.info}</svg>`;
}
export const gameIcon = game => icon({ liar: 'mask', spy: 'spy', taboo: 'chat' }[game]);
export function avatar(name, i) { return `<span class="avatar avatar-${i % 3}" aria-hidden="true">${escapeHTML([...name][0])}</span>`; }
