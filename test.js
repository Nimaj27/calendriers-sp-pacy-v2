const puppeteer = require('puppeteer');
(async () => {
  const b = await puppeteer.launch({ args:['--no-sandbox','--disable-setuid-sandbox'] });
  const p = await b.newPage();
  const erreurs = [], reseau = [];
  p.on('console', m => { if (m.type()==='error') erreurs.push(m.text()); });
  p.on('pageerror', e => erreurs.push('PAGE: ' + e.message));
  p.on('requestfailed', r => reseau.push(r.url().split('/').pop() + ' → ' + r.failure().errorText));

  await p.goto('http://127.0.0.1:8899/', { waitUntil:'networkidle2', timeout:30000 });
  await new Promise(r => setTimeout(r, 4000));

  // Les modules ont-ils bien été évalués ?
  const etat = await p.evaluate(() => ({
    app: typeof window.APP,
    naviguer: typeof window.naviguer,
    contenu: (document.getElementById('main')?.innerText || '').slice(0,90).replace(/\n/g,' ')
  }));

  console.log('APP        :', etat.app);
  console.log('naviguer   :', etat.naviguer);
  console.log('Écran      :', etat.contenu);
  const vraies = erreurs.filter(e => !/firebase|firestore|network|Failed to fetch|ERR_/i.test(e));
  console.log('\nErreurs JS :', vraies.length);
  vraies.slice(0,8).forEach(e => console.log('   ' + e.slice(0,160)));
  const rl = reseau.filter(r => !/firebase|google|gstatic|openstreetmap/i.test(r));
  console.log('\nÉchecs réseau locaux :', rl.length);
  rl.slice(0,8).forEach(r => console.log('   ' + r));
  await b.close();
})();
