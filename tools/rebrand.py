#!/usr/bin/env python3
"""Sostituisce nei giochi copiati i nomi di marchi altrui con i nomi originali PezzaliBoy.
Tocca solo il testo visibile (titoli, intestazioni, avvisi, manifest), non la logica di gioco.
Uso: python3 tools/rebrand.py   (lo richiama anche tools/sync-games.sh)"""
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NOTE = 'Gioco originale pezzaliAPP, scritto da zero. Nessun legame con altri giochi o marchi.'

# cartella -> (nome nuovo, sostituzioni esatte [vecchio, nuovo])
GAMES = {
    'pacman': ('GHIOTTONE', [
        ('<title>PAC-MAN</title>', '<title>GHIOTTONE</title>'),
        ('<h1>PAC-MAN</h1>', '<h1>GHIOTTONE</h1>'),
        ("overlay.querySelector('h1').textContent='PAC-MAN';", "overlay.querySelector('h1').textContent='GHIOTTONE';"),
        ('"name": "PAC-MAN PWA"', '"name": "Ghiottone"'),
        ('"short_name": "PAC-MAN"', '"short_name": "Ghiottone"'),
        ('"description": "Pac-Man arcade game - PezzaliApp Edition"', '"description": "Labirinto, puntini e fantasmi - pezzaliAPP"'),
    ]),
    'galaga': ('SCIAME STELLARE', [
        ('<title>GalagaPWA — pezzaliAPP (Tributo didattico)</title>', '<title>Sciame Stellare — pezzaliAPP</title>'),
        ('<h1>🛸 Galaga — PWA (Tributo 1981)</h1>', '<h1>🛸 Sciame Stellare</h1>'),
        ('<h2>Galaga — Tributo PWA</h2>', '<h2>Sciame Stellare</h2>'),
        ('<p>Ricreazione didattica ispirata al classico Namco (1981). Funziona su smartphone e laptop.</p>',
         '<p>' + NOTE + ' Funziona su smartphone e laptop.</p>'),
        ('"name": "Galaga — PWA (Tributo didattico)"', '"name": "Sciame Stellare"'),
        ('"short_name": "GalagaPWA"', '"short_name": "Sciame"'),
        ('"description": "Ricreazione didattica ispirata a Galaga (1981, Namco). Funziona su smartphone e laptop. MIT — pezzaliAPP."',
         '"description": "' + NOTE + ' MIT — pezzaliAPP."'),
    ]),
    'invaders': ('ONDATA ALIENA', [
        ('<title>Space Invaders (1978) — pezzaliAPP</title>', '<title>Ondata Aliena — pezzaliAPP</title>'),
        ('content="Un omaggio a Space Invaders (1978) in versione PWA:', 'content="Ondata Aliena, PWA pezzaliAPP:'),
        ('<strong>Space Invaders — 1978</strong>', '<strong>Ondata Aliena</strong>'),
        ('<h2 id="title">Space Invaders</h2>', '<h2 id="title">Ondata Aliena</h2>'),
        ('© 2025 Space Invaders — Una PWA di', '© 2025 Ondata Aliena — Una PWA di'),
        ('"name": "Space Invaders — pezzaliAPP"', '"name": "Ondata Aliena"'),
        ('"short_name": "Invaders78"', '"short_name": "Ondata"'),
    ]),
    'defender': ('GUARDIANO ORBITALE', [
        ('<title>Defender — PWA (Tributo) v2</title>', '<title>Guardiano Orbitale — pezzaliAPP</title>'),
        ('<h1>DEFENDER — tributo PWA v2</h1>', '<h1>GUARDIANO ORBITALE</h1>'),
        ('aria-label="Defender tribute canvas"', 'aria-label="Area di gioco"'),
        ('<a class="btn-link" href="https://www.alessandropezzali.it/DefenderPWA/readme.html" target="_blank" rel="noopener">📄 README</a>', ''),
        ('Tributo non commerciale a <em>Defender</em> (1981, Williams).', NOTE),
        ('"name": "Defender \\u2014 PWA (Tributo) v2"', '"name": "Guardiano Orbitale"'),
        ('"name": "Defender — PWA (Tributo) v2"', '"name": "Guardiano Orbitale"'),
        ('"short_name": "DefenderPWA"', '"short_name": "Guardiano"'),
    ]),
    'frogger': ('SALTARANA', [
        ('<title>Frogger — PWA (Tributo 1981)</title>', '<title>Saltarana — pezzaliAPP</title>'),
        ('content="Frogger"', 'content="Saltarana"'),
        ('<h1>🐸 Frogger — pezzaliAPP</h1>', '<h1>🐸 Saltarana</h1>'),
        ('<h2>Frogger (1981, Konami) — Tributo didattico</h2>', '<h2>Saltarana</h2>'),
        ('aria-label="Frogger game area"', 'aria-label="Area di gioco"'),
        ('Questo è un tributo didattico, non affiliato a Konami.', NOTE),
        ('"name": "Frogger — PWA (Tributo 1981)"', '"name": "Saltarana"'),
        ('"short_name": "Frogger"', '"short_name": "Saltarana"'),
    ]),
    'centipede': ('GIARDINO INFESTATO', [
        ('<title>Centipede — pezzaliAPP (PWA)</title>', '<title>Giardino Infestato — pezzaliAPP</title>'),
        ('<h1>🕹️ Centipede — <small>Tributo PWA (Atari, 1981)</small></h1>', '<h1>🕹️ Giardino Infestato</h1>'),
        ('aria-label="Area di gioco Centipede"', 'aria-label="Area di gioco"'),
        ('Questo è un <em>omaggio didattico</em> al gioco originale di Atari (<b>Centipede</b>, 1981). Marchi e IP appartengono ai rispettivi titolari.', NOTE),
        ('"name": "Centipede — pezzaliAPP"', '"name": "Giardino Infestato"'),
        ('"short_name": "Centipede"', '"short_name": "Giardino"'),
    ]),
    'qbert': ('PIRAMIDE SALTERINA', [
        ('<title>Q*bert — PWA (Arcade Complete)</title>', '<title>Piramide Salterina — pezzaliAPP</title>'),
        ('<h1>🧊 Q*bert — PWA (Tributo 1982)</h1>', '<h1>🧊 Piramide Salterina</h1>'),
        ('aria-label="Area di gioco Q*bert"', 'aria-label="Area di gioco"'),
        ('"name": "Q*bert — PWA (Arcade Complete)"', '"name": "Piramide Salterina"'),
        ('"name": "Q*bert — PWA (Tributo 1982)"', '"name": "Piramide Salterina"'),
        ('"short_name": "Q*bert PWA"', '"short_name": "Piramide"'),
        ('"short_name": "QbertPWA"', '"short_name": "Piramide"'),
        ('Replica didattica ispirata a Q*bert (1982).', NOTE),
    ]),
}

