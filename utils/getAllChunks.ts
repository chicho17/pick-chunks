import * as parser from '@babel/parser';
import traverse from '@babel/traverse';
import { File } from '@babel/types';
import { existsSync, readFileSync } from 'fs';
import { resolve, dirname, relative } from 'path';
import { extensions } from "../constants/extensions"

// store object
let store: Record<string, any> = {
  shallow: {
    skipUnnamedChunks: {},
    keepUnnamedChunks: {}
  },
  deep: {
    skipUnnamedChunks: {},
    keepUnnamedChunks: {}
  },
};

export const clearStore = () => {
  store = {
    shallow: {
      skipUnnamedChunks: {},
      keepUnnamedChunks: {}
    },
    deep: {
      skipUnnamedChunks: {},
      keepUnnamedChunks: {}
    },
  };
};

export const getAllChunks = (path: string, root: string, getDescendant: boolean = false, skipImportWithoutChunkName: boolean): Record<string, any> => {

  //resolving path to absolute path 
  path = resolve(root, path);
  const descendant = getDescendant ? 'deep' : 'shallow';
  const unnamedChunks = skipImportWithoutChunkName ? "skipUnnamedChunks" : "keepUnnamedChunks";

  // path is considered cyclic as it is visited but not completed execution
  if (store[descendant][unnamedChunks][path] === null) {
    return Promise.resolve({
      path,
      children: [],
      chunks: new Set(),
      isCyclic: true,
    });
  }

  //if chunks for given combination of descendant, skipUnnamedChunks and path is already calculated then return it
  if (store[descendant][unnamedChunks][path] !== undefined) {
    return Promise.resolve(store[descendant][unnamedChunks][path]);
  }

  store[descendant][unnamedChunks][path] = null;
  const cwd = dirname(path);
  const code = readFileSync(path).toString();
  const ast = parser.parse(code, {
    sourceType: 'module',
    plugins: ['jsx', 'typescript', 'classProperties', 'exportDefaultFrom'],
  });

  const { staticImports, dynamicImports, chunkPathToName } = getImports(ast, skipImportWithoutChunkName);

  const chunks = new Map();
  const children: any = [];

  dynamicImports.forEach((chunk) => {
    let chunkPath: any = chunk;
    for (const extension of extensions) {
      if (!chunkPath.endsWith(extension)) {
        chunkPath += extension;
      }

      const pathToChunk = resolve(cwd, chunkPath);
      const pathToChunkWithRoot = resolve(root, chunkPath);

      const isRelative = chunkPath[0] === '.' && existsSync(pathToChunk);
      const isFromRoot = chunkPath[0] !== '.' && existsSync(pathToChunkWithRoot);

      if (!isRelative && !isFromRoot) {
        chunkPath = chunk;
        continue;
      }

      if (isRelative) {
        chunks.set(pathToChunk, chunkPathToName[chunk as string] || relative(root, pathToChunk));
        if (getDescendant) {
          children.push(getAllChunks(pathToChunk, root, getDescendant, skipImportWithoutChunkName));
        }
      }
      else if (isFromRoot) {
        chunks.set(pathToChunkWithRoot, chunkPathToName[chunk as string] || relative(root, pathToChunkWithRoot));
        if (getDescendant) {
          children.push(getAllChunks(pathToChunkWithRoot, root, getDescendant, skipImportWithoutChunkName));
        }
      }
    }
  });
  dynamicImports.clear();


  // Traverse children of current path
  for (const staticImport of staticImports) {
    let staticImportPath = staticImport;
    for (const extension of extensions) {
      if (!staticImportPath.endsWith(extension)) {
        staticImportPath += extension;
      }

      const pathToImport = resolve(cwd, staticImportPath);
      const pathToImportWithRoot = resolve(root, staticImportPath);

      const isRelative = staticImportPath[0] === '.' && existsSync(pathToImport);
      const isFromRoot = staticImportPath[0] !== '.' && existsSync(pathToImportWithRoot);

      if (!isRelative && !isFromRoot) {
        staticImportPath = staticImport;
        continue;
      }

      if (isRelative) {
        children.push(getAllChunks(pathToImport, root, getDescendant, skipImportWithoutChunkName));
      } else if (isFromRoot) {
        children.push(getAllChunks(pathToImportWithRoot, root, getDescendant, skipImportWithoutChunkName));
      }
    }
  }

  return new Promise((resolve) => {
    Promise.all(children).then((childChunks) => {
      const allChunks: any = childChunks.reduce(
        (all: any, curr: any) => {
          return [...all, ...curr.chunks];
        },
        [...chunks]
      );
      store[descendant][unnamedChunks][path] = {
        path,
        chunks: new Map(allChunks),
        children: childChunks,
      };
      resolve(store[descendant][unnamedChunks][path]);
    });
  });
};


// fetching all the static dynamic imports and chunk names
const getImports = (ast: File, skipImportWithoutChunkName: boolean) => {
  const staticImports: string[] = [];
  const dynamicImports = new Set();
  const chunkPathToName: any = {};

  traverse(ast, {
    ImportDeclaration(path: any) {
      staticImports.push(path.node.source.value);
    },
    CallExpression(path: any) {
      if (path.node.callee.type === 'Import') {
        const comments = path.node.arguments[0].leadingComments;
        const filePath = path.node.arguments[0].value;

        if (!filePath) {
          return;
        }

        if (comments) {
          for (const comment of comments) {
            const chunkNameComment = comment.value.replace("'", '"');
            if (chunkNameComment.includes('webpackChunkName')) {
              // Assuming webpackChunkName comment to be of format /* webpackChunkName: "name" */
              chunkPathToName[filePath] = chunkNameComment.split('"')[1];
              dynamicImports.add(filePath);
              return;
            }
          }
        }

        if (!skipImportWithoutChunkName) {
          chunkPathToName[filePath] = undefined;
          dynamicImports.add(filePath);
        }
      }
    },
    ExportNamedDeclaration(path: any) {
      if (!!path.node.source) {
        staticImports.push(path.node.source.value);
      }
    },
    ExportAllDeclaration(path: any) {
      if (!!path.node.source) {
        staticImports.push(path.node.source.value);
      }
    },
  });

  return {
    staticImports,
    dynamicImports,
    chunkPathToName,
  };
};
