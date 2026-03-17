// L1: greet — Generated from L3 contract "greet"

export interface Greeting {
  message: string;
  timestamp: string;
}

export function greet(name: string): Greeting {
  const effectiveName = name.trim() || "World";
  return {
    message: `Hello, ${effectiveName}!`,
    timestamp: new Date().toISOString(),
  };
}
