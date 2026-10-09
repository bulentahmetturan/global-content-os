/**
 * ArtifactStore: the seam where raw evidence bytes will live (R2, once an owner approves the binding). Statistics storage code depends on
 * this interface only. The production R2 adapter is NOT_IMPLEMENTED in this milestone; the in-memory adapter exists for local proof flows.
 */
import { sha256Hex } from './identity';

export interface StoredArtifact {
  locator: string;
  sha256: string;
  byteSize: number;
}

export interface ArtifactStore {
  readonly kind: 'IN_MEMORY_TEST' | 'R2';
  put(key: string, bytes: Uint8Array): Promise<StoredArtifact>;
  get(locator: string): Promise<Uint8Array | null>;
}

export class InMemoryArtifactStore implements ArtifactStore {
  readonly kind = 'IN_MEMORY_TEST' as const;
  private readonly blobs = new Map<string, Uint8Array>();
  async put(key: string, bytes: Uint8Array): Promise<StoredArtifact> {
    const locator = `mem:${key}`;
    this.blobs.set(locator, bytes.slice());
    return { locator, sha256: await sha256Hex(bytes), byteSize: bytes.byteLength };
  }
  async get(locator: string): Promise<Uint8Array | null> {
    return this.blobs.get(locator)?.slice() ?? null;
  }
  get size(): number {
    return this.blobs.size;
  }
}

/** Placeholder so the production wiring point is explicit: constructing it fails until an owner-approved R2 adapter replaces it. */
export function r2ArtifactStoreNotImplemented(): never {
  throw new Error('R2_ARTIFACT_STORE_NOT_IMPLEMENTED: R2 binding is not approved (R2_REQUIRED_FOR_PDF_ZIP_PRODUCTION=YES, R2_CREATE=NO)');
}
