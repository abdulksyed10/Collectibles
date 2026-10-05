begin;
alter table private.account_deletion_jobs drop constraint account_deletion_jobs_status_check;
alter table private.account_deletion_jobs add constraint account_deletion_jobs_status_check
  check(status in ('storage_pending','provider_pending','provider_processing','complete','needs_attention'));
commit;
