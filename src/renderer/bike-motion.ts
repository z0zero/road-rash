import type { RaceView } from "@/game/session";
import type { AttackSnapshot, CopId, CopSnapshot, CrashPhase, RaceSnapshot, RiderId, RiderSnapshot, Side, Weapon } from "@/race";
import { Vector3 } from "three";
import { bikePoseOf, createTrackPose, poseOf, type TrackPose } from "./track-pose";

const GRAVITY = 9.81;
/** Radians. */
const MAX_LEAN = 0.75;
/** How quickly the drawn lean follows the wanted lean (1/s), whatever the frame rate. */
const LEAN_RESPONSE = 9;
/** A crashed bike falls onto its side over about this many seconds... */
const FALL_SECONDS = 0.35;
/** ...and slews round this far (radians) as it slides. */
const SLEW = 0.55;
/** A tumbling rider turns over once for every this many metres they travel. */
const TUMBLE_METRES = 2.6;
/** A running rider takes a full stride (two steps) every this many metres. */
const STRIDE_METRES = 2.4;
/** Moves between frames longer than this (metres), such as a new race starting, are jumps, not travel. */
const JUMP = 10;
/** A bike going back down the road faster than this (m/s) is turned round to face back along it... */
const BACKING_SPEED = 0.5;
/** ...turning round at this many radians a second. */
const TURN_ROUND_RATE = 4;
/**
 * A club swing's strike is drawn on for this long after it lands (seconds of
 * race time), held and then easing back, however soon the swinger is ready to
 * swing again: the race lets a club swing go again 0.05 s after its strike,
 * too soon to see it struck.
 */
const FOLLOW_THROUGH_SECONDS = 0.35;

/**
 * How someone on a bike, a rider or a cop, is drawn this frame: where their
 * bike is, which way it faces, how far it leans into the corner (or lies on
 * its side after a crash) and how far its wheels have turned; and, after a
 * crash, where they are on their own, tumbling or on foot. The renderer keeps
 * one for everyone on a bike and updates it once a frame, before anything
 * that draws or follows them reads it.
 */
export abstract class BikeMotion {
  /** Where they are: on their bike, or wherever they are after a crash. The camera follows the player's. */
  readonly pose: TrackPose = createTrackPose();
  /** Where their bike is. */
  readonly bikePose: TrackPose = createTrackPose();
  /** Where the bike is, on the road's surface: world coordinates, metres. */
  readonly bikeAt = new Vector3();
  /** Radians about the vertical, as three.js turns an object: facing along the road, turned towards its sideways motion. */
  yaw = 0;
  /** Radians the road climbs ahead of the bike. */
  pitch = 0;
  /** Radians the road is banked under the bike; positive tilts it down to the bike's right. */
  bank = 0;
  /** Radians the bike leans into the corner, positive to its right, smoothed. */
  lean = 0;
  /** Radians the bike has turned round from facing along the road: 0, or π while it rides back down it. */
  facing = 0;
  /** Radians the wheels have turned. */
  wheelTurn = 0;
  /** Null while they are on their bike; otherwise how far they are in getting back on it. */
  crash: CrashPhase | null = null;
  /** The attack they are making, or null; after a club swing's strike, its follow-through (see `FOLLOW_THROUGH_SECONDS`). */
  attack: AttackSnapshot | null = null;
  /** When the last club swing struck (race time) and which way, while it follows through. */
  private readonly strike = { at: -Infinity, side: 1 as Side, seen: false };
  /** The follow-through drawn as `attack` once the race has done with the swing. */
  private readonly followThrough = { kind: "club-swing" as const, side: 1 as Side, stage: "recovery" as const, progress: 0 };
  /** The weapon they hold, or null. */
  weapon: Weapon | null = null;
  /** The hand a held club is in: 1 the right, -1 the left. It moves to the side of each swing and stays there. */
  clubHand: Side = 1;
  /** After a crash: 0 while the bike is upright, 1 once it lies on its side. */
  fallen = 0;
  /** The side the crashed bike lies on: 1 its right, -1 its left. */
  fallSide: Side = 1;
  /** Where they are off their bike, on the road's surface: world coordinates, metres. */
  readonly bodyAt = new Vector3();
  /** Radians about the vertical: the way they face off their bike. */
  bodyYaw = 0;
  /** Radians a tumbling body has turned over since the crash. */
  tumble = 0;
  /** Radians through a running stride. */
  stride = 0;
  /** Whether their bike's lights flash: only a cop's do. */
  lightsFlashing = false;
  /** Where they and their bike were drawn last frame, so the wheels, tumble and stride turn with the ground covered. */
  private readonly last = { distance: 0, offset: 0, bikeDistance: 0 };
  /** Their entry in a snapshot. */
  protected abstract readonly entryIn: (snapshot: RaceSnapshot) => RiderSnapshot | CopSnapshot;

  /**
   * The attack to draw: the race's, except that a club swing's strike is drawn
   * on through its follow-through until a new attack winds up, or they crash.
   */
  private drawnAttack({ attack, crash }: RiderSnapshot | CopSnapshot, clock: number): AttackSnapshot | null {
    const strike = this.strike;
    const striking = attack?.kind === "club-swing" && attack.stage === "recovery";
    if (striking && !strike.seen) {
      strike.at = clock;
      strike.side = attack.side;
    }
    strike.seen = striking;
    // A new attack, a crash or a race started over ends the follow-through.
    if (attack?.stage === "wind-up" || crash || clock < strike.at) strike.at = -Infinity;
    const since = clock - strike.at;
    if (since >= FOLLOW_THROUGH_SECONDS) return attack;
    this.followThrough.side = strike.side;
    this.followThrough.progress = since / FOLLOW_THROUGH_SECONDS;
    return this.followThrough;
  }

