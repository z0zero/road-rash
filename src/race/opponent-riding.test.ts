import { describe, expect, it } from "vitest";
import type { Footprint } from "./footprint";
import { lineAround } from "./opponent-riding";
import type { Motion } from "./riding";

/** A bike at `distance` and `offset` going at `speed`, steering straight on. */
function bike(distance: number, offset: number, speed: number): Motion {
  return { distance, offset, speed, steering: 0, shove: 0, kickShove: 0 };
}

/** A saloon (4.6 m by 1.8 m) driving at `velocity` along the track, keeping to its lane at `offset`. */
function saloon(distance: number, offset: number, velocity: number): Footprint {
  return { distance, offset, movingTo: offset, velocity, halfLength: 2.3, halfWidth: 0.9 };
}

/** Opponents keep their racing line this far inside the road's edges, and squeeze past out onto the shoulder this far. */
const EDGE = 6 - 0.8;
const SHOULDER_EDGE = 6 + 3 - 0.4;

describe("getting round a rider", () => {
  it("keeps a crawling bike to its own side of a rider stopped just in front of it, with room there, rather than cut across behind them", () => {
    // Crawling at walking pace, with a rider stopped 2.5 m ahead and half a metre to its right, its racing line beyond them.
    const me = bike(1000, 1, 2);

    const { line } = lineAround(me, 3.5, [me, bike(1002.5, 1.5, 0)], [], EDGE, SHOULDER_EDGE);

    // It would run into their back before it got clear of them on the right: it goes by on the left, clear of their bike.
    expect(line).toBeLessThanOrEqual(1.5 - 0.8);
  });

  it("takes a bike stopped at the shoulder's edge round a rider stopped just in front of it on the road's side, rather than wait behind them", () => {
    // Stopped 0.1 m inside the furthest out an opponent squeezes, with a rider stopped 2.9 m ahead and 0.2 m inside it:
    // no bike fits between them and the shoulder's edge.
    const me = bike(1000, 8.5, 0);

    const { line, holdBehind } = lineAround(me, 1.5, [me, bike(1002.9, 8.3, 0)], [], EDGE, SHOULDER_EDGE);

    // It goes by on their left, clear of their bike, and rolls on, since a bike can't move sideways while it stands still.
    expect(line).toBeLessThanOrEqual(8.3 - 0.8);
    expect(holdBehind).toBeGreaterThan(0);
  });

  it("holds a bike stopped at the shoulder's edge back behind a rider stopped too close in front of it to get round them", () => {
    // As above, but the rider stands 2.5 m ahead: their bikes, 2 m long, are half a metre apart, end to end.
    const me = bike(1000, 8.5, 0);

    const { line, holdBehind } = lineAround(me, 1.5, [me, bike(1002.5, 8.3, 0)], [], EDGE, SHOULDER_EDGE);

    // To go by on their left it must get a metre across, to 0.8 m left of their middle, before it reaches their back.
    // Steering takes a bike at most 1.6 m across for every metre it rolls on, and less while it builds up: it would run
    // into them. It waits behind them, on its side of them.
    expect(holdBehind).toBeLessThanOrEqual(0);
    expect(line).toBeGreaterThan(8.3);
  });

  it("takes a cop on patrol crawling at the road's edge round a player stopped just in front of it, rather than wait behind them", () => {
    // A cop on patrol squeezes past only on the road. The player stands 2.9 m ahead of it and 0.2 m inside it.
    const me = bike(1000, 5.2, 1);

    const { line, holdBehind } = lineAround(me, 1.5, [me, bike(1002.9, 5, 0)], [], EDGE, EDGE);

    expect(line).toBeLessThanOrEqual(5 - 0.8);
    expect(holdBehind).toBeGreaterThan(0);
  });

  it("holds a cop on patrol crawling at the road's edge back behind a player stopped too close in front of it to get round them", () => {
    // As above, but the player stands 2.5 m ahead of it.
    const me = bike(1000, 5.2, 1);

    const { line, holdBehind } = lineAround(me, 1.5, [me, bike(1002.5, 5, 0)], [], EDGE, EDGE);

    expect(holdBehind).toBeLessThanOrEqual(0);
    expect(line).toBeGreaterThan(5);
  });

  it("takes a bike stopped against the left edge round a rider stopped just in front of it against the same edge", () => {
    // A bike that slides, or is kicked, off the road stops against the shoulder's outer edge, 9 m left of the centreline.
    const me = bike(1000, -9, 0);

    const { line, holdBehind } = lineAround(me, 1.5, [me, bike(1002.9, -9, 0)], [], EDGE, SHOULDER_EDGE);

    // It goes by on their right, the only side with room for its bike.
    expect(line).toBeGreaterThanOrEqual(-9 + 0.8);
    expect(holdBehind).toBeGreaterThan(0);
  });

  it("holds a bike stopped against the left edge back behind a rider stopped too close in front of it against the same edge", () => {
    // As above, but the rider stands 2.5 m ahead: in the half metre to their back, no bike gets 0.8 m across.
    const me = bike(1000, -9, 0);

    const { line, holdBehind } = lineAround(me, 1.5, [me, bike(1002.5, -9, 0)], [], EDGE, SHOULDER_EDGE);

    expect(holdBehind).toBeLessThanOrEqual(0);
    expect(line).toBeLessThan(-9 + 0.8);
  });

  it("holds a bike crawling up fast behind a rider stopped just in front of it back, rather than cut across behind them", () => {
    // Crawling at 4 m/s at the shoulder's edge, with a rider stopped 2.9 m ahead and 0.2 m inside it: room enough for a
    // bike rolling round them at walking pace, but at 4 m/s it reaches their back in under a quarter of a second, and
    // opponents steer across no faster than 4 m/s.
    const me = bike(1000, 8.5, 4);

    const { line, holdBehind } = lineAround(me, 1.5, [me, bike(1002.9, 8.3, 0)], [], EDGE, SHOULDER_EDGE);

    expect(holdBehind).toBeLessThanOrEqual(0);
    expect(line).toBeGreaterThan(8.3);
  });

  it("holds a bike stopped at the shoulder's edge back behind a rider stopped just in front of it, rather than make for a narrow gap beside them", () => {
    // Stopped 8.5 m out, 2.95 m behind a rider stopped 8.3 m out, with another stopped level with them 6.4 m out: their
    // bikes leave a gap 0.3 m wider than a bike between them, whose middle is only 0.15 m past clear of the first rider.
    // Steering more and more gently as it nears its line there, it would run into the first rider's back before it got
    // clear of them.
    const me = bike(1000, 8.5, 0);

    const { line, holdBehind } = lineAround(me, 4.5, [me, bike(1002.95, 8.3, 0), bike(1002.95, 6.4, 0)], [], EDGE, SHOULDER_EDGE);

    // It waits behind them, on its side of them.
    expect(holdBehind).toBeLessThanOrEqual(0);
    expect(line).toBeGreaterThan(8.3 - 0.8);
  });

  it("holds a bike crawling up behind a rider stopped just in front of it back, though it is a hair's breadth on their side nearer the road", () => {
    // Slowing through 2.5 m/s, 2.62 m behind a rider stopped 7.9 m out, and 2 mm nearer the road than them, as a bike
    // held back on their other side drifts: their side nearer the road is its own, with room for its bike, but it would
    // run into their back before it got a bike's width across.
    const me = bike(1000, 7.898, 2.5);

    const { holdBehind } = lineAround(me, 4.5, [me, bike(1002.62, 7.9, 0)], [], EDGE, SHOULDER_EDGE);

    expect(holdBehind).toBeLessThanOrEqual(0);
  });

  it("keeps a bike already steering round a rider stopped just in front of it going round them, rather than give up partway", () => {
    // Rolling at walking pace at the shoulder's edge, already moving across to its left as fast as steering takes a bike
    // at that speed (1.6 m/s for every m/s), with a rider stopped 2.75 m ahead and 0.2 m inside it. Not yet steering, it
    // would run into them while its steering built up; moving across already, it gets clear of them.
    const me: Motion = { ...bike(1000, 8.5, 2), steering: -3.2 };

    const { line, holdBehind } = lineAround(me, 1.5, [me, bike(1002.75, 8.3, 0)], [], EDGE, SHOULDER_EDGE);

    expect(line).toBeLessThanOrEqual(8.3 - 0.8);
    expect(holdBehind).toBeGreaterThan(0);
  });
});

