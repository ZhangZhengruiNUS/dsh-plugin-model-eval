# Five-capability implementation evidence

Task 1 (`5814027`) imports the frozen 350 IDs, verifies 270 existing question hashes and 1902 historical resource files, and ports the deterministic reading scorer. Task 2 (`6de3332`) adds independently versioned 100/350 definitions, preserving the original four-domain identities. New admissions remain disabled.

Task 3 adds native tool turns and a trusted JSON-only simulator. The original BFCL checker and seven upstream simulator classes retain their source bytes and repository Apache-2.0 license. The adapter replaces upstream expression execution with fixed public method lookup and JSON argument binding. Only fixed reference expressions use AST literal decoding; no model source is evaluated.

The JSON adaptation binds numeric values to the original schema's `float` fields (excluding booleans and strings), explicitly preserves floats across snapshots, and copies explicit/default parameters to isolate mutable list arguments. These conditions are pinned by the simulator manifest. The reader also rejects unclosed or mismatched Markdown fences; these extra parser cases correct boundary mistakes in the initial isolated prototype.

Verified locally on Windows:

- 50 reading positives, 150 wrong answers, 200 format variants, 19 original adversarial carriers, plus unclosed/mismatched fence regressions.
- All 30 selected BFCL references through the product dispatcher; 30 empty-answer and 30 removed-action negatives rejected. This validates scoring machinery, not model discrimination.
- Snapshot float preservation, mutable-argument isolation, unknown/private tools, malformed JSON, pause/resume after one committed action, finite retries, unchanged logical-round reservation, and no dispatch after checkpoint-save failure.
- Native tool stream fragment assembly, usage retention on failures, fresh preparation per request, duplicate/changed identities, and restored-adapter configuration changes during streaming.
- Installed DSH 0.2.1-rc.5 native runtime methods with a synthetic adapter: 3 prepares (one snapshot plus two requests), 2 stream dispatches, tool-result correlation and argument fragments passed. Node network hooks recorded zero attempts. This is not the full Cordis lifecycle or an OS sandbox test.
- Typecheck and frozen legacy execution projection passed. The previous 22-file proof is retained; only the exact reading-only dispatch extension is removed for comparison. Other old execution bytes and old catalog definitions must match their original hashes.

Pending: queue integration, five-domain aggregation and reuse, estimation, UI, actual package and full Cordis lifecycle gates. Desktop remains alpha.14, user history unchanged, real model calls zero. The broad pre-change regression run has observed old programming-reference timing failures and is not claimed green; exact diagnostics will be recorded when it completes.
