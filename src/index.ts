export type Result<A> = { ok: false; error: string } | { ok: true; value: A };

function mapResult<A, B>(res: Result<A>, f: (a: A) => B): Result<B> {
  if (res.ok) {
    return { ...res, value: f(res.value) };
  } else {
    return res;
  }
}

export interface SerDe<X, A> {
  encode(entity: X): any;
  decode(data: any): Result<A>;
}

export class Codec<A, X = A> {
  constructor(private readonly repr: SerDe<X, A>) {}

  get serde(): SerDe<X, A> {
    return this.repr;
  }

  toObject(entity: X): any {
    return this.serde.encode(entity);
  }

  toJSON(entity: X): string {
    return JSON.stringify(this.toObject(entity));
  }

  fromJSON(json: string): Result<A> {
    return this.serde.decode(JSON.parse(json));
  }

  sel<Y>(extract: (big: Y) => X): Codec<A, Y> {
    const { encode, decode } = this.serde;
    return new Codec({
      encode: y => encode(extract(y)),
      decode,
    });
  }
}

export const string: Codec<string> = new Codec({
  encode: s => s,
  decode: data =>
    typeof data === 'string'
      ? { ok: true, value: data }
      : { ok: false, error: 'expected string' },
});

export const number: Codec<number> = new Codec({
  encode: s => s,
  decode: data =>
    typeof data === 'number'
      ? { ok: true, value: data }
      : { ok: false, error: 'expected number ' },
});

export const boolean: Codec<boolean> = new Codec({
  encode: s => s,
  decode: data =>
    typeof data === 'boolean'
      ? { ok: true, value: data }
      : { ok: false, error: 'expected boolean' },
});

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

export function record<R>(codecs: { [K in keyof R]: Codec<R[K], R[K]> }): Codec<R> {
  const enlarged: { [K in keyof R]: Codec<R[K], R> } = {} as any;
  for (const key in codecs) {
    enlarged[key] = codecs[key].sel(r => r[key]);
  }
  return new Codec({
    encode: x => encodeRecord(x, enlarged),
    decode: data => decodeRecord(data, enlarged),
  });
}

export function map<A, B, X>(codec: Codec<A, X>, f: (a: A) => B): Codec<B, X> {
  const { encode, decode } = codec.serde;
  return new Codec({
    encode,
    decode: data => mapResult(decode(data), f),
  });
}

export function mapRecord<R, B, X>(
  codecs: { [K in keyof R]: Codec<R[K], X> },
  f: (args: R) => B,
): Codec<B, X> {
  return map(sameRecord(codecs), f);
}
