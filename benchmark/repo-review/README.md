# Wirksamkeitstest für `ase-repo-review`

Misst reproduzierbar, wie viele eingebaute Fehler der Skill `ase-repo-review` mit
einem gegebenen Modell findet und wie oft er korrekten Code beanstandet. Die
Auswertung ist rein regelbasiert, ohne bewertendes Modell.

## Aufbau

| Pfad | Inhalt |
|---|---|
| `fixture/base/`, `fixture/change/` | Beispielprojekt „shop-core“: fehlerfreier Grundstand und die begutachtete Änderung |
| `solution/sollliste.json` | verborgene Sollliste: Befunde in drei Stufen und Köder mit Fundstellen (gelangt nie in eine Arbeitskopie) |
| `thresholds.json` | vorab festgelegte Schwellen (vor dem ersten Messlauf committet) |
| `check.mjs` | prüft die Sollliste gegen das Fixture |
| `run.mjs` | Runner: Wegwerfkopie, Leckprüfung, `claude -p`, Ergebnisordner |
| `compare.mjs` | Vergleich der Ergebnisordner mit der Sollliste, Bericht in Markdown und JSON |
| `selftest.mjs` | Selbsttest von Parser, Zuordnung, Kennzahlen und Runner-Bausteinen |
| `testdata/` | gestellte `stream-json`-Mitschriften für Trockenläufe |
| `reference/` | Referenzmessung mit Claude Opus 5.5 und Sonnet 5.5 |
| `results/` | lokale Ergebnisordner (nicht versioniert) |

## Voraussetzungen

- Node.js 22 oder neuer, Git; unter Windows genügt PowerShell, Bash ist nicht nötig
- für bezahlte Läufe zusätzlich: Claude-Code-CLI (`claude`) mit Anmeldung und das
  gebaute `tool/` dieses Repos (`cd tool && npm start build`)

## Trockenlauf (ohne Modellaufruf, ohne Kosten)

```
node benchmark/repo-review/check.mjs
node benchmark/repo-review/selftest.mjs
node benchmark/repo-review/run.mjs --dry-run
node benchmark/repo-review/run.mjs --dry-run --simulate unparseable
node benchmark/repo-review/run.mjs --dry-run --simulate abort-cost
node benchmark/repo-review/run.mjs --dry-run --simulate abort-time
node benchmark/repo-review/run.mjs --dry-run --simulate leak
node benchmark/repo-review/compare.mjs
```

`--replay <datei>` spielt eine eigene `stream-json`-Mitschrift ein, zum Beispiel
`testdata/isolation.jsonl` oder `testdata/kontamination.jsonl`.

## Messlauf (bezahlt)

Ein Messlauf startet nur, wenn `thresholds.json` committet und unverändert ist,
`tool/` gebaut ist und `--confirm-paid` angegeben wird:

```
node benchmark/repo-review/run.mjs --model sonnet --runs 3 --confirm-paid
node benchmark/repo-review/run.mjs --model opus   --runs 3 --confirm-paid
node benchmark/repo-review/compare.mjs
```

Jeder Lauf ruft fest `/ase:ase-repo-review -c HEAD -S LOW` auf, mit Kostengrenze
5 USD und Zeitgrenze 20 Minuten. Das Serienbudget eines Aufrufs (Standard 30 USD)
wird vor jedem weiteren Lauf geprüft; `--prior-spent` übernimmt bereits
verbrauchte Kosten einer Serie. Geerbte `CLAUDE*`- und `ANTHROPIC_*`-Variablen
werden für den Kindprozess entfernt; geladen wird nur das Plugin dieser
Arbeitskopie. MCP-Server kommen ausschließlich über `--strict-mcp-config` und eine
erzeugte `--mcp-config` mit genau dem Server `ase`; die claude.ai-Konnektoren des
Kontos bleiben damit außen vor. Die eingebauten Plugins der CLI (`@builtin`) werden
nur protokolliert. Lädt `claude` ein anderes Plugin oder einen anderen MCP-Server,
bricht der Runner sofort ab (Status `fehler`, Grund `isolation`). Nach jedem Lauf
beendet der Runner übrig gebliebene ASE-Prozesse (etwa den Projektdienst) und
vermerkt sie im Protokoll.

Status eines Laufs: `ok`, `unauswertbar` (Ausgabe nicht als Review erkennbar,
zählt mit 0 Treffern), `abgebrochen` (Kosten oder Zeit), `fehler` (Leck,
Isolation, Kontamination, Start).

## Bericht

`compare.mjs` liefert je Modell die Trefferquote je Stufe (offensichtlich, mittel,
versteckt) und gesamt (Mittel, Minimum, Maximum), die Köder-Fehlalarmquote, die
nicht zuordenbaren Befunde, das Urteil des Skills je Lauf, Dauer und Kosten sowie
das Schwellenurteil „Schwelle erreicht“ bzw. „nicht erreicht“. Für Opus kommt eine
Kalibrierungsaussage hinzu: „zu leicht“, wenn alle Läufe alle Befunde finden.
Zweimal auf dieselben Ordner angewendet, ist `report.json` byte-gleich.

Zuordnung: Dateiname und Zeilenüberlappung mit Toleranz 3 Zeilen; bei mehreren
Kandidaten gewinnt die größte Überlappung, dann der kleinste Abstand, dann die
kleinste ID. `ACCEPTED`-Befunde zählen weder als Treffer noch als Fehlalarm.

## Andere Endpunkte (offene Modelle)

```
$env:BENCH_TOKEN = "<token des Anbieters>"
node benchmark/repo-review/run.mjs --model <modell-id> --base-url https://anbieter.example/v1 --auth-token-env BENCH_TOKEN --confirm-paid
```

`--base-url` setzt `ANTHROPIC_BASE_URL`, `--auth-token-env` liest das Token aus der
genannten Variable und setzt `ANTHROPIC_AUTH_TOKEN`. Das Laufprotokoll vermerkt den
Endpunkt, aber nie das Token. Die Kostenangaben der CLI (`total_cost_usd`) beruhen
auf Anthropic-Preisen und sind für andere Endpunkte unzuverlässig; der Bericht
weist darauf hin. Zum Ausprobieren ohne Kosten:
`node benchmark/repo-review/run.mjs --dry-run --base-url https://example.invalid --auth-token-env BENCH_TOKEN`.

## Herkunft

Vorgehen und Zuordnungsregel folgen dem Wirksamkeitstest von MERIT
(`tests/effectiveness/`); der Code ist neu geschrieben.
