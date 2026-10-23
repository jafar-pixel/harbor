import type { CSSProperties } from "react";

const schoolColors: Record<string, [string, string]> = {
  Wyoming: ["#FFC425", "#FFFFFF"], Oregon: ["#FEE123", "#FFFFFF"],
  "Ohio State": ["#BB0000", "#FFFFFF"], Alabama: ["#9E1B32", "#FFFFFF"],
  Miami: ["#F47321", "#FFFFFF"], "Penn State": ["#FFFFFF", "#90B4D0"],
  Gallaudet: ["#F1C40F", "#FFFFFF"], Washington: ["#B7A57A", "#FFFFFF"],
};
const nicknames = ["Cowboys", "Ducks", "Buckeyes", "Crimson Tide", "Hurricanes", "Nittany Lions", "Bison", "Huskies"];

export function splitSportsTeamName(fullName: string) {
  const clean = fullName.trim();
  const school = Object.keys(schoolColors).find(value => clean.toLowerCase().startsWith(value.toLowerCase() + " "));
  if (school) return { school, nickname: clean.slice(school.length).trim() };
  const nickname = nicknames.find(value => clean.toLowerCase().endsWith(" " + value.toLowerCase()));
  if (nickname) return { school: clean.slice(0, -(nickname.length + 1)), nickname };
  const pieces = clean.split(/\s+/);
  return { school: pieces.slice(0, -1).join(" ") || clean, nickname: pieces.length > 1 ? pieces.at(-1)! : "" };
}
/** Outline the school in its team color; nickname stays filled for contrast. */
export function SportsTeamTitle({ name, color }: { name: string; color?: string }) {
  const { school, nickname } = splitSportsTeamName(name);
  const palette = schoolColors[school] || ["#FFFFFF", "#FFC425"];
  return (
    <div className="jl-team-orbitron-title" style={{ "--team-outline": color || palette[0], "--team-fill": palette[1] } as CSSProperties} aria-label={name}>
      <span aria-hidden="true" className="jl-team-school">{school}</span>
      {nickname && <span aria-hidden="true" className="jl-team-nickname">{nickname}</span>}
    </div>
  );
}
