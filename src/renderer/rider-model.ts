import {
  BoxGeometry,
  type BufferGeometry,
  type ColorRepresentation,
  ConeGeometry,
  CylinderGeometry,
  Group,
  IcosahedronGeometry,
  type Material,
  Mesh,
  MeshBasicMaterial,
  MeshPhongMaterial,
  Quaternion,
  Vector3,
} from "three";
import type { Livery } from "./liveries";
import { LowPoly } from "./low-poly";

/** Metres. */
export const WHEEL_RADIUS = 0.31;

/** A limb's two bones: the upper one turns at the shoulder or hip, the lower one at the elbow or knee. */
export interface Limb {
  readonly upper: Group;
  readonly lower: Group;
}

/**
 * A rider on their bike, flat-shaded and built in code. The bike faces -z
 * with its wheels on the ground at y = 0. Move and turn `root` to place it on
 * the road; turn the wheels about x to roll them; move and turn the rider's
 * joints to animate them (each joint's group is turned so its bone runs
 * along +y, and its rest pose is the riding crouch).
 */
export interface RiderModel {
  readonly root: Group;
  /** Front, then rear. */
  readonly wheels: readonly [Group, Group];
  /** The rider, seated: shift and lean it to hang off into corners. */
  readonly rider: Group;
  /** Turns at the hips. */
  readonly torso: Group;
  /** Turns at the neck, upright in the bike's frame at rest. */
  readonly head: Group;
  /** Left, then right. */
  readonly arms: readonly [Limb, Limb];
  /** Left, then right. */
  readonly legs: readonly [Limb, Limb];
  /**
   * A club gripped in each hand, left then right, both hidden until the rider
   * holds one. Each turns at the grip, its shaft running along +y to its head.
   */
  readonly clubs: readonly [Group, Group];
  /** Every joint's turn in the riding crouch, to animate from and return to. */
  readonly rest: ReadonlyMap<Group, Quaternion>;
  /** Every mesh, to cast shadows or to swap materials. */
  readonly meshes: readonly Mesh[];
  dispose(): void;
}

const TYRE = "#1b1a1f";
const DARK_METAL = "#3a3940";
const STEEL = "#b8bac0";
const SEAT = "#211f25";
const SCREEN = "#2a3644";
const LEATHER = "#2b2833";
const GLOVE = "#1d1c22";
const BOOT = "#1a191e";
const VISOR = "#1b2230";
/** Pale wood, so a club stands out against dark jackets and the road. */
const WOOD = "#e2b06e";
const GRIP_TAPE = "#2a2320";

