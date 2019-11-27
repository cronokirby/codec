/**
 * Represents either a failed decoding, or a successful decoding.
 *
 * If we succeeded, we'll be able to access the decoded value,
 * otherwise we'll have an error message we can use.
 */
export type Result<A> = { ok: false; error: string } | { ok: true; value: A };

/**
 * Apply a function to a decoded value, if it was decoded successfully.
 *
 * If the result is a failure, this function does nothing.
 *
 * @param result the result of some decoding
 * @param f the function to apply to the value, if it exists
 */
export function mapResult<A, B>(result: Result<A>, f: (a: A) => B): Result<B> {
  if (result.ok) {
    return { ...result, value: f(result.value) };
  } else {
    return result;
  }
}

/**
 * Represents a way to encode some entity, and decode some data.
 *
 * The first type represents what this interface can encode, and the
 * second represents what this interface can decode, with possible failure.
 */
export interface SerDe<X, A> {
  encode(entity: X): any;
  decode(data: any): Result<A>;
}

/**
 * Represents a way of encoding and decoding two related types.
 *
 * In the common case, both type parameters are the same, and this object
 * represents a way to both encode some type, and to decode that same type.
 * The reason we have two type parameters is in order to construct this object
 * in a composable way.
 */
export class Codec<A, X = A> {
  /**
   * Construct a codec from an encoding and decoding function.
   *
   * @param repr how do we encode and decode our types
   */
  constructor(private readonly repr: SerDe<X, A>) {}

  /**
   * The recipes for encoding and decoding.
   *
   * This doesn't need to be called directly. Instead, use the
   * `toObject` and `fromObject` methods.
   */
  get serde(): SerDe<X, A> {
    return this.repr;
  }

  /**
   * Encode some entity as a generic object.
   *
   * We use the `any` type, because the representation can truly
   * be anything depending on how this codec is constructed.
   *
   * Most use cases of this function may want to use the `toJSON` method
   * instead, which returns a JSON string. This function is useful to pass
   * some kind of object to another API, e.g. MongoDB.
   *
   * @param entity the entity to encode
   */
  toObject(entity: X): any {
    return this.serde.encode(entity);
  }

  /**
   * Try and decode from an object representation.
   *
   * This can fail if the object is of the wrong type, or
   * is missing certain keys, etc. If you want to decode directly from some JSON
   * data, you can use the `fromJSON` method instead.
   *
   * @param data the object to try and decode
   */
  fromObject(data: any): Result<A> {
    return this.serde.decode(data);
  }

  /**
   * Encode an entity as a JSON string.
   *
   * This is like `toObject`, except that it does the extra step of encoding the
   * object that method returns as a JSON string.
   *
   * @param entity the entity to encode
   */
  toJSON(entity: X): string {
    return JSON.stringify(this.toObject(entity));
  }

  /**
   * Try and decode some JSON data into our type.
   *
   * This is like `fromObject`, except that this parses out an object from JSON
   * before trying to extract out the right information.
   *
   * @param json the JSON to decode
   */
  fromJSON(json: string): Result<A> {
    return this.serde.decode(JSON.parse(json));
  }

  /**
   * Create a new Codec that accepts more entities.
   *
   * By specifying a mapping from a larger entity to a smaller one,
   * we can reuse the smaller entity's codec. Note that the encode and decode
   * methods are still relative to the smaller type, and that the decoding
   * type is no longer the same as the entity type.
   *
   * For example:
   * ```ts
   * const user = { name: 'Mickey' };
   * const userCodec = C.string.sel(u => u.name);
   * // "Mickey"
   * userCodec.toJSON(user);
   * ```
   * We encode the user as a simple string, because encoding is still relative to the
   * smaller entity.
   *
   * To fix these issues, consider combining this function with `map` and `mapRecord`.
   *
   * @param extract
   */
  sel<Y>(extract: (big: Y) => X): Codec<A, Y> {
    const { encode, decode } = this.serde;
    return new Codec({
      encode: y => encode(extract(y)),
      decode,
    });
  }

  /**
   * Filter out only decoded values satisfying some condition.
   *
   * This is useful to have additional constraints on values besides basic shape.
   *
   * @param error the error message to show if the condition fails
   * @param cond the condition to check after decoding
   */
  filter(error: string, cond: (a: A) => boolean): Codec<A, X> {
    const { encode, decode } = this.serde;
    return new Codec({
      encode,
      decode: data => {
        const decoded = decode(data);
        if (!decoded.ok) {
          return decoded;
        }
        if (!cond(decoded.value)) {
          return { ok: false, error };
        }
        return decoded;
      },
    });
  }

