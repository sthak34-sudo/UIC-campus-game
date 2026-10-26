/** Reads the JSON chunk of a .glb (no decoding of buffers). Used by tests and tools. */
export interface GlbNode { name?: string; mesh?: number; translation?: number[]; rotation?: number[]; children?: number[]; extras?: Record<string, unknown> }
export interface GlbJson {
  nodes: GlbNode[];
  meshes: { primitives: { indices?: number; material?: number }[] }[];
  materials?: { name?: string }[];
  images?: unknown[];
  accessors: { count: number }[];
  scenes: { nodes: number[] }[];
  extensionsUsed?: string[];
  extensionsRequired?: string[];
}

export function readGlbJson(buf: Uint8Array): GlbJson {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error('not a glb');
  const len = dv.getUint32(12, true);
  if (dv.getUint32(16, true) !== 0x4e4f534a) throw new Error('first chunk is not JSON');
  return JSON.parse(new TextDecoder().decode(buf.subarray(20, 20 + len))) as GlbJson;
}

export function meshTriangles(j: GlbJson, meshIndex: number): number {
  return j.meshes[meshIndex]!.primitives.reduce((n, p) => n + (p.indices !== undefined ? j.accessors[p.indices]!.count / 3 : 0), 0);
}
