begin;
alter table private.account_deletion_jobs drop constraint account_deletion_jobs_status_check;
-- Preserve jobs created between deployment stages and retry their storage
-- cleanup before attempting provider or Auth deletion.
update private.account_deletion_jobs set status='storage_pending' where status='pending';
alter table private.account_deletion_jobs alter column status set default 'storage_pending';
alter table private.account_deletion_jobs add constraint account_deletion_jobs_status_check
  check(status in ('storage_pending','provider_pending','provider_processing','complete','needs_attention'));
commit;
