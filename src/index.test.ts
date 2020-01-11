import * as C from './index';

test('boolean codecs work', () => {
  expect(C.boolean.toObject(true)).toBe(true);
  expect(C.boolean.toObject(false)).toBe(false);
  expect(C.boolean.fromJSON('true')).toEqual({ ok: true, value: true });
  expect(C.boolean.toJSON(true)).toBe('true');
});

test('number codecs work', () => {
  expect(C.number.toObject(1)).toBe(1);
  expect(C.number.toJSON(2)).toBe('2');
  expect(C.number.fromJSON('1')).toEqual({ ok: true, value: 1 });
});

test('string codecs work', () => {
  expect(C.string.toObject('foo')).toBe('foo');
  expect(C.string.toJSON('foo')).toBe('"foo"');
  expect(C.string.fromJSON('"foo"')).toEqual({ ok: true, value: 'foo' });
});

test('record codecs work', () => {
  const codec = C.record({ name: C.string, age: C.number });
  const john = { name: 'John', age: 18 };
  expect(codec.toObject(john)).toEqual(john);
  expect(codec.toJSON(john)).toEqual(JSON.stringify(john));
  const json = '{"name": "John", "age": 18}';
  expect(codec.fromJSON(json)).toEqual({ ok: true, value: john });
});

class Int {
  static codec: C.Codec<Int> = C.number.map(n => new Int(n)).sel(x => x.num);
  constructor(public readonly num: number) {}
}

test('map works on codecs', () => {
  const one = new Int(1);
  expect(Int.codec.toObject(one)).toEqual(1);
  expect(Int.codec.toJSON(one)).toEqual('1');
  expect(Int.codec.fromJSON('1')).toEqual({ ok: true, value: one });
});

class User {
  static codec: C.Codec<User> = C.mapRecord(
    { name: C.string.sel(u => u.name), age: C.number.sel(u => u.age) },
    ({ name, age }) => new User(name, age),
  );
  constructor(public readonly name: string, public readonly age: number) {}
}

test('mapRecord works as expected', () => {
  const john = new User('John', 18);
  const json = '{"name":"John","age":18}';
  expect(User.codec.toObject(john)).toEqual({ name: 'John', age: 18 });
  expect(User.codec.toJSON(john)).toEqual(json);
  expect(User.codec.fromJSON(json)).toEqual({ ok: true, value: john });
});

test('array codecs work', () => {
  const codec = C.array(C.number);
  expect(codec.toObject([1, 2, 3])).toEqual([1, 2, 3]);
  expect(codec.toJSON([1, 2, 3])).toBe('[1,2,3]');
  expect(codec.fromJSON('[1,2,3]')).toEqual({ ok: true, value: [1, 2, 3] });
});

test('constant codecs work', () => {
  const codec = C.constant<'X'>('X');
  expect(codec.toObject('X')).toEqual('X');
  const decoded = codec.fromJSON('"Y"');
  expect(decoded.ok).toBeFalsy();
});

type Sum = { type: 'number'; n: number } | { type: 'string'; s: string };

test('oneOf works', () => {
  const sumNumber = C.record<Sum>({
    type: C.constant('number'),
    n: C.number,
  });
  const sumString = C.record<Sum>({
    type: C.constant('string'),
    s: C.string,
  });
  const codec = C.oneOf(
    [sumNumber, x => x.type === 'number'],
    [sumString, x => x.type === 'string'],
  );
  expect(codec.toJSON({ type: 'number', n: 1 })).toBe(
    '{"type":"number","n":1}',
  );
  expect(codec.toJSON({ type: 'string', s: 's' })).toBe(
    '{"type":"string","s":"s"}',
  );
  expect(codec.fromJSON('{"type":"number","n":1}')).toEqual({
    ok: true,
    value: { type: 'number', n: 1 },
  });
  expect(codec.fromJSON('{"type":"string","s":"s"}')).toEqual({
    ok: true,
    value: { type: 'string', s: 's' },
  });
});

interface OptionalUser {
  name: string;
  age?: number;
}

test('optional works', () => {
  const codec = C.record<OptionalUser>({
    name: C.string,
    age: C.number.optional(),
  });
  expect(codec.toJSON({ name: 'John', age: 20 })).toBe(
    '{"name":"John","age":20}',
  );
  expect(codec.toJSON({ name: 'John' })).toBe('{"name":"John"}');
  expect(codec.fromJSON('{"name": "John", "age": 20}')).toEqual({
    ok: true,
    value: { name: 'John', age: 20 },
  });
  expect(codec.fromJSON('{"name": "John"}')).toEqual({
    ok: true,
    value: { name: 'John' },
  });
});
