# TODO

**Prioritet:** 1 = högst, 3 = lägst · **Komplexitet:** 1 = lägst, 3 = högst  
**ID:** kategorins första bokstav + löpnummer i den ordning punkterna lades till (t.ex. B1, B2). Numren ändras aldrig.  
**Ordning:** kategorier i bokstavsordning, punkter i nummerordning.

## Bug (B)

| ID | Uppgift | Prio | Komplexitet | Status |
|----|---------|------|-------------|--------|
| B1 | Bollen går igenom paddelns sida/underkant (bara ovansidan studsar) | 1 | 2 | Klar |
| B2 | Hörnträff mot två rutor samtidigt ger märkliga studsar (bara en axel vänds) | 2 | 2 | Öppen |
| B3 | Bollen kan studsa nästan horisontellt mellan väggarna länge / fastna (anti-stall) | 1 | 1 | Klar – loopbrytare: paddeln styr alltid vinkeln, bara samma träff tre gånger i rad får en knuff på 3–6° |
| B4 | Spelet blir söligt till och från, bollen ser ut att gå saktare (på iPad och iPhone); mät bildtiderna först för att hitta orsaken | 1 | 2 | Klar – märks inte längre efter omgjord ritning och jämn bollrörelse (2026-11-06); tas upp igen om det återkommer |
| B5 | Känns som vibration i telefonen; allt som vibrerar ska bort | 1 | 1 | Struken – det var telefonen som glappade i fodralet. Spelet har ingen vibration; de djupa ljudeffekterna är ändå höjda till över 200 Hz |

## Grafik (G)

| ID | Uppgift | Prio | Komplexitet | Status |
|----|---------|------|-------------|--------|
| G1 | Minska mellanrummet mellan block | 1 | 1 | Klar |
| G2 | Klarad bana på kartan: tjockare ram och lysa upp, samma för spåret fram till rutan | 2 | 1 | Öppen |
| G3 | Träffrespons: blixt vid träff, skärmskak, paddelrespons, bollglöd | 1 | 2 | Klar |
| G4 | Kombo-effekter: stigande ljus/ton vid flera rutor i rad | 3 | 2 | Öppen (jfr S6, L1) |
| G5 | Slow motion och större explosion på sista rutan | 3 | 1 | Öppen |
| G6 | Dött utrymme i spelet: större/tätare rutor eller flytta mönstren nedåt | 1 | 1 | Klar – korta mönster flyttas nedåt |
| G7 | Zonernas spelstilar: Mirror (golvreflektion), Hairline (tunna linjer), Prism (glas); alla banor ser ut som Spectrum idag | 2 | 3 | Öppen |
| G8 | Displaytypsnitt för namn och rubriker | 3 | 1 | Öppen |
| G9 | Eget ritat hjärta i stället för teckensnittsglyf | 3 | 1 | Öppen |
| G10 | Ny hemskärmsikon (modern, ser bra ut på skärmen; ersätter den genererade hexagonikonen). Ska göras före allt annat. Skapas med tools/make-icons.py | 1 | 2 | Klar – ikon C (Krossen) |
| G11 | Ta bort paddelns animation (sjunker och lyser) när bollen träffar den | 1 | 1 | Klar |
| G12 | Knivskarpa rutor: full upplösning, 1 punkt tunn linje, kanter på hela pixlar och yttersta rutorna mot skärmkanten | 1 | 2 | Klar |
| G13 | Mockups på ikonen för Core (ersätter hjärtat för liv, jfr S13) | 2 | 1 | Klar – hexagonkärna (förslag A) |

## Innehåll (I)

| ID | Uppgift | Prio | Komplexitet | Status |
|----|---------|------|-------------|--------|
| I1 | Jämna ut svårighetskurvan på bana 1–5 (hjärtat 230 rutor vs måltavlan 164) | 2 | 1 | Öppen |
| I2 | Skriva resterande 75 banor (zon 1–4 à 20) | 3 | 3 | Öppen |

## Ljud (L)

