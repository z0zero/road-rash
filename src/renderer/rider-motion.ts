import type { RaceView } from "@/game/session";
import type { AttackSnapshot, CrashPhase, RiderId, Weapon } from "@/race";
import { bikePoseOf, createPose, poseOf, type RiderPose } from "./rider-pose";

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

/**
 * How one rider is drawn this frame: where their bike is, which way it faces,
 * how far it leans into the corner (or lies on its side after a crash) and
 * how far its wheels have turned; and, after a crash, where the rider is on
 * their own, tumbling or on foot. The renderer keeps one per rider and updates
 * it once a frame, before anything that draws or follows that rider reads it.
 */
export class RiderMotion {
  /** Where the rider is: on their bike, or wherever they are after a crash. The camera follows the player's. */
  readonly pose: RiderPose = createPose();
  /** Where the rider's bike is. */
  readonly bikePose: RiderPose = createPose();
  /** The bike: metres, on the road's surface. */
  x = 0;
  y = 0;
  z = 0;
  /** Radians about the vertical, as three.js turns an object: facing along the road, turned towards its sideways motion. */
  yaw = 0;
  /** Radians the road climbs ahead. */
  pitch = 0;
  /** Radians the road is banked; positive tilts it down to the right. */
  bank = 0;
  /** Radians the bike leans into the corner, positive to the right, smoothed. */
  lean = 0;
  /** Radians the wheels have turned. */
  wheelTurn = 0;
  /** Whether the rider is beyond the road's edge, on the shoulder. */
  offRoad = false;
  /** Null while the rider is on their bike; otherwise how far they are in getting back on it. */
  crash: CrashPhase | null = null;
  /** The attack the rider is making, or null. */
  attack: AttackSnapshot | null = null;
  /** The weapon the rider holds, or null. */
  weapon: Weapon | null = null;
  /** The hand a held club is in: 1 the right, -1 the left. It moves to the side of each swing and stays there. */
  clubHand: -1 | 1 = 1;
  /** After a crash: 0 while the bike is upright, 1 once it lies on its side. */
  fallen = 0;
  /** The side the crashed bike lies on: 1 its right, -1 its left. */
  fallSide: -1 | 1 = 1;
  /** The rider off their bike: metres, on the road's surface. */
  bodyX = 0;
  bodyY = 0;
  bodyZ = 0;
  /** Radians about the vertical: the way the rider off their bike faces. */
  bodyYaw = 0;
  /** Radians a tumbling rider has turned over since their crash. */
  tumble = 0;
  /** Radians through a running rider's stride. */
  stride = 0;
  /** Where the rider and the bike were drawn last frame, so the wheels, tumble and stride turn with the ground covered. */
  private readonly last = { distance: 0, offset: 0, bikeDistance: 0 };

  constructor(readonly rider: RiderId) {}

  /** Moves on to this frame's view, `delta` seconds after the last. */
  update(view: RaceView, delta: number, wheelRadius: number) {
    const snapshot = view.current.riders[this.rider];
    const was = this.crash;
    this.crash = snapshot.crash;
    this.attack = snapshot.attack;
    this.weapon = snapshot.weapon;
    if (snapshot.attack?.kind === "club-swing") this.clubHand = snapshot.attack.side;
    const rider = poseOf(view, this.rider, this.pose);
    const bike = bikePoseOf(view, this.rider, this.bikePose);
    // Ground covered since the last frame: none while the race is paused.
    const travelled = travel(bike.distance - this.last.bikeDistance);
    const ran = travel(Math.hypot(rider.distance - this.last.distance, rider.offset - this.last.offset));
    [this.last.distance, this.last.offset, this.last.bikeDistance] = [rider.distance, rider.offset, bike.distance];

    const road = view.track.sampleAt(bike.distance);
    const at = view.track.pointAt(bike.distance, bike.offset);
    this.x = at.x;
    this.y = at.y;
    this.z = at.z;
    this.pitch = Math.atan(road.grade);
    this.bank = road.bank;
    this.wheelTurn = (this.wheelTurn + travelled / wheelRadius) % (Math.PI * 2);
    this.offRoad = Math.abs(rider.offset) > view.track.roadHalfWidth;

    if (!this.crash) {
      // Face along the road, turned a little towards the sideways motion.
      this.yaw = -road.heading - Math.atan2(bike.sideways, Math.max(bike.speed, 1));
      // Lean as a motorcycle does: into the sideways acceleration of the bend and of steering.
      const turning = bike.speed * bike.speed * road.curvature + (bike.speed * bike.sideways) / 60;
      const wanted = Math.max(-MAX_LEAN, Math.min(MAX_LEAN, 0.7 * Math.atan(turning / GRAVITY)));
      this.lean += (wanted - this.lean) * (1 - Math.exp(-LEAN_RESPONSE * delta));
      this.fallen = 0;
      this.tumble = 0;
      this.stride = 0;
      return;
    }

    // Down: the bike falls onto the side it leant to and slews round as it slides to a stop.
    if (was === null) {
      this.fallSide = this.lean < 0 ? -1 : 1;
      this.bodyYaw = this.yaw;
    }
    this.fallen = Math.min(1, this.fallen + delta / FALL_SECONDS);
    this.yaw = -road.heading + this.fallSide * SLEW * this.fallen;
    // Whatever follows the lean (the camera's tilt) settles back upright while the rider is down.
    this.lean -= this.lean * (1 - Math.exp(-LEAN_RESPONSE * delta));

    const ground = view.track.pointAt(rider.distance, rider.offset);
    this.bodyX = ground.x;
    this.bodyY = ground.y;
    this.bodyZ = ground.z;
    if (this.crash === "tumbling") {
      // Knocked down by a car while on foot, they tumble afresh.
      if (was === "on-foot") this.tumble = 0;
      this.tumble += (ran * Math.PI * 2) / TUMBLE_METRES;
      // Head over heels the way they are thrown: on along the road, or back down it by an oncoming car.
      this.bodyYaw = -view.track.sampleAt(rider.distance).heading + (rider.speed < 0 ? Math.PI : 0);
    } else {
      this.stride = (this.stride + (ran * Math.PI * 2) / STRIDE_METRES) % (Math.PI * 2);
      // Face the way they run; standing still, keep facing the same way.
      if (ran > 0) this.bodyYaw = -view.track.sampleAt(rider.distance).heading - Math.atan2(rider.sideways, rider.speed);
    }
  }
}

/** Metres covered between two frames, or none if they jumped (a new race, say). */
function travel(metres: number) {
  return Math.abs(metres) > JUMP ? 0 : metres;
}
