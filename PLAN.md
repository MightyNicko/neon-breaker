# Neon Breaker – teknisk plan

## Beslutade val (från dig)
- Webapp i Safari, sparas på hemskärmen (PWA), portrait. Publiceras på **GitHub Pages**.
- Paddeln styrs med **relativ drag i ett fält runt paddeln**.
- Första utkastet: **bara grundspelet** (boll, paddel, små fyrkantiga rutor). Inga power-ups, inget ljud.
- 4 zoner × 20 banor, zon 1 Spectrum, zon 2 Mirror, zon 3 Hairline, zon 4 Prism.
- Candy Crush-upplägg: 5 liv, +1 per 20 min, vid 0 liv vänta eller se (låtsas)reklam. Karta med numrerade noder, man rör sig uppåt.
- **Kartans noder och vägar** byter form per zon. Spelrutorna förblir små fyrkanter.
- Språk: **engelska (default) + svenska**, koden förberedd för fler.

## Tekniska val (mina, med motivering)

**Stack: ren JavaScript (ES-moduler) + Canvas 2D. Inga ramverk, inga beroenden, inget byggsteg.**
Minst kod att ladda, bäst prestanda på iOS, ingen supply-chain-risk, lätt att felsöka. Spelet är 2D med några hundra objekt, så WebGL ger ingen vinst som motiverar komplexiteten.

**Prestanda (iOS Safari)**
- `shadowBlur` är mycket långsamt i Safari. Allt glöd **förrenderas till sprites** (offscreen canvas per rutfärg/stil) och ritas med `drawImage` + `globalCompositeOperation='lighter'`.
- Rutorna ritas till ett **cachat lager** som bara uppdateras när en ruta försvinner. Per bildruta ritas bara boll, paddel, partiklar och HUD.
- `devicePixelRatio` begränsas till 2 (3 på iPhone kostar fyllhastighet utan synlig vinst på tunna linjer).
- **Fast fysiksteg (120 Hz) med accumulator**, oberoende av skärmens 60/120 Hz (iPad Pro/ProMotion). Bollen rör sig i delsteg med svept kollision mot ett **rutnät (O(1)-uppslag)**, så den aldrig tunnlar genom rutor. Maxhastighet och minsta vertikalvinkel för att undvika oändliga horisontella studs.
- Partiklar i förallokerad pool (ingen garbage collection under spel). Spelet pausas vid `visibilitychange`.
- Spelplan med fast logisk bredd (336 enheter, 21 kolumner × 16). Höjden anpassas efter skärmformen (iPad 3:4 till smal telefon), med bräddning vid extrema format så hela skärmen används.

**Input:** Pointer Events, `touch-action:none`, ingen scroll/zoom/långtryck/markering under spel.

**iOS-hemskärmsrecept** (från din CLAUDE.md): inget `black-translucent`, `theme-color` = toppens färg, `.remove-blur`-remsan, `env(safe-area-inset-*)` bara för HUD och dock.

**PWA:** `manifest.webmanifest`, apple-touch-icon (hexagonikon), service worker med versionerad cache (offline fungerar, ny version laddas vid uppdatering).

**Säkerhet**
- Inga tredjepartsskript, CDN:er eller analys. Allt serveras från samma ursprung.
- Strikt CSP via `<meta>` (`default-src 'self'`, ingen `eval`, inga inline-skript). Aldrig `innerHTML` med data, bara `textContent`.
- Sparad data (localStorage, versionerat schema) **valideras och begränsas vid inläsning**; allt omslutet i try/catch eftersom Safari kan blockera lagring.
- Liv räknas ut från sparad tidsstämpel mot `Date.now()`. Klocka som flyttas bakåt hanteras (klampas). **Känd begränsning:** man kan fuska genom att ändra enhetens klocka. Det är acceptabelt för v1; riktig skydd kräver server och blir aktuellt först om vi tjänar pengar.
- Reklam bakom ett gränssnitt (`AdProvider`) med en låtsasimplementation (5 s nedräkning ger ett liv). **Riktig mobilreklam fungerar inte i en ren webbapp**; det kräver senare en app-inpackning (t.ex. Capacitor). Gränssnittet gör bytet enkelt.

**Språk (i18n):** `src/i18n/en.js`, `sv.js` med platta nyckelobjekt, `t('key',{n:22})`. All text går via `t()`. Engelska är reserv om en nyckel saknas. Nytt språk = en ny fil + en rad i registret. Val sparas.

**Data-drivet:** zoner definieras i `zones.js` (palett, spelstil, nodform, vägtyp), banor som ASCII-rutnät i `levels/`. Kartan genereras från zondata så att alla 80 banor kan finnas utan handritade positioner.

## Filstruktur
```
index.html  manifest.webmanifest  sw.js  icons/
src/main.js            start, skärmbyte
src/core/              loop, input, storage, i18n, ads
src/game/              physics, grid, render (sprites/lager), particles
src/map/               kartvy, scroll, noder (square|hex|circle|diamond), vägar (sinus|honeycomb|circle|constellation)
src/data/zones.js, levels/zone1.js ...
src/i18n/en.js sv.js
tests/                 node:test för kollision, liv-timer, banvalidering
```

## Milstolpar
1. **Utkast (nästa steg):** skelett + PWA, kärnspel (boll/paddel/rutor, 6 banor i Spectrum-stil), liv och sparning, låtsasreklam, enkel karta med fyrkantiga noder och slingrande väg, EN/SV. Testas lokalt och sedan på iPad via GitHub Pages.
2. **Zoner:** de fyra nodformerna och fyra vägtyperna, zonövergång på kartan, zonernas spelstilar (Mirror, Hairline, Prism). *(= din todo: "Skapa rutor och vägar för att användas i zoner")*
3. **Banor:** 80 banor med validering, svårighetskurva, stjärnor.
4. **Finish:** ljud, power-ups m.m. om du vill, prestandamätning på riktig iPad/iPhone.

## Öppna frågor till senare
- Vad händer efter zon 4 (bana 81+)? Upprepa zonerna eller sluta?
- Ska stjärnor (1–3) baseras på liv kvar, tid eller poäng?
