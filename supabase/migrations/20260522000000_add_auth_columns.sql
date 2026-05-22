alter table claims
  add column if not exists auth_status text,
  add column if not exists auth_payer text,
  add column if not exists auth_dos_start date,
  add column if not exists auth_dos_end date;
