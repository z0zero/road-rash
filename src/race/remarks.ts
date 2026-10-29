import type { RiderId, RiderOrCop } from "./events";
import type { Temperament } from "./opponents";
import type { Random } from "./random";

/** A one-line remark on how the player's race went, from an opponent or a cop, for the results. */
export interface Remark {
  /** Who makes it. */
  readonly by: RiderOrCop;
  /** Their name. */
  readonly name: string;
  /** What they say. */
  readonly line: string;
}

/** An opponent as the race ends. */
export interface OpponentResult {
  readonly id: RiderId;
  readonly name: string;
  readonly temperament: Temperament;
  /** Their final position; null if they were wrecked or busted. */
  readonly position: number | null;
}

/** How the player's race ended, as far as a remark goes. */
export type Ending =
  | { readonly outcome: "finished"; readonly position: number; readonly qualified: boolean }
  | { readonly outcome: "wrecked" };

/** What an opponent might say: grudging respect when the player qualified, a taunt when they didn't, a dig at a wreck. */
type Situation = "qualified" | "finished" | "wrecked";

/**
 * Original lines in the spirit of Road Rash's rivals, who had a word with the
 * player after every race: by situation, then by the temperament of the
 * opponent who says them. Racers talk riding, brawlers fists, bullies threats.
 */
const OPPONENT_LINES: Readonly<Record<Situation, Readonly<Record<Temperament, readonly string[]>>>> = {
  qualified: {
    racer: [
      "Fine. You can ride. Don't let it go to your head.",
      "I'll find those two seconds by the next race. Count on it.",
      "Nice line through the hairpins. I'm stealing it.",
      "Enjoy the podium. I'll be the one filling your mirrors next time.",
    ],
    brawler: [
      "You took my best shots and kept going. Respect. Sort of.",
      "Next time I'm aiming for your front wheel.",
      "Good race. My knuckles still owe you one.",
      "Podium, huh? I'll save you a punch for the next one.",
    ],
    bully: [
      "Enjoy it while it lasts. My club remembers faces.",
      "You got lucky. I won't swing so slow next time.",
      "Qualified? Cute. Watch your back next race.",
      "Nobody passes me twice. Remember that.",
    ],
  },
  finished: {
    racer: [
      "Third place is the line. You weren't on it.",
      "I saw your headlight once. Then never again.",
      "Brake later, steer sooner. You're welcome.",
      "The view from the back is lovely at sunset, I hear.",
    ],
    brawler: [
      "All that riding and nothing to show for it.",
      "Less braking, more punching. Works for me.",
      "You finished. That's something. Not much, but something.",
      "Next time try keeping up. Then we can talk.",
    ],
    bully: [
      "Back of the pack. Right where you belong.",
      "Cute bike. Shame about the rider.",
      "Ride like that again and I won't even need my club.",
      "Stay out of my mirrors and we'll get along fine.",
    ],
  },
  wrecked: {
    racer: [
      "Bikes are for riding, not for scattering along the coast.",
      "You know the road bends, right?",
      "Maybe try a bicycle. Fewer parts to lose.",
      "Saw your front wheel go past me. Without you.",
    ],
    brawler: [
      "Ha! Your bike folded before you did.",
      "Pick a fight with the road and the road wins.",
      "Scrap metal suits you.",
      "That's one way to end a race. Not the good way.",
    ],
    bully: [
      "Told you to keep out of my way.",
      "Nice bike. Was.",
      "Pick up the pieces on your walk home.",
      "Bring a tougher bike next time. And a tougher face.",
    ],
  },
};

/**
 * The remark on how the player's race ended, chosen with `random`: who says
 * it, then what they say. When the player qualified, it comes from an
 * opponent they beat; when they finished without qualifying, from one who
 * beat them; when their bike was wrecked, from one still in the race.
 */
export function remarkOn(ending: Ending, opponents: readonly OpponentResult[], random: Random): Remark {
  const situation: Situation = ending.outcome === "wrecked" ? "wrecked" : ending.qualified ? "qualified" : "finished";
  const likely = opponents.filter(({ position }) => {
    if (position === null) return false;
    if (ending.outcome === "wrecked") return true;
    return ending.qualified ? position > ending.position : position < ending.position;
  });
  const speaker = pick(likely.length > 0 ? likely : opponents, random);
  return {
    by: { kind: "rider", id: speaker.id },
    name: speaker.name,
    line: pick(OPPONENT_LINES[situation][speaker.temperament], random),
  };
}

/** One of `choices` (never empty), chosen with `random`. */
function pick<T>(choices: readonly T[], random: Random): T {
  return choices[Math.floor(random.next() * choices.length)];
}
