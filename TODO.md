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
| B4 | Spelet blir söligt till och från, bollen ser ut att gå saktare (på iPad och iPhone); mät bildtiderna först för att hitta orsaken | 1 | 2 | Åtgärdad, ej bekräftad – ritningen omgjord: tre lager, bara ändrade rutor och det som rör sig ritas om, all glöd förberedd före spel. Bollen ritas nu mellan sina två senaste fysiklägen, så rörelsen blir jämn fast fysiksteg och skärmbilder inte går i takt (troligaste orsaken, eftersom det söliga märks även med få rutor kvar). Mätare med ?perf i adressen; väntar på mätning på telefon |
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

## Monetisering (M)

| ID | Uppgift | Prio | Komplexitet | Status |
|----|---------|------|-------------|--------|
| M1 | Skapa en in-game shop där man kan köpa cosmetics | 3 | 3 | Öppen |

## Spelmekanik (S)

| ID | Uppgift | Prio | Komplexitet | Status |
|----|---------|------|-------------|--------|
| S1 | Skapa upgrades i form av fallande föremål | 2 | 3 | Pågår – klassiskt piller (2/3 av mockupens storlek) som faller sakta, rullar och fångas av paddeln; bredare paddel är byggd, övriga sorter återstår |
| S2 | Klara en bana och få 1–3 stjärnor (grund att bestämma; förslaget "bollar kvar" avvisat av användaren) | 2 | 2 | Öppen – beslut krävs |
| S3 | Ändra hur liv fungerar (nuvarande: 5 liv, +1 per 20 min, ändringen ej specificerad) | 2 | 2 | Öppen – beslut krävs |
| S4 | Utmaningsbanor: vissa banor (t.ex. var 10:e) får större ruta på kartan; klara banan på tid för in-game valuta | 3 | 3 | Öppen (kräver valuta, jfr M1) |
| S5 | Bollens fart ökar under spelets gång (konstant per bana idag) | 2 | 1 | Klar – når banans fart efter 30 s |
| S6 | Poäng och kombo (flera rutor i rad) | 2 | 2 | Öppen |
| S7 | Fler rutsorter: flera träffar, oförstörbara, sprängrutor | 2 | 3 | Öppen |
| S8 | Mål bortom att klara banan: poäng, valuta, belöningar (jfr S4, M1) | 3 | 3 | Öppen |
| S9 | Minska bollens hastighet när en bana startar (jfr S5) | 1 | 1 | Klar – varje boll börjar på 75 % av banans fart |
| S10 | Välj bollens riktning vid start: tryck på höger sida av skärmen skickar den åt höger, vänster sida åt vänster | 2 | 1 | Klar |

## Teknik (T)

| ID | Uppgift | Prio | Komplexitet | Status |
|----|---------|------|-------------|--------|
| T1 | Simulering utan skärm: AI-paddel spelar alla banor många gånger + fysiktester (fastnar? omöjliga? genom rutor?) | 1 | 2 | Öppen |
| T2 | Testa på riktig iPad/iPhone: hemskärm, säkra kanter, blurfix, prestanda (kräver GitHub Pages) | 1 | 1 | iPad godkänd 2026-11-03; iPhone ej bekräftad |
| T3 | Kartans prestanda: rita bara det som syns eller förrendera (över 4 000 px med glödfilter) | 2 | 2 | Öppen |
| T4 | Meddelande "ny version, ladda om" när service workern uppdaterats | 3 | 2 | Öppen |
| T5 | Dela upp main.js (skärmflöde/dialoger/liv) och game.js (fysik/rendering) | 3 | 2 | Öppen |
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
