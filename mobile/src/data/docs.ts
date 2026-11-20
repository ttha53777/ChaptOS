/**
 * Docs writes (MANAGE_DOCS), as the web page makes them (app/org/[slug]/docs/page.tsx):
 *
 *   POST   /api/docs                     DocSaved   add (title, url, description, folderId)
 *   PATCH  /api/docs/[id]                DocSaved   edit (title, url, description)
 *   DELETE /api/docs/[id]                204
 *   PATCH  /api/docs/[id]/move           DocSaved   { folderId } (null = Unfiled)
 *   PATCH  /api/docs/[id]/pin            DocSaved   { pinned }
 *   POST   /api/docs/refresh-metadata    DocSaved   { id }
 *   POST   /api/docs/folders             DocFolder  { name }
 *   PATCH  /api/docs/folders/[id]        DocFolder  { name }
 *   DELETE /api/docs/folders/[id]        204        (its docs return to Unfiled)
 *   PATCH  /api/docs/folders/[id]/pin    DocFolder  { pinned }
 *
 * The reads (useDocs / useDocFolders) live in ./more. A saved doc comes back without
 * `createdByName` (only the list joins it), so the cache carries the old name over, as
 * the web does; a new doc takes the adder's name. The dashboard's docs glance reads the
 * same library, so every write refreshes home too.
 */
import type { Doc, DocFolder, DocSaved } from "@/lib/api-types";
import type { createDocInput, createFolderInput, moveDocInput, pinInput, renameFolderInput, updateDocInput } from "@/lib/validation/doc";
import type { z } from "zod";
import { api } from "~/api/client";
import { activeOrg } from "~/state/org";
import { moreKeys } from "./more";
import { queryClient } from "./query";

const slugNow = () => activeOrg.get().slug;
const docsKey = () => moreKeys.docs(slugNow());
const foldersKey = () => moreKeys.folders(slugNow());

function putDoc(saved: DocSaved, name?: string | null) {
  queryClient.setQueryData<Doc[]>(docsKey(), l => {
    const prev = l?.find(d => d.id === saved.id);
    const row: Doc = { ...saved, createdByName: prev ? prev.createdByName : (name ?? null) };
    if (!l) return [row];
    return prev ? l.map(d => (d.id === saved.id ? row : d)) : [row, ...l];
  });
  void queryClient.invalidateQueries({ queryKey: ["home", slugNow()] });
}

function putFolder(saved: DocFolder) {
  queryClient.setQueryData<DocFolder[]>(foldersKey(), l => {
    if (!l) return [saved];
    return l.some(f => f.id === saved.id) ? l.map(f => (f.id === saved.id ? saved : f)) : [saved, ...l];
  });
}

export async function createDoc(body: z.input<typeof createDocInput>, adder: string | null): Promise<DocSaved> {
  const saved = await api<DocSaved>("/api/docs", { method: "POST", body, org: slugNow() });
  putDoc(saved, adder);
  return saved;
}

export async function updateDoc(id: number, body: z.input<typeof updateDocInput>): Promise<DocSaved> {
  const saved = await api<DocSaved>(`/api/docs/${id}`, { method: "PATCH", body, org: slugNow() });
  putDoc(saved);
  return saved;
}

export async function deleteDoc(id: number): Promise<void> {
  await api<null>(`/api/docs/${id}`, { method: "DELETE", org: slugNow() });
  queryClient.setQueryData<Doc[]>(docsKey(), l => (l ?? []).filter(d => d.id !== id));
  void queryClient.invalidateQueries({ queryKey: ["home", slugNow()] });
}

export async function moveDoc(id: number, folderId: number | null): Promise<DocSaved> {
  const body: z.input<typeof moveDocInput> = { folderId };
  const saved = await api<DocSaved>(`/api/docs/${id}/move`, { method: "PATCH", body, org: slugNow() });
  putDoc(saved);
  return saved;
}

export async function pinDoc(id: number, pinned: boolean): Promise<DocSaved> {
  const body: z.input<typeof pinInput> = { pinned };
  const saved = await api<DocSaved>(`/api/docs/${id}/pin`, { method: "PATCH", body, org: slugNow() });
  putDoc(saved);
  return saved;
}

export async function refreshDoc(id: number): Promise<DocSaved> {
  const saved = await api<DocSaved>("/api/docs/refresh-metadata", { method: "POST", body: { id }, org: slugNow() });
  putDoc(saved);
  return saved;
}

export async function createFolder(name: string): Promise<DocFolder> {
  const body: z.input<typeof createFolderInput> = { name: name.trim() };
  const saved = await api<DocFolder>("/api/docs/folders", { method: "POST", body, org: slugNow() });
  putFolder(saved);
  return saved;
}

export async function renameFolder(id: number, name: string): Promise<DocFolder> {
  const body: z.input<typeof renameFolderInput> = { name: name.trim() };
  const saved = await api<DocFolder>(`/api/docs/folders/${id}`, { method: "PATCH", body, org: slugNow() });
  putFolder(saved);
  return saved;
}

export async function deleteFolder(id: number): Promise<void> {
  await api<null>(`/api/docs/folders/${id}`, { method: "DELETE", org: slugNow() });
  queryClient.setQueryData<DocFolder[]>(foldersKey(), l => (l ?? []).filter(f => f.id !== id));
  // Released docs return to Unfiled.
  queryClient.setQueryData<Doc[]>(docsKey(), l => (l ?? []).map(d => (d.folderId === id ? { ...d, folderId: null } : d)));
}

export async function pinFolder(id: number, pinned: boolean): Promise<DocFolder> {
  const body: z.input<typeof pinInput> = { pinned };
  const saved = await api<DocFolder>(`/api/docs/folders/${id}/pin`, { method: "PATCH", body, org: slugNow() });
  putFolder(saved);
  return saved;
}
