#!/usr/bin/env python3
import re, os

ROOT = os.path.dirname(os.path.abspath(__file__))

def read(path):
    with open(os.path.join(ROOT, path), encoding='utf-8') as f:
        return f.read()

def clean_module(code):
    code = re.sub(r"import \{[^}]+\} from ['\"][^'\"]+['\"];?\n?", '', code)
    code = re.sub(r'^export (async function|function|const)', r'\1', code, flags=re.MULTILINE)
    return code

css          = read('css/style.css')
firebase     = read('js/firebase.js')
secteurs     = read('js/secteurs.js')
tournee      = read('js/tournee.js')
carte        = read('js/carte.js')
historique   = read('js/historique.js')
gamification = read('js/gamification.js')
pdf          = read('js/pdf.js')
vocal        = read('js/vocal.js')
geoloc       = read('js/geoloc.js')
install      = read('js/install.js')
maj          = read('js/maj.js')
notifs       = read('js/notifications.js')
journal      = read('js/journal.js')
app          = read('js/app.js')

firebase_clean      = re.sub(r'\nexport \{[^}]+\};', '', firebase)
secteurs_clean      = clean_module(secteurs)
tournee_clean       = clean_module(tournee)
carte_clean         = carte
historique_clean    = clean_module(historique)
gamification_clean  = clean_module(gamification)
pdf_clean           = clean_module(pdf)
vocal_clean         = clean_module(vocal)
geoloc_clean        = clean_module(geoloc)
install_clean       = clean_module(install)
maj_clean           = clean_module(maj)
notifs_clean        = clean_module(notifs)
journal_clean       = clean_module(journal)
app_clean           = re.sub(r"import \{[^}]+\} from ['\"][^'\"]+['\"];?\n?", '', app)

parts = [
    '<!DOCTYPE html>',
    '<html lang="fr">',
    '<head>',
    '  <meta charset="UTF-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">',
    '  <meta name="theme-color" content="#CC1D1D">',
    '  <meta name="mobile-web-app-capable" content="yes">',
    '  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">',
    '  <meta name="apple-mobile-web-app-title" content="Calendriers SP">',
    '  <title>Tournée Calendriers — SP Pacy</title>',
    '  <link rel="manifest" href="./manifest.json">',
    '  <link rel="icon" type="image/png" sizes="32x32" href="./icons/favicon-32.png">',
    '  <link rel="icon" type="image/png" sizes="192x192" href="./icons/icon-192.png">',
    '  <link rel="apple-touch-icon" sizes="180x180" href="./icons/icon-180.png">',
    '  <link rel="apple-touch-icon" sizes="167x167" href="./icons/icon-167.png">',
    '  <link rel="apple-touch-icon" sizes="152x152" href="./icons/icon-152.png">',
    '  <meta name="apple-mobile-web-app-capable" content="yes">',
    '  <style>' + css + '</style>',
    '</head>',
    '<body>',
    '  <div id="main"></div>',
    '  <div id="toasts" aria-live="polite"></div>',
    '  <script type="module">',
    firebase_clean,
    secteurs_clean,
    tournee_clean,
    carte_clean,
    historique_clean,
    gamification_clean,
    pdf_clean,
    vocal_clean,
    geoloc_clean,
    install_clean,
    maj_clean,
    notifs_clean,
    journal_clean,
    app_clean,
    '  </script>',
    '  <script>',
    "    if ('serviceWorker' in navigator) {",
    "      window.addEventListener('load', () => {",
    "        navigator.serviceWorker.register('./sw.js')",
    "          .then(reg => { if (window.__surveillerMAJ) window.__surveillerMAJ(reg); })",
    "          .catch(()=>{});",
    '      });',
    '    }',
    '  </script>',
    '</body>',
    '</html>',
]

html = '\n'.join(parts)
out = os.path.join(ROOT, 'index-monofichier.html')
with open(out, 'w', encoding='utf-8') as f:
    f.write(html)
print(f"✅ index-monofichier.html généré — {len(html):,} chars ({len(html)//1024} Ko)")
