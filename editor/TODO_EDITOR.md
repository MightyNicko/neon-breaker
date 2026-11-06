# TODO – banredigerare

**Prioritet:** 1 = högst, 3 = lägst · **Komplexitet:** 1 = lägst, 3 = högst  
**ID:** kategorins första bokstav + löpnummer i den ordning punkterna lades till (t.ex. V1, V2). Numren ändras aldrig.  
**Ordning:** kategorier i bokstavsordning, punkter i nummerordning.  
**Regel:** när spelets mekanik eller funktioner ändras uppdateras editorn bara efter att användaren har tillfrågats.

## Filformat (F)

| ID | Uppgift | Prio | Komplexitet | Status |
|----|---------|------|-------------|--------|
| F1 | En JSON-fil per bana i mappen levels/, som spelet läser direkt (ingen manuell omvandling) | 1 | 2 | Klar – en fil per bana |
| F2 | Rutnätet sparas som läsbar text, en rad per rutrad (t.ex. "..##.."), så att ändringar syns tydligt i git | 1 | 1 | Klar |
| F3 | Versionsnummer för formatet i varje fil, så att spelet och editorn känner igen filer från en äldre editor | 1 | 1 | Klar |
| F4 | Konvertera de 5 befintliga banorna till filer så att de kan redigeras | 1 | 1 | Klar – levels/level-001…005.json |

## Grund (G)

| ID | Uppgift | Prio | Komplexitet | Status |
|----|---------|------|-------------|--------|
| G1 | Editorn körs offline på datorn i webbläsaren (Chrome eller Edge) | 1 | 2 | Klar – öppna editor/index.html i Chrome eller Edge |
| G2 | Spara och öppna banfiler direkt i projektmappen (webbläsarens filåtkomst) | 1 | 2 | Klar – sparar även levels/index.json |
| G3 | Editorn ligger i samma repo, mappen editor/, med historik och backup på GitHub | 1 | 1 | Klar |
| G4 | Gränssnittet på engelska (ändrat från svenska) | 2 | 1 | Klar |
| G5 | Layout B "Studio": banorna som en remsa överst, rutnätet i mitten, iPhone-förhandsvisning bredvid, verktyg och rutsorter i en rad under rutnätet, power-ups och inställningar till höger | 1 | 2 | Klar |
| G6 | Justerbara bredder med två dragbara avdelare: mellan rutnätet och telefonen, och mellan telefonen och panelen till höger (power-ups, inställningar, statistik), t.ex. för att göra telefonen större eller mindre | 1 | 1 | Klar – bredderna sparas |

## Hantering (H)

| ID | Uppgift | Prio | Komplexitet | Status |
|----|---------|------|-------------|--------|
| H1 | Autosparning i webbläsaren så att inget försvinner om fliken stängs | 1 | 1 | Klar |
| H2 | Översikt över alla 80 banor som små miniatyrer per zon | 2 | 2 | Öppen |
| H3 | Byta ordning på banor och se svårighetskurvan i översikten | 2 | 2 | Öppen |
| H4 | Kopiera och duplicera en bana | 2 | 1 | Klar |
| H5 | Mallar av befintliga former (hjärtat, hexagonen m.fl.) att utgå från | 3 | 2 | Öppen |
| H6 | Dra och släpp i banremsan för att byta ordning; numren och filerna följer med (bana 6 till plats 1 flyttar 1–5 ett steg) | 1 | 2 | Klar |
| H7 | Radera en bana med bekräftelse; senare banor flyttar ned ett nummer | 1 | 1 | Klar |
| H8 | Save all: sparar alla banor med osparade ändringar på en gång (Ctrl+Shift+S) | 1 | 1 | Klar |

## Inställningar (I)

| ID | Uppgift | Prio | Komplexitet | Status |
|----|---------|------|-------------|--------|
| I1 | Banans nummer och zon | 1 | 1 | Klar – zonen följer numret |
| I2 | Banans fart i en rullista med namn och siffror, t.ex. "Fast (300)" | 1 | 1 | Klar |
| I3 | Plats för stjärnregeln när den är bestämd (jfr S2 i TODO.md) | 3 | 1 | Öppen – väntar på beslut om stjärnor |
| I4 | Låsa en färgpalett för en viss bana (annars slumpas den, se S2) | 3 | 1 | Öppen – förslag |

