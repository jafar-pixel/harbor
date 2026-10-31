import type { HubChip } from "../../sports/hub-chips.ts";
import type { TvLeague } from "./tv-leagues.ts";

const BY_TAG: Record<string, TvLeague> = {
  NFL: "NFL",
  NCAAF: "NCAAF",
  NBA: "NBA",
  WNBA: "WNBA",
  NCAA: "NCAAB",
  MLB: "MLB",
  NHL: "NHL",
};

const BY_GROUP: Record<string, TvLeague> = {
  soccer: "Soccer",
  combat: "Fights",
  boxing: "Fights",
  motorsport: "Racing",
  golf: "Golf & Tennis",
  tennis: "Golf & Tennis",
};

/** The sports-channel league a Hub chip shows channels for; null shows every sports channel. */
export function chipTvLeague(chip: HubChip | undefined): TvLeague | null {
  if (!chip?.league) return null;
  return BY_TAG[chip.league.tag] ?? BY_GROUP[chip.league.group] ?? null;
}
