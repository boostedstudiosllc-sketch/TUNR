import { useState, useEffect, useRef } from "react";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;

const meets = [
  { id:1, title:"Caffeine & Octane ATL", host:"CaffeineAndOctane", verified:true, hostFollowers:25000, hostRating:4.9, hostAttendance:98, hostCancellations:0, hostAvgTurnout:2500, hostMeetsHosted:84, distanceMi:18.2, happeningSoon:false, location:"Town Center at Cobb", city:"Kennesaw, GA", distance:"18.2 mi", date:"SUN JUN 1", time:"9:00 AM", vibe:"Domestic", going:2500, interested:8400, img:"https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=700&q=80", tags:["All Makes","Free","Rain or Shine","Monthly"], recurring:true, description:"America's largest monthly car show. 2,500+ vehicles, 25,000+ fans every first Sunday. Free to attend. Arrive by 8:30 AM for best spots.", source:"caffeineandoctane.com", sourceUrl:"https://www.caffeineandoctane.com", lng:-84.5880, lat:34.0227 },
  { id:2, title:"Pints & Pistons at RoundTrip", host:"ShiftAtlanta", verified:true, hostFollowers:1936, hostRating:4.8, hostAttendance:94, hostCancellations:1, hostAvgTurnout:190, hostMeetsHosted:47, distanceMi:8.4, happeningSoon:false, location:"RoundTrip Brewing", city:"Atlanta, GA", distance:"8.4 mi", date:"SUN JUN 15", time:"12:00 PM", vibe:"Euro", going:180, interested:420, img:"https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=700&q=80", tags:["All Makes","Euro Discount","Monthly"], recurring:true, description:"ShiftAtlanta's monthly meet at RoundTrip Brewing. Show your euro key fob for 25% off. All makes welcome.", source:"shiftatlanta.org", sourceUrl:"https://shiftatlanta.org", lng:-84.3963, lat:33.7490 },
  { id:3, title:"IMPORTEXPO Atlanta 2026", host:"ImportExpoATL", verified:true, hostFollowers:3800, hostRating:4.7, hostAttendance:91, hostCancellations:0, hostAvgTurnout:640, hostMeetsHosted:3, distanceMi:12.7, happeningSoon:false, location:"Cobb Galleria Centre", city:"Atlanta, GA", distance:"12.7 mi", date:"SAT MAY 16", time:"10:00 AM", vibe:"JDM", going:640, interested:1820, img:"https://images.unsplash.com/photo-1611016186353-9af58c69a533?w=700&q=80", tags:["JDM","Imports","Euro","Stance","Year 3"], recurring:false, description:"Celebrating Year 3! Imports, Domestics, Euro, JDM all welcome. Music, giveaways, good vibes. One of Atlanta's biggest import shows.", source:"shiftatlanta.org", sourceUrl:"https://shiftatlanta.org", lng:-84.4660, lat:33.8834 },
  { id:4, title:"Nissan Skyline Invitational 2026", host:"Z1Motorsports", verified:true, hostFollowers:12400, hostRating:4.9, hostAttendance:97, hostCancellations:0, hostAvgTurnout:890, hostMeetsHosted:12, distanceMi:22.1, happeningSoon:false, location:"Gas South Convention Center", city:"Duluth, GA", distance:"22.1 mi", date:"THU JUN 25", time:"9:00 AM", vibe:"JDM", going:890, interested:3200, img:"https://images.unsplash.com/photo-1544636331-e26879cd4d9b?w=700&q=80", tags:["Nissan","Skyline","4 Days","Indoor"], recurring:false, description:"4 days of unforgettable Nissan and JDM content. Fully indoor, climate controlled. Street car meet Thursday, main show Friday–Sunday.", source:"shiftatlanta.org", sourceUrl:"https://shiftatlanta.org", lng:-84.1496, lat:33.9787 },
  { id:5, title:"NOPI Nationals 2026", host:"NOPINationals", verified:true, hostFollowers:18700, hostRating:4.6, hostAttendance:88, hostCancellations:1, hostAvgTurnout:3100, hostMeetsHosted:28, distanceMi:31.4, happeningSoon:false, location:"EchoPark Speedway", city:"Hampton, GA", distance:"31.4 mi", date:"SAT SEP 12", time:"9:00 AM", vibe:"JDM", going:3100, interested:9800, img:"https://images.unsplash.com/photo-1525609004556-c46c7d6cf023?w=700&q=80", tags:["NOPI","Imports","2 Days","Spectators"], recurring:false, description:"After a massive revival in 2025, NOPI Nationals is back. Two full days September 12-13 at EchoPark Speedway.", source:"shiftatlanta.org", sourceUrl:"https://shiftatlanta.org", lng:-84.3107, lat:33.3856 },
  { id:6, title:"Drivers Festival 2026", host:"ShiftAtlanta", verified:true, hostFollowers:1936, hostRating:4.8, hostAttendance:94, hostCancellations:1, hostAvgTurnout:310, hostMeetsHosted:47, distanceMi:9.8, happeningSoon:false, location:"Pontoon Brewing", city:"Atlanta, GA", distance:"9.8 mi", date:"SAT OCT 24", time:"10:00 AM", vibe:"Euro", going:310, interested:740, img:"https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=700&q=80", tags:["5th Annual","All Makes","Festival"], recurring:false, description:"The 5th Annual Drivers Festival at Pontoon Brewing. More space, more cars. ShiftAtlanta's flagship community event of the year.", source:"shiftatlanta.org", sourceUrl:"https://shiftatlanta.org", lng:-84.4220, lat:33.7660 },
  { id:7, title:"ImportAlliance Spring 2026", host:"ImportAlliance", verified:true, hostFollowers:31000, hostRating:4.7, hostAttendance:92, hostCancellations:2, hostAvgTurnout:4200, hostMeetsHosted:19, distanceMi:89.0, happeningSoon:false, location:"Talladega Superspeedway", city:"Lincoln, AL", distance:"89 mi", date:"SAT MAR 28", time:"10:00 AM", vibe:"JDM", going:4200, interested:11000, img:"https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=700&q=80", tags:["Import","Stance","Weekend","Camping"], recurring:false, description:"New location — Talladega Superspeedway. March 28-29. More motorsports and camping. One of the Southeast's biggest import events.", source:"shiftatlanta.org", sourceUrl:"https://shiftatlanta.org", lng:-86.0633, lat:33.5672 },
  { id:8, title:"Atlanta Got Whips 5", host:"EzzyColorworks", verified:false, hostFollowers:2100, hostRating:4.2, hostAttendance:78, hostCancellations:2, hostAvgTurnout:380, hostMeetsHosted:5, distanceMi:17.4, happeningSoon:false, location:"411 Maxham Rd", city:"Austell, GA", distance:"17.4 mi", date:"SAT MAY 16", time:"12:00 PM", vibe:"Domestic", going:380, interested:920, img:"https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=700&q=80", tags:["All Makes","ATL Scene","Classics","12PM-10PM"], recurring:false, description:"The ultimate ATL car meet where Atlanta's hottest rides roll deep. Classics to latest builds welcome.", source:"eventbrite.com", sourceUrl:"https://www.eventbrite.com/e/atlanta-got-whips-5-tickets-1986137011266", lng:-84.6211, lat:33.7966 },
  { id:9, title:"Magic City Exotic & Old School", host:"BobbyJonesEnt", verified:false, hostFollowers:870, hostRating:3.8, hostAttendance:72, hostCancellations:3, hostAvgTurnout:210, hostMeetsHosted:4, distanceMi:9.2, happeningSoon:false, location:"Magic City, Atlanta", city:"Atlanta, GA", distance:"9.2 mi", date:"SAT APR 18", time:"6:00 PM", vibe:"Exotic", going:210, interested:540, img:"https://images.unsplash.com/photo-1525609004556-c46c7d6cf023?w=700&q=80", tags:["Exotics","Old School","Classics","ATL"], recurring:false, description:"Exotics and old school builds together. Bobby Jones Entertainment brings together Atlanta's car culture.", source:"eventbrite.com", sourceUrl:"https://www.eventbrite.com/e/magic-city-exotic-and-old-school-car-meet-up-tickets-1986277720130", lng:-84.4118, lat:33.7448 },
  { id:10, title:"Sandy Springs Invitational", host:"SandySpringsMotors", verified:false, hostFollowers:430, hostRating:4.1, hostAttendance:80, hostCancellations:1, hostAvgTurnout:160, hostMeetsHosted:6, distanceMi:14.6, happeningSoon:false, location:"City Springs", city:"Sandy Springs, GA", distance:"14.6 mi", date:"SAT JUN 7", time:"9:00 AM", vibe:"Exotic", going:160, interested:380, img:"https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=700&q=80", tags:["Invitational","All Makes","Free Spectators"], recurring:false, description:"Sandy Springs Invitational at City Springs. Beautiful venue backdrop, great for photography. Spectators welcome.", source:"eventbrite.com", sourceUrl:"https://www.eventbrite.com/d/ga--atlanta/classic-car-show/", lng:-84.3744, lat:33.9302 },
  { id:11, title:"Westside Rollout: Season Opener", host:"WestsideCarMeet", verified:false, hostFollowers:680, hostRating:4.4, hostAttendance:85, hostCancellations:1, hostAvgTurnout:95, hostMeetsHosted:8, distanceMi:6.3, happeningSoon:true, location:"Westside Atlanta", city:"Atlanta, GA", distance:"6.3 mi", date:"SAT MAY 30", time:"7:00 PM", vibe:"Domestic", going:95, interested:210, img:"https://images.unsplash.com/photo-1544636331-e26879cd4d9b?w=700&q=80", tags:["Westside","Season Opener","ATL Community"], recurring:false, description:"The Westside Car Meet season opener. All makes welcome. One of ATL's most authentic community meets.", source:"eventbrite.com", sourceUrl:"https://www.eventbrite.com/d/ga--atlanta/classic-car-show/", lng:-84.4312, lat:33.7590 },
  { id:12, title:"Caffeine & Exotics at City Springs", host:"CaffeineAndExotics", verified:true, hostFollowers:5800, hostRating:4.9, hostAttendance:99, hostCancellations:0, hostAvgTurnout:400, hostMeetsHosted:22, distanceMi:14.8, happeningSoon:false, location:"City Springs", city:"Sandy Springs, GA", distance:"14.8 mi", date:"SAT AUG 15", time:"8:00 AM", vibe:"Exotic", going:400, interested:1800, img:"https://images.unsplash.com/photo-1525609004556-c46c7d6cf023?w=700&q=80", tags:["Invite Only","Exotics","$5 Spectators","Photo Friendly"], recurring:false, description:"Invite-only exotic car show. Owners apply to exhibit. Spectator entry $5. Unlimited photo access. Private Driver's Lounge.", source:"caffeineandexotics.com", sourceUrl:"https://www.caffeineandexotics.com/", lng:-84.3744, lat:33.9262 },
  { id:13, title:"Roswell Cars & Coffee", host:"RoswellCarsAndCoffee", verified:true, hostFollowers:620, hostRating:4.7, hostAttendance:90, hostCancellations:1, hostAvgTurnout:95, hostMeetsHosted:104, distanceMi:21.3, happeningSoon:true, location:"11235 Alpharetta Hwy", city:"Roswell, GA", distance:"21.3 mi", date:"EVERY SAT", time:"8:00 AM", vibe:"Domestic", going:95, interested:210, img:"https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=700&q=80", tags:["All Makes","Weekly","Free","Coffee"], recurring:true, description:"Weekly Saturday meet at 11235 Alpharetta Hwy. Coffee at 967 Coffee Co. All enthusiasts welcome.", source:"carsandcoffeedirectory.com", sourceUrl:"https://www.carsandcoffeedirectory.com/events/roswell-cars-coffee", lng:-84.3627, lat:34.0232 },
  { id:14, title:"Cars & Coffee Alpharetta (Gateway)", host:"GatewayClassicCars", verified:true, hostFollowers:1840, hostRating:4.8, hostAttendance:93, hostCancellations:0, hostAvgTurnout:130, hostMeetsHosted:36, distanceMi:26.1, happeningSoon:false, location:"2705 Ronald Reagan Blvd", city:"Cumming, GA", distance:"26.1 mi", date:"LAST SAT/MO", time:"9:00 AM", vibe:"Domestic", going:130, interested:290, img:"https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=700&q=80", tags:["Monthly","Free","Classic Cars"], recurring:true, description:"Monthly Cars and Coffee at Gateway Classic Cars. Last Saturday of each month, 9AM-12PM.", source:"carsandcoffeedirectory.com", sourceUrl:"https://www.carsandcoffeedirectory.com/events/cars-coffee-alpharetta-gateway-classic-cars", lng:-84.1149, lat:34.2099 },
  { id:15, title:"Worship Roswell Cars & Coffee", host:"WorshipRoswell", verified:false, hostFollowers:310, hostRating:4.5, hostAttendance:87, hostCancellations:0, hostAvgTurnout:65, hostMeetsHosted:18, distanceMi:22.8, happeningSoon:false, location:"1195 Woodstock Rd", city:"Roswell, GA", distance:"22.8 mi", date:"1ST SUN/MO", time:"8:00 AM", vibe:"Domestic", going:65, interested:140, img:"https://images.unsplash.com/photo-1544636331-e26879cd4d9b?w=700&q=80", tags:["Monthly","All Makes","Chill Vibe","Free"], recurring:true, description:"Monthly automotive gathering first Sundays. Chill alternative to C&O crowds.", source:"carsandcoffeedirectory.com", sourceUrl:"https://www.carsandcoffeedirectory.com/events/worship-roswell-cars-coffee", lng:-84.3561, lat:34.0459 },
  { id:16, title:"Athens Cars & Coffee", host:"AthensCarsAndCoffee", verified:false, hostFollowers:480, hostRating:4.3, hostAttendance:82, hostCancellations:1, hostAvgTurnout:75, hostMeetsHosted:24, distanceMi:68.2, happeningSoon:false, location:"196 Alps Rd, Beechwood", city:"Athens, GA", distance:"68.2 mi", date:"1ST SAT/MO", time:"9:00 AM", vibe:"Domestic", going:75, interested:160, img:"https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=700&q=80", tags:["Monthly","Classics","Bikes Welcome","Free"], recurring:true, description:"Monthly gathering for classic cars, bikes and good coffee. First Saturday at Beechwood Shopping Center.", source:"carsandcoffeedirectory.com", sourceUrl:"https://www.carsandcoffeedirectory.com/events/athens-cars-coffee", lng:-83.4078, lat:33.9496 },
  { id:17, title:"Savannah Cars & Coffee", host:"SavannahCarsAndCoffee", verified:false, hostFollowers:390, hostRating:4.4, hostAttendance:84, hostCancellations:0, hostAvgTurnout:60, hostMeetsHosted:31, distanceMi:248.0, happeningSoon:false, location:"4511 Habersham St", city:"Savannah, GA", distance:"248 mi", date:"1ST SAT/MO", time:"7:30 AM", vibe:"Domestic", going:60, interested:130, img:"https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=700&q=80", tags:["Monthly","All Makes","Free","Coastal"], recurring:true, description:"First Saturday at Habersham Village. All makes welcome. One of Georgia's best coastal meets.", source:"carsandcoffeedirectory.com", sourceUrl:"https://www.carsandcoffeedirectory.com/events/savannah-cars-coffee", lng:-81.0998, lat:32.0481 },
  { id:18, title:"Fastlane ATL Car Show", host:"FastlaneCreative", verified:true, hostFollowers:4200, hostRating:4.6, hostAttendance:89, hostCancellations:1, hostAvgTurnout:320, hostMeetsHosted:11, distanceMi:11.0, happeningSoon:false, location:"Atlanta Metro Area", city:"Atlanta, GA", distance:"11 mi", date:"TBA 2026", time:"TBA", vibe:"Domestic", going:320, interested:870, img:"https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=700&q=80", tags:["Culture Driven","Brand Activations","ATL"], recurring:false, description:"Culture-driven car shows and brand activations in Atlanta. Deep roots in automotive and entertainment culture.", source:"fastlanecreative.org", sourceUrl:"https://fastlanecreative.org/", lng:-84.3880, lat:33.7490 },
  { id:19, title:"Locals & Legends Weekly", host:"LocalsAndLegends", verified:true, hostFollowers:3100, hostRating:4.8, hostAttendance:93, hostCancellations:0, hostAvgTurnout:120, hostMeetsHosted:156, distanceMi:22.5, happeningSoon:true, location:"Sake Japanese Steakhouse, 1155 Woodstock Rd", city:"Roswell, GA", distance:"22.5 mi", date:"EVERY THURSDAY", time:"7:00 PM", vibe:"JDM", going:120, interested:280, img:"https://images.unsplash.com/photo-1611016186353-9af58c69a533?w=700&q=80", tags:["Weekly","All Makes","Family Friendly","No Burnouts"], recurring:true, description:"Every Thursday 7-9PM at Sake in Roswell. Enjoy sushi or drinks while you walk the lot. No hooning, 5MPH speed limit.", source:"carcruisefinder.com", sourceUrl:"https://carcruisefinder.com/car-show/locals-and-legends-weekly-car-meet-sake-in-roswell-ga/2026-02-05/", lng:-84.3561, lat:34.0244 },
  { id:20, title:"Tuesday Night Street Drags", host:"BrainerdDragstrip", verified:true, hostFollowers:1200, hostRating:4.7, hostAttendance:91, hostCancellations:0, hostAvgTurnout:210, hostMeetsHosted:220, distanceMi:88.0, happeningSoon:false, location:"Brainerd Dragstrip", city:"Fort Oglethorpe, GA", distance:"88 mi", date:"EVERY TUESDAY", time:"8:00 PM", vibe:"Domestic", going:210, interested:490, img:"https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=700&q=80", tags:["Weekly","Drag","Street Cars","All Makes"], recurring:true, description:"Weekly Tuesday Night Street Drags at Brainerd Dragstrip. Open to all street cars.", source:"carcruisefinder.com", sourceUrl:"https://carcruisefinder.com/car-shows/category/georgia/", lng:-85.2613, lat:34.9490 },
  { id:21, title:"Urban Hardware Cruise-In", host:"UrbanHardwareAlpharetta", verified:false, hostFollowers:340, hostRating:4.2, hostAttendance:79, hostCancellations:2, hostAvgTurnout:55, hostMeetsHosted:14, distanceMi:28.2, happeningSoon:false, location:"Urban Hardware, Alpharetta", city:"Alpharetta, GA", distance:"28.2 mi", date:"EVERY SUN", time:"8:00 AM", vibe:"Domestic", going:55, interested:120, img:"https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=700&q=80", tags:["Weekly","All Makes","Morning Meet"], recurring:true, description:"Weekly Sunday morning cruise-in 8-10AM. Casual and friendly, all makes.", source:"carcruisefinder.com", sourceUrl:"https://carcruisefinder.com/car-shows/category/georgia/", lng:-84.2941, lat:34.0754 },
  { id:22, title:"Southern Tradition Car & Truck Show", host:"SouthernTraditionShow", verified:false, hostFollowers:520, hostRating:4.0, hostAttendance:76, hostCancellations:2, hostAvgTurnout:280, hostMeetsHosted:7, distanceMi:54.0, happeningSoon:false, location:"Canton, GA", city:"Canton, GA", distance:"54 mi", date:"FRI MAR 27", time:"All Day", vibe:"Truck", going:280, interested:610, img:"https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=700&q=80", tags:["Trucks","Cars","Bikes","3 Days"], recurring:false, description:"3-day event March 27-29. Open to trucks, cars, bikes, SxS, and jeeps. Awards Sunday afternoon.", source:"carcruisefinder.com", sourceUrl:"https://carcruisefinder.com/car-shows/category/georgia/", lng:-84.4941, lat:34.2337 },
  { id:23, title:"45th Annual BOPC Car Show", host:"PeachStateCadillacClub", verified:false, hostFollowers:280, hostRating:4.5, hostAttendance:88, hostCancellations:0, hostAvgTurnout:90, hostMeetsHosted:45, distanceMi:19.8, happeningSoon:false, location:"Piedmont Church, Marietta", city:"Marietta, GA", distance:"19.8 mi", date:"SAT APR 18", time:"8:00 AM", vibe:"Domestic", going:90, interested:195, img:"https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=700&q=80", tags:["Buick","Olds","Pontiac","Cadillac","Classic Cars"], recurring:false, description:"45th Annual Peach Blossom BOPC Car Show. Buicks, Oldsmobiles, Pontiacs, and Cadillacs. A classic American iron showcase.", source:"carcruisefinder.com", sourceUrl:"https://carcruisefinder.com/car-show/bopc-car-show/", lng:-84.5197, lat:33.9526 },
];
const igPosts = [
  { id: 1, img: "https://images.unsplash.com/photo-1614162692292-7ac56d7f7f1e?w=400&q=80", likes: "1.2K" },
  { id: 2, img: "https://images.unsplash.com/photo-1494976388531-d1058494cdd8?w=400&q=80", likes: "892" },
  { id: 3, img: "https://images.unsplash.com/photo-1583121274602-3e2820c69888?w=400&q=80", likes: "2.1K" },
  { id: 4, img: "https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?w=400&q=80", likes: "654" },
  { id: 5, img: "https://images.unsplash.com/photo-1560958089-b8a1929cea89?w=400&q=80", likes: "3.4K" },
  { id: 6, img: "https://images.unsplash.com/photo-1471444928139-48c5bf5173f8?w=400&q=80", likes: "1.9K" },
  { id: 7, img: "https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?w=400&q=80", likes: "987" },
  { id: 8, img: "https://images.unsplash.com/photo-1511919884226-fd3cad34687c?w=400&q=80", likes: "4.2K" },
  { id: 9, img: "https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?w=400&q=80", likes: "733" },
];

