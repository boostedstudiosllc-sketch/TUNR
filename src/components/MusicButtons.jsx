import { useState } from "react";
import TrackButton from "./TrackButton.jsx";

// 🎵 on/off and ⏭ next song, for games without their own sound menu
// (Park Up, Guess the Car). audio: a ref to the game's RushAudio.
export default function MusicButtons({ audio, style, playing = true }) {
  const [on, setOn] = useState(() => audio.current?.prefs.music ?? true);
  return (
    <>
      <button
        onClick={() => {
          const a = audio.current;
          if (!a) return;
          const next = !on;
          a.setMusic(next);
          if (next && playing && a.unlock()) a.startMusic();
          setOn(next);
        }}
        aria-label={on ? "Turn music off" : "Turn music on"}
        style={{ ...style, opacity: on ? 1 : 0.4 }}
      >
        🎵
      </button>
      <TrackButton audio={audio} style={style} />
    </>
  );
}