/** Builds a rider and their bike in a livery. Call `dispose` when done with it. */
export function createRiderModel(livery: Livery): RiderModel {
  const geometries: BufferGeometry[] = [];
  const surface = new MeshPhongMaterial({ vertexColors: true, shininess: 38, specular: "#3a3a3a" });
  // The lamps glow far brighter than white, so they bloom.
  const lamps = new MeshBasicMaterial({ vertexColors: true });
  lamps.color.setScalar(4);
  const materials: Material[] = [surface, lamps];
  const meshes: Mesh[] = [];
  const mesh = (geometry: BufferGeometry, material: Material = surface) => {
    geometries.push(geometry);
    const result = new Mesh(geometry, material);
    result.castShadow = material === surface;
    meshes.push(result);
    return result;
  };

  const root = new Group();
  root.add(mesh(bikeGeometry(livery)));
  root.add(mesh(lampGeometry(), lamps));

  const wheels: [Group, Group] = [new Group(), new Group()];
  wheels[0].position.set(0, WHEEL_RADIUS, -0.7);
  wheels[1].position.set(0, WHEEL_RADIUS, 0.72);
  wheels.forEach((wheel, index) => {
    wheel.add(mesh(wheelGeometry(livery, index === 1 ? 0.19 : 0.15)));
    root.add(wheel);
  });

  // The riding crouch, in the bike's frame: hips on the seat, hands on the grips, feet on the pegs.
  const hips = new Vector3(0, 1.05, 0.3);
  const shoulders = new Vector3(0, 1.43, -0.08);
  const rider = new Group();
  rider.position.copy(hips);
  root.add(rider);

  const torso = joint(rider, new Quaternion(), hips, hips, shoulders);
  torso.group.add(
    mesh(new LowPoly().add(new BoxGeometry(0.42, 0.58, 0.27), livery.jacket, { at: [0, 0.27, 0] }).add(
      new BoxGeometry(0.44, 0.1, 0.29),
      LEATHER,
      { at: [0, 0.02, 0] },
    ).build()),
  );

  // The head turns at the neck but sits upright in the bike's frame at rest.
  const neck = new Vector3(0, 1.5, -0.16);
  const head = new Group();
  head.position.copy(localPoint(torso.world, hips, neck));
  head.quaternion.copy(torso.world).invert();
  torso.group.add(head);
  head.add(
    mesh(
      new LowPoly()
        .add(new IcosahedronGeometry(0.16, 1), livery.helmet, { at: [0, 0.09, -0.06], scale: [0.95, 0.92, 1.08] })
        .add(new BoxGeometry(0.035, 0.03, 0.3), livery.paint, { at: [0, 0.24, -0.06] })
        .add(new BoxGeometry(0.24, 0.085, 0.08), VISOR, { at: [0, 0.1, -0.2], turn: [-0.25, 0, 0] }, 0)
        .build(),
    ),
  );

  const clubs: Group[] = [];
  const arm = (side: -1 | 1): Limb => {
    const shoulder = new Vector3(side * 0.21, 1.4, -0.07);
    const elbow = new Vector3(side * 0.28, 1.17, -0.3);
    const hand = new Vector3(side * 0.3, 0.99, -0.5);
    const upper = joint(torso.group, torso.world, hips, shoulder, elbow);
    upper.group.add(mesh(limbGeometry(0.12, upper.length, livery.jacket)));
    const lower = joint(upper.group, upper.world, shoulder, elbow, hand);
    lower.group.add(
      mesh(
        new LowPoly()
          .add(new BoxGeometry(0.1, lower.length, 0.1), livery.jacket, { at: [0, lower.length / 2, 0] })
          .add(new BoxGeometry(0.11, 0.1, 0.12), GLOVE, { at: [0, lower.length, 0] })
          .build(),
      ),
    );
    const club = new Group();
    club.position.set(0, lower.length, 0);
    club.visible = false;
    club.add(mesh(clubGeometry()));
    lower.group.add(club);
    clubs.push(club);
    return { upper: upper.group, lower: lower.group };
  };

  const leg = (side: -1 | 1): Limb => {
    const hip = new Vector3(side * 0.13, 1.03, 0.3);
    const knee = new Vector3(side * 0.25, 0.86, -0.08);
    const foot = new Vector3(side * 0.19, 0.46, 0.22);
    const upper = joint(rider, new Quaternion(), hips, hip, knee);
    upper.group.add(mesh(limbGeometry(0.16, upper.length, LEATHER)));
    const lower = joint(upper.group, upper.world, hip, knee, foot);
    lower.group.add(
      mesh(
        new LowPoly()
          .add(new BoxGeometry(0.13, lower.length, 0.13), LEATHER, { at: [0, lower.length / 2, 0] })
          .add(new BoxGeometry(0.13, 0.26, 0.15), BOOT, { at: [0, lower.length - 0.08, 0] })
          .add(new BoxGeometry(0.12, 0.08, 0.24), BOOT, { at: [0, lower.length, -0.06] })
          .build(),
      ),
    );
    return { upper: upper.group, lower: lower.group };
  };

  const arms: [Limb, Limb] = [arm(-1), arm(1)];
  const legs: [Limb, Limb] = [leg(-1), leg(1)];
  const joints = [torso.group, head, ...arms.flatMap(({ upper, lower }) => [upper, lower]), ...legs.flatMap(({ upper, lower }) => [upper, lower])];
  return {
    root,
    wheels,
    rider,
    torso: torso.group,
    head,
    arms,
    legs,
    clubs: [clubs[0], clubs[1]],
    rest: new Map(joints.map((group) => [group, group.quaternion.clone()])),
    meshes,
    dispose() {
      geometries.forEach((geometry) => geometry.dispose());
      materials.forEach((material) => material.dispose());
    },
  };
}

