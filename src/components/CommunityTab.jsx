import { useEffect, useState } from "react";
import LinkupTab from "./LinkupTab.jsx";
import ForumsTab from "./ForumsTab.jsx";
import ClubsTab from "./ClubsTab.jsx";
import MarketTab from "./MarketTab.jsx";
import { Segments } from "./CommunityBits.jsx";

const KEY = "tunr.community.section";

// Linkups · Forums · Clubs · Parts under one tab. `open` points at something
// to show ({ type: "linkup" | "forum" | "post" | "club" | "listing" |
// "listing-chat", id }), e.g. from an alert.
export default function CommunityTab({ open, onOpened, ...props }) {
  const [section, setSection] = useState(() => {
    try {
      return localStorage.getItem(KEY) || "linkups";
    } catch (e) {
      return "linkups";
    }
  });

  useEffect(() => {
    if (!open) return;
    setSection(open.type === "linkup" ? "linkups" : open.type === "club" ? "clubs" : open.type.startsWith("listing") ? "parts" : "forums");
  }, [open]);

  function pick(s) {
    setSection(s);
    try {
      localStorage.setItem(KEY, s);
    } catch (e) {
      // Private browsing: it just won't remember.
    }
  }

  return (
    <div style={{ animation: "fadeIn 0.3s ease" }}>
      <div style={{ padding: "4px 20px 12px" }}>
        <Segments options={[["linkups", "⚡ LINKUPS"], ["forums", "💬 FORUMS"], ["clubs", "🏁 CLUBS"], ["parts", "🛒 PARTS"]]} value={section} onChange={pick} />
      </div>
      {section === "linkups" && (
        <LinkupTab {...props} openId={open?.type === "linkup" ? open.id : null} onOpened={onOpened} />
      )}
      {section === "forums" && (
        <div style={{ padding: "0 20px" }}>
          <ForumsTab {...props} open={open?.type === "post" || open?.type === "forum" ? open : null} onOpened={onOpened} />
        </div>
      )}
      {section === "parts" && <MarketTab {...props} open={open?.type?.startsWith("listing") ? open : null} onOpened={onOpened} />}
      {section === "clubs" && (
        <div style={{ padding: "0 20px" }}>
          <ClubsTab {...props} open={open?.type === "club" ? open : null} onOpened={onOpened} />
        </div>
      )}
    </div>
  );
}
