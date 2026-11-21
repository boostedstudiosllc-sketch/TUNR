-- The garage: build sheets and car photo galleries (111).
begin;

select tests.user('ana');
select tests.user('ben');
select tests.logout();
insert into public.vehicles (id, owner_id, make, model) values ('00000000-0000-0000-0000-0000000000c1', tests.id('ana'), 'BMW', '540i');

create temp table u as select 'https://abcdefghijklmnopqrst.supabase.co/storage/v1/object/public/vehicle-photos/' as base;
grant select on u to authenticated;

select tests.login(tests.id('ana'));
update public.vehicles set nickname = 'Midnight', drivetrain = 'AWD', transmission = 'Automatic', horsepower = 420, torque = 450, stage = 'stage1',
  mods = '[{"cat":"engine","name":"JB4 tune"},{"cat":"wheels","name":"20in forged"}]' where id = '00000000-0000-0000-0000-0000000000c1';
select tests.eq((select jsonb_array_length(mods) from public.vehicles where id = '00000000-0000-0000-0000-0000000000c1'), 2, 'the owner fills in the build sheet');
select tests.fails($$ update public.vehicles set mods = '[{"cat":"rockets","name":"x"}]' where id = '00000000-0000-0000-0000-0000000000c1' $$, 'bad_mod', 'mods need a known category');
select tests.fails($$ update public.vehicles set drivetrain = 'jetpack' where id = '00000000-0000-0000-0000-0000000000c1' $$, 'check', 'drivetrain is one of the real ones');

insert into public.vehicle_photos (vehicle_id, url, caption)
select '00000000-0000-0000-0000-0000000000c1', base || tests.id('ana') || '/1.jpg', 'Golden hour' from u;
select tests.eq((select count(*) from public.vehicle_photos)::int, 1, 'the owner adds a photo to their car');
select tests.fails(format($$ insert into public.vehicle_photos (vehicle_id, url) values ('00000000-0000-0000-0000-0000000000c1', 'https://evil.example/storage/v1/object/public/vehicle-photos/%s/2.jpg') $$, tests.id('ana')),
  'car_photo_not_ours', 'photos from other websites are refused');
select tests.fails(format($$ insert into public.vehicle_photos (vehicle_id, url) select '00000000-0000-0000-0000-0000000000c1', base || %L || '/2.jpg' from u $$, tests.id('ben')),
  'car_photo_not_ours', 'someone else''s upload is refused');

select tests.login(tests.id('ben'));
select tests.eq((select count(*) from public.vehicle_photos)::int, 1, 'other people can see the car''s photos');
select tests.eq((select caption from public.vehicle_photos), 'Golden hour', 'with the caption');
select tests.blocked_by_rls(format($$ insert into public.vehicle_photos (vehicle_id, url) select '00000000-0000-0000-0000-0000000000c1', base || %L || '/3.jpg' from u $$, tests.id('ben')),
  'nobody else can add photos to your car');
select tests.blocked_by_rls($$ delete from public.vehicle_photos $$, 'nobody else can remove them');
select tests.blocked_by_rls($$ update public.vehicles set horsepower = 1 $$, 'nobody else can change your build sheet');

-- 24 a car.
select tests.logout();
insert into public.vehicle_photos (vehicle_id, owner_id, url) select '00000000-0000-0000-0000-0000000000c1', tests.id('ana'), 'x' || g from generate_series(2, 24) g;
select tests.login(tests.id('ana'));
select tests.fails($$ insert into public.vehicle_photos (vehicle_id, url) select '00000000-0000-0000-0000-0000000000c1', base || auth.uid() || '/25.jpg' from u $$,
  'too_many_car_photos', 'at most 24 photos a car');

-- (130) What the car has, for checking parts fit.
select tests.login(tests.id('ana'));
update public.vehicles set features = array['Adaptive LED headlights', 'M Sport package'] where id = '00000000-0000-0000-0000-0000000000c1';
select tests.eq((select cardinality(features) from public.vehicles where id = '00000000-0000-0000-0000-0000000000c1'), 2, 'the owner lists the car''s features');
select tests.fails($$ update public.vehicles set features = array['x'] where id = '00000000-0000-0000-0000-0000000000c1' $$, 'vehicles_features_check', 'a feature is at least 2 characters');
select tests.fails($$ update public.vehicles set features = array(select 'Feature ' || g from generate_series(1, 21) g) where id = '00000000-0000-0000-0000-0000000000c1' $$, 'vehicles_features_check', 'up to 20 features');
select tests.login(tests.id('ben'));
update public.vehicles set features = array['Hacked'] where id = '00000000-0000-0000-0000-0000000000c1';
select tests.login(tests.id('ana'));
select tests.eq((select features[1] from public.vehicles where id = '00000000-0000-0000-0000-0000000000c1'), 'Adaptive LED headlights', 'nobody else changes them');

-- (131) The VIN is private: only the owner.
select tests.login(tests.id('ana'));
insert into public.vehicle_vins (vehicle_id, vin, decoded) values ('00000000-0000-0000-0000-0000000000c1', 'WBAJE7C59KWW23963', '{"model": "540i"}');
select tests.eq((select vin from public.vehicle_vins where vehicle_id = '00000000-0000-0000-0000-0000000000c1'), 'WBAJE7C59KWW23963', 'the owner saves their VIN');
select tests.fails($$ insert into public.vehicle_vins (vehicle_id, vin) values ('00000000-0000-0000-0000-0000000000c1', 'WBAJE7C5IKWW2396O') $$, 'vehicle_vins_vin_check', 'VINs never use I, O or Q');
select tests.login(tests.id('ben'));
select tests.eq((select count(*) from public.vehicle_vins)::int, 0, 'nobody else sees a VIN');
select tests.blocked_by_rls($$ insert into public.vehicle_vins (vehicle_id, vin) values ('00000000-0000-0000-0000-0000000000c1', 'WBAJE7C59KWW23964') $$, 'nobody adds a VIN to someone else''s car');
update public.vehicle_vins set vin = 'WBAJE7C59KWW23999';
delete from public.vehicle_vins;
select tests.login(null);
select tests.fails($$ select count(*) from public.vehicle_vins $$, 'permission denied', 'signed-out visitors can''t read VINs');
select tests.login(tests.id('ana'));
select tests.eq((select vin from public.vehicle_vins), 'WBAJE7C59KWW23963', 'and nobody else changes or deletes it');
delete from public.vehicle_vins;
select tests.eq((select count(*) from public.vehicle_vins)::int, 0, 'the owner can delete it');

rollback;
