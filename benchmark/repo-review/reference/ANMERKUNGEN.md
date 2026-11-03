# Anmerkungen zur Referenzmessung vom 2026-11-03

Maßgeblich sind die regelbasiert berechneten Zahlen in `report.md` / `report.json`
(Schwellen und Zuordnungsregel vor der Messung festgelegt). Diese Anmerkungen sind
**nicht normativ**: Sie halten fest, wo die Zuordnung über Datei und Zeilen bei der
Durchsicht der Rohausgaben erkennbar danebenliegt. Sie ändern keine Zahl im Bericht.

## Umfang

- Ausgewertet: je 3 Läufe Claude Opus 5.5 und Claude Sonnet 5.5, Aufruf
  `/ase:ase-repo-review -c HEAD -S LOW`, ASE 2.0.6 (`plugin/` und `tool/` unverändert seit `4aae719e`), Claude-Code-CLI 2.1.302.
- Nicht enthalten: zwei vorherige Sonnet-Probeläufe mit der ursprünglichen Aufrufkonfiguration
  (`20261103T071925Z`: Abbruch durch die Isolationsprüfung, `20261103T072901Z`: `unauswertbar`,
  weil der Sub-Agent `git` nicht ausführen durfte). Beide führten zur SD-/TP-Revision 1.
- Kosten der gesamten Messung einschließlich Probeläufen: 3,59 USD.

## Erkennbare Zuordnungsfehler

| Lauf | Befund im Review | Regelbasiert gewertet | Bei Durchsicht |
|---|---|---|---|
| sonnet `073102Z` | HIGH `discount.ts:30-36`: Prozentcodes berechnen den Restbetrag falsch | Köder K-01 gemeldet, B-02 verfehlt | B-02 gefunden, aber am `switch` statt an `percentOff` verortet |
| opus `074051Z` | HIGH `discount.ts:33-34`: `percentOff` liefert den Rabatt statt des Restbetrags | Köder K-01 gemeldet, B-02 verfehlt | B-02 gefunden, am Aufruf statt an der Funktion verortet |
| opus `073856Z` | HIGH `order.ts:29`: `DEFAULT_OPTIONS.tags` wird verändert | nicht zuordenbar, B-04 verfehlt | B-04 gefunden, an der Deklaration statt am `push` verortet |
| opus `073856Z` | MEDIUM `discount.ts:22-36`: fehlende Tests | Köder K-01 gemeldet | kein Bezug zum Köder, breite Bereichsangabe |
| sonnet `073102Z` | MEDIUM `api.ts:15-18`: Währung fest verdrahtet | Köder K-04 gemeldet | kein Bezug zu `== null`, Treffer nur über die Toleranz |
| sonnet `073357Z` | LOW `cart.ts:18-45`: ungenutzte Funktionen | Köder K-03 gemeldet | kein Bezug zur Schleifengrenze, breite Bereichsangabe |

Echte Köder-Meldungen (der Köder selbst wird beanstandet): K-02 (`customer!`) in zwei
Sonnet-Läufen, K-01 als LOW-Stilhinweis in einem Sonnet-Lauf; K-04 als LOW-Hinweis zur `== null`-Verzweigung
in einem Sonnet-Lauf ist ein Grenzfall (beanstandet wird die doppelte Verzweigung, nicht der Vergleich).

## Folgerung für die Kalibrierung

Regelbasiert lautet die Kalibrierung „angemessen“ (Opus fand in zwei Läufen nicht alle
Befunde). Bei Durchsicht hat Opus in **allen drei Läufen alle 7 Befunde** gefunden; nach
der Absicht von AC-011 wäre der Test damit **zu leicht**. Sonnet verfehlte B-02 in einem
Lauf tatsächlich.

## Empfohlene Verbesserungen für einen nächsten Fall (nicht umgesetzt)

- Sollliste: Fundstellen um die Deklaration bzw. den Aufruf ergänzen, an denen Modelle
  denselben Fehler typischerweise verorten (zum Beispiel B-04 auch `order.ts:29`,
  B-02 auch der Aufruf `discount.ts:34`); dafür den Mindestabstand zu Ködern einplanen.
- Köder weiter weg von Stellen legen, an denen echte, nicht eingebaute Schwächen liegen
  (K-04 neben der fest verdrahteten Währung, K-01 neben dem Prozentfehler).
- Breite Bereichsangaben (mehr als 10 Zeilen) gesondert zählen statt sie per Überlappung
  zuzuordnen.
- Schwerere Fälle ergänzen, bevor Ergebnisse als Aussage über offene Modelle dienen.
