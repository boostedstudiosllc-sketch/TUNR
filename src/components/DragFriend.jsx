import FriendRoom from "./FriendRoom.jsx";
import { DragRun, ResultCard } from "./DragRace.jsx";
import { muted } from "./Sheet.jsx";

// Drag Race against a friend, live (see FriendRoom). Each phone runs its own
// tree and car and times its own run from its own green, so lag never
// decides it; the other car is drawn from that phone's reports.

export default function DragFriend({ user, look, audio, onExit, onNeedAccount }) {
  return (
    <FriendRoom
      game="drag"
      title="RACE A FRIEND"
      intro="Live, side by side, from your own phones. Same tree, same quarter mile; each phone times its own run, so lag never decides it."
      user={user}
      look={look}
      audio={audio}
      onExit={onExit}
      onNeedAccount={onNeedAccount}
      renderPlay={({ start, room, hooks, opponent, onDone, onQuit }) => (
        <DragRun
          key={start.round}
          look={look}
          audio={audio}
          remote={{ seed: start.seed, round: start.round, opponent, room, hooks }}
          onDone={(r) => {
            audio.current?.stopEngine();
            onDone(r);
          }}
          onQuit={() => {
            audio.current?.stopEngine();
            onQuit();
          }}
        />
      )}
      renderResult={(result, opponent) => (
        <>
          <ResultCard result={result} rival={{ name: `@${opponent?.name || "your friend"}` }} />
          {result.rivalOut && <div style={{ ...muted, marginTop: 4 }}>{result.rivalOut === "red" ? "They red-lit." : result.rivalOut === "asleep" ? "They never left the line." : "They left the race."}</div>}
        </>
      )}
    />
  );
}
