import type { FileMetadata } from '@wings2i-gracie/contracts';
import prisma from '../../lib/prisma.js';
import { LocalStorageProvider } from './LocalStorageProvider.js';

const provider = new LocalStorageProvider();

export async function uploadFile(params: {
  tenantId: string;
  moduleKey: string;
  originalName: string;
  buffer: Buffer;
  mimeType: string;
  sizeBytes: number;
  uploadedBy: string;
}): Promise<FileMetadata> {
  const { fileId, filePath } = await provider.save({
    tenantId: params.tenantId,
    moduleKey: params.moduleKey,
    filename: params.originalName,
    buffer: params.buffer,
    mimeType: params.mimeType,
  });

  const row = await prisma.coreFile.create({
    data: {
      id: fileId,
      tenant_id: params.tenantId,
      module_key: params.moduleKey,
      original_name: params.originalName,
      file_path: filePath,
      mime_type: params.mimeType,
      size_bytes: params.sizeBytes,
      uploaded_by: params.uploadedBy,
    },
  });

  return mapFile(row);
}

export async function getFile(
  fileId: string,
  tenantId: string,
): Promise<{ metadata: FileMetadata; buffer: Buffer }> {
  const row = await prisma.coreFile.findFirst({
    where: { id: fileId, tenant_id: tenantId, deleted_at: null },
  });
  if (!row) throw Object.assign(new Error('File not found'), { code: 'FILE_NOT_FOUND' });
  const buffer = await provider.retrieve(row.file_path);
  return { metadata: mapFile(row), buffer };
}

export async function deleteFile(fileId: string, tenantId: string): Promise<void> {
  const row = await prisma.coreFile.findFirst({
    where: { id: fileId, tenant_id: tenantId, deleted_at: null },
  });
  if (!row) return;
  await provider.delete(row.file_path);
  await prisma.coreFile.update({
    where: { id: fileId },
    data: { deleted_at: new Date() },
  });
}

export async function getFilesByModule(
  tenantId: string,
  moduleKey: string,
): Promise<FileMetadata[]> {
  const rows = await prisma.coreFile.findMany({
    where: { tenant_id: tenantId, module_key: moduleKey, deleted_at: null },
    orderBy: { created_at: 'desc' },
  });
  return rows.map(mapFile);
}

function mapFile(row: {
  id: string;
  tenant_id: string;
  module_key: string;
  original_name: string;
  file_path: string;
  mime_type: string;
  size_bytes: number;
  uploaded_by: string;
  created_at: Date;
}): FileMetadata {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    moduleKey: row.module_key,
    originalName: row.original_name,
    filePath: row.file_path,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    uploadedBy: row.uploaded_by,
    createdAt: row.created_at,
  };
}
