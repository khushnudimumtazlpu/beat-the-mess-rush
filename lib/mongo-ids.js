
import "server-only";

import { ObjectId } from "mongodb";

export function isValidObjectIdHex(value) {
  return (
    typeof value === "string" &&
    /^[a-fA-F0-9]{24}$/.test(value)
  );
}

export function toObjectId(value, fieldName = "ID") {
  if (!isValidObjectIdHex(value)) {
    throw new TypeError(
      `${fieldName} must be a valid MongoDB ObjectId.`
    );
  }

  return new ObjectId(value);
}