  /**
   * Modify the produced type of a Codec with a function.
   *
   * This works by eventually changing the result of our decoding.
   *
   * ## Example
   * ```ts
   * class Int {
   *  constructor(public num: number) {}
   *
   *  static codec: C.Codec<Int> = C.number.sel(i => i.num).map(n => new Int(n));
   * }
   * ```
   *
   * @param f the function to apply to the decoded entity
   */
  map<B>(f: (a: A) => B): Codec<B, X> {
    const { encode, decode } = this.serde;
    return new Codec({
      encode,
      decode: data => mapResult(decode(data), f),
    });
  }
}

/**
 * A Codec for strings.
 */
export const string: Codec<string> = new Codec({
  encode: s => s,
  decode: data =>
    typeof data === 'string'
      ? { ok: true, value: data }
      : { ok: false, error: 'expected string' },
});

/**
 * A Codec for numbers.
 */
export const number: Codec<number> = new Codec({
  encode: s => s,
  decode: data =>
    typeof data === 'number'
      ? { ok: true, value: data }
      : { ok: false, error: 'expected number ' },
});

/**
 * A Codec for booleans.
 */
export const boolean: Codec<boolean> = new Codec({
  encode: s => s,
  decode: data =>
    typeof data === 'boolean'
      ? { ok: true, value: data }
      : { ok: false, error: 'expected boolean' },
});

function decodeArray<A, X>(data: any, codec: Codec<A, X>): Result<A[]> {
  if (!Array.isArray(data)) {
    return { ok: false, error: 'expected array' };
  }
  const value = [];
  for (const x of data) {
    const decoded = codec.serde.decode(x);
    if (!decoded.ok) {
      return decoded;
    }
    value.push(decoded.value);
  }
  return { ok: true, value };
}

/**
 * Create a Codec that encodes and decodes arrays.
 *
 * @param codec the base codec to extend to arrays.
 */
export function array<A, X>(codec: Codec<A, X>): Codec<A[], X[]> {
  return new Codec({
    encode: xs => xs.map(x => codec.serde.encode(x)),
    decode: data => decodeArray(data, codec),
  });
}

function encodeRecord<X, R>(
  x: X,
  codecs: { [K in keyof R]: Codec<R[K], X> },
): any {
  const res: R = {} as R;
  for (const key in codecs) {
    res[key] = codecs[key].serde.encode(x);
  }
  return res;
}

function decodeRecord<X, B, R>(
  data: any,
  codecs: { [K in keyof R]: Codec<R[K], X> },
): Result<R> {
  if (typeof data !== 'object') {
    return { ok: false, error: 'expected object' };
  }
  const res: R = {} as R;
  for (const key in codecs) {
    const val = data[key];
    if (!val) {
      return { ok: false, error: `missing field ${key}` };
    }
    const decode = codecs[key].serde.decode(val);
    if (!decode.ok) {
      return decode;
    }
    res[key] = decode.value;
  }
  return { ok: true, value: res };
}

function sameRecord<R, X>(
  codecs: { [K in keyof R]: Codec<R[K], X> },
): Codec<R, X> {
  return new Codec({
    encode: x => encodeRecord(x, codecs),
    decode: data => decodeRecord(data, codecs),
  });
}

/**
 * Create a new codec, given codecs for each field of a record.
 *
 * This allows us to easily create new codecs for object types that just
 * do the "right thing".
 *
 * ## Example
 * ```ts
 * const user = { name: 'John', age: 20 };
 * const userCodec = C.record({ name: C.string, age: C.number });
 * // {"name": "John", "age": 20}
 * userCodec.toJSON(user)
 * // { name: 'John', age: 20 }
 * userCodec.fromJSON('{"name": "John", "age": 20}')
 * ```
 *
 * @param codecs the structure of Codecs to build up the new Codec
 */
export function record<R>(
  codecs: { [K in keyof R]: Codec<R[K], R[K]> },
): Codec<R> {
  const enlarged: { [K in keyof R]: Codec<R[K], R> } = {} as any;
  for (const key in codecs) {
    enlarged[key] = codecs[key].sel(r => r[key]);
  }
  return new Codec({
    encode: x => encodeRecord(x, enlarged),
    decode: data => decodeRecord(data, enlarged),
  });
}

/**
 * Construct a new Codec by mapping over a structure of records.
 *
 * This is similar to the `record` function.
 *
 * ## Example
 * ```ts
 * class User {
 *   constructor(public readonly name: string, public readonly age: number) {}
 *
 *   static codec: C.Codec<User> = C.mapRecord(
 *     { name: C.string.sel(u => u.name), age: C.number.sel(u => u.age) },
 *     ({ name, age }) => new User(name, age),
 *   );
 * }
 * ```
 *
 * @param codecs the structure of codecs to use
 * @param f a function from the corresponding record to the end type
 */
export function mapRecord<R, B, X>(
  codecs: { [K in keyof R]: Codec<R[K], X> },
  f: (args: R) => B,
): Codec<B, X> {
  return sameRecord(codecs).map(f);
}
