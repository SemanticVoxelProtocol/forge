// TypeScript 签名提取器
// 使用 TypeScript Compiler API 从 .ts 文件提取导出符号的签名
// 这是唯一依赖 typescript 包的模块

import {
  createProgram,
  isClassDeclaration,
  isEnumDeclaration,
  isFunctionDeclaration,
  isInterfaceDeclaration,
  isTypeAliasDeclaration,
  isVariableDeclaration,
  ModuleKind,
  ModuleResolutionKind,
  ScriptTarget,
  TypeFormatFlags,
} from "typescript";
import type { ExportedSymbol, FileFingerprint, SignatureExtractor } from "../fingerprint.js";
import type { Declaration } from "typescript";

/** 从 TS 符号类型映射到我们的 kind */
function mapSymbolKind(declarations: readonly Declaration[] | undefined): ExportedSymbol["kind"] {
  if (declarations === undefined || declarations.length === 0) return "variable";
  const decl = declarations[0];

  if (isFunctionDeclaration(decl)) return "function";
  if (isClassDeclaration(decl)) return "class";
  if (isInterfaceDeclaration(decl)) return "interface";
  if (isTypeAliasDeclaration(decl)) return "type";
  if (isEnumDeclaration(decl)) return "enum";
  if (isVariableDeclaration(decl)) return "variable";

  return "variable";
}

/** 从 TS 文件提取导出符号 */
function extractExports(filePath: string): ExportedSymbol[] {
  const program = createProgram([filePath], {
    target: ScriptTarget.ESNext,
    module: ModuleKind.ESNext,
    moduleResolution: ModuleResolutionKind.Bundler,
    strict: true,
    skipLibCheck: true,
    noEmit: true,
  });

  const sourceFile = program.getSourceFile(filePath);
  if (sourceFile === undefined) return [];

  const checker = program.getTypeChecker();
  const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
  if (moduleSymbol === undefined) return [];

  const exports = checker.getExportsOfModule(moduleSymbol);
  const result: ExportedSymbol[] = [];

  for (const sym of exports) {
    const kind = mapSymbolKind(sym.declarations);
    const type = checker.getTypeOfSymbol(sym);
    const signature = checker.typeToString(
      type,
      sourceFile,
      TypeFormatFlags.NoTruncation | TypeFormatFlags.WriteArrowStyleSignature,
    );

    result.push({
      name: sym.name,
      kind,
      signature,
    });
  }

  return result;
}

/** 创建 TypeScript 签名提取器 */
export function createTypescriptExtractor(): SignatureExtractor {
  return {
    extract: (filePath: string): Promise<FileFingerprint> =>
      Promise.resolve({
        filePath,
        exports: extractExports(filePath),
      }),
  };
}
