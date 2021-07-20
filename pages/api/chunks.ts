import type { NextApiResponse } from 'next';
import { getAllChunks, clearStore } from '../../utils/getAllChunks';

type Data = {
  directory: string;
  pages: any;
};

const store: any = {};

export default async function handler(req: any, res: NextApiResponse<Data>) {
  if (req.method === 'POST') {
    const body = req.body;

    if (store[body.path] !== undefined && store[body.path][body.getDescendant || false] !== undefined) {
      res.json(store[body.path][body.getDescendant || false]);
      return;
    }

    const tree = await getAllChunks(body.path, req.srcDir, body.getDescendant || false).then(
      (tree: Record<string, any>) => {
        clearStore();
        return tree;
      }
    );
    const response = JSON.stringify(
      {
        tree,
        chunks: tree.chunks,
      },
      (_, value) => {
        // Stringify ES6 Map
        if (typeof value === 'object' && value instanceof Map) {
          const obj = [];
          for (const [filepath, chunkName] of value) {
            obj.push({ filepath, chunkName });
          }
          return obj;
        }
        return value;
      }
    );

    if (!store[body.path]) {
      store[body.path] = {};
    }

    store[body.path][body.getDescendant || false] = JSON.parse(response);

    res.json(JSON.parse(response));
  }
}
