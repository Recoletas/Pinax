# Troubleshooting

## My manuscript disappeared

Check the exact application address, browser and profile. Private browsing and another origin use different storage. Return to the original address before assuming the work was deleted. Restore a saved backup if necessary; do not clear site data.

## Saving failed

Keep the page open. Retry saving or export the current manuscript text first. Preserve existing backup files. The browser may refuse writes due to storage restrictions or capacity. Another browser or device may allow restoring your backup. Never treat a failed restore as a completed one.

## Imported text looks wrong

Use the import preview's encoding controls. Changing the encoding can change chapter detection; review titles before confirming. If headings are ambiguous, import as one chapter. Pinax supports TXT and Markdown here, not every ebook format.

## AI is unavailable or uses the wrong language

Check the selected model and its connection test. A built-in model requires server configuration. Set Manuscript language, check Assistant explanation language and explicitly state unusual output requirements. Existing results keep their original language after an interface switch. Do not apply output that translates or changes a passage unintentionally.

## Why do the counts differ from my word processor?

Pinax counts Han characters plus Unicode words, including numbers, and splits hyphenated words. Technical character limits and model tokens use separate units. [Writing and review](./05-writing.md) describes the policy.

## A help page is still Chinese

Some advanced chapters currently have only a Chinese version. The page states this explicitly. The chapter address remains stable when you switch language.

## The selection toolbar does not appear

Select text in the central editable manuscript, not a chapter name, panel answer or read-only preview. Close active search/proofreading overlays and select the text again. If the problem persists, report the browser and which panel was open. Save or copy the text before refreshing.

## A rehearsal response did not change my manuscript

The response belongs to the rehearsal route. **写成试稿** requests a draft for the manuscript; review and adopt that draft to insert it. If **查看试稿** is shown, there is already a draft to review. Repeated generation will not fix a save failure.

## Rehearsal repeats an event

Check that you continued from the intended step. If the source text or settings changed and the panel reports stale context, use **重新确定起点**. Check the current scene and conditions. If it still repeats a completed action, leave the draft unapplied and report the previous response, your action and the repeated passage.

## A recognized character has not joined the scene

Recognition offers candidates. Add the desired character or place to the scene form, then save with **保存当前场**. Cancelling leaves the saved scene unchanged. Recognition uses the linked story bible; a new name does not automatically create a character entry. Mentions in memories or quotations may not describe the current cast.

## Rename a note

Open the note under **Notes**, click its title at the top of the editor, enter a non-empty title, then press Enter or click outside to save. Esc cancels the edit. The linked chapter title is unchanged.

## The assistant found no evidence

That does not prove the book contains no relevant passage. A whole-book question still uses retrieved excerpts. Narrow the question, name the character or event, and check the returned citations.

## Report a problem

Include what you wanted to do, what you clicked, the expected result and the actual result. Add the browser and the exact error if available. A short relevant excerpt is usually more useful than a whole manuscript. Remove keys and private information from screenshots.