const vibeColors = { JDM: "#FF4500", Euro: "#3B82F6", Exotic: "#F59E0B", Domestic: "#EF4444", Truck: "#10B981" };
const filters = ["All", "Tonight", "This Weekend", "JDM", "Euro", "Exotic", "Domestic", "Truck"];

function MapboxMap({ meets, onSelectMeet, selectedMeet }) {
  const mapContainer = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);

  useEffect(() => {
    if (mapRef.current) return;

    const script = document.createElement("script");
    script.src = "https://api.mapbox.com/mapbox-gl-js/v3.3.0/mapbox-gl.js";
    script.onload = () => {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "https://api.mapbox.com/mapbox-gl-js/v3.3.0/mapbox-gl.css";
      document.head.appendChild(link);

      const mapboxgl = window.mapboxgl;
      mapboxgl.accessToken = MAPBOX_TOKEN;

      const map = new mapboxgl.Map({
        container: mapContainer.current,
        style: "mapbox://styles/mapbox/dark-v11",
        center: [-84.39, 33.75],
        zoom: 10,
        pitch: 45,
        bearing: -10,
      });

      mapRef.current = map;

      map.on("load", () => {
        // Add custom atmosphere
        map.setFog({
          color: "rgb(10, 10, 10)",
          "high-color": "rgb(20, 20, 20)",
          "horizon-blend": 0.1,
        });

        // Add meet markers
        meets.forEach((meet) => {
          const el = document.createElement("div");
          el.className = "tunr-marker";
          el.style.cssText = `
            width: 36px;
            height: 36px;
            border-radius: 50% 50% 50% 0;
            transform: rotate(-45deg);
            background: ${vibeColors[meet.vibe]};
            border: 2px solid #0A0A0A;
            cursor: pointer;
            box-shadow: 0 4px 20px ${vibeColors[meet.vibe]}88;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: transform 0.2s ease, box-shadow 0.2s ease;
          `;

          const inner = document.createElement("div");
          inner.style.cssText = `
            transform: rotate(45deg);
            color: white;
            font-size: 10px;
            font-weight: 900;
            font-family: 'Barlow Condensed', sans-serif;
            letter-spacing: 0.5px;
          `;
          inner.textContent = meet.vibe.slice(0, 1);
          el.appendChild(inner);

          el.addEventListener("mouseenter", () => {
            el.style.transform = "rotate(-45deg) scale(1.25)";
            el.style.boxShadow = `0 8px 30px ${vibeColors[meet.vibe]}cc`;
          });
          el.addEventListener("mouseleave", () => {
            el.style.transform = "rotate(-45deg) scale(1)";
            el.style.boxShadow = `0 4px 20px ${vibeColors[meet.vibe]}88`;
          });
          el.addEventListener("click", () => onSelectMeet(meet));

          const popup = new mapboxgl.Popup({
            offset: 30,
            closeButton: false,
            className: "tunr-popup",
          }).setHTML(`
            <div style="
              background: #111;
              border: 1px solid ${vibeColors[meet.vibe]};
              border-radius: 8px;
              padding: 10px 14px;
              font-family: 'Barlow Condensed', sans-serif;
              color: #F0F0F0;
              min-width: 160px;
            ">
              <div style="font-size: 10px; color: ${vibeColors[meet.vibe]}; letter-spacing: 2px; font-weight: 800;">${meet.vibe} ${meet.verified ? "✓" : ""}</div>
              <div style="font-size: 15px; font-weight: 800; margin-top: 2px;">${meet.title}</div>
              <div style="font-size: 11px; color: #888; margin-top: 4px;">${meet.date} · ${meet.time}</div>
              <div style="font-size: 11px; color: #666; margin-top: 2px;">👥 ${meet.going} going · ${meet.distance}</div>
            </div>
          `);

          const marker = new mapboxgl.Marker(el)
            .setLngLat([meet.lng, meet.lat])
            .setPopup(popup)
            .addTo(map);

          markersRef.current.push(marker);
        });

        // User location dot
        const userEl = document.createElement("div");
        userEl.style.cssText = `
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #fff;
          border: 3px solid #0A0A0A;
          box-shadow: 0 0 0 6px rgba(255,255,255,0.15), 0 0 25px rgba(255,255,255,0.5);
        `;
        new mapboxgl.Marker(userEl)
          .setLngLat([-84.39, 33.75])
          .addTo(map);
      });
    };

    document.head.appendChild(script);

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Fly to selected meet
  useEffect(() => {
    if (selectedMeet && mapRef.current) {
      mapRef.current.flyTo({
        center: [selectedMeet.lng, selectedMeet.lat],
        zoom: 14,
        pitch: 60,
        bearing: Math.random() * 60 - 30,
        duration: 1800,
        essential: true,
      });
    }
  }, [selectedMeet]);

  return (
    <div style={{ position: "relative" }}>
      <style>{`
        .mapboxgl-ctrl-logo { display: none !important; }
        .mapboxgl-ctrl-attrib { display: none !important; }
        .mapboxgl-popup-content { background: transparent !important; padding: 0 !important; box-shadow: none !important; border: none !important; }
        .mapboxgl-popup-tip { display: none !important; }
        .tunr-marker { position: relative; }
      `}</style>
      <div ref={mapContainer} style={{ width: "100%", height: 420, borderRadius: 12, overflow: "hidden", border: "1px solid #222" }} />

      {/* Map Legend */}
      <div style={{
        position: "absolute", bottom: 14, left: 14,
        background: "rgba(10,10,10,0.85)",
        backdropFilter: "blur(10px)",
        border: "1px solid #222",
        borderRadius: 8,
        padding: "8px 12px",
        display: "flex",
        flexDirection: "column",
        gap: 5,
      }}>
        {Object.entries(vibeColors).map(([vibe, color]) => (
          <div key={vibe} style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, boxShadow: `0 0 6px ${color}` }} />
            <span style={{ fontSize: 10, color: "#666", letterSpacing: 1.5, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700 }}>{vibe}</span>
          </div>
        ))}
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 2, borderTop: "1px solid #222", paddingTop: 5 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#fff", boxShadow: "0 0 6px #fff" }} />
          <span style={{ fontSize: 10, color: "#666", letterSpacing: 1.5, fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700 }}>YOU</span>
        </div>
      </div>

      {/* Meet count badge */}
      <div style={{
        position: "absolute", top: 14, right: 14,
        background: "rgba(10,10,10,0.85)",
        backdropFilter: "blur(10px)",
        border: "1px solid #FF4500",
        borderRadius: 8,
        padding: "6px 12px",
      }}>
        <span style={{ fontSize: 11, color: "#FF4500", fontWeight: 800, letterSpacing: 1.5, fontFamily: "'Barlow Condensed', sans-serif" }}>
          {meets.length} MEETS NEAR YOU
        </span>
      </div>
    </div>
  );
}


