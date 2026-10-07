const el = document.querySelector('.cm-rail-channel, .ca-rail .channel-item, [class*=channel-item]');
if (el) { const r = el.getBoundingClientRect(); el.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:r.left+5,clientY:r.top+5})); }
