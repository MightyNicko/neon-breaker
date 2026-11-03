# TODO

**Prioritet:** 1 = högst, 3 = lägst · **Komplexitet:** 1 = lägst, 3 = högst
**ID:** kategorins första bokstav + löpnummer i den ordning punkterna lades till (t.ex. B1, B2).

| ID | Uppgift | Kategori | Prio | Komplexitet | Status |
|----|---------|----------|------|-------------|--------|
| L1 | Lägga till ljudeffekter | Ljud | 2 | 2 | Öppen |
| G1 | Minska mellanrummet mellan block | Grafik | 1 | 1 | Öppen |
| S1 | Skapa upgrades i form av fallande föremål | Spelmekanik | 2 | 3 | Öppen |
| S2 | Klara en bana och få 1–3 stjärnor (grund att bestämma; förslaget "bollar kvar" avvisat av användaren) | Spelmekanik | 2 | 2 | Öppen – beslut krävs |
| M1 | Skapa en in-game shop där man kan köpa cosmetics | Monetisering | 3 | 3 | Öppen |
| S3 | Ändra hur liv fungerar (nuvarande: 5 liv, +1 per 20 min, ändringen ej specificerad) | Spelmekanik | 2 | 2 | Öppen – beslut krävs |
| S4 | Utmaningsbanor: vissa banor (t.ex. var 10:e) får större ruta på kartan; klara banan på tid för in-game valuta | Spelmekanik | 3 | 3 | Öppen (kräver valuta, jfr M1) |
| G2 | Klarad bana på kartan: tjockare ram och lysa upp, samma för spåret fram till rutan | Grafik | 2 | 1 | Öppen |
| U1 | Versionsnummer på förstasidan i formatet v0.1.MMdd.hhmm (kräver stämpel vid release, t.ex. litet skript) | UI | 3 | 1 | Öppen |
| B1 | Bollen går igenom paddelns sida/underkant (bara ovansidan studsar) | Bug | 1 | 2 | Öppen |
| B2 | Hörnträff mot två rutor samtidigt ger märkliga studsar (bara en axel vänds) | Bug | 2 | 2 | Öppen |
| B3 | Bollen kan studsa nästan horisontellt mellan väggarna länge / fastna (anti-stall) | Bug | 1 | 1 | Öppen |
| T1 | Simulering utan skärm: AI-paddel spelar alla banor många gånger + fysiktester (fastnar? omöjliga? genom rutor?) | Teknik | 1 | 2 | Öppen |
| T2 | Testa på riktig iPad/iPhone: hemskärm, säkra kanter, blurfix, prestanda (kräver GitHub Pages) | Teknik | 1 | 1 | Öppen – kräver användaren |
| T3 | Kartans prestanda: rita bara det som syns eller förrendera (över 4 000 px med glödfilter) | Teknik | 2 | 2 | Öppen |
| T4 | Meddelande "ny version, ladda om" när service workern uppdaterats | Teknik | 3 | 2 | Öppen |
| T5 | Dela upp main.js (skärmflöde/dialoger/liv) och game.js (fysik/rendering) | Teknik | 3 | 2 | Öppen |
| T6 | Liggande läge: "vrid enheten"-ruta eller bra liggande layout (iOS kan inte låsa riktning) | Teknik | 2 | 2 | Öppen |
| T7 | Klockfusk på liv/valuta: serverkontroll när valuta och butik införs | Teknik | 3 | 3 | Öppen (jfr M1, S4) |
| S5 | Bollens fart ökar under spelets gång (konstant per bana idag) | Spelmekanik | 2 | 1 | Öppen |
| S6 | Poäng och kombo (flera rutor i rad) | Spelmekanik | 2 | 2 | Öppen |
| S7 | Fler rutsorter: flera träffar, oförstörbara, sprängrutor | Spelmekanik | 2 | 3 | Öppen |
| S8 | Mål bortom att klara banan: poäng, valuta, belöningar (jfr S4, M1) | Spelmekanik | 3 | 3 | Öppen |
| G3 | Träffrespons: blixt vid träff, skärmskak, paddelrespons, bollglöd | Grafik | 1 | 2 | Öppen |
| G4 | Kombo-effekter: stigande ljus/ton vid flera rutor i rad | Grafik | 3 | 2 | Öppen (jfr S6, L1) |
| G5 | Slow motion och större explosion på sista rutan | Grafik | 3 | 1 | Öppen |
| G6 | Dött utrymme i spelet: större/tätare rutor eller flytta mönstren nedåt | Grafik | 1 | 1 | Öppen |
| G7 | Zonernas spelstilar: Mirror (golvreflektion), Hairline (tunna linjer), Prism (glas); alla banor ser ut som Spectrum idag | Grafik | 2 | 3 | Öppen |
| G8 | Displaytypsnitt för namn och rubriker | Grafik | 3 | 1 | Öppen |
| G9 | Eget ritat hjärta i stället för teckensnittsglyf | Grafik | 3 | 1 | Öppen |
| U2 | Nedräkning 3-2-1 efter paus (bollen släpps direkt idag) | UI | 2 | 1 | Öppen |
| U3 | Bana-klar-skärm med fanfar och stjärnor (jfr S2) | UI | 2 | 2 | Öppen |
| U4 | Introduktion första gången: animerad hand och text på bana 1 (dra i fältet runt paddeln) | UI | 2 | 1 | Öppen |
| A1 | Tillgänglighet: stöd för färgblindhet och reducerad rörelse | Tillgänglighet | 3 | 2 | Öppen |
| I1 | Jämna ut svårighetskurvan på bana 1–5 (hjärtat 230 rutor vs måltavlan 164) | Innehåll | 2 | 1 | Öppen |
| I2 | Skriva resterande 75 banor (zon 1–4 à 20) | Innehåll | 3 | 3 | Öppen |
| U5 | Byt benämningen "upgrades" till "Power-Ups" (i TODO, S1 och all kommande text/kod) | UI | 3 | 1 | Öppen |
