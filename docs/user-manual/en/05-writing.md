# Writing workspace

Chapters and notes are on the left, the manuscript is in the center, and tool buttons open panels on the right. Hover over an icon to see its name. Some rehearsal and scene controls still use Chinese labels; these are included below where needed.

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

The chapter sidebar and full assistant share **Manuscript text / Assistant / Story Bible / Sources** for the current book. **Manuscript text** in the assistant shows the current document name. Story Bible and Sources also provide direct returns to the manuscript or assistant. On a phone, open it with the navigation button at the top. The question list scrolls independently and highlights the question being viewed. Select a question to revisit its answer without sending it again. Stop an active review before returning to the conversation. Story Bible and Sources are temporarily disabled during a query, review or rewrite, so leaving cannot interrupt the task.

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

This scope does not mean every chapter was read in full. Retrieval can miss a relevant passage; narrow the question and name the character or event. Original files imported on the materials page are not yet connected to assistant retrieval; open them on that page when you need to check them. This interface does not search the web.

Conversations and input drafts are saved separately for each manuscript in this browser. Switching manuscripts opens the corresponding conversation. Refreshing does not resend a question; it interrupts an active request, which you can retry yourself.

**Review manuscript** opens the review panel. Choose a scope and describe your goal, then inspect the suggestions or rewrite candidates before applying them. The manuscript stays unchanged until you apply a result; use the review's undo control to reverse an applied change. **Generate illustration** needs its own supported image configuration, even if the text-model connection works.

## Generate an illustration

Select a passage or place the cursor inside the text block you want to illustrate, then choose **Generate image**. Check the source, edit the scene description, and choose a model, aspect ratio and image count. You can also draft a description from the original text and review it before using it.

Parameters are on the left; the current image and this book's candidates are on the right. Style presets supplement the description. Each successful image is archived automatically. **Save as material** creates a material entry; **Insert into manuscript** places the chosen image after the original text block. Both require your choice.

Generation keeps the original book, chapter and text position. If the text changes or you switch books, you can still view, download or save the result in its original book, but cannot insert it at the new location. Stopping keeps completed images. If storage fails, use **Retry saving** instead of generating again.

For a custom ComfyUI connection, **Stop** ends the wait and stops accepting results. A job already submitted to ComfyUI may continue there; manage that job in ComfyUI.

The built-in MiniMax adapter accepts one character reference (JPG/PNG, under 10 MB). It does not provide composition editing or masks, and reference input does not guarantee character consistency. Limits vary with other model configurations. An image used in manuscript text, materials or comics cannot have its file deleted from generation history.

## Rehearsal: action, response, draft

![Rehearsal panel before an action is submitted](../../screenshots/user-guide-20260924/15-rehearsal-en.png)

1. Place the cursor at the intended continuation point. Open **Rehearsal** and start from the current paragraph (**从当前段落开始**).
2. If scene confirmation opens first, check the proposed characters and place. Save the changes, or choose **暂不调整，直接推演** to continue with the existing scene.
3. Enter a specific action. Select the actor and target if the panel asks. Optional conditions apply to this rehearsal; they do not edit the story bible.
4. Submit the action and read the response. You can stop generation from the panel.
5. Continue from the latest response or branch from an earlier step. A route allows up to four steps.

After a response, choose **写成试稿** to generate a manuscript draft from the route. This is another model request. The draft appears at the writing position and still needs review and adoption. If a draft already exists, use **查看试稿** and deal with it first.

If the starting context is stale, use **重新确定起点** to start from the current context. Do not apply a response that repeats an already completed action. Keep a copy of useful unadopted text before leaving or refreshing.

## Current scene

![Time and other context in the current-scene panel](../../screenshots/user-guide-20260924/16-current-scene-en.png)

Open the current-scene panel and choose **Edit current scene**. Set the time, place and characters present.

The recognition section suggests matches from nearby manuscript text and the linked story bible. Choose the candidates to add, then press **保存当前场** to save the scene. Merely selecting a candidate changes the form, not the saved scene; cancelling discards the edits.

Recognition matches known names and keywords. A mention in a memory, quotation or negative statement may not mean the character is present. A new name without a story-bible entry will not automatically become a character record. No new suggestions does not mean the scene is empty. Normal typing does not update the cast on every keystroke; you can open the scene form and run recognition again when needed.

## Finding earlier text and story facts

| What you need | Where to look |
| --- | --- |
| Earlier manuscript text | **Comments → Versions**, or the chapter menu's **Version history** |
| Extracted facts, pending memory proposals and revisions | **Settings → Memory & history**, or **Memory & history** at the top of the assistant sidebar |
| Character, place and rule definitions | Character/settings panels and the linked story bible |

Compare an older manuscript version before restoring it, and keep a copy of your current text.

## Language and backup

Book language is set in the manuscript sidebar. It affects supported future AI tasks and does not translate existing text. Interface language is a separate setting.

Length counts Han characters plus Unicode words. Apostrophes inside words stay within a word; hyphens split words. This differs from model-token counts.

Before moving to a different browser, device or URL, export a full workspace ZIP. Text export and lightweight JSON have smaller scopes. See [Settings](./07-settings.md).