| ID | Uppgift | Prio | Komplexitet | Status |
|----|---------|------|-------------|--------|
| L1 | Lägga till ljudeffekter | 2 | 2 | Klar – syntetiserat ljud, av/på i inställningarna |
| L2 | Bakgrundsmusik i SID-stil under spel | 2 | 2 | Klar – audio/neon-breaker-sid-loop.wav, skapas med tools/make-sid-loop.mjs; följer ljudinställningen |
| L3 | Stretchande ljud när paddeln blir bredare av power-upen | 3 | 1 | Klar – glidande ton uppåt med ett gummiband-darr |

## Monetisering (M)

| ID | Uppgift | Prio | Komplexitet | Status |
|----|---------|------|-------------|--------|
| M1 | Skapa en in-game shop där man kan köpa cosmetics | 3 | 3 | Öppen |

## Spelmekanik (S)

| ID | Uppgift | Prio | Komplexitet | Status |
|----|---------|------|-------------|--------|
| S1 | Skapa upgrades i form av fallande föremål | 2 | 3 | Klar – alla power-ups byggda; gemensamt system i src/game/powerups.js |
| S2 | Klara en bana och få 1–3 stjärnor (grund att bestämma; förslaget "bollar kvar" avvisat av användaren) | 2 | 2 | Öppen – beslut krävs |
| S3 | Ändra hur liv fungerar (nuvarande: 5 liv, +1 per 20 min, ändringen ej specificerad) | 2 | 2 | Ersatt av S13 och S14 |
| S4 | Utmaningsbanor: vissa banor (t.ex. var 10:e) får större ruta på kartan; klara banan på tid för in-game valuta | 3 | 3 | Öppen (kräver valuta, jfr M1) |
| S5 | Bollens fart ökar under spelets gång (konstant per bana idag) | 2 | 1 | Klar – når banans fart efter 30 s |
| S6 | Poäng och kombo (flera rutor i rad) | 2 | 2 | Öppen |
| S7 | Fler rutsorter: flera träffar, oförstörbara, sprängrutor | 2 | 3 | Öppen |
| S8 | Mål bortom att klara banan: poäng, valuta, belöningar (jfr S4, M1) | 3 | 3 | Öppen |
| S9 | Minska bollens hastighet när en bana startar (jfr S5) | 1 | 1 | Klar – varje boll börjar på 75 % av banans fart |
| S10 | Välj bollens riktning vid start: tryck på höger sida av skärmen skickar den åt höger, vänster sida åt vänster | 2 | 1 | Klar |
| S11 | Ny power-up: skydd bakom paddeln, ett golv som studsar tillbaka bollar som missas; bra kombo med multiboll | 2 | 2 | Klar i spelet och editorn ("Floor shield", bärnstensfärgat piller G, texten GUARD) – laserstaket, 15 s, blinkar de sista 2 s, studsar alla bollar; en boll som kommer underifrån studsar ned på paddelns undersida |
| S12 | Power-ups med procentchans: en bana kan ha t.ex. multiboll bockad med 10 %, då är det 10 % chans att den finns med när banan startar; utöver de fasta antalen, så att banor inte känns statiska vid omspel | 2 | 2 | Klar – kryssruta och procent per power-up i editorn; en start lägger till en till av sorten om chansen slår in; fältet chances i banfilen |
| S13 | Liv tas bort ur spelet och ersätts av Cores: max 5, en ny var 20:e minut som i dag; de 3 bollarna per bana försvinner | 1 | 2 | Klar – liv och de 3 bollarna borttagna; sparade liv blir Cores. |
| S14 | Missad boll: meddelande "Du förlorade en Core", sedan valen "Use a Core to continue" eller "Cancel" tillbaka till kartan; man kan fortsätta på banan tills alla Cores är slut | 1 | 2 | Klar – beslutat: missen är gratis, "Använd en Core och fortsätt" kostar 1, Avbryt och Avsluta i pausmenyn är gratis; utan Cores är banan slut (reklam kanske senare); minst 1 Core krävs för att starta en bana |