function AuthScreen({ onSignIn }) {
  const [mode, setMode] = useState("landing");
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const handleSignIn = () => { setLoading(true); setTimeout(() => { setLoading(false); onSignIn(); }, 1200); };
  if (loading) return (
    <div style={{ background:"#0A0A0A", minHeight:"100vh", maxWidth:430, margin:"0 auto", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:16, fontFamily:"'Barlow Condensed',sans-serif" }}>
      <style>{"@keyframes spin{to{transform:rotate(360deg)}}"}</style>
      <div style={{ width:40, height:40, border:"3px solid #1E1E1E", borderTop:"3px solid #FF4500", borderRadius:"50%", animation:"spin 0.8s linear infinite" }}/>
      <div style={{ fontSize:13, color:"#555", letterSpacing:3 }}>SIGNING YOU IN...</div>
    </div>
  );
  if (mode === "landing") return (
    <div style={{ background:"#0A0A0A", minHeight:"100vh", maxWidth:430, margin:"0 auto", fontFamily:"'Barlow Condensed',sans-serif", display:"flex", flexDirection:"column" }}>
      <style>{"@import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;700;800;900&family=Barlow:wght@400;500&display=swap');"}</style>
      <div style={{ position:"relative", flex:"1 1 440px", minHeight:440 }}>
        <img src="https://images.unsplash.com/photo-1611016186353-9af58c69a533?w=800&q=80" style={{ width:"100%", height:"100%", objectFit:"cover", position:"absolute", inset:0 }} alt=""/>
        <div style={{ position:"absolute", inset:0, background:"linear-gradient(180deg,rgba(10,10,10,0.15) 0%,rgba(10,10,10,0.97) 88%)" }}/>
        <div style={{ position:"absolute", bottom:0, left:0, right:0, padding:"32px 28px 28px" }}>
          <div style={{ fontSize:72, fontWeight:900, letterSpacing:-3, lineHeight:0.9, color:"#F0F0F0" }}>TUN<span style={{ color:"#FF4500" }}>R</span></div>
          <div style={{ height:2, width:56, background:"#FF4500", margin:"12px 0 14px" }}/>
          <div style={{ fontSize:17, color:"#AAA", lineHeight:1.5, fontFamily:"'Barlow',sans-serif", maxWidth:300 }}>Find car meets near you. Connect with your local car community.</div>
        </div>
      </div>
      <div style={{ padding:"28px 24px 48px", display:"flex", flexDirection:"column", gap:12 }}>
        <button onClick={handleSignIn} style={{ width:"100%", padding:"15px 20px", background:"#fff", color:"#111", border:"none", borderRadius:12, fontSize:15, fontWeight:700, fontFamily:"'Barlow Condensed',sans-serif", display:"flex", alignItems:"center", justifyContent:"center", gap:12, cursor:"pointer" }}>
          <svg width="20" height="20" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
          Continue with Google
        </button>
        <button onClick={handleSignIn} style={{ width:"100%", padding:"15px 20px", background:"#F0F0F0", color:"#000", border:"none", borderRadius:12, fontSize:15, fontWeight:700, fontFamily:"'Barlow Condensed',sans-serif", display:"flex", alignItems:"center", justifyContent:"center", gap:12, cursor:"pointer" }}>
          <svg width="17" height="20" viewBox="0 0 814 1000" fill="#000"><path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76 0-103.7 40.8-165.9 40.8s-105-47.4-148.2-117.8C46 382.4 4.4 191.1 4.4 106.2c0-55.3 14.8-109.7 44.2-156 29.1-46 74.7-83.9 128.9-104 52.7-19.6 110.2-22.4 165.6-22.4 57.9 0 118.3 17.5 162.9 40.8l.1.1c44.6 23.2 86.1 39.3 131.5 39.3 43.2 0 82.7-14.8 128.6-37.5C795.7 9.5 810.4.5 822.4 0c9.5-.1 18.5 6.5 22.8 16.2 4.3 9.7 2.8 21.8-3.7 28.9-50.4 52.9-54.5 75.3-54.5 120.2l.1 175.6z"/></svg>
          Continue with Apple
        </button>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}><div style={{ flex:1, height:1, background:"#1E1E1E" }}/><span style={{ fontSize:11, color:"#444", letterSpacing:2 }}>OR</span><div style={{ flex:1, height:1, background:"#1E1E1E" }}/></div>
        <button onClick={() => setMode("email")} style={{ width:"100%", padding:"15px 0", background:"#FF4500", color:"#fff", border:"none", borderRadius:12, fontSize:15, fontWeight:800, letterSpacing:2, fontFamily:"'Barlow Condensed',sans-serif", boxShadow:"0 4px 24px rgba(255,69,0,0.4)", cursor:"pointer" }}>SIGN IN WITH EMAIL</button>
        <button onClick={handleSignIn} style={{ width:"100%", padding:"12px 0", background:"transparent", color:"#555", border:"1px solid #222", borderRadius:12, fontSize:13, fontWeight:700, letterSpacing:1.5, fontFamily:"'Barlow Condensed',sans-serif", cursor:"pointer" }}>CONTINUE AS GUEST</button>
        <div style={{ textAlign:"center", fontSize:11, color:"#2A2A2A", fontFamily:"'Barlow',sans-serif" }}>By continuing you agree to TUNR Terms of Service</div>
      </div>
    </div>
  );
  return (
    <div style={{ background:"#0A0A0A", minHeight:"100vh", maxWidth:430, margin:"0 auto", fontFamily:"'Barlow Condensed',sans-serif", padding:"0 24px 40px", display:"flex", flexDirection:"column" }}>
      <style>{"@import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;800;900&family=Barlow:wght@400;500&display=swap'); .auth-inp{background:#161616;border:1px solid #2A2A2A;border-radius:10px;padding:14px 16px;color:#F0F0F0;font-size:15px;font-family:'Barlow',sans-serif;outline:none;width:100%;box-sizing:border-box;}.auth-inp:focus{border-color:#FF4500;}"}</style>
      <div style={{ paddingTop:56, paddingBottom:32 }}>
        <button onClick={() => setMode("landing")} style={{ background:"#161616", border:"1px solid #222", color:"#888", borderRadius:8, padding:"6px 14px", fontSize:12, fontWeight:700, letterSpacing:1, marginBottom:28, fontFamily:"'Barlow Condensed',sans-serif", cursor:"pointer" }}>BACK</button>
        <div style={{ fontSize:42, fontWeight:900, letterSpacing:-1 }}>TUN<span style={{ color:"#FF4500" }}>R</span></div>
        <div style={{ fontSize:22, fontWeight:800, color:"#F0F0F0", marginTop:6 }}>Welcome back</div>
      </div>
      <div style={{ display:"flex", flexDirection:"column", gap:12, flex:1 }}>
        <input className="auth-inp" placeholder="Email address" type="email" value={email} onChange={e => setEmail(e.target.value)}/>
        <input className="auth-inp" placeholder="Password" type="password" value={password} onChange={e => setPassword(e.target.value)}/>
        <button onClick={handleSignIn} style={{ width:"100%", padding:"15px 0", background:"#FF4500", color:"#fff", border:"none", borderRadius:10, fontSize:15, fontWeight:800, letterSpacing:2, fontFamily:"'Barlow Condensed',sans-serif", boxShadow:"0 4px 24px rgba(255,69,0,0.35)", cursor:"pointer" }}>SIGN IN</button>
        <button onClick={handleSignIn} style={{ background:"none", border:"none", color:"#666", fontSize:13, cursor:"pointer", fontFamily:"'Barlow',sans-serif", textAlign:"center" }}>Don't have an account? Sign up</button>
      </div>
    </div>
  );
}