## Kontroll (K)

Beslutat: svårighet och kontroll fylls i av Claude efter att banan har testats, och sparas i banans fil. Editorn visar bara resultatet.

| ID | Uppgift | Prio | Komplexitet | Status |
|----|---------|------|-------------|--------|
| K1 | Kontrollera att banan går att klara, t.ex. att oförstörbara rutor inte stänger in andra rutor | 1 | 2 | Öppen – görs av Claude vid test |
| K2 | Kontrollera att det inte finns fler power-ups än rutor som kan bära dem | 1 | 1 | Öppen – görs av Claude vid test |
| K3 | Statistik: antal rutor per sort och uppskattad svårighet | 2 | 1 | Öppen – svårigheten sätts av Claude vid test |
| K4 | Låt boten spela banan många gånger och visa tid och om den fastnar (jfr T1 i TODO.md) | 2 | 3 | Öppen – görs av Claude vid test |
| K5 | Banans fil har fält för svårighet och kontrollresultat, som editorn visar men inte ändrar | 1 | 1 | Klar – fältet test |

## Power-ups (P)

Ingen power-up finns i spelet än; varje sort måste byggas i spelet också (se S4).

| ID | Uppgift | Prio | Komplexitet | Status |
|----|---------|------|-------------|--------|
| P1 | Välja vilka power-ups som ska finnas på banan och hur många av varje | 1 | 1 | Klar i editorn |
| P2 | Bredare paddel – byggs först; kapsel med E som faller sakta, rullar och fångas av paddeln | 1 | 1 | Klar i spelet – pillret B, texten BIG; paddeln blir 96 i stället för 64 i 20 s och blinkar de sista 2 s; slutar när bollen tappas |
| P3 | Slow motion: bara bollen eller bollarna saktas ned | 2 | 2 | Klar i spelet – pillret S (blått), SLOW: bollarna går i 65 % av farten i 10 s; krockar med FAST |
| P4 | Multiboll: bollen blir 3; bollen förloras först när alla är borta | 2 | 2 | Klar i spelet – pillret M: den högsta bollen blir tre, de två nya ±20°; max 12 bollar; missen räknas först när sista bollen är borta |
| P5 | Eldboll som går igenom rutor, men inte igenom oförstörbara rutor | 2 | 2 | Klar i spelet – fallande eldklot, FIRE: i 8 s brinner alla bollar (även de som multiboll lägger till) och ser ut som eldklotet; de går rakt igenom krossbara rutor (även rutor med två träffar och bomber) men studsar på oförstörbara |
| P6 | Maskingevär: klicka på skärmen för att skjuta | 2 | 3 | Klar i spelet – roterande rött sikte, GUN: paddeln krymper och förvandlas till en plasmakanon (44 bred) på knappt en halv sekund med gnistor, och skjuter sedan själv i 8 s, 4 skott i sekunden växelvis från två mynningar; varje skott är en träff; oförstörbara rutor stoppar skotten; krockar med BIG och TINY |
| P7 | Mindre paddel (negativ) | 2 | 1 | Klar i spelet – pillret T (rött, negativt), TINY: paddeln blir 44 i 15 s; krockar med BIG |
| P8 | Snabbare boll (negativ) | 2 | 1 | Klar i spelet – pillret F (rött, negativt), FAST: bollarna går i 130 % av farten i 10 s; krockar med SLOW |
| P9 | Hur länge en power-up varar bestäms per power-up när den byggs; vad som händer när två krockar (t.ex. bredare och mindre paddel) | 1 | 1 | Beslutat: bara power-ups som påverkar samma sak krockar (bredare/mindre paddel, långsam/snabb boll), och då tar den senaste över med ny tid. Alla andra gäller samtidigt, t.ex. bredare paddel och multiboll |

## Rutsorter (R)

Bara vanliga rutor finns i spelet idag; de andra sorterna måste byggas i spelet också (se S5).