## Teknik (T)

| ID | Uppgift | Prio | Komplexitet | Status |
|----|---------|------|-------------|--------|
| T1 | Simulering utan skärm: AI-paddel spelar alla banor många gånger + fysiktester (fastnar? omöjliga? genom rutor?) | 1 | 2 | Klar – tools/sim.mjs: spelar alla banor och tre egna testbanor (alla rutsorter, bombkedjor, oförstörbara fickor, högsta farten) med alla power-ups, i fyra skärmstorlekar, och kontrollerar fysiken efter varje steg; ett frö spelar upp samma körning igen. Körs en gång per bana i tests/sim.test.mjs |
| T2 | Testa på riktig iPad/iPhone: hemskärm, säkra kanter, blurfix, prestanda (kräver GitHub Pages) | 1 | 1 | iPad godkänd 2026-11-03; iPhone ej bekräftad |
| T3 | Kartans prestanda: rita bara det som syns eller förrendera (över 4 000 px med glödfilter) | 2 | 2 | Öppen |
| T4 | Meddelande "ny version, ladda om" när service workern uppdaterats | 3 | 2 | Öppen |
| T5 | Dela upp main.js (skärmflöde/dialoger/liv) och game.js (fysik/rendering) | 3 | 2 | Delvis – power-ups utbrutna till src/game/powerups.js |
| T6 | Liggande läge: "vrid enheten"-ruta eller bra liggande layout (iOS kan inte låsa riktning) | 2 | 2 | Öppen |
| T7 | Klockfusk på liv/valuta: serverkontroll när valuta och butik införs | 3 | 3 | Öppen (jfr M1, S4) |
| T8 | Fokus på iPhone i stället för iPad: allt testas och anpassas för iPhone först (jfr T2) | 1 | 2 | Öppen |

## Tillgänglighet (A)

| ID | Uppgift | Prio | Komplexitet | Status |
|----|---------|------|-------------|--------|
| A1 | Tillgänglighet: stöd för färgblindhet och reducerad rörelse | 3 | 2 | Öppen |

## UI (U)

| ID | Uppgift | Prio | Komplexitet | Status |
|----|---------|------|-------------|--------|
| U1 | Versionsnummer på förstasidan i formatet v0.1.MMdd.hhmm (stämplas automatiskt av en pre-commit-hook) | 3 | 1 | Klar |
| U2 | Nedräkning 3-2-1 efter paus (bollen släpps direkt idag) | 2 | 1 | Öppen |
| U3 | Bana-klar-skärm med fanfar och stjärnor (jfr S2) | 2 | 2 | Öppen |
| U4 | Introduktion första gången: animerad hand och text på bana 1 (dra i fältet runt paddeln) | 2 | 1 | Klar |
| U5 | Byt benämningen "upgrades" till "Power-Ups" (i TODO, S1 och all kommande text/kod) | 3 | 1 | Öppen |
| U6 | Bredda kartan så att hela skärmbredden utnyttjas på iPad (idag en smal kolumn med tomma sidor) | 1 | 2 | Klar |
| U7 | Skärmskakning som inställning, avstängd från början | 1 | 1 | Struken – skakningen är borttagen helt, ingen inställning |
| U8 | Texten som visas när paddel-power-upen fångas byts från BREDARE/WIDE till EXTRA, så att den stämmer med E:et på pillret | 3 | 1 | Ersatt – paddelns power-up heter nu B och BIG |
| U9 | Infotips för nya spelare: varje ny mekanik (rutsort, power-up, Cores m.m.) förklaras första gången spelaren möter den. Vid första start frågar spelet om man har spelat tidigare; svarar man ja stängs tipsen av | 2 | 2 | Öppen – förslag: tipsen går även att slå på/av under Inställningar |
| U10 | Svenska texter för power-ups (i dag samma som de engelska: BIG, TINY, FAST, SLOW, MULTIBALL, GUARD, FIRE, GUN) | 3 | 1 | Öppen |
