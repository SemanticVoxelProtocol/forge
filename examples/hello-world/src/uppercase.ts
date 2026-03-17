// L1: uppercase — Generated from L3 contract "uppercase"

import type { Greeting } from "./greet.js";

export function uppercase(greeting: Greeting): Greeting {
  return {
    message: greeting.message.toUpperCase(),
    timestamp: greeting.timestamp,
  };
}