| ID | Uppgift | Prio | Komplexitet | Status |
|----|---------|------|-------------|--------|
| R1 | Kräver en träff (dagens ruta) | 1 | 1 | Klar i editorn |
| R2 | Kräver 2 träffar | 1 | 1 | Klar |
| R3 | Oförstörbar (räknas inte när banan ska klaras) | 1 | 1 | Klar |
| R4 | Bomb: sprängs efter 5 träffar och förstör alla rutor runt sig, även oförstörbara | 2 | 2 | Klar – bomber som sprängs efter 1, 2, 3 eller 5 träffar (a, b, c, B i banfilen; tangent 5, 6, 7, 4 i editorn); alla spränger provisoriskt 3 × 3, även oförstörbara, med kedjereaktion. Sprängningen: vit blixt och tryckvåg, och rutorna splittras i neonbitar som faller (förslag E) |
| R5 | Rutorna ser olika ut per sort, så att de syns i både editorn och spelet | 1 | 1 | Klar |

## Spelet (S)

Ändringar i själva spelet som editorns banor kräver.

| ID | Uppgift | Prio | Komplexitet | Status |
|----|---------|------|-------------|--------|
| S1 | Spelet läser banorna från levels/ i stället för formlerna i levels.js | 1 | 2 | Klar |
| S2 | Färger slumpas varje gång banan startar, bland utvalda neonpaletter per zon så att det alltid blir snyggt | 1 | 1 | Klar – slumpad färgordning (rader, kolumner, diagonaler eller ringar) från en slumpad startfärg |
| S3 | Power-ups göms i slumpvisa rutor varje start och faller ut när rutan går sönder; aldrig i oförstörbara rutor och inte alla i de sista rutorna | 1 | 2 | Klar – en per ruta, slumpat bland alla krossbara rutor |
| S4 | Bygga power-up-sorterna (P2–P8) i spelet | 1 | 3 | Klar – alla power-up-sorter är byggda |
| S5 | Bygga rutsorterna (R2–R4) i spelet | 1 | 2 | Klar – bombens område är provisoriskt 3 × 3 |
| S6 | Slumpen får ett startvärde som sparas, så att en konstig placering kan återskapas | 2 | 1 | Klar – fröet styr färger och power-ups; det syns i testspelets pausmeny och med ?perf, och ?seed=N upprepar en start |
| S7 | Fem rader till nederst i spelytan, 25 i stället för 20, för häftigare banor och svårare nivåer; kontrollera att det finns plats att spela på mindre iPhones | 1 | 1 | Klar |
| S8 | Spelet placerar banfilernas rader fast som i editorn, utan att flytta korta mönster nedåt | 1 | 1 | Klar |
| S9 | Taket flyttat ned till översta radens överkant, så att den ligger mot taket som de yttersta rutorna mot väggarna | 1 | 1 | Klar i spelet och editorn |

## Testspel (T)

| ID | Uppgift | Prio | Komplexitet | Status |
|----|---------|------|-------------|--------|
| T1 | Provspela banan direkt i editorn med spelets riktiga fysik | 1 | 2 | Klar – Play test öppnar det riktiga spelet i iPhone 15-storlek med banan som den är just nu, sparad eller inte, med en ruta bredvid som visar rutor kvar per sort, power-ups kvar att hitta per sort, bollar och frö. Öppnad från disken används det publicerade spelet, så ändringar i spelet syns där först efter push |
| T2 | Förhandsvisning i iPhone-format: var paddeln och det tomma fältet hamnar | 1 | 1 | Klar |
| T3 | Rutnätet är telefonen 1:1: rad 1 ligger alltid på samma plats, rutorna flyttas aldrig automatiskt | 1 | 1 | Klar i editorn |

## Verktyg (V)

| ID | Uppgift | Prio | Komplexitet | Status |
|----|---------|------|-------------|--------|
| V1 | Rutnät på 21 kolumner och 25 rader där man ritar rutor och väljer sort | 1 | 1 | Klar |
| V2 | Penna och sudd | 1 | 1 | Klar – högerklick suddar också |
| V3 | Fyllning, rektangel och linje | 2 | 1 | Klar |
| V4 | Spegling: rita en halva, den andra speglas automatiskt | 1 | 1 | Klar |
| V5 | Ångra och gör om | 1 | 1 | Klar |
| V6 | Flytta hela mönstret | 2 | 1 | Klar |
| V7 | Rensa-knapp som tar bort alla rutor och power-ups på banan (går att ångra) | 1 | 1 | Klar |
| V8 | Lodrät och vågrät mittlinje som slås på var för sig, oberoende av spegling | 2 | 1 | Klar |
| V9 | Editorn minns senaste verktyg, rutsort, spegling och mittlinjer | 2 | 1 | Klar |
