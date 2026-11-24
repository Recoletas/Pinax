CREATE INDEX file_transactions_pending_item ON file_transactions(item_id)
WHERE state IN ('staged', 'file_committed');
