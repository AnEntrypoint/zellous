const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  const consoleMessages = [];
  page.on('console', msg => consoleMessages.push({ type: msg.type(), text: msg.text() }));
  page.on('pageerror', err => consoleMessages.push({ type: 'error', text: err.message }));
  
  try {
    await page.goto('https://anentrypoint.github.io/zellous/nostr-chat/', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);
    
    const title = await page.title();
    console.log('Page title:', title);
    
    // Check for key elements
    const reconnectBanner = await page.$('#reconnectBanner');
    const app = await page.$('.app');
    const serverList = await page.$('#serverList');
    
    console.log('Elements found:');
    console.log('  reconnectBanner:', reconnectBanner ? 'YES' : 'NO');
    console.log('  app:', app ? 'YES' : 'NO');
    console.log('  serverList:', serverList ? 'YES' : 'NO');
    
    // Report console messages
    const errors = consoleMessages.filter(m => m.type === 'error');
    const warnings = consoleMessages.filter(m => m.type === 'warning');
    
    console.log('\nConsole errors:', errors.length);
    errors.forEach(e => console.log('  -', e.text.substring(0, 200)));
    
    console.log('\nConsole warnings:', warnings.length);
    warnings.slice(0, 3).forEach(w => console.log('  -', w.text.substring(0, 100)));
    
  } catch (e) {
    console.log('Error:', e.message);
  }
  
  await browser.close();
})();
