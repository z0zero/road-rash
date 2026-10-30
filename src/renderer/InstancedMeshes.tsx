import { useEffect } from "react";
import type { InstancedMesh, Material } from "three";

/**
 * Instanced meshes built in code, put in the scene as they are. When they go,
 * each is disposed of with its geometry and materials, once each, however
 * many of the meshes share them.
 */
export function InstancedMeshes({ meshes }: { meshes: readonly InstancedMesh[] }) {
  useEffect(
    () => () => {
      const disposed = new Set<{ dispose(): void }>();
      for (const mesh of meshes) {
        const materials: Material[] = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const resource of [mesh.geometry, ...materials]) {
          if (!disposed.has(resource)) resource.dispose();
          disposed.add(resource);
        }
        mesh.dispose();
      }
    },
    [meshes],
  );

  return (
    <group>
      {meshes.map((mesh) => (
        <primitive key={mesh.uuid} object={mesh} />
      ))}
    </group>
  );
}
