import { useCallback } from "react";
import type { SportsGame } from "@/lib/sports/espn";
import { useView } from "@/lib/view";
import { useTogether } from "./provider";
import { buildWatchPartyInvite } from "./watch-party";

/**
 * Start (or reuse) a Watch Together room for a game: send the room the game, open the Watch
 * Together panel with its invite link, and open the game here to pick a channel.
 */
export function useStartWatchParty(): (game: SportsGame, eventGames?: SportsGame[]) => void {
  const { snapshot, startSession, sendInvite, openModal } = useTogether();
  const { openMatchDetail } = useView();
  const inRoom = snapshot.state === "joined" || snapshot.state === "connecting";
  return useCallback(
    (game, eventGames) => {
      if (!inRoom) startSession();
      // The client queues the invite and resends it once the room connects.
      sendInvite(buildWatchPartyInvite(game));
      openModal("auto");
      openMatchDetail(game, eventGames);
    },
    [inRoom, startSession, sendInvite, openModal, openMatchDetail],
  );
}
