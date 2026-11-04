# TODO

**Prioritet:** 1 = högst, 3 = lägst · **Komplexitet:** 1 = lägst, 3 = högst  
**ID:** kategorins första bokstav + löpnummer i den ordning punkterna lades till (t.ex. B1, B2). Numren ändras aldrig.  
**Ordning:** kategorier i bokstavsordning, punkter i nummerordning.

## Bug (B)

| ID | Uppgift | Prio | Komplexitet | Status |
|----|---------|------|-------------|--------|
| B1 | Bollen går igenom paddelns sida/underkant (bara ovansidan studsar) | 1 | 2 | Klar |
| B2 | Hörnträff mot två rutor samtidigt ger märkliga studsar (bara en axel vänds) | 2 | 2 | Öppen |
| B3 | Bollen kan studsa nästan horisontellt mellan väggarna länge / fastna (anti-stall) | 1 | 1 | Klar – orsaken var lodräta loopar och långa uppehåll, inte vågrät studs |

## Grafik (G)

| ID | Uppgift | Prio | Komplexitet | Status |
|----|---------|------|-------------|--------|
| G1 | Minska mellanrummet mellan block | 1 | 1 | Öppen |
| G2 | Klarad bana på kartan: tjockare ram och lysa upp, samma för spåret fram till rutan | 2 | 1 | Öppen |
| G3 | Träffrespons: blixt vid träff, skärmskak, paddelrespons, bollglöd | 1 | 2 | Öppen |
| G4 | Kombo-effekter: stigande ljus/ton vid flera rutor i rad | 3 | 2 | Öppen (jfr S6, L1) |
| G5 | Slow motion och större explosion på sista rutan | 3 | 1 | Öppen |
| G6 | Dött utrymme i spelet: större/tätare rutor eller flytta mönstren nedåt | 1 | 1 | Öppen |
| G7 | Zonernas spelstilar: Mirror (golvreflektion), Hairline (tunna linjer), Prism (glas); alla banor ser ut som Spectrum idag | 2 | 3 | Öppen |
| G8 | Displaytypsnitt för namn och rubriker | 3 | 1 | Öppen |
| G9 | Eget ritat hjärta i stället för teckensnittsglyf | 3 | 1 | Öppen |
| G10 | Ny hemskärmsikon (modern, ser bra ut på skärmen; ersätter den genererade hexagonikonen). Ska göras före allt annat. Skapas med tools/make-icons.py | 1 | 2 | Klar – ikon C (Krossen) |

## Innehåll (I)

| ID | Uppgift | Prio | Komplexitet | Status |
|----|---------|------|-------------|--------|
| I1 | Jämna ut svårighetskurvan på bana 1–5 (hjärtat 230 rutor vs måltavlan 164) | 2 | 1 | Öppen |
| I2 | Skriva resterande 75 banor (zon 1–4 à 20) | 3 | 3 | Öppen |

## Ljud (L)

| ID | Uppgift | Prio | Komplexitet | Status |
|----|---------|------|-------------|--------|
| L1 | Lägga till ljudeffekter | 2 | 2 | Öppen |

## Monetisering (M)

| ID | Uppgift | Prio | Komplexitet | Status |
|----|---------|------|-------------|--------|
| M1 | Skapa en in-game shop där man kan köpa cosmetics | 3 | 3 | Öppen |

## Spelmekanik (S)

| ID | Uppgift | Prio | Komplexitet | Status |
|----|---------|------|-------------|--------|
| S1 | Skapa upgrades i form av fallande föremål | 2 | 3 | Öppen |
| S2 | Klara en bana och få 1–3 stjärnor (grund att bestämma; förslaget "bollar kvar" avvisat av användaren) | 2 | 2 | Öppen – beslut krävs |
| S3 | Ändra hur liv fungerar (nuvarande: 5 liv, +1 per 20 min, ändringen ej specificerad) | 2 | 2 | Öppen – beslut krävs |
| S4 | Utmaningsbanor: vissa banor (t.ex. var 10:e) får större ruta på kartan; klara banan på tid för in-game valuta | 3 | 3 | Öppen (kräver valuta, jfr M1) |
| S5 | Bollens fart ökar under spelets gång (konstant per bana idag) | 2 | 1 | Öppen |
| S6 | Poäng och kombo (flera rutor i rad) | 2 | 2 | Öppen |
| S7 | Fler rutsorter: flera träffar, oförstörbara, sprängrutor | 2 | 3 | Öppen |
| S8 | Mål bortom att klara banan: poäng, valuta, belöningar (jfr S4, M1) | 3 | 3 | Öppen |
| S9 | Minska bollens hastighet när en bana startar (jfr S5) | 1 | 1 | Öppen |
| S10 | Välj bollens riktning vid start: tryck på höger sida av skärmen skickar den åt höger, vänster sida åt vänster | 2 | 1 | Öppen |

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
| U4 | Introduktion första gången: animerad hand och text på bana 1 (dra i fältet runt paddeln) | 2 | 1 | Öppen |
| U5 | Byt benämningen "upgrades" till "Power-Ups" (i TODO, S1 och all kommande text/kod) | 3 | 1 | Öppen |
| U6 | Bredda kartan så att hela skärmbredden utnyttjas på iPad (idag en smal kolumn med tomma sidor) | 1 | 2 | Öppen |