  /** Moves on to this frame's view, `delta` seconds after the last. */
  update(view: RaceView, delta: number, wheelRadius: number) {
    const snapshot = this.entryIn(view.current);
    const phaseBefore = this.crash;
    this.crash = snapshot.crash;
    this.attack = this.drawnAttack(snapshot, view.current.clock);
    this.weapon = snapshot.weapon;
    if (snapshot.attack?.kind === "club-swing") this.clubHand = snapshot.attack.side;
    const body = poseOf(view, this.entryIn, this.pose);
    const bike = bikePoseOf(view, this.entryIn, this.bikePose);
    // Ground covered since the last frame: none while the race is paused.
    const travelled = travel(bike.distance - this.last.bikeDistance);
    const ran = travel(Math.hypot(body.distance - this.last.distance, body.offset - this.last.offset));
    [this.last.distance, this.last.offset, this.last.bikeDistance] = [body.distance, body.offset, bike.distance];

    // Riding back down the road, as a cop does to bust a rider behind it, the bike turns round to face back along it.
    if (!this.crash) {
      const facing = bike.speed < -BACKING_SPEED ? Math.PI : bike.speed > BACKING_SPEED ? 0 : this.facing;
      this.facing = towards(this.facing, facing, TURN_ROUND_RATE * delta);
    }
    /** 1 while the bike faces along the road, -1 while it faces back down it. */
    const along = Math.cos(this.facing);

    const road = view.track.sampleAt(bike.distance);
    const at = view.track.pointAt(bike.distance, bike.offset);
    this.bikeAt.set(at.x, at.y, at.z);
    this.pitch = along * Math.atan(road.grade);
    this.bank = along * road.bank;
    this.wheelTurn = (this.wheelTurn + (along * travelled) / wheelRadius) % (Math.PI * 2);

    if (!this.crash) {
      // Face the way it rides, turned a little towards the sideways motion.
      this.yaw = -road.heading + this.facing - along * Math.atan2(bike.sideways, Math.max(Math.abs(bike.speed), 1));
      // Lean as a motorcycle does: into the sideways acceleration of the bend and of steering.
      const turning = along * (bike.speed * bike.speed * road.curvature + (Math.abs(bike.speed) * bike.sideways) / 60);
      const wanted = Math.max(-MAX_LEAN, Math.min(MAX_LEAN, 0.7 * Math.atan(turning / GRAVITY)));
      this.lean += (wanted - this.lean) * (1 - Math.exp(-LEAN_RESPONSE * delta));
      this.fallen = 0;
      this.tumble = 0;
      this.stride = 0;
      return;
    }

    // Down: the bike falls onto the side it leant to and slews round as it slides to a stop.
    if (phaseBefore === null) {
      this.fallSide = this.lean < 0 ? -1 : 1;
      this.bodyYaw = this.yaw;
    }
    this.fallen = Math.min(1, this.fallen + delta / FALL_SECONDS);
    this.yaw = -road.heading + this.facing + this.fallSide * SLEW * this.fallen;
    // Whatever follows the lean (the camera's tilt) settles back upright while they are down.
    this.lean -= this.lean * (1 - Math.exp(-LEAN_RESPONSE * delta));

    const ground = view.track.pointAt(body.distance, body.offset);
    this.bodyAt.set(ground.x, ground.y, ground.z);
    if (this.crash !== "on-foot") {
      // A car knocking them down starts their tumble afresh.
      if (this.crash === "knocked-down" && phaseBefore !== "knocked-down") this.tumble = 0;
      this.tumble += (ran * Math.PI * 2) / TUMBLE_METRES;
      // Head over heels the way they are thrown: on along the road, or back down it by an oncoming car.
      this.bodyYaw = -view.track.sampleAt(body.distance).heading + (body.speed < 0 ? Math.PI : 0);
    } else {
      this.stride = (this.stride + (ran * Math.PI * 2) / STRIDE_METRES) % (Math.PI * 2);
      // Face the way they run; standing still, keep facing the same way.
      if (ran > 0) this.bodyYaw = -view.track.sampleAt(body.distance).heading - Math.atan2(body.sideways, body.speed);
    }
  }
}

/** How one rider is drawn this frame. The camera follows the player's. */
export class RiderMotion extends BikeMotion {
  constructor(readonly rider: RiderId) {
    super();
  }

  protected readonly entryIn = (snapshot: RaceSnapshot) => snapshot.riders[this.rider];
}

/** How one cop is drawn this frame, with the lights on their bike flashing while they ride in the race. */
export class CopMotion extends BikeMotion {
  constructor(readonly cop: CopId) {
    super();
  }

  protected readonly entryIn = (snapshot: RaceSnapshot) => snapshot.cops[this.cop];

  update(view: RaceView, delta: number, wheelRadius: number) {
    super.update(view, delta, wheelRadius);
    this.lightsFlashing = view.current.cops[this.cop].status === "riding";
  }
}

/** Metres covered between two frames, or none if they jumped (a new race, say). */
function travel(metres: number) {
  return Math.abs(metres) > JUMP ? 0 : metres;
}

/** `angle` turned towards `target` by at most `step` (radians). */
function towards(angle: number, target: number, step: number) {
  return angle + Math.max(-step, Math.min(step, target - angle));
}