export default function TUNR() {
  const [activeTab, setActiveTab] = useState("discover");
  const [activeFilter, setActiveFilter] = useState("All");
  const [selectedMeet, setSelectedMeet] = useState(null);
  const [rsvpd, setRsvpd] = useState({});
  const [mapView, setMapView] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showSplash, setShowSplash] = useState(true);
  const [showAuth, setShowAuth] = useState(false);
  const [showTos, setShowTos] = useState(false);
  const [tosScrolled, setTosScrolled] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardUsername, setOnboardUsername] = useState("");
  const [onboardLocation, setOnboardLocation] = useState("");
  const [onboardStep, setOnboardStep] = useState(1);
  const [tosAccepted, setTosAccepted] = useState(false);
  const [carPhoto, setCarPhoto] = useState(null);
  const [radiusFilter, setRadiusFilter] = useState(25);
  const [sortBy, setSortBy] = useState("smart");
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [showDiscoverySheet, setShowDiscoverySheet] = useState(false);
  const [dateFilter, setDateFilter] = useState("any");
  const [followedHosts, setFollowedHosts] = useState(["CaffeineAndOctane","ShiftAtlanta"]);
  const [hostedMeets, setHostedMeets] = useState([]);
  const [unlockedIds, setUnlockedIds] = useState({});
  const [unlockTarget, setUnlockTarget] = useState(null);
  const [unlockInput, setUnlockInput] = useState("");
  const [unlockError, setUnlockError] = useState("");
  const [checkedIn, setCheckedIn] = useState({});
  const [liveCounts, setLiveCounts] = useState({});
  const [comments, setComments] = useState({ 1:[{id:1,user:"atl_wrench",avatar:"A",text:"Been coming for 5 years straight. Nothing like C&O on a Sunday morning.",time:"18h ago",likes:91},{id:2,user:"r35_kennesaw",avatar:"R",text:"Bringing the GT-R out this month 🔥",time:"6h ago",likes:43}], 19:[{id:1,user:"LocalsAndLegends",avatar:"L",text:"Every Thursday 7-9PM. Come early for parking!",time:"1d ago",likes:67},{id:2,user:"silvia_atl",avatar:"S",text:"Anyone bringing an S-chassis? Looking to link up",time:"5h ago",likes:24}] });
  const [commentInput, setCommentInput] = useState("");
  const [commentPhoto, setCommentPhoto] = useState(null);
  const [commentPhotoPreview, setCommentPhotoPreview] = useState(null);
  const [scanningPhoto, setScanningPhoto] = useState(false);
  const [commentError, setCommentError] = useState("");
  const [commentLikes, setCommentLikes] = useState({});
  const [detailTab, setDetailTab] = useState("info");
  const [galleryPhotos, setGalleryPhotos] = useState({});
  const [swipeState, setSwipeState] = useState({});
  const [swipeFeedback, setSwipeFeedback] = useState({});
  const [shareToast, setShareToast] = useState(null);
  const [cancelledMeets, setCancelledMeets] = useState({});
  const [showCancelSheet, setShowCancelSheet] = useState(null);
  const [cancelReason, setCancelReason] = useState("");
  const [waitlists, setWaitlists] = useState({});
  const [capacities] = useState({ 1:2500, 2:200, 3:700, 4:1000, 5:3500 });
  const [rollingOut, setRollingOut] = useState(null);
  const [showRolloutSheet, setShowRolloutSheet] = useState(false);
  const [userLocation, setUserLocation] = useState(null);
  const [watchId, setWatchId] = useState(null);
  const [convoyDrivers, setConvoyDrivers] = useState({});
  const [locationPermAsked, setLocationPermAsked] = useState(false);
  const [convoyChats, setConvoyChats] = useState({});
  const [showConvoyChat, setShowConvoyChat] = useState(null);
  const [convoyMsg, setConvoyMsg] = useState("");
  const [showVerifySheet, setShowVerifySheet] = useState(false);
  const [verifyForm, setVerifyForm] = useState({ instagram:"", meetCount:"", bio:"" });
  const [verifySubmitted, setVerifySubmitted] = useState(false);
  const [spottedCars, setSpottedCars] = useState({});
  const [spotTarget, setSpotTarget] = useState(null);
  const [spotForm, setSpotForm] = useState({ year:"", make:"", model:"" });
  const [createTitle, setCreateTitle] = useState("");
  const [createLocation2, setCreateLocation2] = useState("");
  const [createVibe, setCreateVibe] = useState("JDM");
  const [createDate, setCreateDate] = useState("");
  const [createTime, setCreateTime] = useState("");
  const [createDesc, setCreateDesc] = useState("");
  const [createPrivate, setCreatePrivate] = useState(false);
  const [createCode, setCreateCode] = useState("");
  const [createCodeError, setCreateCodeError] = useState("");
  const [createStep, setCreateStep] = useState(1);

  useEffect(() => {
    const t = setTimeout(() => { setShowSplash(false); setShowAuth(true); }, 2200);
    return () => clearTimeout(t);
  }, []);

  const filtered = meets.filter(m => {
    if (activeFilter === "All") return true;
    if (activeFilter === "Tonight") return m.date.includes("FRI");
    if (activeFilter === "This Weekend") return m.date.includes("SAT") || m.date.includes("SUN");
    return m.vibe === activeFilter;
  });

  const handleRsvp = (id, type, e) => {
    e.stopPropagation();
    setRsvpd(prev => ({ ...prev, [id]: prev[id] === type ? null : type }));
  };

  if (showSplash) {
    return (
      <div style={{
        background: "#0A0A0A", minHeight: "100vh", maxWidth: 430,
        margin: "0 auto", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        fontFamily: "'Barlow Condensed', sans-serif",
      }}>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:ital,wght@0,400;0,600;0,700;0,800;0,900;1,700&family=Barlow:wght@400;500;600&display=swap');
          @keyframes revEngine { 0%,100%{transform:scaleX(1)} 50%{transform:scaleX(1.04)} }
          @keyframes fadeSlideUp { from{opacity:0;transform:translateY(30px)} to{opacity:1;transform:translateY(0)} }
          @keyframes lineGrow { from{width:0} to{width:60px} }
          @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
        `}</style>
        <div style={{ animation: "revEngine 0.7s ease-in-out infinite", marginBottom: 12 }}>
          <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
            <circle cx="28" cy="28" r="27" stroke="#FF4500" strokeWidth="2"/>
            <path d="M14 32 L22 20 L28 26 L34 18 L42 28 L38 32 Z" fill="#FF4500"/>
            <circle cx="19" cy="37" r="4" fill="#333" stroke="#FF4500" strokeWidth="1.5"/>
            <circle cx="37" cy="37" r="4" fill="#333" stroke="#FF4500" strokeWidth="1.5"/>
          </svg>
        </div>
        <div style={{ fontSize: 72, fontWeight: 900, letterSpacing: "-2px", color: "#F0F0F0", lineHeight: 1, animation: "fadeSlideUp 0.6s ease 0.2s both" }}>TUNR</div>
        <div style={{ width: 60, height: 2, background: "#FF4500", margin: "10px auto 14px", animation: "lineGrow 0.6s ease 0.5s both" }}/>
        <div style={{ color: "#666", fontSize: 13, letterSpacing: 4, textTransform: "uppercase", animation: "fadeSlideUp 0.6s ease 0.7s both" }}>Find Your Meet</div>
        <div style={{ marginTop: 60, color: "#FF4500", fontSize: 11, letterSpacing: 3, animation: "pulse 1.2s ease 1s infinite" }}>● LOCATING MEETS NEAR YOU</div>
      </div>
    );
  }


  if (showAuth) return <AuthScreen onSignIn={() => { setShowAuth(false); setShowTos(true); }} />;

  if (showTos) return (
    <div style={{ background:"#0A0A0A", minHeight:"100vh", maxWidth:430, margin:"0 auto", fontFamily:"'Barlow Condensed',sans-serif", color:"#F0F0F0", display:"flex", flexDirection:"column" }}>
      <style>{"@import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;800;900&family=Barlow:wght@400;500&display=swap'); .tos-body{font-family:'Barlow',sans-serif;font-size:13px;color:#AAA;line-height:1.7;} .tos-h{font-family:'Barlow Condensed',sans-serif;font-size:13px;font-weight:800;letter-spacing:1.5px;color:#FF4500;margin-top:20px;margin-bottom:6px;} .tos-warn{background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.25);border-radius:8px;padding:10px 14px;margin:10px 0;font-family:'Barlow',sans-serif;font-size:13px;color:#EF4444;line-height:1.6;}"}</style>
      <div style={{ padding:"20px 20px 16px", borderBottom:"1px solid #1A1A1A", flexShrink:0 }}>
        <div style={{ fontSize:28, fontWeight:900 }}>TUN<span style={{ color:"#FF4500" }}>R</span></div>
        <div style={{ fontSize:18, fontWeight:800, marginTop:4 }}>Terms of Service</div>
        <div style={{ fontSize:12, color:"#555", marginTop:2, fontFamily:"'Barlow',sans-serif" }}>Please read before continuing</div>
      </div>
      <div onScroll={e => { const el=e.target; if (el.scrollHeight-el.scrollTop-el.clientHeight < 80) setTosScrolled(true); }} style={{ flex:1, overflowY:"auto", padding:"20px 20px 0" }}>
        <div className="tos-body">Welcome to TUNR. By using this app you agree to the following terms.</div>
        <div className="tos-warn">⚠️ TUNR is a discovery platform only. We do not organize or endorse any listed event. Attending any event is at your own risk.</div>
        <div className="tos-h">1. ILLEGAL ACTIVITY — ZERO TOLERANCE</div>
        <div className="tos-body">TUNR has a strict zero-tolerance policy for illegal activity. You agree not to use TUNR to organize, promote, or participate in:</div>
        <div className="tos-warn">🚫 Street racing, drag racing, or illegal racing on public roads<br/>🚫 Reckless driving, burnouts, or stunt driving in public spaces<br/>🚫 Takeovers, sideshows, or activities that block public roads<br/>🚫 Threatening or harassing any person or group<br/>🚫 Any activity that violates federal, state, or local law</div>
        <div className="tos-body">Any meet listing promoting illegal activity will be immediately removed. Hosts found in violation will be permanently banned.</div>
        <div className="tos-h">2. HOST RESPONSIBILITY</div>
        <div className="tos-body">If you post a meet you are the sole organizer and fully responsible for that event. TUNR accepts no liability for anything that occurs at a listed event. You must have permission to use the listed venue and will not encourage dangerous driving of any kind.</div>
        <div className="tos-h">3. USER CONDUCT</div>
        <div className="tos-body">You agree not to post hateful, threatening, sexually explicit, or defamatory content. TUNR reserves the right to remove any content and ban any user at any time.</div>
        <div className="tos-h">4. RELEASE OF LIABILITY</div>
        <div className="tos-body">TO THE MAXIMUM EXTENT PERMITTED BY LAW, TUNR IS NOT LIABLE FOR ANY INJURY, DEATH, PROPERTY DAMAGE, OR OTHER HARM ARISING FROM YOUR USE OF THIS APP OR ATTENDANCE AT ANY LISTED EVENT. YOU ATTEND ANY EVENT AT YOUR SOLE RISK.</div>
        <div className="tos-h">5. REPORTING</div>
        <div className="tos-body">If you witness illegal activity at a TUNR-listed meet, report it to local law enforcement immediately. TUNR will cooperate fully with law enforcement investigations.</div>
        <div style={{ height:40 }}/>
      </div>
      <div style={{ padding:"16px 20px 32px", borderTop:"1px solid #1A1A1A", flexShrink:0, background:"#0A0A0A" }}>
        {!tosScrolled && <div style={{ textAlign:"center", fontSize:11, color:"#444", fontFamily:"'Barlow',sans-serif", marginBottom:10 }}>↑ Scroll to read all terms</div>}
        <button onClick={() => { setTosAccepted(true); setShowTos(false); setShowOnboarding(true); }} style={{ width:"100%", padding:"16px 0", background:"#FF4500", color:"#fff", border:"none", borderRadius:12, fontSize:15, fontWeight:900, letterSpacing:2, cursor:"pointer", boxShadow:"0 4px 24px rgba(255,69,0,0.4)", fontFamily:"'Barlow Condensed',sans-serif" }}>I AGREE — LET'S GO 🔥</button>
        <div style={{ textAlign:"center", fontSize:11, color:"#333", fontFamily:"'Barlow',sans-serif", marginTop:10 }}>By tapping agree you confirm you are 16 or older</div>
      </div>
    </div>
  );

  if (showOnboarding) return (
    <div style={{ background:"#0A0A0A", minHeight:"100vh", maxWidth:430, margin:"0 auto", fontFamily:"'Barlow Condensed',sans-serif", display:"flex", flexDirection:"column", color:"#F0F0F0" }}>
      <style>{"@import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;800;900&family=Barlow:wght@400;500&display=swap'); .ob-inp{background:#161616;border:1px solid #2A2A2A;border-radius:10px;padding:14px 16px;color:#F0F0F0;font-size:15px;font-family:'Barlow',sans-serif;outline:none;width:100%;transition:border-color 0.2s;box-sizing:border-box;}.ob-inp:focus{border-color:#FF4500;}.ob-inp::placeholder{color:#444;}"}</style>
      <div style={{ height:3, background:"#1E1E1E" }}>
        <div style={{ height:"100%", background:"#FF4500", width:onboardStep===1?"50%":"100%", transition:"width 0.4s ease" }}/>
      </div>
      {onboardStep === 1 && (
        <div style={{ flex:1, display:"flex", flexDirection:"column", padding:"48px 28px 40px" }}>
          <div style={{ fontSize:11, color:"#FF4500", letterSpacing:3, fontWeight:700, marginBottom:10 }}>STEP 1 OF 2</div>
          <div style={{ fontSize:34, fontWeight:900, lineHeight:1.1, marginBottom:8 }}>What should we<br/>call you?</div>
          <div style={{ fontSize:14, color:"#555", fontFamily:"'Barlow',sans-serif", marginBottom:32 }}>Pick a username for the community</div>
          <div style={{ position:"relative", marginBottom:12 }}>
            <span style={{ position:"absolute", left:16, top:"50%", transform:"translateY(-50%)", color:"#555", fontSize:15, fontWeight:700 }}>@</span>
            <input className="ob-inp" placeholder="your_username" value={onboardUsername} onChange={e => setOnboardUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g,""))} style={{ paddingLeft:32 }} autoFocus/>
          </div>
          {onboardUsername.length >= 3 && <div style={{ fontSize:12, color:"#10B981", fontFamily:"'Barlow',sans-serif", marginBottom:8 }}>✓ @{onboardUsername} looks good</div>}
          <div style={{ flex:1 }}/>
          <button onClick={() => { if (onboardUsername.length >= 3) setOnboardStep(2); }} disabled={onboardUsername.length < 3} style={{ width:"100%", padding:"16px 0", background:onboardUsername.length>=3?"#FF4500":"#1E1E1E", color:onboardUsername.length>=3?"#fff":"#444", border:"none", borderRadius:12, fontSize:16, fontWeight:900, letterSpacing:2, cursor:onboardUsername.length>=3?"pointer":"default", boxShadow:onboardUsername.length>=3?"0 4px 24px rgba(255,69,0,0.4)":"none", transition:"all 0.2s", fontFamily:"'Barlow Condensed',sans-serif" }}>CONTINUE →</button>
          <button onClick={() => setShowOnboarding(false)} style={{ background:"none", border:"none", color:"#333", fontSize:12, cursor:"pointer", marginTop:16, fontFamily:"'Barlow',sans-serif", letterSpacing:1 }}>SKIP FOR NOW</button>
        </div>
      )}
      {onboardStep === 2 && (
        <div style={{ flex:1, display:"flex", flexDirection:"column", padding:"48px 28px 40px" }}>
          <div style={{ fontSize:11, color:"#FF4500", letterSpacing:3, fontWeight:700, marginBottom:10 }}>STEP 2 OF 2</div>
          <div style={{ fontSize:34, fontWeight:900, lineHeight:1.1, marginBottom:8 }}>Where are<br/>you rolling?</div>
          <div style={{ fontSize:14, color:"#555", fontFamily:"'Barlow',sans-serif", marginBottom:32 }}>We'll show you meets near you</div>
          {!onboardLocation ? (
            <button onClick={() => setOnboardLocation("Atlanta, GA")} style={{ width:"100%", padding:"16px 0", background:"#161616", border:"1px solid #2A2A2A", borderRadius:12, color:"#888", fontSize:14, fontWeight:700, letterSpacing:1, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:10, marginBottom:16, fontFamily:"'Barlow Condensed',sans-serif" }}>
              <span style={{ fontSize:18 }}>📍</span> USE MY LOCATION
            </button>
          ) : (
            <div style={{ background:"rgba(16,185,129,0.1)", border:"1px solid #10B981", borderRadius:12, padding:"14px 16px", marginBottom:16, display:"flex", alignItems:"center", gap:10 }}>
              <span style={{ fontSize:18 }}>📍</span>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:14, fontWeight:800, color:"#10B981" }}>✓ Location set</div>
                <div style={{ fontSize:12, color:"#666", marginTop:2, fontFamily:"'Barlow',sans-serif" }}>{onboardLocation}</div>
              </div>
              <button onClick={() => setOnboardLocation("")} style={{ background:"none", border:"none", color:"#555", cursor:"pointer", fontSize:14 }}>✕</button>
            </div>
          )}
          <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:16 }}><div style={{ flex:1, height:1, background:"#1E1E1E" }}/><span style={{ fontSize:11, color:"#444", letterSpacing:2 }}>OR TYPE IT</span><div style={{ flex:1, height:1, background:"#1E1E1E" }}/></div>
          <input className="ob-inp" placeholder="City, State — e.g. Atlanta, GA" value={onboardLocation} onChange={e => setOnboardLocation(e.target.value)}/>
          <div style={{ background:"#111", border:"1px solid #1E1E1E", borderRadius:10, padding:"12px 16px", margin:"20px 0", display:"flex", gap:8, alignItems:"center" }}>
            <span style={{ fontSize:20 }}>🔥</span>
            <div style={{ fontSize:13, color:"#888", fontFamily:"'Barlow',sans-serif" }}><span style={{ color:"#F0F0F0", fontWeight:700 }}>23 meets</span> near Atlanta waiting for you</div>
          </div>
          <div style={{ flex:1 }}/>
          <div style={{ display:"flex", gap:10 }}>
            <button onClick={() => setOnboardStep(1)} style={{ flex:0.4, padding:"16px 0", background:"#161616", border:"1px solid #2A2A2A", color:"#888", borderRadius:12, fontSize:14, fontWeight:800, letterSpacing:1, cursor:"pointer", fontFamily:"'Barlow Condensed',sans-serif" }}>← BACK</button>
            <button onClick={() => setShowOnboarding(false)} style={{ flex:1, padding:"16px 0", background:onboardLocation?"#FF4500":"#1A1A1A", color:onboardLocation?"#fff":"#666", border:"none", borderRadius:12, fontSize:16, fontWeight:900, letterSpacing:2, cursor:"pointer", boxShadow:onboardLocation?"0 4px 24px rgba(255,69,0,0.4)":"none", transition:"all 0.2s", fontFamily:"'Barlow Condensed',sans-serif" }}>
              {onboardLocation ? "FIND MY MEETS 🔥" : "SKIP →"}
            </button>
          </div>
        </div>
      )}
    </div>
  );



  return (
    <div style={{
      fontFamily: "'Barlow Condensed', sans-serif",
      background: "#0A0A0A", color: "#F0F0F0",
      minHeight: "100vh", maxWidth: 430,
      margin: "0 auto", position: "relative",
      overflow: "hidden", paddingBottom: 80,
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:ital,wght@0,400;0,600;0,700;0,800;0,900;1,700&family=Barlow:wght@400;500;600&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 0; height: 0; }
        @keyframes fadeSlideUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        @keyframes slideUp { from{transform:translateY(100%);opacity:0} to{transform:translateY(0);opacity:1} }
        @keyframes storyPulse{0%,100%{box-shadow:0 0 0 0 rgba(255,69,0,0.7)}70%{box-shadow:0 0 0 8px rgba(255,69,0,0)}}
        @keyframes liveBlip{0%,100%{opacity:1}50%{opacity:0.3}}
        @keyframes carFloat{0%,100%{transform:translateY(0px)}50%{transform:translateY(-6px)}}
        @keyframes spotPulse{0%,100%{opacity:0.6}50%{opacity:1}}
        @keyframes popIn{from{opacity:0;transform:scale(0.88)}to{opacity:1;transform:scale(1)}}
        @keyframes toastIn{from{opacity:0;transform:translateX(-50%) translateY(20px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeIn { from{opacity:0} to{opacity:1} }
        .meet-card { transition: transform 0.18s ease, box-shadow 0.18s ease; cursor: pointer; }
        .meet-card:hover { transform: translateY(-3px); box-shadow: 0 12px 40px rgba(255,69,0,0.18); }
        .filter-pill { transition: all 0.2s ease; cursor: pointer; border: none; }
        .action-btn { transition: all 0.18s ease; cursor: pointer; border: none; }
        .action-btn:hover { opacity: 0.85; transform: scale(0.97); }
        .tab-item { transition: all 0.2s ease; cursor: pointer; background: transparent; border: none; }
        .ig-post { transition: transform 0.2s ease; cursor: pointer; overflow: hidden; border-radius: 4px; position: relative; }
        .ig-post:hover { transform: scale(1.04); }
        .close-btn { transition: opacity 0.2s; cursor: pointer; background: transparent; }
        .close-btn:hover { opacity: 0.7; }
      `}</style>

      {/* HEADER */}
      <div style={{
        padding: "16px 20px 0",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        position: "sticky", top: 0,
        background: "linear-gradient(180deg, #0A0A0A 85%, transparent)",
        zIndex: 50, paddingBottom: 12,
      }}>
        <div>
          <div style={{ fontSize: 38, fontWeight: 900, letterSpacing: -1, lineHeight: 1 }}>
            TUN<span style={{ color: "#FF4500" }}>R</span>
          </div>
          <div style={{ fontSize: 11, color: "#555", letterSpacing: 2, marginTop: 1 }}>ATLANTA, GA</div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button className="action-btn" onClick={() => setShowCreate(true)} style={{
            background: "#FF4500", color: "#fff", fontSize: 12, fontWeight: 700,
            letterSpacing: 1.5, padding: "8px 14px", borderRadius: 4,
            fontFamily: "'Barlow Condensed', sans-serif",
          }}>+ HOST MEET</button>
          <div style={{
            width: 36, height: 36, borderRadius: "50%",
            background: "linear-gradient(135deg, #FF4500, #FF7A00)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 16, fontWeight: 800, cursor: "pointer",
          }}>J</div>
        </div>
      </div>

      {/* DISCOVER TAB */}
      {activeTab === "discover" && (
        <div style={{ animation: "fadeIn 0.3s ease" }}>
          {/* List/Map Toggle */}
          <div style={{ padding: "0 20px 12px", display: "flex", gap: 8 }}>
            <button className="action-btn" onClick={() => setMapView(false)} style={{
              flex: 1, padding: "9px 0", borderRadius: 4,
              background: !mapView ? "#1E1E1E" : "transparent",
              color: !mapView ? "#FF4500" : "#555",
              fontSize: 13, fontWeight: 700, letterSpacing: 1,
              border: !mapView ? "1px solid #333" : "1px solid #222",
              fontFamily: "'Barlow Condensed', sans-serif",
            }}>≡ LIST</button>
            <button className="action-btn" onClick={() => setMapView(true)} style={{
              flex: 1, padding: "9px 0", borderRadius: 4,
              background: mapView ? "#1E1E1E" : "transparent",
              color: mapView ? "#FF4500" : "#555",
              fontSize: 13, fontWeight: 700, letterSpacing: 1,
              border: mapView ? "1px solid #333" : "1px solid #222",
              fontFamily: "'Barlow Condensed', sans-serif",
            }}>◎ MAP</button>
          </div>

          {/* STORIES ROW */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", gap: 12, padding: "4px 20px 8px", overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
              {meets.filter(m => m.happeningSoon || m.recurring).slice(0, 8).map((meet, i) => (
                <div key={meet.id} onClick={() => setSelectedMeet(meet)} style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 5, cursor: "pointer" }}>
                  <div style={{ position: "relative" }}>
                    <div style={{ width: 62, height: 62, borderRadius: "50%", padding: 2.5, background: meet.happeningSoon ? "conic-gradient(#FF4500 0%,#FF7A00 50%,#FF4500 100%)" : `conic-gradient(${vibeColors[meet.vibe]||"#FF4500"} 0%,${vibeColors[meet.vibe]||"#FF4500"}88 100%)` }}>
                      <div style={{ width: "100%", height: "100%", borderRadius: "50%", border: "2.5px solid #0A0A0A", overflow: "hidden" }}>
                        <img src={meet.img} style={{ width: "100%", height: "100%", objectFit: "cover" }} alt=""/>
                      </div>
                    </div>
                    {meet.happeningSoon && (
                      <div style={{ position: "absolute", bottom: 0, left: "50%", transform: "translateX(-50%)", background: "#FF4500", color: "#fff", fontSize: 7, fontWeight: 900, padding: "2px 5px", borderRadius: 3, letterSpacing: 1, whiteSpace: "nowrap", border: "1.5px solid #0A0A0A" }}>LIVE</div>
                    )}
                    {rsvpd[meet.id] && (
                      <div style={{ position: "absolute", top: -2, right: -2, width: 18, height: 18, borderRadius: "50%", background: "#FF4500", border: "2px solid #0A0A0A", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9 }}>✓</div>
                    )}
                  </div>
                  <div style={{ fontSize: 9, color: "#888", fontWeight: 700, maxWidth: 60, textAlign: "center", lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {meet.title.split(" ").slice(0, 2).join(" ")}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ height: 1, background: "#1A1A1A", margin: "0 0 14px" }}/>

          {/* Filters */}
          <div style={{ display: "flex", gap: 8, padding: "0 20px 16px", overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
            {filters.map(f => (
              <button key={f} className="filter-pill" onClick={() => setActiveFilter(f)} style={{
                padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 700,
                letterSpacing: 0.8, whiteSpace: "nowrap",
                background: activeFilter === f ? "#FF4500" : "#161616",
                color: activeFilter === f ? "#fff" : "#666",
                border: activeFilter === f ? "1px solid #FF4500" : "1px solid #222",
                fontFamily: "'Barlow Condensed', sans-serif",
              }}>{f.toUpperCase()}</button>
            ))}
          </div>

          {/* Happening Now banner */}
          <div style={{
            margin: "0 20px 16px",
            background: "linear-gradient(135deg, #1A0A00, #2A1000)",
            border: "1px solid #FF4500", borderRadius: 6,
            padding: "10px 14px", display: "flex", alignItems: "center", gap: 10,
          }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#FF4500", boxShadow: "0 0 8px #FF4500", flexShrink: 0 }}/>
            <div>
              <div style={{ fontSize: 11, color: "#FF4500", letterSpacing: 2, fontWeight: 700 }}>HAPPENING TONIGHT</div>
              <div style={{ fontSize: 13, color: "#CCC", marginTop: 1 }}>3 meets within 15 miles of you</div>
            </div>
          </div>

          {/* MAP VIEW */}
          {mapView ? (
            <div style={{ padding: "0 20px", animation: "fadeIn 0.3s ease" }}>
              <MapboxMap
                meets={filtered}
                onSelectMeet={setSelectedMeet}
                selectedMeet={selectedMeet}
              />
              {/* Meet cards below map */}
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 11, color: "#555", letterSpacing: 2, fontWeight: 700, marginBottom: 12 }}>TAP A PIN OR BROWSE BELOW</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {filtered.map(meet => (
                    <div key={meet.id} className="meet-card" onClick={() => setSelectedMeet(meet)} style={{
                      background: "#111", borderRadius: 8, overflow: "hidden",
                      border: `1px solid ${selectedMeet?.id === meet.id ? vibeColors[meet.vibe] : "#1E1E1E"}`,
                      display: "flex",
                      boxShadow: selectedMeet?.id === meet.id ? `0 0 20px ${vibeColors[meet.vibe]}33` : "none",
                      transition: "all 0.2s ease",
                    }}>
                      <img src={meet.img} style={{ width: 80, height: 80, objectFit: "cover", flexShrink: 0 }}/>
                      <div style={{ padding: "10px 12px", flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: vibeColors[meet.vibe] }}/>
                          <span style={{ fontSize: 10, color: vibeColors[meet.vibe], fontWeight: 800, letterSpacing: 1 }}>{meet.vibe}</span>
                        </div>
                        <div style={{ fontSize: 15, fontWeight: 800, marginTop: 2 }}>{meet.title}</div>
                        <div style={{ fontSize: 11, color: "#777", marginTop: 3 }}>{meet.date} · {meet.time} · {meet.distance}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            /* LIST VIEW */
            <div style={{ padding: "0 20px", display: "flex", flexDirection: "column", gap: 14 }}>
              {filtered.map((meet, i) => (
                <div key={meet.id} className="meet-card" onClick={() => setSelectedMeet(meet)} style={{
                  background: "#111", borderRadius: 10, overflow: "hidden",
                  border: "1px solid #1E1E1E",
                  animation: `fadeSlideUp 0.4s ease ${i * 0.06}s both`,
                }}>
                  <div style={{ position: "relative", height: 160 }}>
                    <img src={meet.img} style={{ width: "100%", height: "100%", objectFit: "cover" }}/>
                    <div style={{ position: "absolute", inset: 0, background: "linear-gradient(0deg, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.1) 60%)" }}/>
                    <div style={{
                      position: "absolute", top: 10, left: 10,
                      background: vibeColors[meet.vibe],
                      color: "#fff", fontSize: 10, fontWeight: 800,
                      padding: "3px 8px", borderRadius: 3, letterSpacing: 1.5,
                    }}>{meet.vibe}</div>
                    <div style={{ position: "absolute", top: 10, right: 10, display: "flex", gap: 6 }}>
                      {meet.recurring && (
                        <div style={{ background: "rgba(0,0,0,0.7)", border: "1px solid #444", color: "#aaa", fontSize: 9, fontWeight: 700, padding: "3px 7px", borderRadius: 3, letterSpacing: 1 }}>WEEKLY</div>
                      )}
                      {meet.verified && (
                        <div style={{ background: "rgba(255,69,0,0.2)", border: "1px solid #FF4500", color: "#FF4500", fontSize: 9, fontWeight: 700, padding: "3px 7px", borderRadius: 3, letterSpacing: 1 }}>✓ VERIFIED</div>
                      )}
                    </div>
                    <div style={{ position: "absolute", bottom: 10, right: 12, fontSize: 11, color: "#aaa", letterSpacing: 1 }}>📍 {meet.distance}</div>
                  </div>
                  <div style={{ padding: "12px 14px 10px" }}>
                    <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: 0.5, lineHeight: 1.1 }}>{meet.title}</div>
                    <div style={{ fontSize: 12, color: "#FF4500", marginTop: 3 }}>@{meet.host} {meet.verified && "✓"}</div>
                    <div style={{ fontSize: 13, color: "#888", marginTop: 8 }}>📅 {meet.date} · {meet.time}</div>
                    <div style={{ fontSize: 12, color: "#666", marginTop: 3 }}>📍 {meet.location}</div>
                    <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                      {meet.tags.map(tag => (
                        <span key={tag} style={{ background: "#1A1A1A", border: "1px solid #2A2A2A", color: "#777", fontSize: 10, padding: "3px 8px", borderRadius: 3, letterSpacing: 0.8, fontWeight: 600 }}>{tag}</span>
                      ))}
                    </div>
                    <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                      <button className="action-btn" onClick={(e) => handleRsvp(meet.id, "going", e)} style={{
                        flex: 1, padding: "9px 0",
                        background: rsvpd[meet.id] === "going" ? "#FF4500" : "#1A1A1A",
                        color: rsvpd[meet.id] === "going" ? "#fff" : "#888",
                        border: rsvpd[meet.id] === "going" ? "1px solid #FF4500" : "1px solid #2A2A2A",
                        borderRadius: 5, fontSize: 12, fontWeight: 700, letterSpacing: 1,
                        fontFamily: "'Barlow Condensed', sans-serif",
                      }}>{rsvpd[meet.id] === "going" ? "✓ GOING" : `GOING · ${meet.going}`}</button>
                      <button className="action-btn" onClick={(e) => handleRsvp(meet.id, "interested", e)} style={{
                        flex: 1, padding: "9px 0",
                        background: rsvpd[meet.id] === "interested" ? "#1A0800" : "#1A1A1A",
                        color: rsvpd[meet.id] === "interested" ? "#FF7A00" : "#666",
                        border: rsvpd[meet.id] === "interested" ? "1px solid #FF7A00" : "1px solid #2A2A2A",
                        borderRadius: 5, fontSize: 12, fontWeight: 700, letterSpacing: 1,
                        fontFamily: "'Barlow Condensed', sans-serif",
                      }}>{rsvpd[meet.id] === "interested" ? "★ SAVED" : `INTERESTED · ${meet.interested}`}</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* MAP TAB */}
      {activeTab === "map" && (
        <div style={{ animation: "fadeIn 0.3s ease" }}>
          <div style={{ display: "flex", gap: 8, padding: "0 20px 12px", overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
            {["All","JDM","Euro","Exotic","Domestic","Truck"].map(f => (
              <button key={f} className="filter-pill" onClick={() => setActiveFilter(f)} style={{ padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 700, letterSpacing: 0.8, whiteSpace: "nowrap", background: activeFilter === f ? "#FF4500" : "#161616", color: activeFilter === f ? "#fff" : "#666", border: activeFilter === f ? "1px solid #FF4500" : "1px solid #222", fontFamily: "'Barlow Condensed',sans-serif" }}>{f.toUpperCase()}</button>
            ))}
          </div>
          <div style={{ padding: "0 20px" }}>
            <MapboxMap meets={filtered} onSelectMeet={m => setSelectedMeet(m)} selectedMeet={selectedMeet} />
          </div>
          <div style={{ padding: "12px 20px 0", display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 11, color: "#555", letterSpacing: 2, fontWeight: 700 }}>TAP A PIN OR BROWSE</div>
            {filtered.map(meet => (
              <div key={meet.id} className="meet-card" onClick={() => setSelectedMeet(meet)} style={{ background: "#111", borderRadius: 8, overflow: "hidden", border: `1px solid ${selectedMeet?.id === meet.id ? vibeColors[meet.vibe] : "#1E1E1E"}`, display: "flex", transition: "all 0.2s ease" }}>
                <img src={meet.img} style={{ width: 80, height: 80, objectFit: "cover", flexShrink: 0 }}/>
                <div style={{ padding: "10px 12px", flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: vibeColors[meet.vibe] }}/>
                    <span style={{ fontSize: 10, color: vibeColors[meet.vibe], fontWeight: 800, letterSpacing: 1 }}>{meet.vibe}</span>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 800, marginTop: 2 }}>{meet.title}</div>
                  <div style={{ fontSize: 11, color: "#777", marginTop: 3 }}>{meet.date} · {meet.time} · {meet.distance}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SAVED TAB */}
      {activeTab === "saved" && (
        <div style={{ padding: "0 20px", animation: "fadeIn 0.3s ease" }}>
          <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: 1, marginBottom: 6, paddingTop: 4 }}>MY MEETS</div>
          <div style={{ fontSize: 13, color: "#555", marginBottom: 20 }}>Meets you're going to or interested in</div>
          {meets.filter(m => rsvpd[m.id]).length === 0 ? (
            <div style={{ background: "#111", border: "1px solid #1E1E1E", borderRadius: 10, padding: 40, textAlign: "center" }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🏁</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#555" }}>No meets saved yet</div>
              <div style={{ fontSize: 13, color: "#444", marginTop: 6 }}>RSVP to meets in the Discover tab</div>
            </div>
          ) : meets.filter(m => rsvpd[m.id]).map(meet => (
            <div key={meet.id} className="meet-card" onClick={() => setSelectedMeet(meet)} style={{
              background: "#111", borderRadius: 10, overflow: "hidden",
              border: "1px solid #1E1E1E", marginBottom: 14, display: "flex",
            }}>
              <img src={meet.img} style={{ width: 90, height: 90, objectFit: "cover" }}/>
              <div style={{ padding: "10px 12px", flex: 1 }}>
                <div style={{
                  display: "inline-block",
                  background: rsvpd[meet.id] === "going" ? "#FF4500" : "#1A0800",
                  color: rsvpd[meet.id] === "going" ? "#fff" : "#FF7A00",
                  fontSize: 9, fontWeight: 800, padding: "2px 7px",
                  borderRadius: 3, letterSpacing: 1.5, marginBottom: 5,
                }}>{rsvpd[meet.id] === "going" ? "✓ GOING" : "★ INTERESTED"}</div>
                <div style={{ fontSize: 16, fontWeight: 800 }}>{meet.title}</div>
                <div style={{ fontSize: 11, color: "#888", marginTop: 3 }}>{meet.date} · {meet.time}</div>
                <div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>{meet.distance} away</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* PROFILE TAB */}
      {activeTab === "profile" && (
        <div style={{ animation: "fadeIn 0.3s ease" }}>
          <div style={{ background: "linear-gradient(180deg, #1A0800 0%, #0A0A0A 100%)", padding: "20px 20px 24px", borderBottom: "1px solid #1E1E1E" }}>
            <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
              <div style={{
                width: 70, height: 70, borderRadius: "50%",
                background: "linear-gradient(135deg, #FF4500, #FF7A00)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 28, fontWeight: 900, border: "3px solid #FF4500",
                boxShadow: "0 0 20px rgba(255,69,0,0.4)",
              }}>J</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: 0.5 }}>JDM_JAKE</div>
                <div style={{ fontSize: 12, color: "#FF4500", marginTop: 2 }}>@jdm_jake_la</div>
                <div style={{ fontSize: 12, color: "#555", marginTop: 3 }}>📍 Los Angeles, CA · R34 GTR Owner</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 24, marginTop: 18 }}>
              {[["24", "MEETS\nATTENDED"], ["3", "HOSTED"], ["847", "FOLLOWERS"]].map(([n, l]) => (
                <div key={l} style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 24, fontWeight: 900, color: "#FF4500" }}>{n}</div>
                  <div style={{ fontSize: 9, color: "#555", letterSpacing: 1.5, whiteSpace: "pre-line", lineHeight: 1.3 }}>{l}</div>
                </div>
              ))}
            </div>
            <div style={{
              marginTop: 16, background: "rgba(0,0,0,0.4)", border: "1px solid #2A2A2A",
              borderRadius: 8, padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700 }}>📸 Instagram Connected</div>
                <div style={{ fontSize: 11, color: "#555", marginTop: 1 }}>@jdm_jake_la · 2.4K followers</div>
              </div>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#10B981", boxShadow: "0 0 6px #10B981" }}/>
            </div>
          </div>
          <div style={{ padding: "16px 20px" }}>
            <div style={{ fontSize: 13, color: "#555", letterSpacing: 2, fontWeight: 700, marginBottom: 12 }}>INSTAGRAM GARAGE</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 3 }}>
              {igPosts.map((post, i) => (
                <div key={post.id} className="ig-post" style={{ aspectRatio: "1", animation: `fadeSlideUp 0.3s ease ${i * 0.05}s both` }}>
                  <img src={post.img} style={{ width: "100%", height: "100%", objectFit: "cover" }}/>
                  <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.3)" }}>
                    <span style={{ color: "#fff", fontSize: 12, fontWeight: 700 }}>♥ {post.likes}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* BOTTOM NAV */}
      <div style={{
        position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)",
        width: "100%", maxWidth: 430,
        background: "rgba(10,10,10,0.96)", backdropFilter: "blur(20px)",
        borderTop: "1px solid #1A1A1A", display: "flex", zIndex: 100,
      }}>
        {[
          { id: "discover", icon: "≡", label: "DISCOVER" },
          { id: "map", icon: "◎", label: "MAP" },
          { id: "saved", icon: "★", label: "MY MEETS" },
          { id: "profile", icon: "◉", label: "PROFILE" },
        ].map(tab => (
          <button key={tab.id} className="tab-item" onClick={() => setActiveTab(tab.id)} style={{
            flex: 1, padding: "12px 0", display: "flex", flexDirection: "column",
            alignItems: "center", gap: 3,
          }}>
            <span style={{ fontSize: 20, color: activeTab === tab.id ? "#FF4500" : "#333" }}>{tab.icon}</span>
            <span style={{ fontSize: 9, letterSpacing: 1.5, fontWeight: 700, color: activeTab === tab.id ? "#FF4500" : "#333", fontFamily: "'Barlow Condensed', sans-serif" }}>{tab.label}</span>
            {activeTab === tab.id && <div style={{ width: 20, height: 2, background: "#FF4500", borderRadius: 2, marginTop: 1 }}/>}
          </button>
        ))}
      </div>

      {/* MEET DETAIL MODAL */}
      {selectedMeet && (
        <div onClick={() => setSelectedMeet(null)} style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)",
          zIndex: 200, display: "flex", alignItems: "flex-end",
          maxWidth: 430, left: "50%", transform: "translateX(-50%)",
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            width: "100%", background: "#0F0F0F",
            borderRadius: "16px 16px 0 0", border: "1px solid #1E1E1E",
            maxHeight: "88vh", overflowY: "auto",
            animation: "slideUp 0.3s ease",
          }}>
            <div style={{ position: "relative", height: 220 }}>
              <img src={selectedMeet.img} style={{ width: "100%", height: "100%", objectFit: "cover" }}/>
              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(0deg, #0F0F0F 0%, transparent 60%)" }}/>
              <button className="close-btn" onClick={() => setSelectedMeet(null)} style={{
                position: "absolute", top: 14, right: 14,
                background: "rgba(0,0,0,0.7)", border: "1px solid #333",
                color: "#fff", borderRadius: "50%", width: 32, height: 32,
                fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center",
              }}>✕</button>
              <div style={{ position: "absolute", top: 14, left: 14, background: vibeColors[selectedMeet.vibe], color: "#fff", fontSize: 10, fontWeight: 800, padding: "3px 10px", borderRadius: 3, letterSpacing: 2 }}>{selectedMeet.vibe}</div>
            </div>
            <div style={{ padding: "16px 20px 100px" }}>
              <div style={{ fontSize: 28, fontWeight: 900, lineHeight: 1.1 }}>{selectedMeet.title}</div>
              <div style={{ fontSize: 13, color: "#FF4500", marginTop: 4 }}>Hosted by @{selectedMeet.host} {selectedMeet.verified && "✓"}</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 16 }}>
                {[["📅 DATE", selectedMeet.date], ["🕐 TIME", selectedMeet.time], ["📍 DIST", selectedMeet.distance], ["👥 GOING", `${selectedMeet.going} confirmed`]].map(([label, val]) => (
                  <div key={label} style={{ background: "#161616", border: "1px solid #222", borderRadius: 8, padding: "10px 12px" }}>
                    <div style={{ fontSize: 9, color: "#555", letterSpacing: 1.5, marginBottom: 4 }}>{label}</div>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{val}</div>
                  </div>
                ))}
              </div>
              <div style={{ background: "#161616", border: "1px solid #222", borderRadius: 8, padding: "12px 14px", marginTop: 10 }}>
                <div style={{ fontSize: 9, color: "#555", letterSpacing: 1.5, marginBottom: 4 }}>📍 LOCATION</div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{selectedMeet.location}</div>
                <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>{selectedMeet.city}</div>
              </div>

              {/* Mini map in detail modal */}
              <div style={{ marginTop: 12, borderRadius: 8, overflow: "hidden", height: 160, border: "1px solid #222" }}>
                <iframe
                  title="meet-location"
                  width="100%" height="160"
                  style={{ border: "none", display: "block" }}
                  src={`https://api.mapbox.com/styles/v1/mapbox/dark-v11/static/pin-l+FF4500(${selectedMeet.lng},${selectedMeet.lat})/${selectedMeet.lng},${selectedMeet.lat},14,0/400x160@2x?access_token=${MAPBOX_TOKEN}`}
                />
              </div>

              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 11, color: "#555", letterSpacing: 2, marginBottom: 8 }}>ABOUT THIS MEET</div>
                <div style={{ fontSize: 14, color: "#AAA", lineHeight: 1.6, fontFamily: "'Barlow', sans-serif", fontWeight: 400 }}>{selectedMeet.description}</div>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
                {selectedMeet.tags.map(tag => (
                  <span key={tag} style={{ background: "#1A1A1A", border: "1px solid #2A2A2A", color: "#777", fontSize: 11, padding: "5px 12px", borderRadius: 4, letterSpacing: 0.8, fontWeight: 600 }}>{tag}</span>
                ))}
              </div>

              {/* Navigate + Calendar */}
              <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
                {selectedMeet.lat && selectedMeet.lng && (
                  <a href={`https://maps.apple.com/?daddr=${selectedMeet.lat},${selectedMeet.lng}&dirflg=d`}
                    onClick={e => { e.stopPropagation(); const isApple = /iPhone|iPad|Mac/.test(navigator.userAgent); if (!isApple) { e.preventDefault(); window.open(`https://www.google.com/maps/dir/?api=1&destination=${selectedMeet.lat},${selectedMeet.lng}&travelmode=driving`,"_blank"); } }}
                    style={{ flex:1, padding:"12px 0", background:"linear-gradient(135deg,#1A2A1A,#0F1F0F)", border:"1px solid #10B981", borderRadius:10, color:"#10B981", fontSize:13, fontWeight:800, letterSpacing:1.5, fontFamily:"'Barlow Condensed',sans-serif", textDecoration:"none", display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
                    <span style={{ fontSize:16 }}>🗺</span> NAVIGATE
                  </a>
                )}
                <button onClick={e => { e.stopPropagation(); const title=encodeURIComponent(selectedMeet.title); const loc=encodeURIComponent(selectedMeet.location+", "+selectedMeet.city); window.open(`https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&location=${loc}&details=${encodeURIComponent("Car meet via TUNR.")}`, "_blank"); }} style={{ flex:1, padding:"12px 0", background:"#111", border:"1px solid #2A2A2A", borderRadius:10, color:"#888", fontSize:13, fontWeight:800, letterSpacing:1.5, fontFamily:"'Barlow Condensed',sans-serif", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
                  <span style={{ fontSize:16 }}>📅</span> CALENDAR
                </button>
              </div>

              {/* Source attribution */}
              {selectedMeet.source && (
                <div style={{ marginTop:12, background:"#111", border:"1px solid #1E1E1E", borderRadius:10, padding:"10px 14px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                  <div style={{ fontSize:11, color:"#555" }}>via {selectedMeet.source}</div>
                  <a href={selectedMeet.sourceUrl} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()} style={{ padding:"5px 12px", background:"#1A1A1A", border:"1px solid #2A2A2A", borderRadius:8, color:"#888", fontSize:11, fontWeight:700, letterSpacing:1, fontFamily:"'Barlow Condensed',sans-serif", textDecoration:"none" }}>VIEW EVENT</a>
                </div>
              )}

              <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
                <button className="action-btn" onClick={(e) => handleRsvp(selectedMeet.id, "going", e)} style={{
                  flex: 1, padding: "14px 0",
                  background: rsvpd[selectedMeet.id] === "going" ? "#FF4500" : "#1A1A1A",
                  color: rsvpd[selectedMeet.id] === "going" ? "#fff" : "#888",
                  border: rsvpd[selectedMeet.id] === "going" ? "none" : "1px solid #2A2A2A",
                  borderRadius: 8, fontSize: 14, fontWeight: 800, letterSpacing: 2,
                  fontFamily: "'Barlow Condensed', sans-serif",
                  boxShadow: rsvpd[selectedMeet.id] === "going" ? "0 4px 20px rgba(255,69,0,0.4)" : "none",
                }}>{rsvpd[selectedMeet.id] === "going" ? "✓ YOU'RE GOING" : "I'M GOING"}</button>
                <button className="action-btn" onClick={(e) => { e.stopPropagation(); setShowRolloutSheet(selectedMeet); }} style={{ flex:1, padding:"12px 0", background:rollingOut&&rollingOut.id===selectedMeet.id?"rgba(59,130,246,0.15)":"#1A1A1A", color:rollingOut&&rollingOut.id===selectedMeet.id?"#3B82F6":"#888", border:`1px solid ${rollingOut&&rollingOut.id===selectedMeet.id?"#3B82F6":"#2A2A2A"}`, borderRadius:8, fontSize:11, fontWeight:800, letterSpacing:1, fontFamily:"'Barlow Condensed',sans-serif", cursor:"pointer" }}>{rollingOut&&rollingOut.id===selectedMeet.id?"ROLLING":"ROLL OUT"}</button>
                <button className="action-btn" onClick={(e) => handleRsvp(selectedMeet.id, "interested", e)} style={{
                  flex: 1, padding: "14px 0",
                  background: rsvpd[selectedMeet.id] === "interested" ? "#1A0800" : "#1A1A1A",
                  color: rsvpd[selectedMeet.id] === "interested" ? "#FF7A00" : "#666",
                  border: rsvpd[selectedMeet.id] === "interested" ? "1px solid #FF7A00" : "1px solid #2A2A2A",
                  borderRadius: 8, fontSize: 14, fontWeight: 800, letterSpacing: 2,
                  fontFamily: "'Barlow Condensed', sans-serif",
                }}>{rsvpd[selectedMeet.id] === "interested" ? "★ INTERESTED" : "INTERESTED"}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DEEP SEARCH SHEET */}
      {showDiscoverySheet && (
        <div onClick={() => setShowDiscoverySheet(false)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.87)", zIndex:250, display:"flex", alignItems:"flex-end", maxWidth:430, left:"50%", transform:"translateX(-50%)" }}>
          <div onClick={e=>e.stopPropagation()} style={{ width:"100%", background:"#0F0F0F", borderRadius:"16px 16px 0 0", border:"1px solid #1E1E1E", padding:"24px 20px 48px", maxHeight:"90vh", overflowY:"auto", animation:"slideUp 0.3s ease" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
              <div style={{ fontSize:22, fontWeight:900 }}>DEEP SEARCH</div>
              <button onClick={() => setShowDiscoverySheet(false)} style={{ background:"#1A1A1A", border:"1px solid #2A2A2A", color:"#fff", borderRadius:"50%", width:30, height:30, fontSize:14, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer" }}>X</button>
            </div>
            <div style={{ fontSize:11, color:"#FF4500", letterSpacing:2, fontWeight:700, marginBottom:10 }}>DATE RANGE</div>
            <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:20 }}>
              {[["any","Any time"],["today","Happening now"],["week","This week"],["weekend","This weekend"],["recurring","Recurring only"]].map(([val,label]) => (
                <button key={val} onClick={() => setDateFilter(val)} style={{ padding:"8px 14px", borderRadius:20, background:dateFilter===val?"#FF4500":"#161616", color:dateFilter===val?"#fff":"#666", border:dateFilter===val?"1px solid #FF4500":"1px solid #222", fontSize:11, fontWeight:700, cursor:"pointer", fontFamily:"'Barlow Condensed',sans-serif", whiteSpace:"nowrap" }}>{label.toUpperCase()}</button>
              ))}
            </div>
            <div style={{ fontSize:11, color:"#FF4500", letterSpacing:2, fontWeight:700, marginBottom:10 }}>DISTANCE</div>
            <div style={{ display:"flex", gap:8, marginBottom:20 }}>
              {[5,10,25,50,100].map(r => (
                <button key={r} onClick={() => setRadiusFilter(r)} style={{ flex:1, padding:"10px 0", background:radiusFilter===r?"rgba(255,69,0,0.15)":"#161616", border:`1px solid ${radiusFilter===r?"#FF4500":"#1E1E1E"}`, borderRadius:8, color:radiusFilter===r?"#FF4500":"#666", fontSize:11, fontWeight:800, fontFamily:"'Barlow Condensed',sans-serif", cursor:"pointer" }}>{r} mi</button>
              ))}
            </div>
            <div style={{ fontSize:11, color:"#FF4500", letterSpacing:2, fontWeight:700, marginBottom:10 }}>VIBE</div>
            <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:20 }}>
              {["All","JDM","Euro","Exotic","Domestic","Truck"].map(v => (
                <button key={v} onClick={() => setActiveFilter(v)} style={{ padding:"8px 14px", borderRadius:20, background:activeFilter===v?"rgba(255,69,0,0.15)":"#161616", color:activeFilter===v?"#FF4500":"#666", border:`1px solid ${activeFilter===v?"#FF4500":"#222"}`, fontSize:11, fontWeight:700, cursor:"pointer", fontFamily:"'Barlow Condensed',sans-serif" }}>{v.toUpperCase()}</button>
              ))}
            </div>
            <div style={{ fontSize:11, color:"#FF4500", letterSpacing:2, fontWeight:700, marginBottom:10 }}>SORT BY</div>
            <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:20 }}>
              {[["smart","Smart (followed + verified first)"],["distance","Nearest first"],["popular","Most going"],["newest","Newest posted"]].map(([val,label]) => (
                <button key={val} onClick={() => setSortBy(val)} style={{ padding:"12px 16px", background:sortBy===val?"rgba(255,69,0,0.12)":"#161616", border:`1px solid ${sortBy===val?"#FF4500":"#1E1E1E"}`, borderRadius:10, color:sortBy===val?"#FF4500":"#888", fontSize:13, fontWeight:700, fontFamily:"'Barlow Condensed',sans-serif", cursor:"pointer", textAlign:"left", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                  {label}{sortBy===val&&<span>V</span>}
                </button>
              ))}
            </div>
            <button onClick={() => { setDateFilter("any"); setRadiusFilter(25); setSortBy("smart"); setActiveFilter("All"); setSearchQuery(""); }} style={{ width:"100%", padding:"12px 0", background:"#161616", border:"1px solid #2A2A2A", borderRadius:10, color:"#666", fontSize:12, fontWeight:700, letterSpacing:1.5, cursor:"pointer", fontFamily:"'Barlow Condensed',sans-serif" }}>RESET ALL FILTERS</button>
          </div>
        </div>
      )}

      {/* HOST VERIFICATION */}
      {showVerifySheet && (
        <div onClick={() => setShowVerifySheet(false)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.92)", zIndex:300, display:"flex", alignItems:"flex-end", maxWidth:430, left:"50%", transform:"translateX(-50%)" }}>
          <div onClick={e=>e.stopPropagation()} style={{ width:"100%", background:"#0F0F0F", borderRadius:"16px 16px 0 0", border:"1px solid #1E1E1E", padding:"24px 20px 48px", maxHeight:"90vh", overflowY:"auto", animation:"slideUp 0.3s ease" }}>
            {verifySubmitted ? (
              <div style={{ textAlign:"center", padding:"32px 0" }}>
                <div style={{ fontSize:48, marginBottom:16 }}>VERIFIED</div>
                <div style={{ fontSize:24, fontWeight:900, color:"#F59E0B" }}>APPLICATION SUBMITTED</div>
                <div style={{ fontSize:14, color:"#666", fontFamily:"'Barlow',sans-serif", marginTop:8, lineHeight:1.6 }}>We review applications within 48 hours.</div>
                <button onClick={() => { setShowVerifySheet(false); setVerifySubmitted(false); }} style={{ marginTop:24, padding:"12px 32px", background:"#FF4500", border:"none", borderRadius:10, color:"#fff", fontSize:14, fontWeight:800, letterSpacing:1.5, cursor:"pointer", fontFamily:"'Barlow Condensed',sans-serif" }}>DONE</button>
              </div>
            ) : (
              <div>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
                  <div style={{ fontSize:22, fontWeight:900 }}>APPLY FOR VERIFIED</div>
                  <button onClick={() => setShowVerifySheet(false)} style={{ background:"#1A1A1A", border:"1px solid #2A2A2A", color:"#fff", borderRadius:"50%", width:30, height:30, fontSize:14, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer" }}>X</button>
                </div>
                <div style={{ background:"rgba(245,158,11,0.1)", border:"1px solid rgba(245,158,11,0.3)", borderRadius:10, padding:"12px 14px", marginBottom:20 }}>
                  <div style={{ fontSize:12, fontWeight:800, color:"#F59E0B", marginBottom:6 }}>REQUIREMENTS</div>
                  {["5+ meets hosted with 80%+ attendance","Active Instagram","No cancellations in last 60 days"].map(r => (
                    <div key={r} style={{ fontSize:12, color:"#888", fontFamily:"'Barlow',sans-serif", marginTop:4 }}>V {r}</div>
                  ))}
                </div>
                <div style={{ display:"flex", flexDirection:"column", gap:12, marginBottom:20 }}>
                  <div>
                    <div style={{ fontSize:10, color:"#555", letterSpacing:1.5, marginBottom:6, fontWeight:700 }}>INSTAGRAM HANDLE</div>
                    <div style={{ display:"flex", alignItems:"center", background:"#161616", border:"1px solid #2A2A2A", borderRadius:10, padding:"0 0 0 14px" }}>
                      <span style={{ color:"#555", fontSize:14 }}>@</span>
                      <input placeholder="your_handle" value={verifyForm.instagram} onChange={e=>setVerifyForm(p=>({...p,instagram:e.target.value}))} style={{ flex:1, background:"none", border:"none", padding:"14px 12px", color:"#F0F0F0", fontSize:14, fontFamily:"'Barlow',sans-serif", outline:"none" }}/>
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize:10, color:"#555", letterSpacing:1.5, marginBottom:6, fontWeight:700 }}>MEETS HOSTED</div>
                    <input placeholder="e.g. 12" value={verifyForm.meetCount} onChange={e=>setVerifyForm(p=>({...p,meetCount:e.target.value}))} style={{ width:"100%", background:"#161616", border:"1px solid #2A2A2A", borderRadius:10, padding:"14px 16px", color:"#F0F0F0", fontSize:14, fontFamily:"'Barlow',sans-serif", outline:"none", boxSizing:"border-box" }}/>
                  </div>
                  <div>
                    <div style={{ fontSize:10, color:"#555", letterSpacing:1.5, marginBottom:6, fontWeight:700 }}>WHY SHOULD YOU BE VERIFIED?</div>
                    <textarea placeholder="Tell us about your meet history..." value={verifyForm.bio} onChange={e=>setVerifyForm(p=>({...p,bio:e.target.value}))} rows={4} style={{ width:"100%", background:"#161616", border:"1px solid #2A2A2A", borderRadius:10, padding:"14px 16px", color:"#F0F0F0", fontSize:13, fontFamily:"'Barlow',sans-serif", outline:"none", resize:"none", boxSizing:"border-box" }}/>
                  </div>
                </div>
                <button onClick={() => { if(verifyForm.instagram&&verifyForm.meetCount&&verifyForm.bio.length>20) setVerifySubmitted(true); }} style={{ width:"100%", padding:"15px 0", background:verifyForm.instagram&&verifyForm.meetCount&&verifyForm.bio.length>=20?"#F59E0B":"#1A1A1A", color:verifyForm.instagram&&verifyForm.meetCount&&verifyForm.bio.length>=20?"#000":"#444", border:"none", borderRadius:12, fontSize:15, fontWeight:900, letterSpacing:2, cursor:"pointer", fontFamily:"'Barlow Condensed',sans-serif", transition:"all 0.2s" }}>
                  SUBMIT APPLICATION
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* CAR SPOTTING MODAL */}
      {spotTarget && (
        <div onClick={() => setSpotTarget(null)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.92)", zIndex:300, display:"flex", alignItems:"center", justifyContent:"center", padding:24, maxWidth:430, left:"50%", transform:"translateX(-50%)" }}>
          <div onClick={e=>e.stopPropagation()} style={{ width:"100%", background:"#111", borderRadius:20, border:"1px solid #2A2A2A", padding:"28px 24px", animation:"popIn 0.3s ease" }}>
            <div style={{ textAlign:"center", marginBottom:20 }}>
              <img src={spotTarget.src} style={{ width:"100%", height:140, objectFit:"cover", borderRadius:10, marginBottom:12 }} alt=""/>
              <div style={{ fontSize:20, fontWeight:900 }}>TAG THIS CAR</div>
              <div style={{ fontSize:12, color:"#555", fontFamily:"'Barlow',sans-serif", marginTop:4 }}>Help build TUNR's community car database</div>
            </div>
            {spottedCars[spotTarget.id] ? (
              <div style={{ background:"rgba(16,185,129,0.1)", border:"1px solid #10B981", borderRadius:10, padding:"14px 16px", textAlign:"center" }}>
                <div style={{ fontSize:16, fontWeight:800, color:"#10B981" }}>Tagged!</div>
                <div style={{ fontSize:14, color:"#AAA", marginTop:4 }}>{spottedCars[spotTarget.id].year} {spottedCars[spotTarget.id].make} {spottedCars[spotTarget.id].model}</div>
                <button onClick={() => setSpotTarget(null)} style={{ marginTop:12, padding:"8px 20px", background:"#10B981", border:"none", borderRadius:8, color:"#fff", fontSize:12, fontWeight:800, cursor:"pointer", fontFamily:"'Barlow Condensed',sans-serif" }}>DONE</button>
              </div>
            ) : (
              <div>
                <div style={{ display:"flex", flexDirection:"column", gap:10, marginBottom:16 }}>
                  {[["Year","year","e.g. 2002"],["Make","make","e.g. Nissan"],["Model","model","e.g. Silvia S15"]].map(([label,field,ph]) => (
                    <div key={field}>
                      <div style={{ fontSize:10, color:"#555", letterSpacing:1.5, marginBottom:5, fontWeight:700 }}>{label}</div>
                      <input placeholder={ph} value={spotForm[field]} onChange={e=>setSpotForm(p=>({...p,[field]:e.target.value}))} style={{ width:"100%", background:"#161616", border:"1px solid #2A2A2A", borderRadius:8, padding:"12px 14px", color:"#F0F0F0", fontSize:14, fontFamily:"'Barlow',sans-serif", outline:"none", boxSizing:"border-box" }}/>
                    </div>
                  ))}
                </div>
                <button onClick={() => { if(spotForm.year&&spotForm.make&&spotForm.model){setSpottedCars(prev=>({...prev,[spotTarget.id]:{...spotForm}}));setSpotForm({year:"",make:"",model:""});} }} style={{ width:"100%", padding:"14px 0", background:spotForm.year&&spotForm.make&&spotForm.model?"#FF4500":"#1A1A1A", color:spotForm.year&&spotForm.make&&spotForm.model?"#fff":"#444", border:"none", borderRadius:10, fontSize:14, fontWeight:800, letterSpacing:1.5, cursor:"pointer", fontFamily:"'Barlow Condensed',sans-serif", transition:"all 0.2s" }}>TAG THIS CAR</button>
                <button onClick={() => setSpotTarget(null)} style={{ width:"100%", marginTop:8, padding:"10px 0", background:"transparent", border:"none", color:"#444", fontSize:12, cursor:"pointer", fontFamily:"'Barlow',sans-serif" }}>Cancel</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* CONVOY CHAT */}
      {showConvoyChat && convoyChats[showConvoyChat] && (
        <div onClick={() => setShowConvoyChat(null)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.9)", zIndex:300, display:"flex", alignItems:"flex-end", maxWidth:430, left:"50%", transform:"translateX(-50%)" }}>
          <div onClick={e=>e.stopPropagation()} style={{ width:"100%", background:"#0F0F0F", borderRadius:"16px 16px 0 0", border:"1px solid #3B82F6", maxHeight:"80vh", display:"flex", flexDirection:"column", animation:"slideUp 0.3s ease" }}>
            <div style={{ padding:"16px 20px 12px", borderBottom:"1px solid #1A1A1A", flexShrink:0 }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                <div>
                  <div style={{ fontSize:16, fontWeight:900, color:"#3B82F6" }}>CONVOY CHAT</div>
                  <div style={{ fontSize:12, color:"#555", marginTop:2, fontFamily:"'Barlow',sans-serif" }}>{convoyChats[showConvoyChat].meet.title} - {convoyChats[showConvoyChat].members.length} drivers</div>
                </div>
                <button onClick={() => setShowConvoyChat(null)} style={{ background:"#1A1A1A", border:"1px solid #2A2A2A", color:"#fff", borderRadius:"50%", width:28, height:28, fontSize:13, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer" }}>X</button>
              </div>
              <div style={{ display:"flex", gap:6, marginTop:10, overflowX:"auto" }}>
                {convoyChats[showConvoyChat].members.map(m => (
                  <div key={m} style={{ flexShrink:0, display:"flex", flexDirection:"column", alignItems:"center", gap:3 }}>
                    <div style={{ width:32, height:32, borderRadius:"50%", background:m==="jdm_jake"?"linear-gradient(135deg,#3B82F6,#60A5FA)":"linear-gradient(135deg,#FF4500,#FF7A00)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:900, border:"2px solid #0A0A0A" }}>{m[0].toUpperCase()}</div>
                    <div style={{ fontSize:8, color:"#555" }}>{m==="jdm_jake"?"you":m.split("_")[0]}</div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ flex:1, overflowY:"auto", padding:"12px 20px", display:"flex", flexDirection:"column", gap:10 }}>
              {convoyChats[showConvoyChat].messages.map(msg => (
                <div key={msg.id}>
                  {msg.isSystem ? (
                    <div style={{ textAlign:"center", fontSize:11, color:"#3B82F6", fontFamily:"'Barlow',sans-serif", background:"rgba(59,130,246,0.08)", border:"1px solid rgba(59,130,246,0.25)", borderRadius:8, padding:"6px 12px" }}>{msg.text}</div>
                  ) : (
                    <div style={{ display:"flex", gap:8, alignItems:"flex-start", flexDirection:msg.user==="jdm_jake"?"row-reverse":"row" }}>
                      <div style={{ width:30, height:30, borderRadius:"50%", background:msg.user==="jdm_jake"?"linear-gradient(135deg,#3B82F6,#60A5FA)":"linear-gradient(135deg,#FF4500,#FF7A00)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:900, flexShrink:0 }}>{msg.avatar}</div>
                      <div style={{ maxWidth:"70%" }}>
                        {msg.user!=="jdm_jake"&&<div style={{ fontSize:10, color:"#555", marginBottom:3 }}>@{msg.user}</div>}
                        <div style={{ background:msg.user==="jdm_jake"?"#1A2A3A":"#161616", border:`1px solid ${msg.user==="jdm_jake"?"rgba(59,130,246,0.3)":"#2A2A2A"}`, borderRadius:10, padding:"8px 12px", fontSize:13, color:"#F0F0F0", fontFamily:"'Barlow',sans-serif", lineHeight:1.4 }}>{msg.text}</div>
                        <div style={{ fontSize:9, color:"#444", marginTop:3, textAlign:msg.user==="jdm_jake"?"right":"left" }}>{msg.time}</div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div style={{ padding:"12px 20px 24px", borderTop:"1px solid #1A1A1A", flexShrink:0, display:"flex", gap:8 }}>
              <input placeholder="Message the convoy..." value={convoyMsg} onChange={e=>setConvoyMsg(e.target.value)} onKeyDown={e=>{ if(e.key==="Enter"&&convoyMsg.trim()){const m={id:Date.now(),user:"jdm_jake",avatar:"J",text:convoyMsg.trim(),time:"just now"};setConvoyChats(prev=>({...prev,[showConvoyChat]:{...prev[showConvoyChat],messages:[...prev[showConvoyChat].messages,m]}}));setConvoyMsg("");} }} style={{ flex:1, background:"#161616", border:"1px solid #2A2A2A", borderRadius:20, padding:"10px 16px", color:"#F0F0F0", fontSize:13, fontFamily:"'Barlow',sans-serif", outline:"none" }}/>
              <button onClick={() => { if(!convoyMsg.trim())return; const m={id:Date.now(),user:"jdm_jake",avatar:"J",text:convoyMsg.trim(),time:"just now"}; setConvoyChats(prev=>({...prev,[showConvoyChat]:{...prev[showConvoyChat],messages:[...prev[showConvoyChat].messages,m]}})); setConvoyMsg(""); }} style={{ width:36, height:36, borderRadius:"50%", background:"#3B82F6", border:"none", color:"#fff", fontSize:16, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", flexShrink:0 }}>^</button>
            </div>
          </div>
        </div>
      )}

      {/* ROLL OUT SHEET */}
      {showRolloutSheet && (
        <div onClick={() => setShowRolloutSheet(false)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.92)", zIndex:300, display:"flex", alignItems:"flex-end", maxWidth:430, left:"50%", transform:"translateX(-50%)" }}>
          <div onClick={e=>e.stopPropagation()} style={{ width:"100%", background:"#0F0F0F", borderRadius:"16px 16px 0 0", border:"1px solid #1E1E1E", padding:"24px 20px 48px", animation:"slideUp 0.3s ease" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
              <div style={{ fontSize:24, fontWeight:900 }}>I'M ROLLING OUT</div>
              <button onClick={() => setShowRolloutSheet(false)} style={{ background:"#1A1A1A", border:"1px solid #2A2A2A", color:"#fff", borderRadius:"50%", width:30, height:30, fontSize:14, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer" }}>X</button>
            </div>
            {typeof showRolloutSheet === "object" && showRolloutSheet.title && (
              <div style={{ display:"flex", gap:12, alignItems:"center", background:"#111", border:"1px solid #2A2A2A", borderRadius:10, padding:"12px 14px", marginBottom:20 }}>
                <img src={showRolloutSheet.img} style={{ width:52, height:52, borderRadius:8, objectFit:"cover", flexShrink:0 }} alt=""/>
                <div>
                  <div style={{ fontSize:15, fontWeight:800 }}>{showRolloutSheet.title}</div>
                  <div style={{ fontSize:12, color:"#666", marginTop:2 }}>{showRolloutSheet.date} - {showRolloutSheet.time}</div>
                </div>
              </div>
            )}
            <div style={{ fontSize:11, color:"#555", letterSpacing:1.5, fontWeight:700, marginBottom:10 }}>WHO'S ROLLING</div>
            <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:20 }}>
              {[{id:"d1",user:"r34_kennesaw",car:"R34 GT-R",eta:"10 min"},{id:"d2",user:"silvia_atl",car:"S15 Silvia",eta:"22 min"},{id:"d3",user:"mk7_roswell",car:"MK7 GTI",eta:"35 min"}]
                .concat(rollingOut && typeof showRolloutSheet==="object" && rollingOut.id===showRolloutSheet.id ? [{id:"you",user:"jdm_jake",car:"Your ride",eta:"Now",isYou:true}] : [])
                .map(r => (
                <div key={r.id} style={{ display:"flex", alignItems:"center", gap:12, background:r.isYou?"rgba(59,130,246,0.1)":"#111", border:`1px solid ${r.isYou?"#3B82F6":"#1E1E1E"}`, borderRadius:10, padding:"10px 14px" }}>
                  <div style={{ width:36, height:36, borderRadius:"50%", background:r.isYou?"linear-gradient(135deg,#3B82F6,#60A5FA)":"linear-gradient(135deg,#FF4500,#FF7A00)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, fontWeight:900, flexShrink:0 }}>{r.user[0].toUpperCase()}</div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13, fontWeight:800, color:r.isYou?"#3B82F6":"#F0F0F0" }}>@{r.user}</div>
                    <div style={{ fontSize:11, color:"#555", marginTop:2 }}>{r.car}</div>
                  </div>
                  <div style={{ background:r.eta==="Now"?"rgba(59,130,246,0.2)":"#1A1A1A", border:`1px solid ${r.eta==="Now"?"#3B82F6":"#2A2A2A"}`, borderRadius:20, padding:"4px 10px" }}>
                    <div style={{ fontSize:11, fontWeight:800, color:r.eta==="Now"?"#3B82F6":"#888" }}>{r.eta==="Now"?"ROLLING":r.eta}</div>
                  </div>
                </div>
              ))}
            </div>
            {rollingOut && typeof showRolloutSheet==="object" && rollingOut.id===showRolloutSheet.id ? (
              <button onClick={() => { setRollingOut(null); setShowRolloutSheet(false); }} style={{ width:"100%", padding:"15px 0", background:"rgba(59,130,246,0.12)", color:"#3B82F6", border:"1px solid #3B82F6", borderRadius:12, fontSize:15, fontWeight:800, letterSpacing:2, fontFamily:"'Barlow Condensed',sans-serif", cursor:"pointer" }}>CANCEL ROLLOUT</button>
            ) : (
              <button onClick={() => {
                const meet = typeof showRolloutSheet==="object"&&showRolloutSheet.title ? showRolloutSheet : selectedMeet;
                if (!meet) return;
                setRollingOut(meet);
                setShowRolloutSheet(false);
                setConvoyChats(prev => ({ ...prev, [meet.id]: prev[meet.id] || { meet, members:["r34_kennesaw","silvia_atl","mk7_roswell","jdm_jake"], messages:[{id:1,user:"r34_kennesaw",avatar:"R",text:"Convoy forming, who's rolling?",time:"just now"},{id:2,user:"TUNR",avatar:"T",text:"Convoy created - 4 drivers heading to "+meet.title,time:"just now",isSystem:true}] }}));
                setTimeout(() => setShowConvoyChat(meet.id), 800);
              }} style={{ width:"100%", padding:"15px 0", background:"#3B82F6", color:"#fff", border:"none", borderRadius:12, fontSize:15, fontWeight:800, letterSpacing:2, fontFamily:"'Barlow Condensed',sans-serif", boxShadow:"0 4px 24px rgba(59,130,246,0.4)", cursor:"pointer" }}>I'M ROLLING OUT</button>
            )}
          </div>
        </div>
      )}

      {/* ROLLOUT STATUS BAR */}
      {rollingOut && (
        <div onClick={() => setShowRolloutSheet(rollingOut)} style={{ position:"fixed", bottom:65, left:"50%", transform:"translateX(-50%)", width:"calc(100% - 32px)", maxWidth:398, background:"#0F1829", border:"1px solid #3B82F6", borderRadius:12, padding:"10px 16px", display:"flex", alignItems:"center", gap:10, zIndex:90, cursor:"pointer", boxShadow:"0 4px 24px rgba(59,130,246,0.25)" }}>
          <div style={{ width:8, height:8, borderRadius:"50%", background:"#3B82F6", boxShadow:"0 0 8px #3B82F6", flexShrink:0 }}/>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:12, fontWeight:800, color:"#3B82F6", letterSpacing:1 }}>YOU'RE ROLLING OUT</div>
            <div style={{ fontSize:11, color:"#666", fontFamily:"'Barlow',sans-serif", marginTop:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{rollingOut.title}</div>
          </div>
          {convoyChats[rollingOut.id] && (
            <button onClick={e=>{e.stopPropagation();setShowConvoyChat(rollingOut.id);}} style={{ background:"rgba(59,130,246,0.2)", border:"1px solid #3B82F6", borderRadius:8, padding:"4px 10px", cursor:"pointer" }}>
              <div style={{ fontSize:10, fontWeight:800, color:"#3B82F6", letterSpacing:1 }}>CHAT</div>
            </button>
          )}
          <div style={{ background:"rgba(59,130,246,0.15)", border:"1px solid #3B82F6", borderRadius:8, padding:"4px 10px" }}>
            <div style={{ fontSize:10, fontWeight:800, color:"#3B82F6", letterSpacing:1 }}>MAP</div>
          </div>
        </div>
      )}

      {/* CREATE MEET MODAL */}
      {showCreate && (
        <div onClick={() => setShowCreate(false)} style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.9)",
          zIndex: 200, display: "flex", alignItems: "flex-end",
          maxWidth: 430, left: "50%", transform: "translateX(-50%)",
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            width: "100%", background: "#0F0F0F",
            borderRadius: "16px 16px 0 0", border: "1px solid #1E1E1E",
            padding: "24px 20px 60px", animation: "slideUp 0.3s ease",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
              <div>
                <div style={{ fontSize: 28, fontWeight: 900 }}>HOST A MEET</div>
                <div style={{ fontSize: 12, color: "#555", letterSpacing: 1 }}>STEP {createStep} OF 3</div>
              </div>
              <button className="close-btn" onClick={() => { setShowCreate(false); setCreateStep(1); }} style={{
                background: "#1A1A1A", border: "1px solid #2A2A2A",
                color: "#fff", borderRadius: "50%", width: 32, height: 32,
                fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center",
              }}>✕</button>
            </div>
            <div style={{ display: "flex", gap: 6, marginBottom: 24 }}>
              {[1, 2, 3].map(s => (
                <div key={s} style={{ flex: 1, height: 3, borderRadius: 2, background: s <= createStep ? "#FF4500" : "#1E1E1E", transition: "background 0.3s ease" }}/>
              ))}
            </div>
            {createStep === 1 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ fontSize: 14, color: "#888", letterSpacing: 1 }}>MEET DETAILS</div>
                {["Meet Title", "Location / Address"].map(ph => (
                  <input key={ph} placeholder={ph} style={{ background: "#161616", border: "1px solid #2A2A2A", borderRadius: 8, padding: "14px 16px", color: "#F0F0F0", fontSize: 14, fontFamily: "'Barlow', sans-serif", outline: "none", width: "100%" }}/>
                ))}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {["JDM", "Euro", "Exotic", "Domestic", "Truck"].map(v => (
                    <button key={v} className="filter-pill" style={{ flex: 1, padding: "8px 0", background: "#161616", border: `1px solid ${vibeColors[v]}44`, color: vibeColors[v], fontSize: 11, fontWeight: 700, borderRadius: 6, letterSpacing: 0.8, fontFamily: "'Barlow Condensed', sans-serif", minWidth: 60 }}>{v}</button>
                  ))}
                </div>
              </div>
            )}
            {createStep === 2 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ fontSize: 14, color: "#888", letterSpacing: 1 }}>DATE & TIME</div>
                {["Date (e.g. Sat Mar 15)", "Start Time", "Expected Attendees"].map(ph => (
                  <input key={ph} placeholder={ph} style={{ background: "#161616", border: "1px solid #2A2A2A", borderRadius: 8, padding: "14px 16px", color: "#F0F0F0", fontSize: 14, fontFamily: "'Barlow', sans-serif", outline: "none", width: "100%" }}/>
                ))}
              </div>
            )}
            {createStep === 3 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ fontSize: 14, color: "#888", letterSpacing: 1 }}>RULES & INFO</div>
                <textarea placeholder="Describe the vibe, rules, what's welcome..." rows={4} style={{ background: "#161616", border: "1px solid #2A2A2A", borderRadius: 8, padding: "14px 16px", color: "#F0F0F0", fontSize: 14, resize: "none", fontFamily: "'Barlow', sans-serif", outline: "none", width: "100%" }}/>
                {["No street racing", "No burnouts", "All builds welcome", "21+ only"].map(rule => (
                  <div key={rule} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", background: "#161616", border: "1px solid #222", borderRadius: 8, padding: "10px 14px" }}>
                    <div style={{ width: 16, height: 16, border: "1px solid #333", borderRadius: 3, background: "#222" }}/>
                    <span style={{ fontSize: 13, color: "#888" }}>{rule}</span>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
              {createStep > 1 && (
                <button className="action-btn" onClick={() => setCreateStep(s => s - 1)} style={{ flex: 0.4, padding: "14px 0", background: "#1A1A1A", border: "1px solid #2A2A2A", color: "#888", borderRadius: 8, fontSize: 14, fontWeight: 800, letterSpacing: 1, fontFamily: "'Barlow Condensed', sans-serif" }}>BACK</button>
              )}
              <button className="action-btn" onClick={() => { if (createStep < 3) setCreateStep(s => s + 1); else { setShowCreate(false); setCreateStep(1); } }} style={{ flex: 1, padding: "14px 0", background: "#FF4500", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 800, letterSpacing: 2, fontFamily: "'Barlow Condensed', sans-serif", boxShadow: "0 4px 20px rgba(255,69,0,0.35)" }}>{createStep === 3 ? "🏁 POST MEET" : "CONTINUE →"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
