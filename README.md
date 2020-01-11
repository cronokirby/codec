# Codec

Codec is a library that lets you write bi-directional encodings for types in a composable way.
When you create a new codec, you're specifying how to read a file from JSON, and how to serialize it at the same time!

## Usage

```ts
// This is useful since quite a few definitions overlap with basic types
import * as C from 'codec-ts';

// 1
C.number.toObject(1);
// '1'
C.number.toJSON(1);
// { ok: true, value: 1 }
C.number.fromJSON('1');

class Int {
  // map->sel works better for type inference
  static codec: C.Codec<Int> = C.number.map(n => new Int(n)).sel(x => x.num);

  constructor(public readonly num: number) {}
}

interface U {
  name: string;
  age: Int;
}

const uCodec: C.Codec<U> = C.record({ name: C.string, age: Int.codec });


class User {
  static codec: C.Codec<User> = C.mapRecord(
    { name: C.string.sel(u => u.name), age: C.number.sel(u => u.age) },
    ({ name, age }) => new User(name, age),
  );

  constructor(public readonly name: string, public readonly age: number) {}
}

interface OptionalUser {
  name: string;
  age?: number;
}

const optionalCodec = C.record({name: C.string, age: C.number.optional()});
```
