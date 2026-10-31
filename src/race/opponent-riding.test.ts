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
