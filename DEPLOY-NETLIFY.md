# PocketAid auf Netlify deployen

## Wichtig vorab

PocketAid braucht **Frontend + API** (Node.js). Netlify hostet:

- **Statische Dateien** (HTML, CSS, JS) → feste URL z. B. `https://pocketaid.netlify.app`
- **API** als **Netlify Function** (Express über `serverless-http`)

**ngrok ist danach nicht mehr nötig** für die öffentliche URL.

---

## Schritt 1: Netlify CLI (Deploy vom PC – ohne GitHub)

```powershell
cd c:\Users\waily\OneDrive\Desktop\AppNew
npm install -g netlify-cli
netlify login
```

Einmalig im Browser anmelden.

---

## Schritt 2: Site-Einstellungen (Build)

| Einstellung | Wert |
|-------------|------|
| Build command | `npm install` |
| Publish directory | `.` (Punkt = Projektroot) |
| Functions directory | `netlify/functions` (steht in `netlify.toml`) |

`netlify.toml` im Projekt ist schon vorkonfiguriert.

---

## Schritt 3: Umgebungsvariablen (Netlify Dashboard)

**Site configuration → Environment variables** – alles aus deiner `.env` eintragen:

| Variable | Beispiel / Hinweis |
|----------|-------------------|
| `AI_PROVIDER` | `gemini` |
| `GEMINI_API_KEY` | dein Google-Key |
| `GEMINI_MODEL` | `gemini-2.5-flash-lite` |
| `ENABLE_BANKING_ENV` | `production` |
| `ENABLE_BANKING_APP_ID` | Production-App-UUID |
| `ENABLE_BANKING_COUNTRY` | `AT` |
| `ENABLE_BANKING_REDIRECT_URL` | `https://DEIN-SITE.netlify.app/api/banking/callback` |
| `ENABLE_BANKING_PRIVATE_KEY` | **kompletter PEM-Inhalt** (siehe unten) |
| `SITE_PASSWORD` | dein Zugangs-Passwort |

### PEM auf Netlify (ohne Datei)

In Netlify **keine** `.pem`-Datei hochladen. Stattdessen:

1. PEM-Datei in Editor öffnen
2. Alles kopieren (inkl. `-----BEGIN...` / `-----END...`)
3. Als Variable `ENABLE_BANKING_PRIVATE_KEY` einfügen  
   Zeilenumbrüche als echte Umbrüche oder `\n` – Netlify akzeptiert meist mehrzeilige Werte

`ENABLE_BANKING_PRIVATE_KEY_PATH` kann auf Netlify leer bleiben.

### Redirect-URL Enable Banking

Im **Enable Banking Control Panel** dieselbe URL eintragen:

```
https://DEIN-SITE-NAME.netlify.app/api/banking/callback
```

Privacy / Terms:

```
https://DEIN-SITE-NAME.netlify.app/privacy.html
https://DEIN-SITE-NAME.netlify.app/terms.html
```

---

## Schritt 4: Site verknüpfen & Variablen

```powershell
cd c:\Users\waily\OneDrive\Desktop\AppNew
netlify link
```

- Bestehende Site wählen **oder** neue Site anlegen
- Build command: `npm install`
- Publish directory: `.`

**Umgebungsvariablen hochladen** (aus deiner `.env`):

```powershell
netlify env:import .env
```

Oder manuell im Netlify-Dashboard unter **Environment variables**.

**Wichtig für Enable Banking auf Netlify:**  
Zusätzlich im Dashboard (oder per CLI) setzen:

- `ENABLE_BANKING_PRIVATE_KEY` = kompletter PEM-Inhalt (Datei in Editor öffnen, alles kopieren)
- `ENABLE_BANKING_REDIRECT_URL` = `https://DEIN-SITE-NAME.netlify.app/api/banking/callback`  
  (exakte URL nach erstem Deploy anpassen und nochmal deployen)

---

## Schritt 5: Production-Deploy

```powershell
npm install
netlify deploy --prod
```

Am Ende steht die URL, z. B. `https://pocketaid.netlify.app`.

**Danach:** Redirect-URL in Enable Banking + `ENABLE_BANKING_REDIRECT_URL` in Netlify auf diese URL setzen → `netlify env:import .env` → `netlify deploy --prod` erneut.

---

## Schritt 6: Testen

1. `https://DEIN-SITE.netlify.app` öffnen → Passwort (wenn gesetzt)
2. Tab **Assistent Chat** → Nachricht senden
3. Tab **Mehr** → Bank verbinden → Sync

API-Check: `https://DEIN-SITE.netlify.app/api/health`

---

## Lokal weiter entwickeln

```bash
npm start
```

→ http://localhost:3000 (wie bisher, mit `.env` + PEM-Datei)

---

## Hinweise

- **Daten auf Netlify** (Transaktionen/Session) liegen im Function-`/tmp` – für ernsthaften Dauerbetrieb später z. B. Datenbank einplanen.
- Nach jedem Deploy Umgebungsvariablen prüfen.
- **API-Key nie** ins Git committen.
