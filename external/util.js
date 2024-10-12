export function isObject(o) {
  return Object.prototype.toString.call(o) === "[object Object]";
}

export function isPlainObject(o) {
  var ctor, prot;

  if (isObject(o) === false) return false;

  ctor = o.constructor;
  if (ctor === undefined) return true;

  prot = ctor.prototype;
  if (isObject(prot) === false) return false;

  if (Object.prototype.hasOwnProperty.call(prot, "isPrototypeOf") === false) {
    return false;
  }

  return true;
}