const UP = new Vector3(0, 1, 0);

/**
 * A joint at `from` whose bone runs to `to` (both in the bike's frame), as a
 * group inside `parent`, whose own joint sits at `parentAt` and is turned by
 * `parentWorld` relative to the bike.
 */
function joint(parent: Group, parentWorld: Quaternion, parentAt: Vector3, from: Vector3, to: Vector3) {
  const direction = to.clone().sub(from);
  const length = direction.length();
  const world = new Quaternion().setFromUnitVectors(UP, direction.normalize());
  const group = new Group();
  group.position.copy(localPoint(parentWorld, parentAt, from));
  group.quaternion.copy(parentWorld).invert().multiply(world);
  parent.add(group);
  return { group, world, length };
}

/** Where a point in the bike's frame lies in the frame of a joint at `at` turned by `world`. */
function localPoint(world: Quaternion, at: Vector3, point: Vector3) {
  return point.clone().sub(at).applyQuaternion(world.clone().invert());
}

function limbGeometry(thickness: number, length: number, color: ColorRepresentation) {
  return new LowPoly().add(new BoxGeometry(thickness, length, thickness), color, { at: [0, length / 2, 0] }).build();
}

/** The bike without its wheels and lamps, in the livery's paint. */
function bikeGeometry({ paint, accent }: Livery): BufferGeometry {
  const rake = 0.42;
  return (
    new LowPoly()
      // Fork, from the front axle up and back to the top of the steering head.
      .add(new BoxGeometry(0.05, 0.72, 0.05), STEEL, { at: [-0.09, 0.64, -0.55], turn: [rake, 0, 0] })
      .add(new BoxGeometry(0.05, 0.72, 0.05), STEEL, { at: [0.09, 0.64, -0.55], turn: [rake, 0, 0] })
      .add(new BoxGeometry(0.06, 0.1, 0.3), paint, { at: [0, WHEEL_RADIUS + 0.32, -0.7] })
      // Nose fairing around the headlamp, and the windscreen.
      .add(new ConeGeometry(0.25, 0.42, 4), paint, { at: [0, 0.86, -0.83], turn: [-Math.PI / 2, Math.PI / 4, 0], scale: [1, 1, 0.8] })
      .add(new BoxGeometry(0.44, 0.34, 0.36), paint, { at: [0, 0.82, -0.56] })
      .add(new BoxGeometry(0.34, 0.24, 0.03), SCREEN, { at: [0, 1.07, -0.66], turn: [0.95, 0, 0] }, 0.02)
      // Side fairings with a stripe, and the engine below them.
      .add(new BoxGeometry(0.46, 0.36, 0.74), paint, { at: [0, 0.56, -0.28] })
      .add(new BoxGeometry(0.47, 0.06, 0.74), accent, { at: [0, 0.68, -0.28] })
      .add(new BoxGeometry(0.34, 0.3, 0.42), DARK_METAL, { at: [0, 0.38, 0.06] })
      // Tank, seat and tail with its stripe.
      .add(new BoxGeometry(0.4, 0.22, 0.5), paint, { at: [0, 0.92, -0.18] })
      .add(new BoxGeometry(0.3, 0.08, 0.42), paint, { at: [0, 1.05, -0.2] })
      .add(new BoxGeometry(0.3, 0.07, 0.42), SEAT, { at: [0, 1.0, 0.27] })
      .add(new BoxGeometry(0.28, 0.16, 0.42), paint, { at: [0, 1.03, 0.66], turn: [-0.18, 0, 0] })
      .add(new BoxGeometry(0.29, 0.04, 0.42), accent, { at: [0, 1.1, 0.66], turn: [-0.18, 0, 0] })
      .add(new BoxGeometry(0.22, 0.05, 0.2), DARK_METAL, { at: [0, 0.82, 0.92], turn: [0.5, 0, 0] })
      // Swingarm, exhaust, footpegs and clip-on handlebars.
      .add(new BoxGeometry(0.05, 0.07, 0.72), DARK_METAL, { at: [-0.12, 0.36, 0.38], turn: [0.06, 0, 0] })
      .add(new BoxGeometry(0.05, 0.07, 0.72), DARK_METAL, { at: [0.12, 0.36, 0.38], turn: [0.06, 0, 0] })
      .add(new CylinderGeometry(0.065, 0.055, 0.6, 7), STEEL, { at: [0.2, 0.46, 0.5], turn: [Math.PI / 2 - 0.35, 0, 0] })
      .add(new CylinderGeometry(0.05, 0.05, 0.04, 7), TYRE, { at: [0.2, 0.56, 0.78], turn: [Math.PI / 2 - 0.35, 0, 0] })
      .add(new BoxGeometry(0.5, 0.03, 0.05), DARK_METAL, { at: [0, 0.44, 0.22] })
      .add(new BoxGeometry(0.68, 0.04, 0.04), DARK_METAL, { at: [0, 0.98, -0.5] })
      .add(new BoxGeometry(0.08, 0.05, 0.03), DARK_METAL, { at: [-0.25, 1.04, -0.68] })
      .add(new BoxGeometry(0.08, 0.05, 0.03), DARK_METAL, { at: [0.25, 1.04, -0.68] })
      .build()
  );
}

