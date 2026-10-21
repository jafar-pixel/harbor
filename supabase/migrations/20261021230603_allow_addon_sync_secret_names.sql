-- Applied to JL account service; keeps UUID profile/client journal names compatible.
alter table media.secrets drop constraint secrets_name_check;
alter table media.secrets add constraint secrets_name_check check (char_length(name) between 1 and 128);
