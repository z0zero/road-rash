import { useFrame } from "@react-three/fiber";
import { useMemo } from "react";
import {
  type BufferGeometry,
  Color,
  Euler,
  InstancedMesh,
  type Material,
  Matrix4,
  MeshBasicMaterial,
  MeshPhongMaterial,
  Quaternion,
  Vector3,
} from "three";
import type { GameSession, RaceView } from "@/game/session";
import { smoothstep } from "@/math";
import { MOST_CARS, PLAYER, STEP_SECONDS, TRAFFIC_AHEAD, type CarKind, type CarSnapshot } from "@/race";
import { CAR_MODELS, isCarKind, paintOf } from "./car-models";
import { InstancedMeshes } from "./InstancedMeshes";

/**
 * Cars come onto the road, and leave it, at the far end of the window around
 * the player, which across a hairpin can be in plain view: there a car grows
 * from nothing over this many metres of road, rather than popping in.
 */
const GROW_METRES = 40;

/** The cars of one kind, drawn with instancing: one instance per car of that kind on the road. */
interface CarsOfAKind {
  /** Painted each car's own colour. */
  readonly body: InstancedMesh;
  readonly trim: InstancedMesh;
  readonly lamps: InstancedMesh;
  /** All three. */
  readonly meshes: readonly InstancedMesh[];
  /** The model's size (metres), to stretch it to each car's own. */
  readonly length: number;
  readonly width: number;
  /** Cars of this kind placed so far this frame. */
  drawn: number;
}

/**
 * The cars on the road around the player, from the race's traffic: hatchbacks,
 * saloons, vans and pickups in a few colours, each drawn between the last two
 * snapshots, facing the way it drives, nosing over as it changes lanes, and
 * pitched and tilted with the road. Their lamps glow, so the oncoming cars'
 * headlamps bloom in the dusk. They grow into view, and shrink out of it, at
 * the far end of the traffic's window.
 */
export function Traffic({ session }: { session: GameSession }) {
  const kinds = useMemo(() => buildFleet(), []);
  const meshes = useMemo(() => [...kinds.values()].flatMap((cars) => cars.meshes), [kinds]);
  useFrame(() => placeCars(kinds, session.view));
  return <InstancedMeshes meshes={meshes} />;
}

function buildFleet() {
  const paint = new MeshPhongMaterial({ vertexColors: true, shininess: 70, specular: "#4d4d4d" });
  const trim = new MeshPhongMaterial({ vertexColors: true, shininess: 45, specular: "#3a3a3a" });
  // Unlit: the lamps glow, as bright as their colours, which are brighter than white.
  const lamps = new MeshBasicMaterial({ vertexColors: true });
  const instanced = (geometry: BufferGeometry, material: Material, shadows: boolean) => {
    // Room for every car on the road, which could all be of one kind.
    const mesh = new InstancedMesh(geometry, material, MOST_CARS);
    mesh.count = 0;
    mesh.visible = false;
    // The cars move every frame, so their instances are never where a bounding sphere last put them.
    mesh.frustumCulled = false;
    mesh.castShadow = shadows;
    mesh.receiveShadow = shadows;
    return mesh;
  };
  const kinds = new Map<CarKind, CarsOfAKind>();
  // Every kind there is a model for, which is every kind the race has.
  for (const kind of Object.keys(CAR_MODELS).filter(isCarKind)) {
    const model = CAR_MODELS[kind]();
    const body = instanced(model.body, paint, true);
    // Every car's paint, given before the first frame so the material is built to take it.
    for (let i = 0; i < MOST_CARS; i++) body.setColorAt(i, WHITE);
    const parts = { body, trim: instanced(model.trim, trim, true), lamps: instanced(model.lamps, lamps, false) };
    kinds.set(kind, {
      ...parts,
      meshes: [parts.body, parts.trim, parts.lamps],
      length: model.length,
      width: model.width,
      drawn: 0,
    });
  }
  return kinds;
}

const WHITE = new Color("#ffffff");
const matrix = new Matrix4();
const position = new Vector3();
const turn = new Quaternion();
const angles = new Euler();
const stretch = new Vector3();

/** Puts every car on the road where the view says it is this frame. */
function placeCars(kinds: ReadonlyMap<CarKind, CarsOfAKind>, { track, previous, current, alpha }: RaceView) {
  for (const cars of kinds.values()) cars.drawn = 0;
  const player = current.riders[PLAYER].distance;
  for (const car of current.traffic) {
    const cars = kinds.get(car.kind);
    // Full size once well inside the window's far end, nothing at it.
    const grown = smoothstep(TRAFFIC_AHEAD, TRAFFIC_AHEAD - GROW_METRES, car.distance - player);
    if (!cars || cars.drawn >= MOST_CARS || grown === 0) continue;
    // A car that has only just come onto the road is drawn where it came on.
    const before = sameCar(previous.traffic, car.id) ?? car;
    const distance = before.distance + (car.distance - before.distance) * alpha;
    const offset = before.offset + (car.offset - before.offset) * alpha;
    // Which way it heads, from the race direction, turning right: along the road its own way, nosing across as it changes lanes.
    const sideways = (car.offset - before.offset) / STEP_SECONDS;
    const facing = Math.atan2(sideways, car.oncoming ? -car.speed : car.speed);
    const road = track.sampleAt(distance);
    const at = track.pointAt(distance, offset);
    // An oncoming car meets the road's climb and tilt the other way round.
    const ahead = Math.cos(facing);
    angles.set(Math.atan(road.grade * ahead), -(road.heading + facing), -road.bank * ahead, "YXZ");
    matrix.compose(
      position.set(at.x, at.y, at.z),
      turn.setFromEuler(angles),
      stretch.set((grown * car.width) / cars.width, grown, (grown * car.length) / cars.length),
    );
    const instance = cars.drawn++;
    cars.body.setMatrixAt(instance, matrix);
    cars.trim.setMatrixAt(instance, matrix);
    cars.lamps.setMatrixAt(instance, matrix);
    cars.body.setColorAt(instance, paintOf(car.id));
  }
  for (const cars of kinds.values()) {
    for (const mesh of cars.meshes) {
      mesh.count = cars.drawn;
      mesh.visible = cars.drawn > 0;
      mesh.instanceMatrix.needsUpdate = true;
    }
    if (cars.body.instanceColor) cars.body.instanceColor.needsUpdate = true;
  }
}

/** The car with this id among `cars`, if it is there. */
function sameCar(cars: readonly CarSnapshot[], id: number): CarSnapshot | undefined {
  for (const car of cars) if (car.id === id) return car;
  return undefined;
}
