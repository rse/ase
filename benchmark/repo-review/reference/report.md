# Wirksamkeitstest ase-repo-review

Sollliste: `sha256:0b85107df3dd308fedc59f81b9832b687a9b7fa327402e2006f75e2f89d2decf`

Schwellen: Trefferquote gesamt ≥ 0.6, offensichtlich ≥ 0.8, Köder-Fehlalarmquote ≤ 0.25; Datei-Version `c3f00a577d903e21c8f991b1c583917680f11f7b`

## Modell opus

Urteil: **Schwelle erreicht**

Kalibrierung: **angemessen**

Läufe: 3 gesamt, 3 ausgewertet, 0 unauswertbar, 0 abgebrochen, 0 fehler

| Kennzahl | Mittel (Min–Max) |
|---|---|
| Trefferquote gesamt | 0.90 (0.86–1.00) |
| Trefferquote offensichtlich | 0.83 (0.50–1.00) |
| Trefferquote mittel | 0.89 (0.67–1.00) |
| Trefferquote versteckt | 1.00 (1.00–1.00) |
| Köder-Fehlalarmquote (n=3) | 0.17 (0.00–0.25) |
| nicht zuordenbare Befunde je Lauf | 1.00 (0.00–2.00) |
| Dauer je Lauf (s) | 116 |
| Kosten gesamt (USD) | 2.29 |

| Lauf | Status | Urteil des Skills | Treffer | Köder gemeldet | nicht zuordenbar | Dauer (s) | Kosten (USD) |
|---|---|---|---|---|---|---|---|
| 20261103T073704Z-opus-1 | ok | REJECT - DEMANDS CHANGES | B-01, B-02, B-03, B-04, B-05, B-06, B-07 | – | 0 | 113 | 0.89 |
| 20261103T073856Z-opus-2 | ok | REJECT - DEMANDS CHANGES | B-01, B-02, B-03, B-05, B-06, B-07 | K-01 | 1 | 115 | 0.70 |
| 20261103T074051Z-opus-3 | ok | REJECT - DEMANDS CHANGES | B-01, B-03, B-04, B-05, B-06, B-07 | K-01 | 2 | 121 | 0.70 |

## Modell sonnet

Urteil: **nicht erreicht**

Läufe: 3 gesamt, 3 ausgewertet, 0 unauswertbar, 0 abgebrochen, 0 fehler

| Kennzahl | Mittel (Min–Max) |
|---|---|
| Trefferquote gesamt | 0.90 (0.86–1.00) |
| Trefferquote offensichtlich | 0.67 (0.50–1.00) |
| Trefferquote mittel | 1.00 (1.00–1.00) |
| Trefferquote versteckt | 1.00 (1.00–1.00) |
| Köder-Fehlalarmquote (n=3) | 0.50 (0.25–0.75) |
| nicht zuordenbare Befunde je Lauf | 2.00 (1.00–3.00) |
| Dauer je Lauf (s) | 93 |
| Kosten gesamt (USD) | 1.00 |

| Lauf | Status | Urteil des Skills | Treffer | Köder gemeldet | nicht zuordenbar | Dauer (s) | Kosten (USD) |
|---|---|---|---|---|---|---|---|
| 20261103T073102Z-sonnet-1 | ok | REJECT - DEMANDS CHANGES | B-01, B-03, B-04, B-05, B-06, B-07 | K-01, K-04 | 3 | 93 | 0.33 |
| 20261103T073357Z-sonnet-1 | ok | REJECT - DEMANDS CHANGES | B-01, B-03, B-04, B-05, B-06, B-07 | K-02, K-03, K-04 | 1 | 86 | 0.32 |
| 20261103T073523Z-sonnet-2 | ok | REJECT - DEMANDS CHANGES | B-01, B-02, B-03, B-04, B-05, B-06, B-07 | K-02 | 2 | 100 | 0.35 |