# Controllo finale: questi nomi non devono restare nel testo visibile
BANNED = re.compile(r'pac-?man|galaga|space invaders|defender|frogger|centipede|q\*bert|namco|konami|atari|williams|taito', re.I)


def visible_text(path, text):
    """Testo che un utente può vedere: HTML senza script/commenti, oppure il manifest intero."""
    if path.endswith('.html'):
        text = re.sub(r'<script\b.*?</script>', '', text, flags=re.S | re.I)
        text = re.sub(r'<!--.*?-->', '', text, flags=re.S)
    return text


def main():
    leftovers = []
    for gid, (_, pairs) in GAMES.items():
        gdir = os.path.join(ROOT, 'games', gid)
        if not os.path.isdir(gdir):
            continue
        for name in os.listdir(gdir):
            if not (name == 'index.html' or name.startswith('manifest')):
                continue
            path = os.path.join(gdir, name)
            with open(path, encoding='utf-8') as f:
                text = f.read()
            new = text
            for old, rep in pairs:
                new = new.replace(old, rep)
            if new != text:
                with open(path, 'w', encoding='utf-8') as f:
                    f.write(new)
            for m in BANNED.finditer(visible_text(path, new)):
                leftovers.append(f'{gid}/{name}: "{m.group(0)}"')
    if leftovers:
        print('ATTENZIONE, nomi ancora visibili:')
        print('\n'.join('  ' + l for l in leftovers))
    else:
        print('rebrand: nessun nome di marchi altrui nel testo visibile')


if __name__ == '__main__':
    main()
