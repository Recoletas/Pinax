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

## Assistant questions

![A question entered in the assistant before sending](../../screenshots/user-guide-20260924/17-assistant-en.png)

Choose the task and question scope before sending. Ask for something you can check, such as “Where does she first say that she knows about the key? Give the supporting passage.” Use free advice for possible writing choices rather than claims about established story facts.

Read the cited evidence as well as the answer. A whole-book question does not mean every chapter was read in full. Retrieval can miss a relevant passage; narrow the question and name the character or event. Do not rely on this question interface as a web search tool.

Review produces editing suggestions; a rewrite still needs to be applied. Image generation needs its own supported image configuration, even if the text-model connection works.

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
| Extracted facts, pending memory proposals and revisions | **Settings → Memory & history** |
| Character, place and rule definitions | Character/settings panels and the linked story bible |

Compare an older manuscript version before restoring it, and keep a copy of your current text.

## Language and backup

Book language is set in the manuscript sidebar. It affects supported future AI tasks and does not translate existing text. Interface language is a separate setting.

Length counts Han characters plus Unicode words. Apostrophes inside words stay within a word; hyphens split words. This differs from model-token counts.

Before moving to a different browser, device or URL, export a full workspace ZIP. Text export and lightweight JSON have smaller scopes. See [Settings](./07-settings.md).
