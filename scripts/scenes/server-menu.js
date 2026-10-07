const el = document.querySelector('.ca-rail-servers a, .ca-rail-servers button');
if (el) { const r = el.getBoundingClientRect(); el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: r.left + 5, clientY: r.top + 5 })); }
