import { mkdirSync, existsSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import {
  appendChunk,
  getDirSizeForId,
  getFileContent,
  getFilePath,
  listDir,
  renameFile,
  rmPath,
  unzipPath,
  writeFileContent,
  zipPaths,
} from '../handlers/fs';
import logger from '../logger';
import { jailPath } from '../security/pathJail';
import { validateContainerId, validateFileName, validatePath } from '../validation';
import { DriverRegistry } from '../virtualization/DriverRegistry';
import type { FilesystemDriver } from '../virtualization/types';

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function resolveFsDriver(req: Request): Promise<{ driver: FilesystemDriver | null; id: string } | { error: Response }> {
  const url = new URL(req.url);
  let id = url.searchParams.get('id') || '';
  let instanceType = url.searchParams.get('instanceType') || '';

  if (!id && req.method !== 'GET') {
    try {
      const body = await req.clone().json().catch(() => ({}));
      id = body.id || id;
      instanceType = body.instanceType || instanceType;
    } catch {}
  }

  if (!id) return { error: json({ error: 'container ID is required' }, 400) };
  if (!validateContainerId(id)) return { error: json({ error: 'invalid container ID' }, 400) };

  if (instanceType === 'LXC') {
    try {
      const incusDriver = DriverRegistry.get('lxc');
      const fsDriver = incusDriver.getFilesystem(id);
      return { driver: fsDriver, id };
    } catch (err) {
      return { error: json({ error: 'LXC filesystem driver not available' }, 500) };
    }
  }

  return { driver: null, id };
}

function lxcError(): Response {
  return json({ error: 'this operation is not supported for LXC containers' }, 400);
}

export async function handleFsList(req: Request): Promise<Response> {
  const params = new URL(req.url).searchParams;
  const id = params.get('id');
  const path = params.get('path') ?? '/';
  const filter = params.get('filter') ?? undefined;
  const instanceType = params.get('instanceType') ?? '';

  if (!id || typeof id !== 'string') return json({ error: 'container ID is required' }, 400);
  if (!validateContainerId(id)) return json({ error: 'invalid container ID' }, 400);

  if (instanceType === 'LXC') {
    try {
      const incusDriver = DriverRegistry.get('lxc');
      const fsDriver = incusDriver.getFilesystem(id);
      const entries = await fsDriver.list(path);
      let filtered = entries;
      if (filter) {
        filtered = entries.filter(e => e.name.includes(filter));
      }
      return json(filtered.map(e => ({
        name: e.name,
        path: e.path,
        type: e.isDirectory ? 'directory' : 'file',
        size: e.size,
        mode: e.mode,
        last_modified: e.mtime.toISOString(),
      })));
    } catch (err) {
      return json({ error: err instanceof Error ? err.message : 'unknown error' }, 500);
    }
  }

  try {
    const contents = await listDir(id, path, filter);
    return json(contents);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'unknown error' }, 500);
  }
}

export async function handleFsSize(req: Request): Promise<Response> {
  const result = await resolveFsDriver(req);
  if ('error' in result) return result.error;
  if (result.driver) return lxcError();

  const params = new URL(req.url).searchParams;
  const id = params.get('id');
  const path = params.get('path') ?? '/';

  try {
    const size = await getDirSizeForId(id, path);
    return json({ size });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'unknown error' }, 500);
  }
}

export async function handleFsInfo(req: Request): Promise<Response> {
  const result = await resolveFsDriver(req);
  if ('error' in result) return result.error;
  if (result.driver) return lxcError();

  const id = new URL(req.url).searchParams.get('id');

  try {
    const contents = (await listDir(id, '/')) as {
      type: string;
      size: number;
    }[];
    if (!Array.isArray(contents)) return json({ error: 'could not list directory' }, 500);

    const totalSize = contents.reduce((a, i) => a + (i.size || 0), 0);
    const fileCount = contents.filter((i) => i.type === 'file').length;
    const dirCount = contents.filter((i) => i.type === 'directory').length;

    return json({ id, totalSize, fileCount, dirCount });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'unknown error' }, 500);
  }
}

