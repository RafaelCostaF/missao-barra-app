// Celular: lê assets como data URL e salva/compartilha arquivos pela folha de compartilhamento do sistema
// (Instagram, WhatsApp, "Salvar imagem/vídeo", Arquivos…). Versão web em shareFiles.web.ts.
import { Asset } from 'expo-asset';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

export async function assetDataUrl(mod: number, mime: string) {
  const asset = Asset.fromModule(mod);
  await asset.downloadAsync();
  return `data:${mime};base64,${await new File(asset.localUri ?? asset.uri).base64()}`;
}

const UTI: Record<string, string> = { 'image/jpeg': 'public.jpeg', 'video/mp4': 'public.mpeg-4', 'application/gpx+xml': 'com.topografix.gpx' };

/** Grava no cache e abre a folha de compartilhamento. false se o aparelho não permite compartilhar. */
export async function shareFile(name: string, data: { base64?: string; text?: string }, mime: string, dialogTitle: string) {
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.create();
  if (data.base64 != null) await file.write(data.base64, { encoding: 'base64' });
  else await file.write(data.text ?? '');
  if (!(await Sharing.isAvailableAsync())) return false;
  await Sharing.shareAsync(file.uri, { mimeType: mime, UTI: UTI[mime], dialogTitle });
  return true;
}
