# Writing workspace

The left sidebar contains chapter search, new-chapter and new-book controls, notes, the volume and chapter directory, and story-bible linking. The current scene stays at the bottom; the manuscript is in the center, and tool buttons open panels on the right. Hover over an icon to see its name. Some rehearsal and scene controls still use Chinese labels; these are included below where needed.

![Chapter list, manuscript and tool rail](../../screenshots/user-guide-20260924/13-workbench-en.png)

## Chapters and notes

Select a chapter to edit it. The chapter menu offers renaming and **Version history**. New chapters belong to the current manuscript; a new manuscript is a separate work.

Use **Notes** for passages you have not assigned to a chapter. Open a note and click its title at the top of the editor to rename it. Enter or clicking outside saves; Esc cancels the title edit. An empty title is rejected. Renaming a note does not rename its linked chapter.

The outline describes what a chapter should contain. Writing in an outline or note does not insert the text into a chapter.

## Editing and saving

The manuscript autosaves in this browser. If saving fails, copy or export the visible text before refreshing.

Formatting changes font, spacing, indentation and block-boundary display. These display settings do not add characters to the manuscript. Focus mode hides surrounding controls; Esc returns. Search locates text in the selected scope. Proofreading provides suggestions for you to check.

## Comments and rewriting

![A comment attached to selected manuscript text](../../screenshots/user-guide-20260924/14-annotations-en.png)

1. Select text in the editable manuscript and choose **Comments**.
2. Describe the change and what must remain, then add the comment.
3. Use **Rewrite from comment** when ready. This step needs a text model.
4. Compare the candidate with the original, then apply or discard it.

Editing or deleting a comment does not change the source passage. If that passage changes, an older candidate may no longer be applicable. Select the updated text and generate again.

If the selection toolbar is missing, close active search/proofreading overlays and select text again in the manuscript, rather than a panel answer or preview.

## Assistant: brainstorming, source lookup and manuscript review

Choose **Assistant** at the top to open the full page, then **Back to workbench** to continue writing. For questions while writing, open the assistant sidebar; **Open assistant** expands the same conversation. Switching views keeps your draft and reading position without resending a question.

The manuscript sidebar contains the current book’s contents. Use **Navigate** at the top to open Story Bible, Sources or other workspaces; **More tools** in that drawer opens inspiration, map, comics and video. Select **Writing** to return to this book’s writing location, or select its existing workspace tab. The question list scrolls independently and highlights the question being viewed. Select a question to revisit its answer without sending it again. Stop an active review before returning to the conversation. The assistant’s Story Bible and Sources controls are disabled during a query, review or rewrite. Leaving through the top navigation also prompts you to finish or stop the task first.

The sidebar toolbar opens the full assistant or sources. Once there are messages, it also provides search and question history. Search filters the current conversation; choosing a history entry fills the input so you can edit it before sending.

For an empty manuscript, choose **Start with the assistant**, or select **Brainstorm with the assistant** when creating a manuscript. You can name it later. The suggested starting points fill a question draft without sending it. Edit the question before sending, or go straight to writing.

The default is **Discuss the story**, for characters, plot and writing choices. It does not automatically read the manuscript. Include a passage in your question if you want to discuss it. To check established content, switch to **Look up sources** in the input, or select it from **+**, then write and send your question.

The **+** menu also offers **Review manuscript** and **Generate illustration**. Manuscript review is disabled when the manuscript is empty.

| What you need | Suggested entry and question |
| --- | --- |
| Discuss plot or writing choices | **Discuss the story**: “I want these two characters to test each other without revealing their intentions. How could the scene develop?” |
| Check earlier text or story-bible entries | **Look up sources**: “Where does she first explain her background? Give the supporting passages.” |
| Check manuscript problems | **+ → Review manuscript**: choose a scope and describe the problem, such as repeated description or an awkward transition |

**Look up sources** searches the current book's connected manuscript, story-bible entries and other supported content. When supporting material is found, the answer includes the sources actually cited. Select a source title to preview the passage inside the assistant, then choose **Open original** to go to its source.

This scope does not mean every chapter was read in full. Retrieval can miss a relevant passage; narrow the question and name the character or event. Original chunks imported and linked to this book are included in retrieval. Citations can open their source files; other books are outside this scope. This interface does not search the web.

Conversations and input drafts are saved separately for each manuscript in this browser. Switching manuscripts opens the corresponding conversation. Refreshing does not resend a question; it interrupts an active request, which you can retry yourself.

### Write & revise

Choose **Write & revise** in the input task menu. Select references and techniques, or type `@` and use the arrow keys, Enter or Tab to confirm a reference. Confirming a reference does not send a task.

Choose **Review proposed changes** to inspect manuscript edits in the manuscript area and character, setting or outline edits in their existing sidebar. Confirm the group to save its changes together. A failed save rolls back incomplete writes and retains the proposal. Applied changes can be undone; later edits are checked before undoing.

Follow-up messages continue the task. **Start a new task** keeps the conversation and creates a fresh task. **New conversation** starts another topic; project navigation lets you reopen earlier conversations. Refreshing never runs a task automatically.

These tools require the server runtime. If unavailable, inputs and saved results are retained; retry after the runtime recovers. The optional story exploration switch is off by default and does not bypass strict task checks. Retrieval covers bounded loaded excerpts. Imported book sources can now be selected as references; an external database is not connected here.

**Review manuscript** opens the review panel. Choose a scope and describe your goal, then inspect the suggestions or rewrite candidates before applying them. The manuscript stays unchanged until you apply a result; use the review's undo control to reverse an applied change. **Generate illustration** needs its own supported image configuration, even if the text-model connection works.

## Generate an illustration

