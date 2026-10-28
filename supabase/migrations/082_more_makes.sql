-- More makes to pick from in the garage: brands people bring to Georgia
-- meets that weren't on 015's list. The 3D garage gives some of them their
-- own front end (Jeep, Ram, GMC, Cadillac, Volvo, Land Rover, MINI,
-- Lamborghini, Ferrari); the rest get the plain one.

insert into public.car_makes (name) values
  ('Jeep'),('Ram'),('GMC'),('Cadillac'),('Lincoln'),('Buick'),('Chrysler'),
  ('Volvo'),('Land Rover'),('MINI'),('Alfa Romeo'),('Jaguar'),('Maserati'),
  ('Lamborghini'),('Ferrari'),('McLaren'),('Aston Martin'),('Bentley'),
  ('Rolls-Royce'),('Lotus'),('Fiat'),('Scion'),('Pontiac'),('Saab'),
  ('Rivian'),('Lucid'),('Polestar')
on conflict (name) do nothing;
