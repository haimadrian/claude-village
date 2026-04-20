import PF from "pathfinding";

export interface GridPoint {
  x: number;
  z: number;
}

export function computePath(from: GridPoint, to: GridPoint, walkable: boolean[][]): GridPoint[] {
  const size = walkable.length;
  const matrix: number[][] = [];
  for (let z = 0; z < size; z++) {
    const row: number[] = [];
    for (let x = 0; x < size; x++) row.push(walkable[x]?.[z] ? 0 : 1);
    matrix.push(row);
  }
  const grid = new PF.Grid(matrix);
  const finder = new PF.AStarFinder({ diagonalMovement: PF.DiagonalMovement.Never });
  const raw = finder.findPath(from.x, from.z, to.x, to.z, grid);
  return raw.map(([x, z]) => ({ x: x as number, z: z as number }));
}