Select a passage or place the cursor inside the text block you want to illustrate, then choose **Generate image**. Check the source, edit the scene description, and choose a model, aspect ratio and image count. You can also draft a description from the original text and review it before using it.

Parameters are on the left; the current image and this book's candidates are on the right. Style presets supplement the description. Each successful image is archived automatically. **Save as material** creates a material entry; **Insert into manuscript** places the chosen image after the original text block. Both require your choice.

Generation keeps the original book, chapter and text position. If the text changes or you switch books, you can still view, download or save the result in its original book, but cannot insert it at the new location. Stopping keeps completed images. If storage fails, use **Retry saving** instead of generating again.

For a custom ComfyUI connection, **Stop** ends the wait and stops accepting results. A job already submitted to ComfyUI may continue there; manage that job in ComfyUI.

The built-in MiniMax adapter accepts one character reference (JPG/PNG, under 10 MB). It does not provide composition editing or masks, and reference input does not guarantee character consistency. Limits vary with other model configurations. An image used in manuscript text, materials or comics cannot have its file deleted from generation history.

## Rehearsal: write prose or explore the plot

Open **Rehearsal** on the right. Before you place the cursor in the manuscript, continuation starts at the chapter end; after you choose a position, it follows that cursor. The excerpt shows the starting point. Use the task selector beside the heading:

- **Write next passage** is the default. Add instructions or leave the field empty, then choose **Generate draft**. The editable draft stays at the writing position and expands to fit its text. **View draft** in the sidebar locates it. Review and adopt it to change the manuscript.
- **Explore plot** lets you try character actions and developments in the sidebar. Enter instructions immediately, or leave them blank to continue the current story. Click the source excerpt to return to the starting passage.

If character or location suggestions appear, select the ones you need and save. The pending request then resumes with your instructions; there is no need to submit again. You can also continue with the existing scene without changing it.

Enter submits. Ctrl+Enter (or ⌘+Enter on Mac) adds a line. References are prepared when you submit, without repeated preparation while you type. Use **Stop** during generation to end the current wait.

### Continue, branch and compare

In **Explore plot**, add instructions after a result and choose **Continue rehearsal**, or leave the field blank for a natural continuation. Suggested next actions only fill the input; submit to generate. The actor selector changes the character in focus.

To explore another choice, branch from an earlier step. **Other outcomes** restores or compares saved paths in the current session; **… → Start again** starts again from the current context. Each path allows up to four steps, after which you can branch or create a manuscript draft.

**… → Compare character choices** compares the same character with two different beliefs. **返回推演** returns to the original panel without changing the character’s saved settings. After starting again, you can use **Add background** to add an assumption before continuing.

### Use the result in the manuscript

**Create manuscript draft**, below the plot results, makes another generation request to turn the selected path into prose. Review the draft before adopting it. If a draft already exists, choose **View draft** and deal with it first. If saving fails, retry saving rather than generating again.

If the manuscript or references change during generation, the result stays available to read and copy without being inserted. A retained prose draft can be saved as a note. **Edit instructions** returns to the preserved input; **Back to result** returns to the text. Moving the cursor or closing the sidebar keeps generated drafts. A failed plot result does not count as a successful rehearsal step. Some failed responses yield only a readable excerpt; the panel indicates when it is shortened. A response without retained text cannot be recovered in full.

Copy useful text, or save an available draft as a note, before leaving or refreshing. Review the result yourself for repeated events and whether it advances the story.

## Current scene

![Time and other context in the current-scene panel](../../screenshots/user-guide-20260924/16-current-scene-en.png)

Open the current-scene panel and choose **Edit current scene**. Set the time, place and characters present.

The recognition section suggests matches from nearby manuscript text and the linked story bible. Choose the candidates to add, then press **保存当前场** to save the scene. Merely selecting a candidate changes the form, not the saved scene; cancelling discards the edits.

Recognition matches known names and keywords. A mention in a memory, quotation or negative statement may not mean the character is present. A new name without a story-bible entry will not automatically become a character record. No new suggestions does not mean the scene is empty. Normal typing does not update the cast on every keystroke; you can open the scene form and run recognition again when needed.

## Finding earlier text and story facts

| What you need | Where to look |
| --- | --- |
| Earlier manuscript text | **Comments → Manuscript history**, or the chapter menu's **Version history** |
| Extracted facts, pending memory proposals and revisions | **Settings → Memory & history** |
| Character, place and rule definitions | Character/settings panels and the linked story bible |

Manuscript history saves chapter text and annotations as snapshots. Name a snapshot yourself or enable automatic word-count milestones. Restoring first preserves the current chapter. This is not a comment edit log, and there is no side-by-side draft comparison. Notes do not use chapter snapshots; open a chapter first.

## Language and backup

Change the interface language in **Settings → Appearance**. This does not translate existing text.

Length counts Han characters plus Unicode words. Apostrophes inside words stay within a word; hyphens split words. This differs from model-token counts.

Before moving to a different browser, device or URL, export a full workspace ZIP. Text export and lightweight JSON have smaller scopes. See [Settings](./07-settings.md).

In **Outline**, select a project or chapter node and edit its title and content directly. Changes save after a short pause or when the input loses focus. A new chapter outline opens ready for typing. Search, filters, grouped navigation, chapter-outline ordering, and explicit manuscript insertion remain available.

Use **Conversations** to create, switch, or delete a conversation. Deletion requires confirmation; deleting the last one starts an empty conversation. The composer’s **+** adds local files or references this book’s chapters and imported sources. Local files are parsed into the book’s source library and selected as references. A reference chip’s × removes the reference only. Memory and revision records remain under **Settings → Memory & history**.

