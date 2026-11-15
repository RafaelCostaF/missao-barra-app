// Prévia web: assets via fetch e "compartilhar" = baixar o arquivo.
import { Asset } from 'expo-asset';

const toDataUrl = (blob: Blob) => new Promise<string>((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result));
  r.onerror = rej;
  r.readAsDataURL(blob);
});

export async function assetDataUrl(mod: number, mime: string) {
  const blob = await (await fetch(Asset.fromModule(mod).uri)).blob();
  const url = await toDataUrl(blob);
  return url.replace(/^data:[^;]*;/, `data:${mime};`);
}

export async function shareFile(name: string, data: { base64?: string; text?: string }, mime: string, _title: string) {
  const blob = data.base64 != null
    ? new Blob([Uint8Array.from(atob(data.base64), (ch) => ch.charCodeAt(0))], { type: mime })
    : new Blob([data.text ?? ''], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  return true;
}