describe("an obstacle close ahead", () => {
  /** A rock on the shoulder, 0.8 m across its base each way from its middle, at `distance` and `offset`. */
  const rock = (distance: number, offset: number): Footprint => ({ distance, offset, movingTo: offset, velocity: 0, halfLength: 0.8, halfWidth: 0.8 });

  it("never takes a bike across its path to get nearer the bike's racing line", () => {
    // Stopped on the shoulder 8.5 m out, on the right of a rock 3 m ahead at 7 m, with its racing line beyond the rock.
    const me = bike(1000, 8.5, 0);

    const { line } = lineAround(me, 4.5, [me], [rock(1003, 7)], EDGE, SHOULDER_EDGE);

    // It would get to the rock before it got across its path, as wide as the rock and a bike: it stays on its right.
    expect(line).toBeGreaterThanOrEqual(7 + 0.8 + 0.4);
  });

  it("never takes a bike across its path to go round a rider stopped just in front of it", () => {
    // As above, with a rider stopped 2.9 m ahead of the bike and 0.2 m inside it, beside the rock, between it and the
    // shoulder's outer edge: no bike fits between them and that edge, and their other side is the rock's path.
    const me = bike(1000, 8.5, 0);

    const { line } = lineAround(me, 4.5, [me, bike(1002.9, 8.3, 0)], [rock(1003, 7)], EDGE, SHOULDER_EDGE);

    expect(line).toBeGreaterThanOrEqual(7 + 0.8 + 0.4);
  });

  it("gives a crawling bike behind a rider stopped on the shoulder the same line whether it rolls on at walking pace or has all but stopped, with a cop's bike standing just beyond them", () => {
    // Crawling on the shoulder 7.9 m out, 2.9 m behind a rider stopped there, with a cop's bike standing 2 m beyond them
    // and 1.1 m nearer the road (a bike's length and width).
    const copsBike: Footprint = { distance: 1004.9, offset: 6.8, movingTo: 6.8, velocity: 0, halfLength: 1, halfWidth: 0.4 };
    const rolling = bike(1000, 7.9, 2);
    const stopping = bike(1000, 7.9, 0.3);

    const atWalkingPace = lineAround(rolling, 4.5, [rolling, bike(1002.9, 7.9, 0)], [copsBike], EDGE, SHOULDER_EDGE);
    const allButStopped = lineAround(stopping, 4.5, [stopping, bike(1002.9, 7.9, 0)], [copsBike], EDGE, SHOULDER_EDGE);

    // Slowing down never changes its mind, so it never stops and starts behind them: it either rolls on round them or
    // waits behind them.
    expect(allButStopped.line).toBeCloseTo(atWalkingPace.line, 6);
    expect(allButStopped.holdBehind > 0).toBe(atWalkingPace.holdBehind > 0);
  });

  it("takes a crawling bike round a rider stopped on the shoulder and across the path of a rock just beyond them, when it gets across in time", () => {
    // Rolling at walking pace 8.3 m out, 3 m behind a rider stopped there, with a rock (0.5 m across its base each way)
    // 2 m beyond them, 6.9 m out: 3.5 m to go before it gets to the rock, and 2.3 m to get across its path.
    const me = bike(1000, 8.3, 2);
    const smallRock: Footprint = { distance: 1005, offset: 6.9, movingTo: 6.9, velocity: 0, halfLength: 0.5, halfWidth: 0.5 };

    const { line, holdBehind } = lineAround(me, 4.5, [me, bike(1003, 8.3, 0)], [smallRock], EDGE, SHOULDER_EDGE);

    // Out of the rock's path, which reaches 6.9 - 0.5 - 0.4 m, and rolling on, rather than wait behind them.
    expect(line).toBeLessThanOrEqual(6);
    expect(holdBehind).toBeGreaterThan(0);
  });

  it("keeps a crawling bike already moving across the path of a rock close ahead going across, once it is too close to stop short of it", () => {
    // Rolling at walking pace 7.05 m out, moving across to its left at 3.1 m/s, beside a rider stopped 8.3 m out and level
    // with a rock (0.5 m across its base each way) 6 m out, whose back is 1.2 m ahead of its front: steering, which
    // takes a tenth of a second to die away, carries it the 0.15 m into the rock's path whatever it does now.
    const me: Motion = { ...bike(1000, 7.05, 1.94), steering: -3.09 };
    const smallRock: Footprint = { distance: 1002.7, offset: 6, movingTo: 6, velocity: 0, halfLength: 0.5, halfWidth: 0.5 };

    const { line } = lineAround(me, 4.5, [me, bike(1002.7, 8.3, 0)], [smallRock], EDGE, SHOULDER_EDGE);

    // It carries on across, to beyond the rock's path, which reaches 6 - 0.5 - 0.4 m, rather than stop in it.
    expect(line).toBeLessThanOrEqual(5.1);
  });
});

