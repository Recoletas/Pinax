# Settings, AI and backups

## Languages and appearance

In **Appearance**, choose Interface language and Assistant language. These are device preferences and are intentionally excluded from workspace backups. **Book language** belongs to each manuscript and is included in its backup. Older manuscripts and backups may have no language field; this is supported.

Theme, zoom and writing typography remain separate. Switching languages does not translate your manuscript, reset the editor or regenerate AI results.

## AI setup and data

Writing and backups work without AI. In **AI settings**, select a text model and test its connection. A built-in model is available only if the deployment server provides its key. You can configure your own supported provider.

When you invoke AI, the requested selection and relevant context or linked references may be sent through the deployment server to the configured provider. Do not send material you are not authorized to share. Model keys are excluded from backups. Provider error details may remain in their original language.

## Export and backup are different

**Export chapter / Export manuscript** produces readable UTF-8 Markdown. It is not a complete workspace backup.

**Workspace backup (ZIP)** includes manuscripts, settings, source archives, saved media and memory history. **Lightweight backup (JSON)** preserves local records but excludes archived memory history and media files kept outside those records. External links and unsaved media are not guaranteed to be included in either format.

## Restore

Choose **Restore backup**, then select a JSON or ZIP file. Inspect the preview: added records, overwritten records, skipped identical records, missing files and unsupported records. Confirm only when the selection is correct. Replacing newer records requires an additional checkbox. Keep the original backup file.

A failed or incomplete restore is not success. Keep the page open, preserve another backup if possible and retry using the displayed guidance. Do not clear site data to fix saving problems. ZIP restore reloads the app after successful persistence.

Browser storage belongs to the application origin. Another hostname, protocol or port can look empty even on the same device. Transfer a backup deliberately; there is no automatic cross-domain or cross-device synchronization.
