# PezzaliBoy Arcade

Console tascabile in stile handheld anni '90 che raccoglie i giochi del laboratorio PezzaliAPP come "cartucce".
Ogni gioco è la tua app originale, inserita così com'è: la console aggiunge solo D-pad, A, B, START, SELECT,
tastiera e gamepad, e mostra sullo schermo la sola area di gioco.

100% statica, nessun server, nessun costo: si pubblica gratis su GitHub Pages e funziona anche offline (PWA installabile).

## Cartucce incluse

Tutti i giochi sono scritti da zero da pezzaliAPP. Le cartucce ispirate ai classici arcade hanno nomi originali
(applicati da `tools/rebrand.py`): nessun nome, logo o marchio di altri giochi compare nella console.

I cinque giochi di Retro Arcade (repo `2600`) sono cartucce separate: la console avvia direttamente il gioco scelto e mostra solo il suo schermo, senza il cabinato.

| Cartuccia | Repo | Comandi console |
|---|---|---|
| Ghiottone | PAC-MAN-PWA | D-pad muovi · A/START gioca |
| Sciame Stellare | GalagaPWA | ◀ ▶ · A spara · START gioca · SELECT pausa |
| Ondata Aliena | SpaceInvadersPWA | ◀ ▶ · A spara · START gioca · SELECT pausa |
| Guardiano Orbitale | DefenderPWA | D-pad · A fuoco · B missile · START restart · SELECT pausa |
| Saltarana | FroggerPWA | D-pad salta · START gioca · SELECT pausa |
| Giardino Infestato | Centipede | ◀ ▶ · A spara · START ricomincia · SELECT pausa |
| Piramide Salterina | QbertPWA | diagonali del D-pad · START gioca/pausa |
| Snake | Snake | D-pad · A/START avvia · SELECT pausa · B reset |
| ALESKAT | ALESKAT | D-pad nuota · A/B scatto · START tuffati · SELECT menu |
| Jungle Dash, River Rush, Invasione Aliena, Maze Muncher, Corsa Infinita | 2600 (Retro Arcade) | D-pad · A azione/fuoco · START rigioca · SELECT ricomincia |
| Sudoku | SUDOKU | touch · D-pad sposta · B cancella |
| Il Cubo | ILCUBO (cartella docs) | touch |
| Cubo 3×3 WebGL | Tris | touch |
| Scacco | scacco | touch |
| TamaPWA | TamaPWA | touch |

Tastiera (quando la console ha il focus): frecce/WASD = D-pad · Z, K o Spazio = A · X o J = B · Invio = START ·
Shift = SELECT · Esc = menu. Quando il gioco ha il focus i tasti arrivano direttamente al gioco, come nell'app originale.
Un gamepad USB/Bluetooth funziona come la pulsantiera.

Pulsanti sotto lo schermo: **Menu** (torna alle cartucce), **Zoom/App** (solo area di gioco oppure app completa),
**Pad** (pulsantiera completa o compatta, utile per i giochi touch), **♪** audio.

## Pubblicare su GitHub Pages (gratis)

1. Crea un repo nuovo, ad esempio `PezzaliBoy`, e carica tutto il contenuto di questa cartella (anche `.nojekyll`).
2. Settings → Pages → Source: *Deploy from a branch* → `main` / root.
3. Dopo un minuto è online su `https://www.alessandropezzali.it/PezzaliBoy/`
   (oppure `https://pezzaliapp.github.io/PezzaliBoy/`).

## Aggiornare i giochi

Quando modifichi uno dei giochi nel suo repo, riallinea le cartucce con:

```bash
bash tools/sync-games.sh
```

Lo script riscarica i repo, reinserisce `gbx-bridge.js`, riapplica i nomi originali (`tools/rebrand.py`) e rigenera `sw.js`.
Per aggiungere una cartuccia: una riga in `tools/sync-games.sh` e una voce nell'array `GAMES` in `index.html`.

## Come funziona

- `index.html` è la console: menu, pulsantiera, tastiera, gamepad.
- Ogni gioco gira in un iframe della **stessa origine** (`games/<id>/`), quindi la console può inviargli tasti veri.
- `gbx-bridge.js` è caricato come primo script di ogni gioco: riceve i tasti, preme i pulsanti del gioco
  (Gioca, Pausa…), isola l'area di gioco per lo schermo e sblocca l'audio al primo tocco. Fuori dalla console non cambia nulla.
- Non inclusi perché non sono giochi: AeroPlan (pianificatore volo drone), L'Enigmista (analisi testi), BASIC Reloaded (interprete).
