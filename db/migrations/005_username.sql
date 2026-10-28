-- Optional sign-in name. Email remains the account record; staff may sign in with either.

alter table users add column username text;
alter table users add column username_normalized text;
create unique index users_username_normalized_key on users (username_normalized) where username_normalized is not null;
