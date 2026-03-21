// Benchmark test data schema — defines the format for data-driven E2E tests

/** A single test case */
export interface TestCase {
  /** Human-readable test name */
  name: string;
  /** Optional: skip this test (for documenting known gaps) */
  skip?: boolean;
  /** HTTP method */
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  /** URL path (supports $variable substitution, e.g., /api/v1/products/$productId) */
  path: string;
  /** Request headers (supports $variable substitution) */
  headers?: Record<string, string>;
  /** Request body (supports $variable substitution in string values) */
  body?: unknown;
  /** Expected response */
  expected: {
    /** Expected HTTP status code */
    status: number;
    /** JSONPath-style assertions on response body */
    body?: Record<string, unknown>;
    /** Fields that should exist (any value) */
    bodyHasFields?: string[];
    /** Fields that should NOT exist */
    bodyNotHasFields?: string[];
  };
  /** Capture values from response for use in later tests */
  capture?: Record<string, string>; // variableName → JSONPath (e.g., "tenantId" → "data.id")
}

/** Setup step — runs before tests, failures are fatal */
export interface SetupStep {
  /** Description */
  name: string;
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  path: string;
  headers?: Record<string, string>;
  body?: unknown;
  /** Capture values for use in tests */
  capture?: Record<string, string>;
}

/** A round's test data */
export interface RoundTestData {
  /** Round number (1-20) */
  round: number;
  /** Round description */
  description: string;
  /** Setup steps — run in order before tests, capture variables for test use */
  setup: SetupStep[];
  /** Test cases — run in order, each can capture variables for later tests */
  tests: TestCase[];
}
