import { describe, expect, it } from "vitest";
import { createRace } from ".";

describe("clubs", () => {
  it("are held at the start by the three bullies, and by nobody else", () => {
    const { riders } = createRace({ seed: 1 }).snapshot();

    const holders = riders.filter((rider) => rider.weapon === "club");
    expect(holders.map((rider) => rider.temperament)).toEqual(["bully", "bully", "bully"]);
    expect(riders.filter((rider) => rider.weapon !== "club").every((rider) => rider.weapon === null)).toBe(true);
  });
});
