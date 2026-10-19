# Troubleshooting

## My manuscripts disappeared

Return to the original browser profile and address. HTTP, HTTPS, hostnames, IP addresses and ports have separate browser storage. Do not clear site data or import over existing work first.

Export a full workspace ZIP from the old address and restore it at the new one. Private browsing or clearing site data may remove unbacked-up work.

## Edge says the site is not secure

At the 2026-10-15 check, the public site served HTTP and HTTPS was not working. The operator still needs to configure TLS. Before an HTTPS migration, export data from the HTTP origin; the browser does not move it automatically.

## The assistant wrote a reply but did not change my chapter

Check permissions and the actual result. Read-only mode does not edit. Review mode requires applying the proposal. Automatic mode still requires a valid target and authorization, successful checks and a successful save.

Reading a chapter or looking up settings is not an edit receipt. Open the proposed changes, or expand failed tool calls to read the error.

## Does regeneration create another conversation?

No. Editing a question, regenerating and retrying with different parameters keep this conversation and preserve answer versions. Forking explicitly creates another conversation. Switching answer versions does not undo an edit already applied to the manuscript.

## A tool failed or an answer is incomplete

Expand the failed tool for its actual reason. Possible causes include an outdated runtime, changed source revision, unavailable local knowledge, a model timeout or failed output checks. Retained text may be copied but is not a completed, adoptable edit.

Report the action sequence and sanitized error. Never include API keys or private manuscript content in public reports.

## Can I leave rehearsal instructions blank?

Yes, continuation uses the current manuscript context. Check the starting passage. A blank chapter may need a character, situation or direction.

Write-next-passage produces a manuscript draft for adoption. Plot rehearsal explores developments in the sidebar before prose generation. Enter submits; Ctrl+Enter or ⌘+Enter adds a line. Closing the panel does not adopt the draft.

## Why is a mentioned character not in the current scene?

Mentions, memories and quotations do not necessarily mean presence. Recognition suggests candidates; confirm and save the scene. New names do not automatically become official character entries.

## Why does a source or knowledge search fail?

Check the scope: imported browser sources, bound local project documents and local knowledge search are different. Local knowledge needs its runtime and project binding; the public site disables local filesystem interfaces. Missing original text cannot be replaced with an index summary.

For PDFs, check the 100 MB limit and whether the file contains a text layer. Other supported files have a 50 MB limit. Review parsing before adding a source.

## Saving or media generation failed

Keep unsaved text and the page open, then retry saving. Do not clear storage to fix a save failure.

Text, image and video models are separate configurations. Retry saving an already generated image instead of generating again; continue querying an existing video task rather than submitting a duplicate. Only saved video originals can survive an expired remote URL.

## Which backup should I use?

Use a full workspace ZIP for migration. Lightweight JSON excludes archived source and media files; manuscript export is readable text only. Keep original source files and model credentials separately. See [Settings](./07-settings.md).
