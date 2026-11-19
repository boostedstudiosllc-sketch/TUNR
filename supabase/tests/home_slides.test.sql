-- The Discover banner's slides (119): everyone sees live ones, admins manage.
begin;

select tests.user('boss', true, true); -- an admin
select tests.user('member');

select tests.login(null);
select tests.eq((select count(*) from public.home_slides)::int, 4, 'the starter slides show to everyone, signed out too');

select tests.login(tests.id('boss'));
insert into public.home_slides (id, title, cta, link, theme, sort) values ('00000000-0000-0000-0000-0000000000b1', 'Holiday toy drive meet', 'See meet', 'meet:abc-123', 'green', 1);
insert into public.home_slides (id, title, cta, link, starts_at) values ('00000000-0000-0000-0000-0000000000b2', 'Coming soon', 'Soon', 'tab:perks', now() + interval '1 day');
insert into public.home_slides (id, title, cta, link, ends_at, starts_at) values ('00000000-0000-0000-0000-0000000000b3', 'Old news', 'Old', 'tab:perks', now() - interval '1 day', now() - interval '3 days');
insert into public.home_slides (id, title, cta, link, active) values ('00000000-0000-0000-0000-0000000000b4', 'Draft', 'Draft', 'tab:perks', false);
select tests.eq((select count(*) from public.home_slides)::int, 8, 'admins see every slide, drafts and scheduled ones too');
select tests.fails($$ insert into public.home_slides (title, link) values ('Bad link', 'javascript:alert(1)') $$, 'home_slides_link_check', 'only app links and https addresses');
select tests.fails($$ insert into public.home_slides (title, link, image_url) values ('Bad pic', 'tab:perks', 'https://evil.example.com/x.png') $$, 'home_slides_image_url_check', 'pictures only from TUNR''s storage');
select tests.fails($$ insert into public.home_slides (title, link, starts_at, ends_at) values ('Backwards', 'tab:perks', now(), now() - interval '1 hour') $$, 'home_slides_window', 'the end comes after the start');

select tests.login(tests.id('member'));
select tests.eq((select count(*) from public.home_slides)::int, 5, 'members see only live slides: not scheduled, ended or drafts');
select tests.eq((select count(*) from public.home_slides where id = '00000000-0000-0000-0000-0000000000b1')::int, 1, 'the new one included');
select tests.blocked_by_rls($$ insert into public.home_slides (title, link) values ('Mine', 'tab:perks') $$, 'members can''t add slides');
update public.home_slides set title = 'Hacked' where id = '00000000-0000-0000-0000-0000000000b1';
delete from public.home_slides where id = '00000000-0000-0000-0000-0000000000b1';
select tests.logout();
select tests.eq((select title from public.home_slides where id = '00000000-0000-0000-0000-0000000000b1'), 'Holiday toy drive meet', 'or change or remove them');

rollback;