export async function handleFsFileRead(req: Request): Promise<Response> {
  const params = new URL(req.url).searchParams;
  const id = params.get('id');
  const path = params.get('path') ?? '/';
  const instanceType = params.get('instanceType') ?? '';

  if (!id) return json({ error: 'container ID is required' }, 400);
  if (!validateContainerId(id)) return json({ error: 'invalid container ID' }, 400);

  if (instanceType === 'LXC') {
    try {
      const incusDriver = DriverRegistry.get('lxc');
      const fsDriver = incusDriver.getFilesystem(id);
      const stream = await fsDriver.read(path);
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const content = Buffer.concat(chunks).toString('utf-8');
      return new Response(content, { headers: { 'Content-Type': 'text/plain' } });
    } catch (err) {
      return json({ error: err instanceof Error ? err.message : 'unknown error' }, 500);
    }
  }

  try {
    const content = await getFileContent(id, path);
    if (content === null) {
      return json({ error: 'file not found or not a text file' }, 404);
    }
    return new Response(content, { headers: { 'Content-Type': 'text/plain' } });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'unknown error' }, 500);
  }
}

export async function handleFsFileWrite(req: Request): Promise<Response> {
  let body: { id?: string; path?: string; content?: string; instanceType?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return json({ error: 'invalid json body' }, 400);
  }

  const { id, path, content, instanceType } = body;
  if (!id) return json({ error: 'container ID is required' }, 400);
  if (!validateContainerId(id)) return json({ error: 'invalid container ID' }, 400);
  if (!path || !validatePath(path)) return json({ error: 'invalid file path' }, 400);

  if (instanceType === 'LXC') {
    try {
      const incusDriver = DriverRegistry.get('lxc');
      const fsDriver = incusDriver.getFilesystem(id);
      await fsDriver.write(path, content ?? '');
      return json({ message: 'file content successfully saved' });
    } catch (err) {
      return json({ error: err instanceof Error ? err.message : 'unknown error' }, 500);
    }
  }

  try {
    await writeFileContent(id, path, content ?? '');
    return json({ message: 'file content successfully saved' });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'unknown error' }, 500);
  }
}

export async function handleFsDownload(req: Request): Promise<Response> {
  const params = new URL(req.url).searchParams;
  const id = params.get('id');
  const path = params.get('path') ?? '/';
  const instanceType = params.get('instanceType') ?? '';

  if (!id) return json({ error: 'container ID is required' }, 400);
  if (!validateContainerId(id)) return json({ error: 'invalid container ID' }, 400);

  if (instanceType === 'LXC') {
    try {
      const incusDriver = DriverRegistry.get('lxc');
      const fsDriver = incusDriver.getFilesystem(id);
      const stream = await fsDriver.read(path);
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const content = Buffer.concat(chunks);
      const fileName = path.split('/').pop() || 'file';
      return new Response(content, {
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Disposition': `attachment; filename="${fileName}"`,
        },
      });
    } catch (err) {
      return json({ error: err instanceof Error ? err.message : 'file not found' }, 404);
    }
  }

  try {
    const filePath = getFilePath(id, path);
    return new Response(Bun.file(filePath), {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${basename(filePath)}"`,
      },
    });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'file not found' }, 404);
  }
}

export async function handleFsRm(req: Request): Promise<Response> {
  let body: { id?: string; path?: string; instanceType?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return json({ error: 'invalid json body' }, 400);
  }
  if (!body.id) return json({ error: 'container ID is required' }, 400);
  if (!validateContainerId(body.id)) return json({ error: 'invalid container ID' }, 400);

  if (body.instanceType === 'LXC') {
    try {
      const incusDriver = DriverRegistry.get('lxc');
      const fsDriver = incusDriver.getFilesystem(body.id);
      await fsDriver.delete(body.path ?? '/');
      return json({ message: 'file/folder successfully removed' });
    } catch (err) {
      return json({ error: err instanceof Error ? err.message : 'unknown error' }, 500);
    }
  }

  try {
    await rmPath(body.id, body.path ?? '/');
    return json({ message: 'file/folder successfully removed' });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'unknown error' }, 500);
  }
}

export async function handleFsZip(req: Request): Promise<Response> {
  let body: { id?: string; path?: string | string[]; zipname?: string; instanceType?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return json({ error: 'invalid json body' }, 400);
  }
  if (!body.id) return json({ error: 'container ID is required' }, 400);
  if (!validateContainerId(body.id)) return json({ error: 'invalid container ID' }, 400);

  if (body.instanceType === 'LXC') return lxcError();

  const paths = Array.isArray(body.path) ? body.path : [body.path ?? '/'];

  try {
    const zipPath = await zipPaths(body.id, paths, body.zipname ?? 'archive');
    return json({ message: 'archive created', zipPath });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'unknown error' }, 500);
  }
}