/**
 * A wooden club about 0.9 m long, gripped at the origin: a taped grip with a
 * knob below, widening to a heavy head above. It is a little oversized, so it
 * reads from the chase camera.
 */
function clubGeometry(): BufferGeometry {
  return new LowPoly()
    .add(new CylinderGeometry(0.045, 0.045, 0.04, 7), GRIP_TAPE, { at: [0, -0.13, 0] })
    .add(new CylinderGeometry(0.032, 0.032, 0.22, 7), GRIP_TAPE, { at: [0, 0, 0] })
    .add(new CylinderGeometry(0.075, 0.036, 0.58, 7), WOOD, { at: [0, 0.4, 0] }, 0.12)
    .add(new CylinderGeometry(0.06, 0.075, 0.08, 7), WOOD, { at: [0, 0.73, 0] }, 0.12)
    .build();
}

/** The headlamp and tail lamp. */
function lampGeometry(): BufferGeometry {
  return new LowPoly()
    .add(new BoxGeometry(0.16, 0.08, 0.04), "#fff1d0", { at: [0, 0.86, -1.0] }, 0)
    .add(new BoxGeometry(0.2, 0.05, 0.03), "#ff2a1a", { at: [0, 1.0, 0.88], turn: [-0.18, 0, 0] }, 0)
    .build();
}

/** A wheel about its axle: tyre, rim in the livery's accent colour, and spokes so it can be seen turning. */
function wheelGeometry({ accent }: Livery, width: number): BufferGeometry {
  const sideways: [number, number, number] = [0, 0, Math.PI / 2];
  const model = new LowPoly()
    .add(new CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, width, 14), TYRE, { turn: sideways }, 0.04)
    .add(new CylinderGeometry(0.215, 0.215, width + 0.01, 14), DARK_METAL, { turn: sideways }, 0.02)
    .add(new CylinderGeometry(0.06, 0.06, width + 0.04, 8), STEEL, { turn: sideways }, 0);
  for (let spoke = 0; spoke < 5; spoke++) {
    const angle = (spoke / 5) * Math.PI * 2;
    model.add(new BoxGeometry(width + 0.03, 0.2, 0.035), accent, {
      at: [0, Math.cos(angle) * 0.12, Math.sin(angle) * 0.12],
      turn: [angle, 0, 0],
    }, 0);
  }
  return model.build();
}