describe("keeping to a line", () => {
  it("holds a bike back as for the line it keeps to, rather than roll on as for the line it would take", () => {
    // A cop on patrol stopped where it waited on the shoulder, 7.5 m out, with the player stopped 2.95 m ahead and
    // 0.15 m inside it: room to get round them on their left, nearer the road. But it keeps to the line it is on, as a
    // cop does while someone comes up behind it in the offsets it would cross.
    const me = bike(1000, 7.5, 0);

    const { line, holdBehind } = lineAround(me, 1.5, [me, bike(1002.95, 7.35, 0)], [], EDGE, EDGE, () => me.offset);

    // On that line it would run into their back: it waits behind them.
    expect(line).toBe(7.5);
    expect(holdBehind).toBeLessThanOrEqual(0);
  });
});

describe("squeezing past", () => {
  it("never takes a crawling bike across the path of a car close ahead coming towards it", () => {
    // Crawling in the inner race lane, with a rider stopped just in front of it and another beside it on its right,
    // and a car coming towards it in the inner oncoming lane, 30 m off at 20 m/s.
    const me = bike(1000, 0.5, 2);
    const field = [me, bike(1002, 0.6, 0), bike(1000.5, 1.9, 0)];

    const { line } = lineAround(me, 1.5, field, [saloon(1030, -1.5, -20)], EDGE, SHOULDER_EDGE);

    // The car's path, as wide as the car and a bike, reaches -1.5 + 0.9 + 0.4 m.
    expect(line).toBeGreaterThanOrEqual(-0.2);
  });

  it("takes a crawling bike boxed in in the path of a car coming towards it out of its path, rather than stopping there", () => {
    // Crawling in the outer oncoming lane, with a rider beside it on its right, and a car coming at it in that lane,
    // 20 m off at 25 m/s.
    const me = bike(1000, -4.4, 2.5);
    const field = [me, bike(1000.6, -2.9, 3)];

    const { line, holdBehind } = lineAround(me, 1.5, field, [saloon(1020, -4.5, -25)], EDGE, SHOULDER_EDGE);

    // Out of its path, which reaches from -4.5 - 0.9 - 0.4 m to -4.5 + 0.9 + 0.4 m, and still rolling, so as to steer.
    expect(line < -5.8 || line > -3.2).toBe(true);
    expect(holdBehind).toBeGreaterThan(0);
  });
});