export async function handleFsUnzip(req: Request): Promise<Response> {
  let body: { id?: string; path?: string; zipname?: string; instanceType?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return json({ error: 'invalid json body' }, 400);
  }
  if (!body.id) return json({ error: 'container ID is required' }, 400);
  if (!validateContainerId(body.id)) return json({ error: 'invalid container ID' }, 400);

  if (body.instanceType === 'LXC') return lxcError();

  try {
    await unzipPath(body.id, body.path ?? '/', body.zipname ?? '');
    return json({ message: 'file successfully unzipped' });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'unknown error' }, 500);
  }
}

export async function handleFsRename(req: Request): Promise<Response> {
  let body: { id?: string; path?: string; newName?: string; newPath?: string; instanceType?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return json({ error: 'invalid json body' }, 400);
  }
  if (!body.id) return json({ error: 'container ID is required' }, 400);
  if (!validateContainerId(body.id)) return json({ error: 'invalid container ID' }, 400);

  if (body.instanceType === 'LXC') return lxcError();

  const newPath = body.newPath ?? body.newName ?? '';

  try {
    await renameFile(body.id, body.path ?? '/', newPath);
    return json({ message: 'file successfully renamed' });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'unknown error' }, 500);
  }
}

export async function handleFsUpload(req: Request): Promise<Response> {
  let body: {
    id?: string;
    path?: string;
    fileName?: string;
    fileContent?: string;
    instanceType?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return json({ error: 'invalid json body' }, 400);
  }

  const { id, path: relativePath, fileName, fileContent, instanceType } = body;
  if (!id) return json({ error: 'container ID is required' }, 400);
  if (!validateContainerId(id)) return json({ error: 'invalid container ID' }, 400);
  if (!fileName) return json({ error: 'file name is required' }, 400);
  if (!validateFileName(fileName)) return json({ error: 'invalid file name' }, 400);
  if (!validatePath(relativePath ?? '')) return json({ error: 'invalid file path' }, 400);
  if (!fileContent) return json({ error: 'file content is required' }, 400);

  const targetPath = relativePath === '/' || !relativePath ? fileName : `${relativePath}/${fileName}`;

  let content: Buffer;
  if (typeof fileContent === 'string' && fileContent.includes('base64')) {
    const match = fileContent.match(/^data:[^;]+;base64,(.+)$/);
    if (!match?.[1]) return json({ error: 'invalid base64 format' }, 400);
    content = Buffer.from(match[1], 'base64');
  } else if (typeof fileContent === 'string') {
    content = Buffer.from(fileContent, 'utf8');
  } else {
    return json({ error: 'unsupported content type' }, 400);
  }

  if (instanceType === 'LXC') {
    try {
      const incusDriver = DriverRegistry.get('lxc');
      const fsDriver = incusDriver.getFilesystem(id);
      await fsDriver.write(targetPath, content);
      return json({ message: 'file successfully uploaded', fileName, path: targetPath });
    } catch (err) {
      logger.error('error during LXC file upload', err);
      return json({ error: err instanceof Error ? err.message : 'unknown error' }, 500);
    }
  }

  try {
    const baseDir = resolve(process.cwd(), `volumes/${id}`);
    const filePath = jailPath(baseDir, targetPath);
    mkdirSync(dirname(filePath), { recursive: true });
    await Bun.write(filePath, content);
    return json({ message: 'file successfully uploaded', fileName, path: targetPath });
  } catch (err) {
    logger.error('error during file upload', err);
    return json({ error: err instanceof Error ? err.message : 'unknown error' }, 500);
  }
}

export async function handleFsCreateEmpty(req: Request): Promise<Response> {
  let body: { id?: string; path?: string; fileName?: string; instanceType?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return json({ error: 'invalid json body' }, 400);
  }

  const { id, path: relativePath, fileName, instanceType } = body;
  if (!id) return json({ error: 'container ID is required' }, 400);
  if (!validateContainerId(id)) return json({ error: 'invalid container ID' }, 400);
  if (!fileName) return json({ error: 'file name is required' }, 400);

  const targetPath = relativePath === '/' || !relativePath ? fileName : `${relativePath}/${fileName}`;

  if (instanceType === 'LXC') {
    try {
      const incusDriver = DriverRegistry.get('lxc');
      const fsDriver = incusDriver.getFilesystem(id);
      await fsDriver.write(targetPath, '');
      return json({ message: 'empty file successfully created', fileName, path: targetPath });
    } catch (err) {
      logger.error('error creating empty file in LXC', err);
      return json({ error: err instanceof Error ? err.message : 'unknown error' }, 500);
    }
  }

  try {
    const baseDir = resolve(process.cwd(), `volumes/${id}`);
    const filePath = jailPath(baseDir, targetPath);
    mkdirSync(dirname(filePath), { recursive: true });
    await Bun.write(filePath, '');
    return json({ message: 'empty file successfully created', fileName, path: targetPath });
  } catch (err) {
    logger.error('error creating empty file', err);
    return json({ error: err instanceof Error ? err.message : 'unknown error' }, 500);
  }
}

