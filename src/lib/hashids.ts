import Hashids from "hashids"

const hashids = new Hashids(process.env.HASHIDS_SALT!, 8)

export function encodeId(id: number): string {
  return hashids.encode(id)
}

export function decodeId(hash: string): number | null {
  const decoded = hashids.decode(hash)
  return decoded.length > 0 ? Number(decoded[0]) : null
}