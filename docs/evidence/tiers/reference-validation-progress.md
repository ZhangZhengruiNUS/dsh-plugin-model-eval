# Reference validation checkpoint

This checkpoint does not release either new tier. The installed alpha.13 and real history are unchanged. No model calls or model calibration have occurred.

Latest update: the user explicitly approved the unified60s/512MiB/800B new-protocol budget. It is implemented in `src/evaluation/contest-budget.ts` and V4 staging. A fresh full100 positive/known-negative validation is in progress; all164 legacy coding tasks passed and541 legacy rules remain in progress. The original budget failures and candidate measurements below remain historical evidence, not current admission. V4 adds four source119 transfer-graph inputs, so additions now total69 and known semantic bindings total25 across16 groups.

Final Task3 update: the fresh V4 report completed100/100, with103 positive attempts (one usable correct witness per question plus mandatory source77; failed candidate attempts remain recorded),177 known negative rejections and25 actual canonical semantic assertions. The300 noncoding paths and legacy164/541 completed successfully. The default-readonly finalizer passed and then froze a separate `adapted-questions.json`, preserving the original questions; `adapted-runtime-gate-v4.json` binds all evidence. New entries remain `allowNewRuns:false` until queue/service/UI integration. Independent review's two Important freeze-boundary findings were fixed with explicit22-file execution identity evidence and recoverable4-file publication; five focused safety checks, fresh11 runtime/numeric/audit checks,69 unit tests and type checking passed. A54,918,724-byte prototype actual tgz was extracted and every bundle byte checked, including507 cache files and matching shared light/deep compatibility; it was not installed or published. See `resource-package-v4.json`. Earlier “in progress” notes below are retained chronological checkpoints.

## Runtime cost investigation

Repeated compilation of the pinned trusted standard library in every fresh WASI VM is a measured avoidable cost. The separate checked-hash, read-only bytecode overlay changes neither the base runtime nor VM isolation. A fixed 173-case reference repeated in 9.613/9.454/9.564 seconds after caching, compared with roughly 14–17 seconds in source-only observations. The exact system state behind two older 30-second timeouts was not reconstructed; those failures remain evidence.

Evidence: `stdlib-cache-experiment.json`, commits `4efa91d` and `581567b`.

## Input and semantic review

All 100 fixed coding sources have statement-specific validators. Of 20,779 original tests, 14,079 are retained and 6,700 proven illegal generated inputs are excluded. All 1,264 public/private tests remain byte-for-byte. The V3 final staging adds 65 fixed independently derived inputs; the original frozen question set is not overwritten.

The 15 newly found logic-gap groups have 24 exact source/program bindings. Each known program must still be present exactly once, fail the full canonical set, and fail its bound canonical counterexample by an actual answer assertion. Resource exhaustion or timeout cannot substitute for this semantic proof. The boundary integration test passed in 54.765 seconds. The reviewed source77 DSU program is an exact-hash mandatory positive; its original upstream label and code remain untouched, and it passed all retained/new cases.

Independent review found and prompted a fix for missing/changed known programs bypassing counterexample checks. Missing source, code, or canonical cases now fail closed. Four focused policy tests passed, followed by 16 combined numeric/audit/transport/catalog policy tests. Type checking passed. This is not a claim that the whole integration suite is green.

## Correct witnesses and remaining resource gate

All 35 questions without an upstream Python3 correct witness now have developer references, plus optimized witnesses for four existing-reference resource failures. Source/code hashes and independent oracle tests for these 39 files are pinned in `scripts/references/catalog.json`. Correctness is checked independently with literal enumeration, state simulation, graph search, rank/linear algebra, or other separately derived small-instance methods, then with retained full tests in isolated WASI.

At this checkpoint, 96/100 coding questions have a correct witness that passed the unchanged formal 30-second/512MiB/200-billion-fuel budget in actual runs. Four deep-only questions remain over that budget. This aggregates the recorded runs; it is not a new all100 uniform admission report.

| Source | Full cases | Formal-budget result | Extended diagnostic full correctness | Candidate60s/800B actual runner |
| --- | ---: | --- | --- | ---: |
|25 — Problems for Codeforces |217|fuel exhausted|40.078s /522.751B fuel|43.269s, passed|
|85 — A Perfect Problem |242|fuel exhausted|27.620s /246.459B fuel|28.582s, passed|
|86 — October18,2017 |53|fuel exhausted|22.731s /415.422B fuel|22.244s, passed|
|153 — Subsequences Galore |225|fuel exhausted|22.560s /281.573B fuel|20.695s, passed|

Fuel is an execution counter, not a unit of time. Extended instrumentation used 120s/2T only to measure complete correctness and cost, and never grants admission. The candidate actual-runner results are in `proposed-scoring-budget.json`; that historical artifact expressly keeps `releaseAllowed:false`. The user subsequently approved the unified60s/512MiB/800B new-protocol budget. Denominators, old protocols and published scores remain unchanged; V4 must satisfy every new-budget gate.

The approved design requires all correct references and all available known incorrect programs to be checked; it does not require inventing at least one semantic wrong program for every question. The verifier now records absent upstream negatives explicitly rather than imposing that extra quota. All existing known errors and discovered counterexamples remain mandatory. The complete upstream-negative artifact is hash pinned.

## Other gates

All 300 noncoding selected paths passed local execution checks in `noncoding-runtime-v3.json`. For IFEval this is rule-execution sanity, not a perfect-answer reference or model score. The aggregate report stays pending/release-disabled because coding and legacy checks are separate.

Fresh legacy164 coding/541 rule regression is in progress. Full100 adapted reference admission, legacy completion, fixed protocol/content hashes, attribution and package validation remain necessary. Tasks4–12 have not started. Original source, old quality failures, and V2 diagnostic46 passed/19 failed/35 pending remain preserved as historical snapshots.