export async function handleFsMkdir(req: Request): Promise<Response> {
  let body: { id?: string; path?: string; instanceType?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return json({ error: 'invalid json body' }, 400);
  }

  const { id, path: directoryPath, instanceType } = body;
  if (!id) return json({ error: 'container ID is required' }, 400);
  if (!validateContainerId(id)) return json({ error: 'invalid container ID' }, 400);
  if (!directoryPath) return json({ error: 'directory path is required' }, 400);
  if (!validatePath(directoryPath)) return json({ error: 'invalid directory path' }, 400);

  if (instanceType === 'LXC') {
    try {
      const incusDriver = DriverRegistry.get('lxc');
      const fsDriver = incusDriver.getFilesystem(id);
      // Create a placeholder to represent the directory
      // Incus file API creates parent dirs automatically when writing files
      // For an empty dir, write a .gitkeep equivalent
      const dirFilePath = directoryPath.endsWith('/') ? directoryPath + '.directory' : directoryPath + '/.directory';
      await fsDriver.write(dirFilePath, '');
      return json({ message: 'directory successfully created', path: directoryPath });
    } catch (err) {
      logger.error('error creating directory in LXC', err);
      return json({ error: err instanceof Error ? err.message : 'unknown error' }, 500);
    }
  }

  try {
    const baseDir = resolve(process.cwd(), `volumes/${id}`);
    const fullPath = jailPath(baseDir, directoryPath);
    mkdirSync(fullPath, { recursive: true });
    return json({ message: 'directory successfully created', path: directoryPath });
  } catch (err) {
    logger.error('error creating directory', err);
    return json({ error: err instanceof Error ? err.message : 'unknown error' }, 500);
  }
}

export async function handleFsAppend(req: Request): Promise<Response> {
  let body: {
    id?: string;
    path?: string;
    fileName?: string;
    fileContent?: string;
    chunkIndex?: number;
    totalChunks?: number;
    instanceType?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return json({ error: 'invalid json body' }, 400);
  }

  const { id, path: relativePath, fileName, fileContent, chunkIndex = 0, totalChunks = 1, instanceType } = body;
  if (!id) return json({ error: 'container ID is required' }, 400);
  if (!validateContainerId(id)) return json({ error: 'invalid container ID' }, 400);
  if (!fileName) return json({ error: 'file name is required' }, 400);
  if (!fileContent) return json({ error: 'file content is required' }, 400);

  const targetPath = relativePath === '/' || !relativePath ? fileName : `${relativePath}/${fileName}`;

  let chunk: Buffer;
  if (typeof fileContent === 'string' && fileContent.includes('base64')) {
    const match = fileContent.match(/^data:[^;]+;base64,(.+)$/);
    if (!match?.[1]) return json({ error: 'invalid base64 format' }, 400);
    chunk = Buffer.from(match[1], 'base64');
  } else if (typeof fileContent === 'string') {
    chunk = Buffer.from(fileContent, 'utf8');
  } else {
    return json({ error: 'unsupported content type' }, 400);
  }

  if (instanceType === 'LXC') {
    try {
      const incusDriver = DriverRegistry.get('lxc');
      const fsDriver = incusDriver.getFilesystem(id);
      // Read existing content, append, write back
      let existing = Buffer.alloc(0);
      try {
        const stream = await fsDriver.read(targetPath);
        const existingChunks: Buffer[] = [];
        for await (const c of stream) {
          existingChunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
        }
        existing = Buffer.concat(existingChunks);
      } catch {
        // File doesn't exist yet, start from empty
      }
      await fsDriver.write(targetPath, Buffer.concat([existing, chunk]));
      return json({ message: 'chunk successfully appended', fileName, path: targetPath, chunkIndex, totalChunks });
    } catch (err) {
      logger.error('error appending to LXC file', err);
      return json({ error: err instanceof Error ? err.message : 'unknown error' }, 500);
    }
  }

  try {
    await appendChunk(id, targetPath, chunk);
    return json({ message: 'chunk successfully appended', fileName, path: targetPath, chunkIndex, totalChunks });
  } catch (err) {
    logger.error('error appending to file', err);
    return json({ error: err instanceof Error ? err.message : 'unknown error' }, 500);
  }
}
