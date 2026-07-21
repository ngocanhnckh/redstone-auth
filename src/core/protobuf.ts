/**
 * A minimal protobuf wire-format reader — just enough to decode Google
 * Authenticator's export payload. Hand-rolled to avoid pulling a codegen
 * toolchain in for one 5-field message.
 *
 * Wire format: each field is a varint tag (fieldNumber << 3 | wireType)
 * followed by a payload whose shape depends on the wire type.
 */

export const enum WireType {
  Varint = 0,
  Fixed64 = 1,
  LengthDelimited = 2,
  Fixed32 = 5
}

export interface Field {
  fieldNumber: number
  wireType: WireType
  /** Present for varint fields. */
  value?: bigint
  /** Present for length-delimited fields. */
  bytes?: Uint8Array
}

class Reader {
  private offset = 0

  constructor(private readonly buf: Uint8Array) {}

  get done(): boolean {
    return this.offset >= this.buf.length
  }

  varint(): bigint {
    let result = 0n
    let shift = 0n
    for (;;) {
      if (this.done) throw new Error('truncated varint')
      const byte = this.buf[this.offset++]
      result |= BigInt(byte & 0x7f) << shift
      if ((byte & 0x80) === 0) return result
      shift += 7n
      if (shift > 70n) throw new Error('varint too long')
    }
  }

  take(length: number): Uint8Array {
    if (this.offset + length > this.buf.length) throw new Error('truncated length-delimited field')
    const slice = this.buf.subarray(this.offset, this.offset + length)
    this.offset += length
    return slice
  }

  skip(length: number): void {
    this.take(length)
  }
}

/** Reads every top-level field of a protobuf message. Unknown fields are returned too. */
export function readMessage(buf: Uint8Array): Field[] {
  const reader = new Reader(buf)
  const fields: Field[] = []

  while (!reader.done) {
    const tag = reader.varint()
    const fieldNumber = Number(tag >> 3n)
    const wireType = Number(tag & 7n) as WireType
    if (fieldNumber === 0) throw new Error('invalid field number 0')

    switch (wireType) {
      case WireType.Varint:
        fields.push({ fieldNumber, wireType, value: reader.varint() })
        break
      case WireType.LengthDelimited:
        fields.push({ fieldNumber, wireType, bytes: reader.take(Number(reader.varint())) })
        break
      case WireType.Fixed64:
        reader.skip(8)
        break
      case WireType.Fixed32:
        reader.skip(4)
        break
      default:
        throw new Error(`unsupported wire type ${wireType}`)
    }
  }
  return fields
}
