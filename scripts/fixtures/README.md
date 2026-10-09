# Astra retrospective checks

Created October 4, 2026. Run `node scripts/astra-check.mjs` and then
`node scripts/astra-backtest.mjs`. The latter imports the exact transpiled
production simulation; it does not implement a second forecasting model.

These are two retrospective election-eve checks, **not** independent holdouts,
comprehensive historical replays, calibration, or a claim of superiority.
The author knows historical outcomes. Uncertainty settings were chosen before
running these checks, and were not changed to improve their scores. Only a small
recoverable, primary-source-verified polling subset is included; selection and
missing firms are material limitations. The 2020 subset has three polls from only
two firms (firm weights are capped); 2024 has three polls from three firms.

Each fixture separates `baseline`, `candidates`, `polls`, and `actual`. The test
passes only the first three into the model. `actual` is used afterward for
scoring. Assertions enforce earlier baseline years, publication/fieldwork cutoffs,
and absence of vote totals on candidate records. Names and ballot affiliations
are pre-election facts reconstructed retrospectively from result registers.
No target-election vote totals, turnout, winners or margins inform inputs.
New-party starting priors and floor-crossing adjustments specific to 2026 are
disabled for historical checks. Geography is grouped without target vote data.

## 2020: cutoff October 23, election October 24

- Baseline: Elections BC official 2017 statement-of-votes workbook, 87 ridings:
  https://elections.bc.ca/docs/rpt/2017-election-report/xlsx/2017-provincial-general-election-sov.xlsx
- Candidates and scoring: Elections BC official 2020 statement, Table 20:
  https://elections.bc.ca/docs/rpt/statement-of-votes-2020-provincial-general-election.pdf
- Verified aggregate: 1,883,632 valid votes, NDP 57 / Liberal 28 / Green 2 seats.
- Internal `con` slot means BC Liberals; `centre` means 2020 BC Conservatives.
  `one` is structurally absent. The explicit labels in the fixture avoid confusing
  historical party names with today's slots.
- Research Co. October 22–23, published October 23, 705 decided voters:
  https://researchco.ca/2020/10/23/bcelxn2020-final/
- Angus Reid October 16–19, published October 20, 1,155 decided/leaning/advance voters:
  https://angusreid.org/wp-content/uploads/2020/10/2020.10.20_BC_politics.pdf
- Angus Reid October 14–15, published October 16, 714 decided/leaning/advance voters:
  https://angusreid.org/wp-content/uploads/2020/10/2020.10.15_BCElxn-2.pdf
- Angus Reid's combined "another party" bucket cannot separate Conservatives from
  other candidates, so both are missing there. Their estimates come only from
  the Research Co. poll, whose rounded figures leave zero residual for Others.
  That is an input limitation, not a statement that other voters were impossible.
- No intervening by-election/incumbency update is reconstructed.

## 2024: cutoff October 18, election October 19

- Baseline: Northern Vibe's 2020 results, retrospectively transposed to 93 ridings
  using Elections BC's voting-area conversion table. Each fixture district has
  its source URL, e.g. https://northernvibe.ca/en/bc/district/abbotsford-mission .
  These are notional results, not an actual 2020 election on the new boundaries.
  This is a current reconstruction of earlier votes, not an archived 2024 input.
- Liberal and Conservative 2020 votes are combined into the Conservative
  geographic starting distribution, reflecting the withdrawal of BC United
  before the 2024 election. This is an assumption, not a measured transfer.
- Candidates/actual seats: 2024 result lists in the fixed Astra baseline, checked
  against Elections BC's NDP 47 / Conservative 44 / Green 2 official seat totals:
  https://elections.bc.ca/docs/rpt/statement-of-votes-2024-provincial-election.pdf
- Minor-party affiliations are not retained in the Northern Vibe baseline, so each
  Other candidate is treated as independent; none won seats in the actual result.
- Research Co. October 17–18, published October 18, 753 decided voters:
  https://researchco.ca/2024/10/18/final-bcpoli-2024/
  Page later updated October 27; the dated release and poll figures are October 18.
- Ipsos October 16–18, published October 18, sample 1,330 (total survey base):
  https://www.ipsos.com/en-ca/ndp-are-favourites-win-third-term
- Pallas published October 18, sample 712 (total survey base):
  https://pallas-data.ca/2024/10/18/pallas-final-british-columbia-election-poll-ndp-45-conservatives-42-greens-9/
  Text conflicts between October 16–17 and 17–18 fieldwork; fixture uses the
  enclosing October 16–18 interval. Others is the 4% residual of rounded 45/42/9.
- Sampling bases differ where decided counts are unavailable; design effect 2 is
  shared with production, not an empirically fitted correction.

## Reconstruction and metrics

`scripts/prepare-astra-history.py` rebuilds baseline/candidate/actual sections from
local `/tmp/results2017.xlsx`, `/tmp/results2020.txt` (PDF extracted with
`pdftotext -layout`), and `/tmp/astra-districts/*.html`. It requires openpyxl.
Run from project root. Polls are manually verified fixtures and are preserved by
that script. Cached source pages are intermediates, not required to run checks.

Seat MAE averages absolute errors over the displayed parties/Other group.
Coverage counts actual party seat totals inside the simulated middle 80% ranges;
those totals are correlated and do not constitute independent calibration trials.
The API also reports multiclass Brier scores (sum of squared probability errors,
including a tie category; smaller is better). With only two outcomes, these scores
cannot establish calibration, particularly for minor-party tail probabilities.
The 2020 Conservative actual zero seats misses the model's 80% range; this failure
is deliberately retained and disclosed in the dashboard.
